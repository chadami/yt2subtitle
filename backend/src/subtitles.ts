export type RawCue = {
  start: number;
  end: number;
  text: string;
};

export type CleanCue = RawCue & {
  index: number;
};

export type TranslatedCue = {
  start: number;
  end: number;
  text: string;
  sourceText?: string;
  sourceIndexes?: number[];
};

const BOUNDARY_PUNCTUATION = ["...", "……", "，", ",", "。", ".", "！", "!", "？", "?", "；", ";", "：", ":"];
const MIN_DISPLAY_DURATION = 1.2;
export const MAX_SUBTITLE_CHARACTERS = 42;
export const MAX_SUBTITLE_DURATION = 6;
export const MAX_SOURCE_INDEX_SPAN = 4;
const MAX_UNBROKEN_SUBTITLE_CHARACTERS = 84;
const MAX_UNBROKEN_SUBTITLE_DURATION = 9;
const AUTO_GROUP_MAX_SOURCE_CHARACTERS = 120;
const AUTO_GROUP_MAX_DURATION = 8;
const AUTO_GROUP_MAX_GAP = 0.8;
const SEMANTIC_SOURCE_MAX_CHARACTERS = 260;
const SEMANTIC_SOURCE_MAX_DURATION = 14;
const MAX_SOURCE_TIMED_GROUP_CHARACTERS = 72;
const MAX_SOURCE_TIMED_GROUP_DURATION = 6;
const MAX_SOURCE_TIMED_GROUP_GAP = 0.45;
const MIN_STANDALONE_DURATION = 0.5;
const MIN_SPLIT_FRAGMENT_CHARACTERS = 4;
const MIN_SOURCE_SPLIT_PART_DURATION = 1;
const SHORT_FINAL_SOURCE_PART_DURATION = 0.75;
const MAX_JAPANESE_CHARACTERS_PER_SECOND = 18;
const MAX_JAPANESE_BOUNDARY_SHIFT = 0.5;

export function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function isJapaneseTarget(targetLanguage?: string) {
  return targetLanguage?.trim().toLowerCase().replace(/_/g, "-").split("-")[0] === "ja";
}

export function normalizeTranslatedText(text: string, targetLanguage?: string) {
  const normalized = normalizeText(text);
  return isJapaneseTarget(targetLanguage)
    ? normalized
      .replace(/，/gu, "、")
      .replace(/([「『（【《〈])、/gu, "$1")
      .replace(/([。！？])」、/gu, "$1」")
    : normalized;
}

export function stripSpeakerMarker(text: string) {
  return normalizeText(
    text
      .replace(/^\s*>+\s*/, "")
      .replace(/^\s*[A-Z][A-Za-z ._-]{0,24}:\s+/, "")
  );
}

function isShortBackchannel(text: string) {
  const normalized = stripSpeakerMarker(text).toLowerCase().replace(/[ .!?]+$/g, "");
  return new Set(["yes", "yeah", "yep", "no", "okay", "ok", "right", "sure", "exactly"]).has(normalized)
    || (normalized.length <= 12 && normalized.split(/\s+/).length <= 3);
}

function joinText(first: string, second: string) {
  return normalizeText(`${stripSpeakerMarker(first)} ${stripSpeakerMarker(second)}`);
}

function sourceWords(text: string) {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

function joinSourceFragments(first: string, second: string) {
  const left = sourceWords(stripSpeakerMarker(first));
  const right = sourceWords(stripSpeakerMarker(second));
  if (!left.length) return right.join(" ");
  if (!right.length) return left.join(" ");

  const maxOverlap = Math.min(left.length, right.length, 8);
  for (let size = maxOverlap; size > 0; size -= 1) {
    const leftTail = left.slice(-size).join(" ").toLowerCase();
    const rightHead = right.slice(0, size).join(" ").toLowerCase();
    if (leftTail === rightHead) {
      return [...left, ...right.slice(size)].join(" ");
    }
  }

  return [...left, ...right].join(" ");
}

function endsAtSourceBoundary(text: string) {
  return /(?:[.!?;:]|\.\.\.|……|\[[^\]]*(?:music|音乐)[^\]]*\])$/iu.test(normalizeText(text));
}

function splitTrailingIncompleteSourceFragment(text: string) {
  const match = normalizeText(text).match(/^(.+[.!?;:])\s+([^.!?;:]+)$/u);
  if (!match) return null;

  const prefix = normalizeText(match[1]);
  const tail = normalizeText(match[2]);
  if (!prefix || !tail || endsAtSourceBoundary(tail) || sourceWords(tail).length > 5) return null;
  return { prefix, tail };
}

function isStandaloneSourceMusic(text: string) {
  return /^\s*\[[^\]]*(music|音乐)[^\]]*\]\s*$/iu.test(text);
}

function resolveSourceUnitOverlaps(cues: RawCue[]) {
  const output: RawCue[] = [];

  for (const originalCue of cues) {
    let cue = { ...originalCue };
    const previous = output[output.length - 1];
    if (previous && previous.end > cue.start) {
      const trimmedDuration = cue.start - previous.start;
      if (trimmedDuration >= 0.2) {
        previous.end = cue.start;
      } else if (isStandaloneSourceMusic(previous.text)) {
        output.pop();
      } else {
        output.pop();
        cue = {
          start: Math.min(previous.start, cue.start),
          end: Math.max(previous.end, cue.end),
          text: joinSourceFragments(previous.text, cue.text)
        };
        const prior = output[output.length - 1];
        if (prior && prior.end > cue.start && cue.start - prior.start >= 0.2) {
          prior.end = cue.start;
        }
      }
    }
    output.push(cue);
  }

  return output.filter((cue) => cue.end - cue.start >= 0.2);
}

