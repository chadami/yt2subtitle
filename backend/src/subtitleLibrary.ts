import crypto from "node:crypto";
import { query } from "./db.js";
import type { RawCue, TranslatedCue } from "./subtitles.js";

// Preserve this opaque cache version so existing local generation keys stay valid.
export const PIPELINE_VERSION = "public-library-v1";
export const DEFAULT_STYLE_ID = "accurate";

export function hashRawCues(rawCues: RawCue[]) {
  const stableCues = rawCues.map((cue) => ({
    start: Number(cue.start.toFixed(3)),
    end: Number(cue.end.toFixed(3)),
    text: cue.text.trim()
  }));
  return crypto.createHash("sha256").update(JSON.stringify(stableCues)).digest("hex");
}

export function createGenerationKey(input: {
  captionSourceId: string;
  targetLang: string;
  styleId: string;
  strategyId: string;
  strategyVersion: string;
  provider: string;
  model: string;
}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    ...input,
    pipelineVersion: PIPELINE_VERSION
  })).digest("hex");
}

export function hashTranslatedCues(cues: Array<Pick<TranslatedCue, "start" | "end" | "text">>) {
  return crypto.createHash("sha256").update(JSON.stringify(cues.map((cue) => ({
    start: Number(cue.start.toFixed(3)),
    end: Number(cue.end.toFixed(3)),
    text: cue.text.trim()
  })))).digest("hex");
}

function targetLanguageScore(cues: TranslatedCue[], targetLang: string) {
  const text = cues.map((cue) => cue.text).join("");
  const letters = text.match(/[\p{L}\p{N}]/gu) || [];
  if (!letters.length) return 0;
  const normalized = targetLang.toLowerCase();
  let targetCharacters = 0;
  if (normalized.startsWith("zh")) targetCharacters = (text.match(/\p{Script=Han}/gu) || []).length;
  else if (normalized.startsWith("ja")) targetCharacters = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
  else if (normalized.startsWith("ko")) targetCharacters = (text.match(/[\p{Script=Hangul}\p{Script=Han}]/gu) || []).length;
  else return 20;
  return Math.min(20, Math.round((targetCharacters / letters.length) * 40));
}

export function assessSubtitleQuality(
  sourceCues: Array<RawCue & { index: number }>,
  translatedCues: TranslatedCue[],
  targetLang: string
) {
  const expected = new Set(sourceCues.map((cue) => cue.index));
  const covered = new Set(translatedCues.flatMap((cue) => cue.sourceIndexes || []).filter((index) => expected.has(index)));
  const coverageRatio = expected.size ? covered.size / expected.size : 0;
  const coverageScore = Math.round(coverageRatio * 40);
  const timingValid = translatedCues.length > 0 && translatedCues.every((cue, index) => (
    Number.isFinite(cue.start)
    && Number.isFinite(cue.end)
    && cue.start >= 0
    && cue.end > cue.start
    && (index === 0 || cue.start >= translatedCues[index - 1].start)
  ));
  const timingScore = timingValid ? 20 : 0;
  const languageScore = targetLanguageScore(translatedCues, targetLang);
  const hasEmpty = translatedCues.some((cue) => !cue.text.trim());
  let longestRepeat = 1;
  let repeatRun = 1;
  for (let index = 1; index < translatedCues.length; index += 1) {
    repeatRun = translatedCues[index].text.trim() === translatedCues[index - 1].text.trim() ? repeatRun + 1 : 1;
    longestRepeat = Math.max(longestRepeat, repeatRun);
  }
  const sourceLength = sourceCues.reduce((sum, cue) => sum + cue.text.length, 0);
  const translatedLength = translatedCues.reduce((sum, cue) => sum + cue.text.length, 0);
  const lengthRatio = sourceLength ? translatedLength / sourceLength : 0;
  const structureScore = !hasEmpty && longestRepeat <= 3 && lengthRatio >= 0.15 && lengthRatio <= 4 ? 10 : 0;
  let checkedNumbers = 0;
  let preservedNumbers = 0;
  for (const cue of translatedCues) {
    const sourceNumbers = (cue.sourceText || "").match(/\d+(?:[.,]\d+)*/g) || [];
    for (const number of sourceNumbers) {
      checkedNumbers += 1;
      if (cue.text.includes(number)) preservedNumbers += 1;
    }
  }
  const numberScore = checkedNumbers ? Math.round((preservedNumbers / checkedNumbers) * 10) : 10;
  const score = coverageScore + timingScore + languageScore + structureScore + numberScore;
  const hardPass = coverageRatio === 1 && timingValid && !hasEmpty && longestRepeat <= 3 && languageScore >= 16;
  return {
    score,
    hardPass,
    metrics: {
      coverageRatio,
      timingValid,
      languageScore,
      longestRepeat,
      lengthRatio,
      checkedNumbers,
      preservedNumbers,
      coverageScore,
      timingScore,
      structureScore,
      numberScore
    }
  };
}

// Only discard temporary AI chunks of completed jobs. Keep failed-job chunks
// (including machine fallback) so playback and resume do not lose progress.
export async function cleanupSubtitleArtifacts() {
  for (const table of ["translation_job_chunks", "translation_job_machine_chunks"]) {
    await query(`delete from ${table} c using translation_jobs j
      where c.job_id = j.id and j.status = 'completed' and c.updated_at < now() - interval '7 days'`);
  }
}
