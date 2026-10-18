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
};

function googleLanguageCode(language: string) {
  const normalized = language.trim().replace("_", "-");
  const lower = normalized.toLowerCase();
  if (lower === "zh" || lower === "zh-cn" || lower === "zh-hans") return "zh-CN";
  if (lower === "zh-tw" || lower === "zh-hk" || lower === "zh-hant") return "zh-TW";
  return normalized.split("-")[0] || normalized;
}

function cueBatches(cues: CleanCue[]) {
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
  if (!env.LOCAL_MODE) {
    return env.GOOGLE_CLOUD_TRANSLATION_API_KEY.trim() ? "google" : "off";
  }
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

function runTranslateHelper(payload: string): Promise<string> {
  const helper = env.LOCAL_TRANSLATE_HELPER.trim();
  if (!helper) {
    throw new MachineTranslationError("macos_helper_missing", "本机翻译组件缺失", 503);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(helper, [], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new MachineTranslationError("macos_timeout", "系统翻译超时", 504)));
    }, HELPER_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      finish(() => reject(new MachineTranslationError("macos_helper_failed", error.message, 503)));
    });
    child.on("close", (code) => {
      finish(() => {
        if (code === 0) resolve(stdout);
        else reject(new MachineTranslationError("macos_helper_failed", stderr.trim() || `exit ${code}`, 503));
      });
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

async function translateWithMacOS(input: TranslateMachineCuesInput) {
  const batches = cueBatches(input.cues);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    if (input.shouldContinue && !(await input.shouldContinue())) break;
    if (input.completedBatchIndexes?.has(batchIndex)) continue;
    const batch = batches[batchIndex];
    const raw = await runTranslateHelper(JSON.stringify({
      source: input.sourceLanguage,
      target: input.targetLanguage,
      texts: batch.map((cue) => cue.text)
    }));

    let parsed: { ok?: boolean; error?: string; status?: string; translations?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new MachineTranslationError("macos_bad_output", "系统翻译返回了无法解析的结果", 502);
    }

    if (!parsed.ok) {
      if (parsed.error === "macos_version") {
        throw new MachineTranslationError("macos_version_unsupported", "本地系统翻译需要 macOS 26 或更新版本", 503);
      }
      if (parsed.error === "not_installed") {
        throw new MachineTranslationError(
          "macos_language_not_installed",
          `系统翻译语言包未安装（${input.sourceLanguage} → ${input.targetLanguage}）`,
          409
        );
      }
      if (parsed.error === "unsupported") {
        throw new MachineTranslationError(
          "macos_language_unsupported",
          `系统翻译不支持 ${input.sourceLanguage} → ${input.targetLanguage}`,
          400
        );
      }
      throw new MachineTranslationError("macos_translation_failed", String(parsed.error || "系统翻译失败"), 502);
    }

    const translations = Array.isArray(parsed.translations) ? parsed.translations as string[] : [];
    if (translations.length !== batch.length || translations.some(text => typeof text !== "string" || !text.trim())) {
      throw new MachineTranslationError("macos_bad_output", "系统翻译返回的条数不匹配", 502);
    }

    const translated = batch.map((cue, index): TranslatedCue => {
      const text = normalizeTranslatedText(translations[index], input.targetLanguage);
      return {
        start: cue.start,
        end: cue.end,
        text: text || cue.text,
        sourceText: cue.text,
        sourceIndexes: [cue.index]
      };
    });
    await input.onBatch({ batchIndex, cues: translated });
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
      signal: AbortSignal.timeout(15_000)
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