function enforceSourceCueOrder(cues: RawCue[]) {
  const output: RawCue[] = [];

  for (const originalCue of cues) {
    const cue = { ...originalCue };
    const previous = output[output.length - 1];
    if (previous && previous.end > cue.start) {
      const trimmedPreviousDuration = cue.start - previous.start;
      if (trimmedPreviousDuration >= 0.2) {
        previous.end = cue.start;
      } else {
        cue.start = previous.end;
      }
    }
    if (cue.end - cue.start >= 0.2) output.push(cue);
  }

  return output;
}

function mergeIncompleteSourceCues(cues: RawCue[]) {
  const output: RawCue[] = [];
  for (const cue of cues) {
    const previous = output[output.length - 1];
    const combinedText = previous ? joinSourceFragments(previous.text, cue.text) : cue.text;
    const canCompletePrevious = previous
      && !endsAtSourceBoundary(previous.text)
      && cue.start - previous.end <= AUTO_GROUP_MAX_GAP
      && cue.end - previous.start <= SEMANTIC_SOURCE_MAX_DURATION
      && Array.from(combinedText).length <= SEMANTIC_SOURCE_MAX_CHARACTERS;

    if (canCompletePrevious) {
      output[output.length - 1] = {
        start: previous.start,
        end: Math.max(previous.end, cue.end),
        text: combinedText
      };
    } else {
      output.push({ ...cue });
    }
  }
  return output;
}

function splitSourceUnitAtBoundaries(cue: RawCue) {
  const text = normalizeText(cue.text);
  const parts = text.split(/(?<=[.!?;:])\s+(?=[A-Z\[])/u).filter(Boolean);
  if (parts.length <= 1) return [cue];

  const duration = cue.end - cue.start;
  const totalLength = parts.reduce((sum, part) => sum + Array.from(part).length, 0);
  if (!totalLength || duration / parts.length < MIN_SOURCE_SPLIT_PART_DURATION) return [cue];

  const output: RawCue[] = [];
  if (parts.length === 2 && duration <= 3 && sourceWords(parts[1]).length <= 6) {
    const shortFinalDuration = Math.min(SHORT_FINAL_SOURCE_PART_DURATION, duration - MIN_SOURCE_SPLIT_PART_DURATION);
    if (shortFinalDuration >= 0.5) {
      const boundary = cue.end - shortFinalDuration;
      return [
        { start: cue.start, end: boundary, text: parts[0] },
        { start: boundary, end: cue.end, text: parts[1] }
      ];
    }
  }

  let start = cue.start;
  let consumed = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const isLast = index === parts.length - 1;
    consumed += Array.from(part).length;
    const end = isLast
      ? cue.end
      : cue.start + duration * (consumed / totalLength);
    output.push({ start, end, text: part });
    start = end;
  }
  return output;
}

