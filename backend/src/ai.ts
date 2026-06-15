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
  return {
    providerMode: "system",
    provider: "deepseek",
    apiKey: env.DEEPSEEK_API_KEY,
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
- Output cues only for raw_cues.
- Use source_indexes from raw_cues.
- Do not output start/end times.
- Prefer natural spoken wording over literal translation.
- Keep names, terms, numbers, examples, caveats, contrasts, and speaker intent accurate.
- Do not summarize, compress, or drop meaning-bearing details for readability.
- Remove only clear ASR disfluencies like "um" or immediate accidental repetitions that carry no meaning.
- For Chinese, a cue can be around 80-120 visible characters when needed to preserve meaning.
- If a cue is long, split at punctuation or clause boundaries instead of shortening the content.
- Do not reuse the same source index in multiple output cues.

Return:
{"cues":[{"source_indexes":[1,2],"source":"source text","translation":"translated subtitle"}]}
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
    previousContext: input.previousContext,
    rawCues: input.rawCues,
    nextContext: input.nextContext,
    targetLanguage: input.targetLanguage
  };
  const data = await chatJson(input.aiConfig, [
    { role: "system", content: systemPrompt(input.targetLanguage) },
    { role: "user", content: JSON.stringify(modelInput) }
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
