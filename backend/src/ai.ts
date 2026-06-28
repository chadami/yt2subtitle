import crypto from "node:crypto";
import { env } from "./env.js";
import type { CleanCue, TranslatedCue } from "./subtitles.js";
import { normalizeText } from "./subtitles.js";

export const aiProviders = ["gemini", "deepseek", "openai", "claude", "qwen", "mimo"] as const;
export type AiProvider = typeof aiProviders[number];
export type ProviderMode = "system" | "user";

type VideoContext = {
  title: string;
  channel: string;
  description: string;
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

export type AiConfig = {
  providerMode: ProviderMode;
  provider: AiProvider;
  apiKey: string;
  model: string;
};

const MAX_SOURCE_REALIGN_SPAN = 10;
const MIN_SOURCE_REALIGN_SCORE = 0.6;
const MIN_SOURCE_REALIGN_IMPROVEMENT = 0.2;

const providerDefaults: Record<AiProvider, { baseUrl: string; fallbackModel: string }> = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    fallbackModel: "gemini-2.5-flash"
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    fallbackModel: "deepseek-chat"
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    fallbackModel: "gpt-4.1-mini"
  },
  claude: {
    baseUrl: "https://api.anthropic.com/v1",
    fallbackModel: "claude-sonnet-4-5"
  },
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    fallbackModel: "qwen-plus"
  },
  mimo: {
    baseUrl: "https://api.xiaomimimo.com/v1",
    fallbackModel: "mimo-v2-flash"
  }
};

export function systemAiConfig(): AiConfig {
  if (!env.DEEPSEEK_API_KEY.trim()) {
    throw new Error("DEEPSEEK_API_KEY is required for system translation mode");
  }
  return {
    providerMode: "system",
    provider: "deepseek",
    apiKey: env.DEEPSEEK_API_KEY.trim(),
    model: env.DEEPSEEK_MODEL
  };
}

export function encryptApiKey(apiKey: string) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(env.JWT_SECRET).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptApiKey(value: string) {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Invalid stored API key");
  const key = crypto.createHash("sha256").update(env.JWT_SECRET).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export async function fetchProviderModels(provider: AiProvider, apiKey: string) {
  if (provider === "gemini") return fetchGeminiModels(apiKey);
  if (provider === "claude") return fetchClaudeModels(apiKey);
  return fetchOpenAiCompatibleModels(provider, apiKey);
}

async function fetchOpenAiCompatibleModels(provider: AiProvider, apiKey: string) {
  const response = await fetch(`${providerDefaults[provider].baseUrl.replace(/\/$/, "")}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) throw new Error(`Model fetch failed: ${response.status}`);
  const data = await response.json() as { data?: Array<{ id?: string }> };
  const models = (data.data || []).map((item) => item.id).filter(isNonEmptyString);
  return models.length ? models : [providerDefaults[provider].fallbackModel];
}

async function fetchGeminiModels(apiKey: string) {
  const response = await fetch(`${providerDefaults.gemini.baseUrl}/models?key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) throw new Error(`Model fetch failed: ${response.status}`);
  const data = await response.json() as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  };
  const models = (data.models || [])
    .filter((item) => item.supportedGenerationMethods?.includes("generateContent"))
    .map((item) => item.name?.replace(/^models\//, ""))
    .filter(isNonEmptyString);
  return models.length ? models : [providerDefaults.gemini.fallbackModel];
}

async function fetchClaudeModels(apiKey: string) {
  const response = await fetch(`${providerDefaults.claude.baseUrl}/models`, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    }
  });
  if (!response.ok) throw new Error(`Model fetch failed: ${response.status}`);
  const data = await response.json() as { data?: Array<{ id?: string }> };
  const models = (data.data || []).map((item) => item.id).filter(isNonEmptyString);
  return models.length ? models : [providerDefaults.claude.fallbackModel];
}

async function chatJson(config: AiConfig, messages: ChatMessage[], temperature: number) {
  const text = config.provider === "gemini"
    ? await geminiChat(config, messages, temperature)
    : config.provider === "claude"
      ? await claudeChat(config, messages, temperature)
      : await openAiCompatibleChat(config, messages, temperature);
  return parseJsonObject(text);
}

async function openAiCompatibleChat(config: AiConfig, messages: ChatMessage[], temperature: number) {
  const baseUrl = config.providerMode === "system"
    ? env.DEEPSEEK_API_BASE
    : providerDefaults[config.provider].baseUrl;
  const body: Record<string, unknown> = {
    model: config.model || providerDefaults[config.provider].fallbackModel,
    messages,
    temperature,
    response_format: { type: "json_object" }
  };
  if (config.provider === "deepseek") body.thinking = { type: "disabled" };

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || "{}";
}

async function geminiChat(config: AiConfig, messages: ChatMessage[], temperature: number) {
  const system = messages.find((message) => message.role === "system")?.content || "";
  const user = messages.filter((message) => message.role === "user").map((message) => message.content).join("\n\n");
  const model = config.model || providerDefaults.gemini.fallbackModel;
  const response = await fetch(`${providerDefaults.gemini.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature,
        responseMimeType: "application/json"
      }
    })
  });
  if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "{}";
}

async function claudeChat(config: AiConfig, messages: ChatMessage[], temperature: number) {
  const system = messages.find((message) => message.role === "system")?.content || "";
  const userMessages = messages.filter((message) => message.role === "user");
  const response = await fetch(`${providerDefaults.claude.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model || providerDefaults.claude.fallbackModel,
      max_tokens: 4096,
      temperature,
      system,
      messages: userMessages
    })
  });
  if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
  const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  return data.content?.map((part) => part.text || "").join("") || "{}";
}

function parseJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const direct = tryParse(trimmed);
  if (direct) return direct;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const extracted = tryParse(trimmed.slice(start, end + 1));
    if (extracted) return extracted;
  }
  throw new Error("AI response was not valid JSON");
}

function tryParse(text: string) {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sourceTokens(text: string) {
  return normalizeText(text)
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function tokenOverlapScore(expectedText: string, actualText: string) {
  const expected = sourceTokens(expectedText);
  if (!expected.length) return 0;

  const actualCounts = new Map<string, number>();
  for (const token of sourceTokens(actualText)) {
    actualCounts.set(token, (actualCounts.get(token) || 0) + 1);
  }

  let matches = 0;
  for (const token of expected) {
    const count = actualCounts.get(token) || 0;
    if (count > 0) {
      matches += 1;
      actualCounts.set(token, count - 1);
    }
  }
  return matches / expected.length;
}

function joinSourceText(cues: CleanCue[]) {
  return normalizeText(cues.map((cue) => cue.text).join(" "));
}

function realignSourceCues(input: {
  sourceText: string;
  sourceCues: CleanCue[];
  rawCues: CleanCue[];
}) {
  const sourceText = normalizeText(input.sourceText);
  if (!sourceText) return input.sourceCues;

  const claimedScore = tokenOverlapScore(sourceText, joinSourceText(input.sourceCues));
  let bestScore = claimedScore;
  let bestCues = input.sourceCues;

  for (let start = 0; start < input.rawCues.length; start += 1) {
    for (let end = start; end < Math.min(input.rawCues.length, start + MAX_SOURCE_REALIGN_SPAN); end += 1) {
      const candidate = input.rawCues.slice(start, end + 1);
      const score = tokenOverlapScore(sourceText, joinSourceText(candidate));
      if (score > bestScore) {
        bestScore = score;
        bestCues = candidate;
      }
    }
  }

  if (
    bestCues !== input.sourceCues
    && bestScore >= MIN_SOURCE_REALIGN_SCORE
    && bestScore - claimedScore >= MIN_SOURCE_REALIGN_IMPROVEMENT
  ) {
    return bestCues;
  }
  return input.sourceCues;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function systemPrompt(targetLanguage: string) {
  return `
You are a senior subtitle translator and timing editor.

Use the video title, channel, description, previous context, and next context to understand topic, names, tone, and terminology.
Translate only raw_cues into natural, complete ${targetLanguage} subtitles.

Rules:
- Output strict JSON only.
- Output exactly one cue for each raw_cue in the current raw_cues array.
- Keep the same order as raw_cues.
- Each output cue must use exactly one source index: the matching raw_cue index.
- Do not merge, skip, duplicate, or reorder source indexes.
- Do not output start/end times.
- Translate only the text of the matching raw_cue.
- Do not move words, meaning, examples, conclusions, or context from neighboring raw_cues into the current output cue.
- If a raw_cue is only a sentence fragment, translate only that fragment; do not complete it with later raw_cues.
- The source field must copy the matching raw_cue text exactly.
- Prefer natural spoken wording over literal translation.
- Keep names, terms, numbers, examples, caveats, contrasts, and speaker intent accurate.
- Do not summarize, compress, or drop meaning-bearing details for readability.
- Remove only clear ASR disfluencies like "um" or immediate accidental repetitions that carry no meaning.
- Preserve the full translation; never shorten content to meet a length target.
- Restore natural punctuation after correcting the ASR transcript, even when raw_cues contains no punctuation.
- It is okay if one output cue is a fragment; backend timing/readability cleanup will merge fragments.

Return:
{"cues":[{"source_indexes":[1],"source":"source text","translation":"translated subtitle"}]}
`.trim();
}

export async function translateChunk(input: {
  aiConfig: AiConfig;
  videoContext: VideoContext;
  previousContext: CleanCue[];
  rawCues: CleanCue[];
  nextContext: CleanCue[];
  targetLanguage: string;
}) {
  const modelInput = {
    videoContext: input.videoContext,
    rawCues: input.rawCues,
    targetLanguage: input.targetLanguage
  };
  const data = await chatJson(input.aiConfig, [
    { role: "system", content: systemPrompt(input.targetLanguage) },
    { role: "user", content: JSON.stringify(modelInput) }
  ], 0.2);

  const byIndex = new Map(input.rawCues.map((cue) => [cue.index, cue]));
  const output: TranslatedCue[] = [];
  const cues = Array.isArray(data.cues) ? data.cues : [];
  const usePositionTiming = cues.length >= input.rawCues.length * 0.9;
  for (let itemIndex = 0; itemIndex < cues.length; itemIndex += 1) {
    const item = cues[itemIndex];
    if (!item || typeof item !== "object") continue;
    const sourceIndexes = Array.isArray((item as { source_indexes?: unknown }).source_indexes)
      ? (item as { source_indexes: unknown[] }).source_indexes.map(Number).filter(Number.isFinite)
      : [];
    const sourceText = String((item as { source?: unknown }).source || "");
    let sourceCues = usePositionTiming && input.rawCues[itemIndex]
      ? [input.rawCues[itemIndex]]
      : sourceIndexes.map((index) => byIndex.get(index)).filter(Boolean) as CleanCue[];
    sourceCues = realignSourceCues({ sourceText, sourceCues, rawCues: input.rawCues });
    const translation = normalizeText(String((item as { translation?: unknown }).translation || ""));
    if (!sourceCues.length || !translation) continue;
    output.push({
      start: Math.min(...sourceCues.map((cue) => cue.start)),
      end: Math.max(...sourceCues.map((cue) => cue.end)),
      text: translation,
      sourceIndexes: sourceCues.map((cue) => cue.index)
    });
  }
  return output;
}