export function resolveOverlaps(cues: RawCue[]) {
  const normalized = cues
    .map((cue) => ({ ...cue, text: stripSpeakerMarker(cue.text) }))
    .filter((cue) => cue.text && cue.end > cue.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const resolved: RawCue[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    let cue = normalized[index];
    const next = normalized[index + 1];
    if (next && cue.end - next.start > 0.05) {
      if (isShortBackchannel(cue.text) && next.text.length > cue.text.length) {
        normalized[index + 1] = {
          start: Math.min(cue.start, next.start),
          end: Math.max(cue.end, next.end),
          text: joinText(cue.text, next.text)
        };
        continue;
      }
      if (isShortBackchannel(next.text)) {
        cue = {
          start: cue.start,
          end: Math.max(cue.end, next.end),
          text: joinText(cue.text, next.text)
        };
        index += 1;
      } else {
        cue = { ...cue, end: Math.max(cue.start + 0.2, next.start) };
      }
    }
    resolved.push(cue);
  }

  return resolved.map((cue, index) => ({ ...cue, index }));
}

export function prepareSourceCues(cues: RawCue[], captionType: "manual" | "auto" = "manual") {
  if (captionType !== "auto") {
    return mergeIncompleteSourceCues(resolveOverlaps(cues)).map((cue, index) => ({ ...cue, index }));
  }

  const normalized = cues
    .map((cue) => ({ ...cue, text: stripSpeakerMarker(cue.text) }))
    .filter((cue) => cue.text && cue.end > cue.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const grouped: RawCue[] = [];
  let current: RawCue | null = null;
  let carriedText = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const cue = carriedText
      ? { ...normalized[index], text: joinSourceFragments(carriedText, normalized[index].text) }
      : normalized[index];
    carriedText = "";
    current = current
      ? {
          start: current.start,
          end: Math.max(current.end, cue.end),
          text: joinSourceFragments(current.text, cue.text)
        }
      : { ...cue };

    const next = normalized[index + 1];
    const nextText = next ? joinSourceFragments(current.text, next.text) : current.text;
    const nextEnd = next ? Math.max(current.end, next.end) : current.end;
    const nextGap = next ? next.start - current.end : Number.POSITIVE_INFINITY;
    const wouldExceedLength = Array.from(nextText).length > AUTO_GROUP_MAX_SOURCE_CHARACTERS;
    const wouldExceedDuration = nextEnd - current.start > AUTO_GROUP_MAX_DURATION;
    const hasBoundary = endsAtSourceBoundary(current.text);
    const hasGap = nextGap > AUTO_GROUP_MAX_GAP;

    if (!next || hasBoundary || hasGap || wouldExceedLength || wouldExceedDuration) {
      const trailingFragment = next && !hasBoundary && next.start < current.end
        ? splitTrailingIncompleteSourceFragment(current.text)
        : null;
      if (trailingFragment && next.start - current.start >= 0.2) {
        grouped.push({ ...current, end: next.start, text: trailingFragment.prefix });
        carriedText = trailingFragment.tail;
        current = null;
        continue;
      }

      const shouldCapAtNextStart = Boolean(
        next
        && hasBoundary
        && next.start < current.end
        && next.start - current.start >= 0.2
      );
      grouped.push(shouldCapAtNextStart ? { ...current, end: next.start } : current);
      current = null;
    }
  }

  const split = grouped.flatMap(splitSourceUnitAtBoundaries);
  return mergeIncompleteSourceCues(
    enforceSourceCueOrder(resolveSourceUnitOverlaps(split))
  ).map((cue, index) => ({ ...cue, index }));
}

export function chunkCues(cues: CleanCue[], maxChars = 4200) {
  const chunks: CleanCue[][] = [];
  let current: CleanCue[] = [];
  let size = 0;
  for (const cue of cues) {
    const nextSize = cue.text.length + 24;
    if (current.length && size + nextSize > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(cue);
    size += nextSize;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function sanitizeTiming(cues: TranslatedCue[]) {
  const sorted = [...cues].sort((a, b) => a.start - b.start || a.end - b.end);
  const output: TranslatedCue[] = [];
  for (const cue of sorted) {
    let start = cue.start;
    let end = Math.max(cue.end, start + 0.2);
    const previous = output[output.length - 1];
    if (previous && start < previous.end) {
      start = previous.end;
      end = Math.max(end, start + 0.2);
    }
    output.push({ ...cue, start, end, text: cue.text });
  }
  return output;
}

function endsAtPunctuationBoundary(text: string) {
  const normalized = normalizeText(text);
  const withoutClosingMarks = normalized.replace(/[」』）】》〉]+$/u, "");
  return BOUNDARY_PUNCTUATION.some((mark) => withoutClosingMarks.endsWith(mark));
}

function endsAtStrongPunctuation(text: string) {
  return /(?:[。.!！？?；;][」』）】》〉]*|\[[^\]]*(?:music|音乐)[^\]]*\])$/iu.test(normalizeText(text));
}

function joinTranslatedText(first: string, second: string) {
  const left = normalizeText(first);
  const right = normalizeText(second);
  if (!left) return right;
  if (!right) return left;
  return /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right)
    ? `${left} ${right}`
    : `${left}${right}`;
}

function mergeTranslatedCues(first: TranslatedCue, second: TranslatedCue, text: string): TranslatedCue {
  return {
    start: first.start,
    end: Math.max(first.end, second.end),
    text: normalizeText(text),
    sourceText: joinSourceText(first.sourceText, second.sourceText),
    sourceIndexes: mergeSourceIndexes(first.sourceIndexes, second.sourceIndexes)
  };
}

function leadingJapanesePunctuation(text: string) {
  return normalizeText(text).match(/^((?:[、。！？]+[」』）】》〉]*)|(?:[」』）】》〉]+[、。！？]*))/u);
}

function appendJapanesePunctuation(previousText: string, punctuation: string) {
  const previous = normalizeText(previousText);
  if (!punctuation) return previous;
  if (/^[。！？]/u.test(punctuation)) {
    const previousClosing = previous.match(/[」』）】》〉]+$/u)?.[0] || "";
    const punctuationClosing = punctuation.match(/[」』）】》〉]+$/u)?.[0] || "";
    const previousStem = previous
      .slice(0, previous.length - previousClosing.length)
      .replace(/[、。！？]+$/u, "");
    const punctuationMarks = punctuation.slice(0, punctuation.length - punctuationClosing.length);
    return `${previousStem}${punctuationMarks}${punctuationClosing || previousClosing}`;
  }
  if (punctuation.startsWith("、")) {
    return /[、。！？][」』）】》〉]*$/u.test(previous) ? previous : `${previous}、`;
  }
  return `${previous}${punctuation}`;
}

function repairJapaneseLeadingPunctuation(cues: TranslatedCue[], targetLanguage?: string) {
  if (!isJapaneseTarget(targetLanguage)) return cues;

  const output: TranslatedCue[] = [];
  for (const originalCue of sanitizeTiming(cues)) {
    const normalizedText = normalizeTranslatedText(originalCue.text, targetLanguage);
    const leading = leadingJapanesePunctuation(normalizedText);
    const previous = output[output.length - 1];
    if (leading && previous) {
      previous.text = appendJapanesePunctuation(previous.text, leading[0]);
    }

    const text = leading
      ? normalizeText(normalizedText.slice(leading[0].length))
      : normalizedText;
    const repairedText = previous ? text : text.replace(/^[、。！？」』）】》〉]+/u, "");
    if (repairedText) output.push({ ...originalCue, text: repairedText });
  }
  return output;
}

function repairJapaneseCueBoundaries(cues: TranslatedCue[], targetLanguage?: string) {
  if (!isJapaneseTarget(targetLanguage)) return cues;

  const output: TranslatedCue[] = [];
  for (const current of repairJapaneseLeadingPunctuation(cues, targetLanguage)) {
    const previous = output[output.length - 1];
    if (!previous) {
      output.push(current);
      continue;
    }

    const isFileExtensionBoundary = /[A-Za-z0-9_-]+\.$/u.test(previous.text)
      && /^(?:md|html?|css|jsx?|tsx?|json|ya?ml|txt|pdf|pptx?|docx?)(?=[^A-Za-z]|$)/iu.test(current.text);
    const isLatinNameBoundary = /[A-Za-z][A-Za-z0-9'’-]*、$/u.test(previous.text)
      && /^[A-Z][A-Za-z0-9'’-]*/u.test(current.text);
    const isDetachedParticle = /、$/u.test(previous.text)
      && /^(?:で|を|に|が|は|も|の|と|へ|から|まで|より|って)(?=[、。！？\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])/u.test(current.text);
    const isDetachedDesuEnding = /で、$/u.test(previous.text) && /^す(?:[。！？]|$)/u.test(current.text);
    const isOpenQuoteBoundary = /[「『（【《〈]$/u.test(previous.text);
    const isAttributiveModifierBoundary = /(?:された|している|できる|になる|ではない|この新しい|その新しい|あの新しい|同じ)$/u.test(previous.text.replace(/、$/u, ""))
      && /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z0-9]/u.test(current.text);

    if (isOpenQuoteBoundary) {
      output[output.length - 1] = mergeTranslatedCues(previous, current, `${previous.text}${current.text}`);
    } else if (isFileExtensionBoundary) {
      output[output.length - 1] = mergeTranslatedCues(previous, current, `${previous.text}${current.text}`);
    } else if (isLatinNameBoundary) {
      output[output.length - 1] = mergeTranslatedCues(
        previous,
        current,
        `${previous.text.slice(0, -1)} ${current.text}`
      );
    } else if (isDetachedDesuEnding || isDetachedParticle || isAttributiveModifierBoundary) {
      output[output.length - 1] = mergeTranslatedCues(
        previous,
        current,
        `${previous.text.replace(/、$/u, "")}${current.text}`
      );
    } else {
      output.push(current);
    }
  }
  return output;
}

function joinSourceText(first?: string, second?: string) {
  return joinSourceFragments(first || "", second || "");
}

function visibleLength(text: string) {
  return Array.from(normalizeText(text)).length;
}

function isStandaloneMusic(text: string) {
  return /^\s*\[[^\]]*(music|音乐)[^\]]*\]\s*$/iu.test(text);
}

