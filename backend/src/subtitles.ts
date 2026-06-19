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
  sourceIndexes?: number[];
};

const BOUNDARY_PUNCTUATION = ["...", "……", "，", ",", "。", ".", "！", "!", "？", "?", "；", ";", "：", ":"];
const MIN_DISPLAY_DURATION = 1.2;
export const MAX_SUBTITLE_CHARACTERS = 56;
export const MAX_SUBTITLE_DURATION = 8;
export const MAX_SOURCE_INDEX_SPAN = 6;

export function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
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
  return BOUNDARY_PUNCTUATION.some((mark) => normalized.endsWith(mark));
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

function mergeSourceIndexes(first?: number[], second?: number[]) {
  const indexes = [...(first || []), ...(second || [])];
  return indexes.length ? [...new Set(indexes)].sort((a, b) => a - b) : undefined;
}

export function enforcePunctuationSegmentation(cues: TranslatedCue[]) {
  const merged: TranslatedCue[] = [];
  let buffer: TranslatedCue | null = null;

  for (const cue of [...cues].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const text = normalizeText(cue.text);
    if (!text) continue;
    const current = { ...cue, text };
    buffer = buffer
      ? {
          start: buffer.start,
          end: Math.max(buffer.end, current.end),
          text: joinTranslatedText(buffer.text, current.text),
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
        sourceIndexes: mergeSourceIndexes(previous.sourceIndexes, current.sourceIndexes)
      };
    }

    output.push(current);
  }

  return sanitizeTiming(output);
}

function isBoundaryCharacter(character: string) {
  return /[，,。.!！？?；;：:…]/u.test(character);
}

function sourceIndexSpan(indexes?: number[]) {
  if (!indexes?.length) return 0;
  return Math.max(...indexes) - Math.min(...indexes) + 1;
}

function splitTextIntoParts(text: string, partCount: number) {
  const characters = Array.from(normalizeText(text));
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
    const maxLength = Math.min(MAX_SUBTITLE_CHARACTERS, remaining - (partsLeft - 1));
    const minimumUsefulLength = Math.max(1, Math.floor(idealLength * 0.6));
    let cutLength = Math.min(idealLength, maxLength);
    let closestBoundaryDistance = Number.POSITIVE_INFINITY;

    for (let candidate = minimumUsefulLength; candidate <= maxLength; candidate += 1) {
      if (isBoundaryCharacter(characters[offset + candidate - 1])) {
        const distance = Math.abs(candidate - idealLength);
        if (distance < closestBoundaryDistance) {
          cutLength = candidate;
          closestBoundaryDistance = distance;
        }
      }
    }

    parts.push(characters.slice(offset, offset + cutLength).join("").trim());
    offset += cutLength;
  }

  return parts.filter(Boolean);
}

function distributeIndexes(indexes: number[] | undefined, partIndex: number, partCount: number) {
  if (!indexes?.length) return undefined;
  const start = Math.floor((indexes.length * partIndex) / partCount);
  const end = Math.floor((indexes.length * (partIndex + 1)) / partCount);
  return indexes.slice(start, Math.max(start + 1, end));
}

export function enforceSubtitleLimits(cues: TranslatedCue[]) {
  const output: TranslatedCue[] = [];

  for (const cue of sanitizeTiming(cues)) {
    const textLength = Array.from(normalizeText(cue.text)).length;
    if (!textLength) continue;
    const duration = Math.max(0.2, cue.end - cue.start);
    const isShortLabel = textLength <= 12 && sourceIndexSpan(cue.sourceIndexes) <= MAX_SOURCE_INDEX_SPAN;
    const requiredParts = Math.max(
      1,
      Math.ceil(textLength / MAX_SUBTITLE_CHARACTERS),
      isShortLabel ? 1 : Math.ceil(duration / MAX_SUBTITLE_DURATION),
      Math.ceil(sourceIndexSpan(cue.sourceIndexes) / MAX_SOURCE_INDEX_SPAN)
    );
    const parts = splitTextIntoParts(cue.text, Math.min(requiredParts, textLength));
    const partDuration = Math.min(duration / parts.length, MAX_SUBTITLE_DURATION);

    parts.forEach((text, index) => {
      const start = cue.start + partDuration * index;
      const end = start + partDuration;
      output.push({
        start,
        end,
        text,
        sourceIndexes: distributeIndexes(cue.sourceIndexes, index, parts.length)
      });
    });
  }

  return sanitizeTiming(output);
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
