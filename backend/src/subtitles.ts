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
};

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
    output.push({ start, end, text: cue.text });
  }
  return output;
}

function visibleTextLength(text: string) {
  return text.replace(/\s+/g, "").length;
}

function minReadableDuration(text: string) {
  const length = visibleTextLength(text);
  if (length <= 6) return 0.45;
  if (length <= 10) return 0.8;
  if (length <= 16) return 1.0;
  if (length <= 24) return 1.35;
  if (length <= 34) return 1.7;
  if (length <= 46) return 2.1;
  return 2.5;
}

export function enforceReadableDurations(cues: TranslatedCue[]) {
  const output = sanitizeTiming(cues).map((cue) => ({ ...cue }));
  const minGap = 0.04;

  for (let index = 0; index < output.length; index += 1) {
    const cue = output[index];
    const desiredDuration = minReadableDuration(cue.text);
    let missing = desiredDuration - (cue.end - cue.start);
    if (missing <= 0) continue;

    const next = output[index + 1];
    const latestEnd = next ? Math.max(cue.start, next.start - minGap) : cue.end + missing;
    const extendBy = Math.min(missing, Math.max(0, latestEnd - cue.end));
    cue.end += extendBy;
    missing -= extendBy;

    if (missing <= 0) continue;

    const previous = output[index - 1];
    const earliestStart = previous ? previous.end + minGap : 0;
    const pullBy = Math.min(missing, Math.max(0, cue.start - earliestStart));
    cue.start -= pullBy;
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