function canMergeSourceTimedCue(current: TranslatedCue, next: TranslatedCue) {
  const gap = next.start - current.end;
  const combinedText = joinTranslatedText(current.text, next.text);
  return gap >= -0.05
    && gap <= MAX_SOURCE_TIMED_GROUP_GAP
    && next.end - current.start <= MAX_SOURCE_TIMED_GROUP_DURATION
    && visibleLength(combinedText) <= MAX_SOURCE_TIMED_GROUP_CHARACTERS
    && !endsAtStrongPunctuation(current.text)
    && !isStandaloneMusic(current.text)
    && !isStandaloneMusic(next.text);
}

function canAbsorbShortFragment(previous: TranslatedCue, current: TranslatedCue) {
  const gap = current.start - previous.end;
  const duration = current.end - current.start;
  const combinedText = joinTranslatedText(previous.text, current.text);
  if (gap < -0.05 || gap > 0.05) return false;
  if (isStandaloneMusic(previous.text) || isStandaloneMusic(current.text)) return false;
  if (current.end - previous.start > MAX_SOURCE_TIMED_GROUP_DURATION) return false;
  if (visibleLength(combinedText) > MAX_SOURCE_TIMED_GROUP_CHARACTERS) return false;
  return duration < MIN_STANDALONE_DURATION;
}

function absorbShortFragments(cues: TranslatedCue[]) {
  const output: TranslatedCue[] = [];
  for (const cue of cues) {
    const previous = output[output.length - 1];
    if (previous && canAbsorbShortFragment(previous, cue)) {
      output[output.length - 1] = {
        start: previous.start,
        end: cue.end,
        text: joinTranslatedText(previous.text, cue.text),
        sourceText: joinSourceText(previous.sourceText, cue.sourceText),
        sourceIndexes: mergeSourceIndexes(previous.sourceIndexes, cue.sourceIndexes)
      };
    } else {
      output.push(cue);
    }
  }
  return output;
}

export function groupBySourceTiming(cues: TranslatedCue[]) {
  const output: TranslatedCue[] = [];
  let current: TranslatedCue | null = null;

  for (const cue of sanitizeTiming(cues)) {
    const text = normalizeText(cue.text);
    if (!text) continue;
    const next = { ...cue, text };
    if (current && canMergeSourceTimedCue(current, next)) {
      current = {
        start: current.start,
        end: Math.max(current.end, next.end),
        text: joinTranslatedText(current.text, next.text),
        sourceText: joinSourceText(current.sourceText, next.sourceText),
        sourceIndexes: mergeSourceIndexes(current.sourceIndexes, next.sourceIndexes)
      };
    } else {
      if (current) output.push(current);
      current = next;
    }
  }

  if (current) output.push(current);
  return absorbShortFragments(output);
}

function mergeSourceIndexes(first?: number[], second?: number[]) {
  const indexes = [...(first || []), ...(second || [])];
  return indexes.length ? [...new Set(indexes)].sort((a, b) => a - b) : undefined;
}

function shouldBreakPunctuationBuffer(buffer: TranslatedCue, current: TranslatedCue) {
  const combinedText = joinTranslatedText(buffer.text, current.text);
  const combinedIndexes = mergeSourceIndexes(buffer.sourceIndexes, current.sourceIndexes);
  return current.start - buffer.end > MAX_SOURCE_TIMED_GROUP_GAP
    || current.end - buffer.start > MAX_SOURCE_TIMED_GROUP_DURATION
    || visibleLength(combinedText) > MAX_SOURCE_TIMED_GROUP_CHARACTERS
    || sourceIndexSpan(combinedIndexes) > MAX_SOURCE_INDEX_SPAN
    || isStandaloneMusic(buffer.text)
    || isStandaloneMusic(current.text);
}

