import type { TranslatedCue } from "./subtitles.js";

export const CHINESE_SUBTITLE_TARGET_LENGTH = 20;
const CHINESE_SUBTITLE_NATURAL_LENGTH = 24;
const MIN_ESTIMATED_DURATION = 0.65;
const words = new Intl.Segmenter("zh", { granularity: "word" });

export function isChineseTarget(language?: string) {
  return language?.trim().toLowerCase().replace(/_/g, "-").split("-")[0] === "zh";
}

// Count letters and numbers, excluding spaces and punctuation. Latin tokens stay intact.
function readingLength(text: string) {
  return (text.match(/[\p{L}\p{N}]/gu) || []).length;
}

function strongBoundary(text: string) {
  return /[。！？!?；;.…][”’」』）】》〉]*$/u.test(text.trim());
}

function weakBoundary(text: string) {
  return /[，,、：:][”’」』）】》〉]*$/u.test(text.trim());
}

function tokens(text: string) {
  const output: string[] = [];
  // Protect decimals, percentages, filenames and Latin names from word segmentation.
  const blocks = text.match(/[A-Za-z0-9]+(?:[.,:/_\-][A-Za-z0-9]+)*[%％]?|[^A-Za-z0-9]+/gu) || [];
  for (const block of blocks) {
    for (const token of /^[A-Za-z0-9]/u.test(block) ? [block] : Array.from(words.segment(block), item => item.segment)) {
      if (/^[\s\p{P}\p{S}]+$/u.test(token) && !/^[“‘「『（【《〈]$/u.test(token) && output.length) {
        output[output.length - 1] += token;
      } else {
        output.push(token);
      }
    }
  }
  // Opening quotes belong to the following word, never the preceding subtitle.
  for (let index = output.length - 2; index >= 0; index -= 1) {
    if (/^[“‘「『（【《〈]$/u.test(output[index])) {
      output.splice(index, 2, output[index] + output[index + 1]);
    }
  }
  return output;
}

function splitSentence(text: string) {
  const pending = tokens(text);
  const parts: string[] = [];
  while (pending.length) {
    const remaining = readingLength(pending.join(""));
    if (remaining <= CHINESE_SUBTITLE_TARGET_LENGTH) {
      parts.push(pending.join("").trim());
      break;
    }
    const ideal = remaining / Math.ceil(remaining / CHINESE_SUBTITLE_TARGET_LENGTH);
    let length = 0;
    let cut = 1;
    let bestScore = Infinity;
    let punctuationCut = 0;
    let punctuationScore = Infinity;
    for (let index = 0; index < pending.length - 1; index += 1) {
      length += readingLength(pending[index]);
      if (length > CHINESE_SUBTITLE_NATURAL_LENGTH) break;
      if (!length) continue;
      // Search beyond the target before considering a guessed word boundary.
      // A 21-character clause is preferable to cutting a word just to stay under 20.
      if (weakBoundary(pending[index]) && length >= 4 && remaining - length >= 4) {
        const score = Math.abs(length - CHINESE_SUBTITLE_TARGET_LENGTH);
        if (score < punctuationScore) {
          punctuationScore = score;
          punctuationCut = index + 1;
        }
      }
      if (length > CHINESE_SUBTITLE_TARGET_LENGTH) continue;
      const awkward = /[的地得把被和与及从对向让使将很更最]$/u.test(pending[index].trim())
        || /^[的地得了着过]/u.test(pending[index + 1].trim());
      const score = Math.abs(length - ideal) - (weakBoundary(pending[index]) && length >= 4 ? 12 : 0)
        + (awkward ? 8 : 0);
      if (score < bestScore) {
        bestScore = score;
        cut = index + 1;
      }
    }
    if (punctuationCut) {
      parts.push(pending.splice(0, punctuationCut).join("").trim());
      continue;
    }
    // Keep a slightly longer complete phrase rather than trusting a potentially
    // ambiguous dictionary segmentation to split it into two short fragments.
    if (remaining <= CHINESE_SUBTITLE_NATURAL_LENGTH) {
      parts.push(pending.join("").trim());
      break;
    }
    parts.push(pending.splice(0, cut).join("").trim());
  }
  return parts.filter(Boolean);
}

function splitChineseText(text: string) {
  const sentences: string[] = [];
  let sentence = "";
  for (const token of tokens(text)) {
    sentence += token;
    if (strongBoundary(token)) {
      sentences.push(sentence.trim());
      sentence = "";
    }
  }
  if (sentence.trim()) sentences.push(sentence.trim());
  return sentences.flatMap(splitSentence);
}

function avoidFlashes(parts: string[], duration: number) {
  // Twenty characters is a readability target, not a reason to flash text for 0.1s.
  while (parts.length > 1) {
    const weights = parts.map(part => Math.max(1, readingLength(part)));
    const total = weights.reduce((sum, value) => sum + value, 0);
    const short = weights.findIndex(weight => duration * weight / total < MIN_ESTIMATED_DURATION);
    if (short < 0) break;
    const left = short === 0 ? 0 : short === parts.length - 1 ? short - 1
      : weights[short - 1] <= weights[short + 1] ? short - 1 : short;
    parts.splice(left, 2, parts[left] + parts[left + 1]);
  }
  return parts;
}

function estimatedSourceParts(source: string | undefined, weights: number[]) {
  if (!source) return weights.map(() => source);
  // Bilingual source divisions are estimates too; retain complete source words.
  const sourceTokens = tokens(source);
  const total = weights.reduce((sum, value) => sum + value, 0);
  const sourceLength = source.length;
  let tokenIndex = 0;
  let sourceOffset = 0;
  let consumedWeight = 0;
  return weights.map((weight, index) => {
    consumedWeight += weight;
    const target = sourceLength * consumedWeight / total;
    const start = tokenIndex;
    while (tokenIndex < sourceTokens.length && (index === weights.length - 1
      || sourceOffset + sourceTokens[tokenIndex].length / 2 <= target)) {
      sourceOffset += sourceTokens[tokenIndex++].length;
    }
    return sourceTokens.slice(start, tokenIndex).join("").trim();
  });
}

/** Local estimates stay within each original cue; no cross-cue translation or timing drift. */
export function segmentChineseCues(cues: TranslatedCue[]) {
  return cues.flatMap(cue => {
    const text = cue.text.replace(/\s+/gu, " ").trim();
    if (!text) return [];
    const duration = cue.end - cue.start;
    const parts = avoidFlashes(splitChineseText(text), duration);
    if (parts.length <= 1) return [{ ...cue, text }];
    const weights = parts.map(part => Math.max(1, readingLength(part)));
    const total = weights.reduce((sum, value) => sum + value, 0);
    const sourceParts = estimatedSourceParts(cue.sourceText, weights);
    let elapsed = 0;
    return parts.map((part, index) => {
      const start = cue.start + duration * elapsed / total;
      elapsed += weights[index];
      return {
        ...cue,
        start,
        end: index === parts.length - 1 ? cue.end : cue.start + duration * elapsed / total,
        text: part,
        sourceText: sourceParts[index]
      };
    });
  });
}
