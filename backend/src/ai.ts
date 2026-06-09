import { env } from "./env.js";
import type { CleanCue, TranslatedCue } from "./subtitles.js";
import { normalizeText } from "./subtitles.js";

type VideoContext = {
  title: string;
  channel: string;
  description: string;
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

async function chatJson(messages: ChatMessage[], temperature: number) {
  const response = await fetch(`${env.DEEPSEEK_API_BASE.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL,
      messages,
      temperature,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" }
    })
  });
  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status}`);
  }
  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return JSON.parse(data.choices[0].message.content) as Record<string, unknown>;
}

function systemPrompt(targetLanguage: string) {
  return `
You are a senior subtitle translator and timing editor.

Use the video title, channel, description, previous context, and next context to understand topic, names, tone, and terminology.
Translate only raw_cues into natural, concise ${targetLanguage} subtitles.

Rules:
- Output strict JSON only.
- Output cues only for raw_cues.
- Use source_indexes from raw_cues.
- Do not output start/end times.
- Prefer natural spoken Chinese over literal translation.
- Keep names, terms, numbers, and speaker intent accurate.
- Compress filler and repeated phrasing.
- Prefer 8-18 Chinese characters per cue when possible.
- Do not reuse the same source index in multiple output cues.

Return:
{"cues":[{"source_indexes":[1,2],"source":"source text","translation":"translated subtitle"}]}
`.trim();
}

export async function translateChunk(input: {
  videoContext: VideoContext;
  previousContext: CleanCue[];
  rawCues: CleanCue[];
  nextContext: CleanCue[];
  targetLanguage: string;
}) {
  const data = await chatJson([
    { role: "system", content: systemPrompt(input.targetLanguage) },
    { role: "user", content: JSON.stringify(input) }
  ], 0.35);

  const byIndex = new Map(input.rawCues.map((cue) => [cue.index, cue]));
  const output: TranslatedCue[] = [];
  const cues = Array.isArray(data.cues) ? data.cues : [];
  for (const item of cues) {
    if (!item || typeof item !== "object") continue;
    const sourceIndexes = Array.isArray((item as { source_indexes?: unknown }).source_indexes)
      ? (item as { source_indexes: unknown[] }).source_indexes.map(Number).filter(Number.isFinite)
      : [];
    const sourceCues = sourceIndexes.map((index) => byIndex.get(index)).filter(Boolean) as CleanCue[];
    const translation = normalizeText(String((item as { translation?: unknown }).translation || ""));
    if (!sourceCues.length || !translation) continue;
    output.push({
      start: Math.min(...sourceCues.map((cue) => cue.start)),
      end: Math.max(...sourceCues.map((cue) => cue.end)),
      text: translation
    });
  }
  return output;
}

export async function compressSubtitle(text: string, duration: number, maxChars: number, targetLanguage: string) {
  const data = await chatJson([
    {
      role: "system",
      content: `Compress one subtitle into natural ${targetLanguage}. Max visible characters: ${maxChars}. Duration: ${duration.toFixed(2)}s. Return strict JSON: {"text":"..."}.`
    },
    { role: "user", content: JSON.stringify({ text }) }
  ], 0.2);
  return normalizeText(String(data.text || text));
}