export function enforcePunctuationSegmentation(cues: TranslatedCue[]) {
  const merged: TranslatedCue[] = [];
  let buffer: TranslatedCue | null = null;

  for (const cue of [...cues].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const text = normalizeText(cue.text);
    if (!text) continue;
    const current = { ...cue, text };
    if (buffer && shouldBreakPunctuationBuffer(buffer, current)) {
      merged.push(buffer);
      buffer = null;
    }
    buffer = buffer
      ? {
          start: buffer.start,
          end: Math.max(buffer.end, current.end),
          text: joinTranslatedText(buffer.text, current.text),
          sourceText: joinSourceText(buffer.sourceText, current.sourceText),
          sourceIndexes: mergeSourceIndexes(buffer.sourceIndexes, current.sourceIndexes)
        }
      : current;

    if (endsAtPunctuationBoundary(buffer.text)) {
      merged.push(buffer);
      buffer = null;
    }
  }

  if (buffer) merged.push(buffer);
  return merged;
}

export function enforceReadableDurations(cues: TranslatedCue[]) {
  const input = sanitizeTiming(cues);
  const output: TranslatedCue[] = [];

  for (let index = 0; index < input.length; index += 1) {
    let current = { ...input[index] };
    const next = input[index + 1];
    const missing = MIN_DISPLAY_DURATION - (current.end - current.start);

    if (missing > 0 && next) {
      current.end += Math.min(missing, Math.max(0, next.start - current.end));
    }

    while (current.end - current.start < MIN_DISPLAY_DURATION && index + 1 < input.length) {
      const following = input[index + 1];
      current = {
        start: current.start,
        end: following.end,
        text: joinTranslatedText(current.text, following.text),
        sourceText: joinSourceText(current.sourceText, following.sourceText),
        sourceIndexes: mergeSourceIndexes(current.sourceIndexes, following.sourceIndexes)
      };
      index += 1;
    }

    if (current.end - current.start < MIN_DISPLAY_DURATION && output.length) {
      const previous = output.pop()!;
      current = {
        start: previous.start,
        end: current.end,
        text: joinTranslatedText(previous.text, current.text),
        sourceText: joinSourceText(previous.sourceText, current.sourceText),
        sourceIndexes: mergeSourceIndexes(previous.sourceIndexes, current.sourceIndexes)
      };
    }

    output.push(current);
  }

  return sanitizeTiming(output);
}

function isBoundaryCharacter(character: string) {
  return boundaryPriority(character) > 0;
}

function boundaryPriority(character: string) {
  if (/[。.!！？?…]/u.test(character)) return 2;
  if (/[，,、；;：:]/u.test(character)) return 1;
  return 0;
}

function isDigit(character?: string) {
  return Boolean(character && /[0-9]/u.test(character));
}

function isNumericTokenCharacter(character?: string) {
  return Boolean(character && /[0-9.,:％%$¥￥€£]/u.test(character));
}

function boundaryPriorityAt(characters: string[], index: number) {
  const character = characters[index];
  const previous = characters[index - 1];
  const next = characters[index + 1];
  if (/[.,:]/u.test(character) && isDigit(previous) && isDigit(next)) return 0;
  if (character === "." && /[A-Za-z0-9_-]/u.test(previous || "") && /[A-Za-z]/u.test(next || "")) return 0;
  return boundaryPriority(character);
}

function keepNumericTokenIntact(characters: string[], offset: number, cutLength: number) {
  let cut = offset + cutLength;
  const previous = characters[cut - 1];
  const next = characters[cut];
  if (!isNumericTokenCharacter(previous) || !isNumericTokenCharacter(next)) return cutLength;

  while (cut < characters.length && isNumericTokenCharacter(characters[cut])) cut += 1;
  return cut - offset;
}

function isPunctuationOnly(text: string) {
  return /^[\s，,、。.!！？?；;：:…]+$/u.test(text);
}

function sourceIndexSpan(indexes?: number[]) {
  if (!indexes?.length) return 0;
  return Math.max(...indexes) - Math.min(...indexes) + 1;
}

function findWordBoundary(characters: string[], offset: number, maxLength: number) {
  for (let length = maxLength; length > Math.max(1, Math.floor(maxLength * 0.55)); length -= 1) {
    const previous = characters[offset + length - 1];
    const next = characters[offset + length];
    if (/\s/u.test(previous) || /\s/u.test(next || "")) return length;
  }
  return maxLength;
}

function isKatakanaWordCharacter(character?: string) {
  return Boolean(character && /[\u30a0-\u30ff\u31f0-\u31ff\uff66-\uff9f]/u.test(character));
}

function protectJapaneseKatakanaBoundary(
  characters: string[],
  offset: number,
  cutLength: number,
  maximumCutLength: number
) {
  const cut = offset + cutLength;
  if (!isKatakanaWordCharacter(characters[cut - 1]) || !isKatakanaWordCharacter(characters[cut])) {
    return cutLength;
  }

  let tokenStart = cut - 1;
  while (tokenStart > offset && isKatakanaWordCharacter(characters[tokenStart - 1])) tokenStart -= 1;
  let tokenEnd = cut;
  while (tokenEnd < characters.length && isKatakanaWordCharacter(characters[tokenEnd])) tokenEnd += 1;

  if (/^(?:で|を|に|が|は|も|の|と|へ)$/u.test(characters[tokenEnd] || "") && tokenStart > offset) {
    return tokenStart - offset;
  }

  const rightCutLength = tokenEnd - offset;
  if (rightCutLength <= maximumCutLength) return rightCutLength;
  if (tokenStart > offset) return tokenStart - offset;
  return cutLength;
}

