import { StringDecoder } from "node:string_decoder";
import { acquireMacOSTranslation } from "./macosTranslationQueue.js";
import { spawn } from "node:child_process";
import { env } from "./env.js";
import { normalizeTranslatedText, type CleanCue, type TranslatedCue } from "./subtitles.js";

const MAX_BATCH_CUES = 50;
const MAX_BATCH_CHARACTERS = 4_500;
const HELPER_TIMEOUT_MS = 120_000;

export type MachineTranslationProvider = "google" | "macos" | "off";

export class MachineTranslationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 503
  ) {
    super(message);
    this.name = "MachineTranslationError";
  }
}

type MachineTranslationBatch = {
  batchIndex: number;
  cues: TranslatedCue[];
};

type TranslateMachineCuesInput = {
  cues: CleanCue[];
  sourceLanguage: string;
  targetLanguage: string;
  onBatch: (batch: MachineTranslationBatch) => Promise<void>;
  shouldContinue?: () => Promise<boolean>;
  completedBatchIndexes?: Set<number>;
  completedBatchCues?: Map<number, TranslatedCue[]>;
  signal?: AbortSignal;
};

function googleLanguageCode(language: string) {
  const normalized = language.trim().replace("_", "-");
  const lower = normalized.toLowerCase();
  if (lower === "zh" || lower === "zh-cn" || lower === "zh-hans") return "zh-CN";
  if (lower === "zh-tw" || lower === "zh-hk" || lower === "zh-hant") return "zh-TW";
  return normalized.split("-")[0] || normalized;
}

export function cueBatches(cues: CleanCue[]) {
  const batches: CleanCue[][] = [];
  let current: CleanCue[] = [];
  let characters = 0;

  for (const cue of cues) {
    const cueCharacters = Array.from(cue.text).length;
    if (current.length && (current.length >= MAX_BATCH_CUES || characters + cueCharacters > MAX_BATCH_CHARACTERS)) {
      batches.push(current);
      current = [];
      characters = 0;
    }
    current.push(cue);
    characters += cueCharacters;
  }
  if (current.length) batches.push(current);
  return batches;
}

function translatedText(value: unknown) {
  return value && typeof value === "object" && typeof (value as { translatedText?: unknown }).translatedText === "string"
    ? decodeHtmlEntities((value as { translatedText: string }).translatedText).trim()
    : "";
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function machineTranslationProvider(): MachineTranslationProvider {
  if (env.LOCAL_MT_PROVIDER === "macos") {
    return env.LOCAL_TRANSLATE_HELPER.trim() ? "macos" : "off";
  }
  if (env.LOCAL_MT_PROVIDER === "google") {
    return env.GOOGLE_CLOUD_TRANSLATION_API_KEY.trim() ? "google" : "off";
  }
  return "off";
}

export function machineTranslationConfigured() {
  return machineTranslationProvider() !== "off";
}

type HelperRecord = { ok?: boolean; done?: boolean; index?: number; error?: string; translations?: unknown };

function helperFailure(error: string | undefined, source: string, target: string) {
  if (error === "macos_version") return new MachineTranslationError("macos_version_unsupported", "本地系统翻译需要 macOS 26 或更新版本");
  if (error === "not_installed") return new MachineTranslationError("macos_language_not_installed", `系统翻译语言包未安装（${source} → ${target}）`, 409);
  if (error === "unsupported") return new MachineTranslationError("macos_language_unsupported", `系统翻译不支持 ${source} → ${target}`, 400);
  return new MachineTranslationError("macos_translation_failed", error || "系统翻译失败", 502);
}

async function runTranslateHelper(payload: string, onRecord: (record: HelperRecord) => Promise<void>, signal?: AbortSignal): Promise<void> {
  const release = await acquireMacOSTranslation(signal);
  try {
    signal?.throwIfAborted();
    const helper = env.LOCAL_TRANSLATE_HELPER.trim();
    if (!helper) throw new MachineTranslationError("macos_helper_missing", "本机翻译组件缺失");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(helper, [], { stdio: ["pipe", "pipe", "pipe"] });
      const decoder = new StringDecoder("utf8");
      let buffer = "", stderr = "";
      let records = Promise.resolve();
      let failure: unknown;
      let timer: ReturnType<typeof setTimeout>;
      const abort = () => { child.kill(); };
      const resetTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          failure = new MachineTranslationError("macos_timeout", "系统翻译超时", 504);
          child.kill();
        }, HELPER_TIMEOUT_MS);
      };
      const acceptLine = (line: string) => {
        if (!line.trim()) return;
        records = records.then(async () => {
          signal?.throwIfAborted();
          if (failure) return;
          let record: HelperRecord;
          try { record = JSON.parse(line); }
          catch { throw new MachineTranslationError("macos_bad_output", "系统翻译返回了无法解析的结果", 502); }
          await onRecord(record);
        }).catch(error => { failure = error; child.kill(); });
      };
      resetTimer();
      signal?.addEventListener("abort", abort, {once:true});
      child.stdout.on("data", (chunk: Buffer) => {
        resetTimer();
        buffer += decoder.write(chunk);
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          acceptLine(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
        }
      });
      child.stderr.on("data", chunk => { stderr += chunk.toString("utf8"); });
      child.on("error", error => { failure = new MachineTranslationError("macos_helper_failed", error.message); });
      child.on("close", async code => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        buffer += decoder.end();
        acceptLine(buffer);
        await records;
        if (signal?.aborted) reject(signal.reason);
        else if (failure) reject(failure);
        else if (code !== 0) reject(new MachineTranslationError("macos_helper_failed", stderr.trim() || `exit ${code}`));
        else resolve();
      });
      child.stdin.on("error", () => {}); // Spawn/close reports the actual failure.
      child.stdin.end(payload);
    });
  } finally { release(); }
}

