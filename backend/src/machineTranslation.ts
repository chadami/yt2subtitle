import { env } from "./env.js";
import type { CleanCue, TranslatedCue } from "./subtitles.js";

const MAX_BATCH_CUES = 50;
const MAX_BATCH_CHARACTERS = 4_500;

type MachineTranslationBatch = {
  batchIndex: number;
  cues: TranslatedCue[];
};

type TranslateMachineCuesInput = {
  cues: CleanCue[];
  sourceLanguage: string;
  targetLanguage: string;
  onBatch: (batch: MachineTranslationBatch) => Promise<void>;
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

export function machineTranslationConfigured() {
  return env.GOOGLE_CLOUD_TRANSLATION_API_KEY.trim().length > 0;
}

export async function translateMachineCues(input: TranslateMachineCuesInput) {
  if (!machineTranslationConfigured() || !input.cues.length) return;

  const sourceLanguage = googleLanguageCode(input.sourceLanguage);
  const targetLanguage = googleLanguageCode(input.targetLanguage);
  const endpoint = new URL("/language/translate/v2", env.GOOGLE_CLOUD_TRANSLATION_ENDPOINT);
  endpoint.searchParams.set("key", env.GOOGLE_CLOUD_TRANSLATION_API_KEY.trim());

  const batches = cueBatches(input.cues);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
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
      const text = translatedText(translations[index]);
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