function isLatinTermCharacter(character?: string) {
  return Boolean(character && /[A-Za-z0-9._'’\-]/u.test(character));
}

function protectJapaneseLatinTermBoundary(
  characters: string[],
  offset: number,
  cutLength: number,
  maximumCutLength: number
) {
  const cut = offset + cutLength;
  let left = cut - 1;
  let right = cut;
  while (left >= offset && /\s/u.test(characters[left])) left -= 1;
  while (right < characters.length && /\s/u.test(characters[right])) right += 1;
  if (!isLatinTermCharacter(characters[left]) || !isLatinTermCharacter(characters[right])) return cutLength;

  let termStart = left;
  while (termStart > offset) {
    const previous = characters[termStart - 1];
    if (isLatinTermCharacter(previous)) {
      termStart -= 1;
      continue;
    }
    if (/\s/u.test(previous || "")) {
      let beforeSpace = termStart - 1;
      while (beforeSpace >= offset && /\s/u.test(characters[beforeSpace])) beforeSpace -= 1;
      if (isLatinTermCharacter(characters[beforeSpace])) {
        termStart = beforeSpace;
        continue;
      }
    }
    break;
  }

  let termEnd = right;
  while (termEnd < characters.length) {
    const character = characters[termEnd];
    if (isLatinTermCharacter(character)) {
      termEnd += 1;
      continue;
    }
    if (/\s/u.test(character || "")) {
      let afterSpace = termEnd;
      while (afterSpace < characters.length && /\s/u.test(characters[afterSpace])) afterSpace += 1;
      if (isLatinTermCharacter(characters[afterSpace])) {
        termEnd = afterSpace;
        continue;
      }
    }
    break;
  }

  if (termStart > offset) return termStart - offset;
  const rightCutLength = termEnd - offset;
  return rightCutLength <= maximumCutLength ? rightCutLength : cutLength;
}

function protectJapaneseAttributiveBoundary(
  characters: string[],
  offset: number,
  cutLength: number,
  maximumCutLength: number
) {
  const cut = offset + cutLength;
  const left = characters.slice(offset, cut).join("");
  const right = characters.slice(cut).join("");
  const splitsModifier = /(?:された|している|できる|になる|ではない|この新しい|その新しい|あの新しい|同じ)$/u.test(left)
    && /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z0-9]/u.test(right);
  if (!splitsModifier) return cutLength;

  const maximumCut = offset + maximumCutLength;
  for (let index = cut; index < maximumCut; index += 1) {
    if (/[、。！？]/u.test(characters[index])) return index + 1 - offset;
  }
  return cutLength;
}

function protectJapaneseQuoteBoundary(
  characters: string[],
  offset: number,
  cutLength: number,
  maximumCutLength: number
) {
  const cut = offset + cutLength;
  const beforeCut = characters.slice(offset, cut).join("");
  const quotePairs: Array<[string, string]> = [["「", "」"], ["『", "』"]];

  for (const [opening, closing] of quotePairs) {
    if (beforeCut.lastIndexOf(opening) <= beforeCut.lastIndexOf(closing)) continue;
    const maximumCut = offset + maximumCutLength;
    for (let index = cut; index < maximumCut; index += 1) {
      if (characters[index] !== closing) continue;
      for (let tailIndex = index + 1; tailIndex <= maximumCut; tailIndex += 1) {
        if (/[、。！？]/u.test(characters[tailIndex] || "")) {
          return tailIndex - offset;
        }
      }
      return index + 1 - offset;
    }
  }
  return cutLength;
}

function findBoundaryCut(input: {
  characters: string[];
  offset: number;
  minLength: number;
  maxLength: number;
  idealLength: number;
}) {
  const limit = Math.min(
    input.maxLength,
    input.characters.length - input.offset - 1
  );
  if (limit < input.minLength) return 0;

  let bestLength = 0;
  let bestPriority = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let length = input.minLength; length <= limit; length += 1) {
    const priority = boundaryPriorityAt(input.characters, input.offset + length - 1);
    if (!priority) continue;
    const distance = Math.abs(length - input.idealLength);
    if (priority > bestPriority || (priority === bestPriority && distance < bestDistance)) {
      bestLength = length;
      bestPriority = priority;
      bestDistance = distance;
    }
  }
  return bestLength;
}

function splitTextIntoParts(text: string, partCount: number, forceSafetySplit = false, targetLanguage?: string) {
  const characters = Array.from(normalizeTranslatedText(text, targetLanguage));
  const parts: string[] = [];
  let offset = 0;

  for (let partIndex = 0; partIndex < partCount; partIndex += 1) {
    const partsLeft = partCount - partIndex;
    const remaining = characters.length - offset;
    if (partsLeft === 1) {
      parts.push(characters.slice(offset).join("").trim());
      break;
    }

    const idealLength = Math.ceil(remaining / partsLeft);
    const minimumUsefulLength = Math.max(1, Math.floor(Math.min(idealLength, MAX_SUBTITLE_CHARACTERS) * 0.55));
    const naturalLimit = Math.min(
      Math.max(MAX_SUBTITLE_CHARACTERS, idealLength + 10),
      MAX_UNBROKEN_SUBTITLE_CHARACTERS,
      remaining - (partsLeft - 1)
    );
    const boundaryCutLength = findBoundaryCut({
      characters,
      offset,
      minLength: minimumUsefulLength,
      maxLength: naturalLimit,
      idealLength
    });
    const safetyLimit = Math.min(
      forceSafetySplit ? Math.max(idealLength, MAX_SUBTITLE_CHARACTERS) : MAX_UNBROKEN_SUBTITLE_CHARACTERS,
      MAX_UNBROKEN_SUBTITLE_CHARACTERS,
      remaining - (partsLeft - 1)
    );
    let cutLength = boundaryCutLength || (
      remaining <= safetyLimit && !forceSafetySplit
        ? remaining
        : findWordBoundary(characters, offset, safetyLimit)
    );
    cutLength = keepNumericTokenIntact(characters, offset, cutLength);
    if (isJapaneseTarget(targetLanguage)) {
      cutLength = protectJapaneseKatakanaBoundary(
        characters,
        offset,
        cutLength,
        remaining - (partsLeft - 1)
      );
      cutLength = protectJapaneseLatinTermBoundary(
        characters,
        offset,
        cutLength,
        remaining - (partsLeft - 1)
      );
      cutLength = protectJapaneseAttributiveBoundary(
        characters,
        offset,
        cutLength,
        remaining - (partsLeft - 1)
      );
      cutLength = protectJapaneseQuoteBoundary(
        characters,
        offset,
        cutLength,
        remaining - (partsLeft - 1)
      );
    }
    const trailingText = characters.slice(offset + cutLength).join("").trim();
    if (
      trailingText
      && (isPunctuationOnly(trailingText) || visibleLength(trailingText) < MIN_SPLIT_FRAGMENT_CHARACTERS)
    ) {
      cutLength = remaining;
    }

    parts.push(characters.slice(offset, offset + cutLength).join("").trim());
    offset += cutLength;
  }

  return mergeTinyParts(mergePunctuationOnlyParts(parts.filter(Boolean)));
}