async function translateWithMacOS(input: TranslateMachineCuesInput) {
  const batches = cueBatches(input.cues);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    input.signal?.throwIfAborted();
    if (input.shouldContinue && !(await input.shouldContinue())) break;
    const batch = batches[batchIndex];
    const saved = input.completedBatchCues?.get(batchIndex);
    // Old versions persisted complete batches; new versions also save each
    // streamed cue. Both can be resumed without re-translating finished work.
    if (!saved && input.completedBatchIndexes?.has(batchIndex)) continue;
    const translated = [...(saved || [])];
    const matches = (cue: CleanCue, done: TranslatedCue) => done.start === cue.start && done.end === cue.end;
    const remaining = batch.filter(cue => !translated.some(done => matches(cue, done)));
    if (!remaining.length) continue;
    let received = 0;
    await runTranslateHelper(JSON.stringify({
      source: input.sourceLanguage, target: input.targetLanguage,
      texts: remaining.map(cue => cue.text), stream: true
    }), async record => {
      if (!record.ok) throw helperFailure(record.error, input.sourceLanguage, input.targetLanguage);
      if (record.done) return;
      if (record.index !== received || !Array.isArray(record.translations) || record.translations.length !== 1
          || typeof record.translations[0] !== "string" || !record.translations[0].trim()) {
        throw new MachineTranslationError("macos_bad_output", "系统翻译返回的字幕顺序或条数不匹配", 502);
      }
      const cue = remaining[received++];
      if (!cue) throw new MachineTranslationError("macos_bad_output", "系统翻译返回了多余的字幕", 502);
      translated.push({ start:cue.start, end:cue.end,
        text:normalizeTranslatedText(record.translations[0], input.targetLanguage) || cue.text,
        sourceText:cue.text, sourceIndexes:[cue.index] });
      translated.sort((a,b) => a.start-b.start || a.end-b.end);
      await input.onBatch({batchIndex, cues:[...translated]});
    }, input.signal);
    if (received !== remaining.length) throw new MachineTranslationError("macos_bad_output", "系统翻译未返回全部字幕", 502);
  }
}

export async function translateMachineCues(input: TranslateMachineCuesInput) {
  if (!input.cues.length) return;

  if (machineTranslationProvider() === "macos") {
    await translateWithMacOS(input);
    return;
  }
  if (!machineTranslationConfigured()) return;

  const sourceLanguage = googleLanguageCode(input.sourceLanguage);
  const targetLanguage = googleLanguageCode(input.targetLanguage);
  const endpoint = new URL("/language/translate/v2", env.GOOGLE_CLOUD_TRANSLATION_ENDPOINT);
  endpoint.searchParams.set("key", env.GOOGLE_CLOUD_TRANSLATION_API_KEY.trim());

  const batches = cueBatches(input.cues);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    input.signal?.throwIfAborted();
    if (input.shouldContinue && !(await input.shouldContinue())) break;
    if (input.completedBatchIndexes?.has(batchIndex)) continue;
    const batch = batches[batchIndex];
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        q: batch.map((cue) => cue.text),
        source: sourceLanguage,
        target: targetLanguage,
        format: "text"
      }),
      signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data && typeof data === "object" ? JSON.stringify(data) : response.statusText;
      throw new Error(`Google Cloud Translation request failed (${response.status}): ${detail}`);
    }
    const translations = data && typeof data === "object"
      && (data as { data?: unknown }).data && typeof (data as { data: unknown }).data === "object"
      ? (data as { data: { translations?: unknown } }).data.translations
      : null;
    if (!Array.isArray(translations) || translations.length !== batch.length) {
      throw new Error("Google Cloud Translation returned an unexpected result count");
    }

    const translated = batch.map((cue, index): TranslatedCue => {
      const text = normalizeTranslatedText(translatedText(translations[index]), input.targetLanguage);
      if (!text) throw new Error(`Google Cloud Translation returned empty text for cue ${cue.index}`);
      return {
        start: cue.start,
        end: cue.end,
        text,
        sourceText: cue.text,
        sourceIndexes: [cue.index]
      };
    });
    await input.onBatch({ batchIndex, cues: translated });
  }
}