function mergePunctuationOnlyParts(parts: string[]) {
  const output: string[] = [];
  for (const part of parts) {
    if (isPunctuationOnly(part) && output.length) {
      output[output.length - 1] = `${output[output.length - 1]}${part}`;
    } else {
      output.push(part);
    }
  }

  while (output.length > 1 && isPunctuationOnly(output[0])) {
    output[1] = `${output[0]}${output[1]}`;
    output.shift();
  }
  return output;
}

function mergeTinyParts(parts: string[]) {
  const output: string[] = [];
  for (const part of parts) {
    if (visibleLength(part) < MIN_SPLIT_FRAGMENT_CHARACTERS && output.length) {
      output[output.length - 1] = joinTranslatedText(output[output.length - 1], part);
    } else {
      output.push(part);
    }
  }

  while (output.length > 1 && visibleLength(output[0]) < MIN_SPLIT_FRAGMENT_CHARACTERS) {
    output[1] = joinTranslatedText(output[0], output[1]);
    output.shift();
  }
  return output;
}

function splitWordsIntoParts(words: string[], partCount: number) {
  const parts: string[] = [];
  let offset = 0;

  for (let partIndex = 0; partIndex < partCount; partIndex += 1) {
    const partsLeft = partCount - partIndex;
    if (partsLeft === 1) {
      parts.push(words.slice(offset).join(" "));
      break;
    }

    const remainingWords = words.slice(offset);
    const idealLength = visibleLength(remainingWords.join(" ")) / partsLeft;
    const maxEnd = words.length - (partsLeft - 1);
    let bestEnd = offset + 1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let end = offset + 1; end <= maxEnd; end += 1) {
      const text = words.slice(offset, end).join(" ");
      const distance = Math.abs(visibleLength(text) - idealLength);
      if (distance < bestDistance) {
        bestEnd = end;
        bestDistance = distance;
      }
    }

    parts.push(words.slice(offset, bestEnd).join(" "));
    offset = bestEnd;
  }

  return parts.filter(Boolean);
}

function splitCharactersEvenly(text: string, partCount: number) {
  const characters = Array.from(text);
  const parts: string[] = [];
  let offset = 0;

  for (let partIndex = 0; partIndex < partCount; partIndex += 1) {
    const partsLeft = partCount - partIndex;
    const remaining = characters.length - offset;
    const length = Math.ceil(remaining / partsLeft);
    parts.push(characters.slice(offset, offset + length).join("").trim());
    offset += length;
  }

  return parts.filter(Boolean);
}

function splitSourceTextIntoParts(sourceText: string | undefined, partCount: number, forceSafetySplit: boolean) {
  const text = normalizeText(sourceText || "");
  if (!text) return [];
  if (partCount <= 1) return [text];

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= partCount) return splitWordsIntoParts(words, partCount);

  const naturalParts = splitTextIntoParts(text, partCount, forceSafetySplit);
  if (naturalParts.length === partCount) return naturalParts;

  return splitCharactersEvenly(text, partCount);
}

function distributeIndexes(indexes: number[] | undefined, partIndex: number, partCount: number) {
  if (!indexes?.length) return undefined;
  const start = Math.floor((indexes.length * partIndex) / partCount);
  const end = Math.floor((indexes.length * (partIndex + 1)) / partCount);
  return indexes.slice(start, Math.max(start + 1, end));
}

export function enforceSubtitleLimits(cues: TranslatedCue[], targetLanguage?: string) {
  const output: TranslatedCue[] = [];

  for (const cue of sanitizeTiming(cues)) {
    const normalizedText = normalizeTranslatedText(cue.text, targetLanguage);
    const textLength = Array.from(normalizedText).length;
    if (!textLength) continue;
    const duration = Math.max(0.2, cue.end - cue.start);
    const isShortLabel = textLength <= 12 && sourceIndexSpan(cue.sourceIndexes) <= MAX_SOURCE_INDEX_SPAN;
    const requiredParts = Math.max(
      1,
      Math.ceil(textLength / MAX_SUBTITLE_CHARACTERS),
      isShortLabel ? 1 : Math.ceil(duration / MAX_SUBTITLE_DURATION),
      Math.ceil(sourceIndexSpan(cue.sourceIndexes) / MAX_SOURCE_INDEX_SPAN)
    );
    const forceSafetySplit = duration > MAX_UNBROKEN_SUBTITLE_DURATION;
    const parts = splitTextIntoParts(normalizedText, Math.min(requiredParts, textLength), forceSafetySplit, targetLanguage);
    const sourceParts = splitSourceTextIntoParts(cue.sourceText, parts.length, forceSafetySplit);
    const partLengths = parts.map((part) => Math.max(1, visibleLength(part)));
    const totalPartLength = partLengths.reduce((sum, length) => sum + length, 0);
    const minimumPartDuration = isJapaneseTarget(targetLanguage) && duration >= parts.length * MIN_DISPLAY_DURATION
      ? MIN_DISPLAY_DURATION
      : 0;
    const flexibleDuration = duration - minimumPartDuration * parts.length;
    let consumedDuration = 0;

    parts.forEach((text, index) => {
      const start = cue.start + consumedDuration;
      const isLast = index === parts.length - 1;
      const weightedDuration = isJapaneseTarget(targetLanguage)
        ? minimumPartDuration + flexibleDuration * (partLengths[index] / totalPartLength)
        : duration / parts.length;
      const end = isLast ? cue.end : start + weightedDuration;
      consumedDuration += weightedDuration;
      output.push({
        start,
        end,
        text,
        sourceText: sourceParts[index] || cue.sourceText,
        sourceIndexes: distributeIndexes(cue.sourceIndexes, index, parts.length)
      });
    });
  }

  return sanitizeTiming(output);
}

function continuationPunctuation(text: string, targetLanguage?: string) {
  if (isJapaneseTarget(targetLanguage)) return "、";
  return /[\u3400-\u9fff]/u.test(text) ? "，" : ",";
}

function terminalPunctuation(text: string, targetLanguage?: string) {
  if (isJapaneseTarget(targetLanguage)) return "。";
  return /[\u3400-\u9fff]/u.test(text) ? "。" : ".";
}

function endsAtReadablePunctuation(text: string) {
  return /[，,、。.!！？?；;：:…][」』）】》〉]*$/u.test(normalizeText(text));
}

function addContinuationPunctuation(cues: TranslatedCue[], targetLanguage?: string) {
  return cues.map((cue, index) => {
    const next = cues[index + 1];
    if (
      endsAtReadablePunctuation(cue.text)
      || (isJapaneseTarget(targetLanguage) && /[「『（【《〈]$/u.test(cue.text))
      || isStandaloneMusic(cue.text)
      || (next && isStandaloneMusic(next.text))
    ) {
      return cue;
    }

    if (!next || next.start - cue.end > MAX_SOURCE_TIMED_GROUP_GAP) {
      return {
        ...cue,
        text: `${normalizeTranslatedText(cue.text, targetLanguage)}${terminalPunctuation(cue.text, targetLanguage)}`
      };
    }

    return {
      ...cue,
      text: `${normalizeTranslatedText(cue.text, targetLanguage)}${continuationPunctuation(cue.text, targetLanguage)}`
    };
  });
}

function minimumJapaneseDuration(cue: TranslatedCue) {
  return Math.max(
    MIN_DISPLAY_DURATION,
    visibleLength(cue.text) / MAX_JAPANESE_CHARACTERS_PER_SECOND + 0.001
  );
}

function balanceJapaneseReadingSpeed(cues: TranslatedCue[], targetLanguage?: string) {
  if (!isJapaneseTarget(targetLanguage)) return cues;
  const output = sanitizeTiming(cues).map((cue) => ({ ...cue }));

  for (let index = 0; index < output.length; index += 1) {
    const current = output[index];
    let deficit = minimumJapaneseDuration(current) - (current.end - current.start);
    if (deficit <= 0.001) continue;
    deficit = Math.min(deficit, MAX_JAPANESE_BOUNDARY_SHIFT);

    const previous = output[index - 1];
    const next = output[index + 1];
    if (previous) {
      const freeGap = Math.max(0, current.start - previous.end);
      const borrowedGap = Math.min(deficit, freeGap);
      current.start -= borrowedGap;
      deficit -= borrowedGap;
    } else {
      const borrowedGap = Math.min(deficit, current.start);
      current.start -= borrowedGap;
      deficit -= borrowedGap;
    }

    if (deficit > 0.001 && next) {
      const freeGap = Math.max(0, next.start - current.end);
      const borrowedGap = Math.min(deficit, freeGap);
      current.end += borrowedGap;
      deficit -= borrowedGap;
    }

    if (deficit > 0.001 && next && Math.abs(next.start - current.end) <= 0.05) {
      const available = Math.max(0, (next.end - next.start) - minimumJapaneseDuration(next));
      const borrowed = Math.min(deficit, available);
      current.end += borrowed;
      next.start += borrowed;
      deficit -= borrowed;
    }

    if (deficit > 0.001 && previous && Math.abs(current.start - previous.end) <= 0.05) {
      const available = Math.max(0, (previous.end - previous.start) - minimumJapaneseDuration(previous));
      const borrowed = Math.min(deficit, available);
      previous.end -= borrowed;
      current.start -= borrowed;
    }
  }

  return sanitizeTiming(output);
}

export function finalizeTranslatedCues(cues: TranslatedCue[], targetLanguage?: string) {
  const punctuated = addContinuationPunctuation(
    enforceSubtitleLimits(
      enforceReadableDurations(
        enforcePunctuationSegmentation(
          groupBySourceTiming(repairJapaneseCueBoundaries(cues, targetLanguage))
        )
      ),
      targetLanguage
    ),
    targetLanguage
  );
  return balanceJapaneseReadingSpeed(
    repairJapaneseLeadingPunctuation(punctuated, targetLanguage),
    targetLanguage
  );
}

export function toVtt(cues: TranslatedCue[]) {
  const lines = ["WEBVTT", ""];
  for (const cue of cues) {
    lines.push(`${formatTime(cue.start, ".")} --> ${formatTime(cue.end, ".")}`);
    lines.push(cue.text);
    lines.push("");
  }
  return lines.join("\n");
}

function formatTime(seconds: number, sep: "." | ",") {
  const totalMs = Math.round(seconds * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${sep}${String(ms).padStart(3, "0")}`;
}

/** Coverage is based on source identities, including a partially saved AI batch. */
export function coveredSourceIndexes(cues: TranslatedCue[]) {
  return new Set(cues.flatMap(cue => cue.sourceIndexes || []).map(Number).filter(Number.isFinite));
}
