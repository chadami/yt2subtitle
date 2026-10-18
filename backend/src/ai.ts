import crypto from "node:crypto";
import { env } from "./env.js";
import type { CleanCue, TranslatedCue } from "./subtitles.js";
import { normalizeText } from "./subtitles.js";
import {
  getTranslationStrategy,
  hasJapaneseNumericCoverage,
  type TranslationStrategy
} from "./translationStrategies.js";

export const aiProviders = ["gemini", "deepseek", "openai", "claude", "qwen", "mimo"] as const;
export type AiProvider = typeof aiProviders[number];
export type ProviderMode = "system" | "user";

type VideoContext = {
  title: string;
  channel: string;
  description: string;
};

export type SubtitleTranslationContext = {
  topic: string;
  summary: string;
  tone: string;
  audience: string;
  glossary: Array<{
    source: string;
    target: string;
    note: string;
  }>;
  properNouns: string[];
  styleGuide: string[];
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
  /** Optional custom / proxy endpoint. Falls back to the provider default. */
  baseUrl?: string;
};

export function normalizeBaseUrl(value: string | undefined) {
  const trimmed = (value || "").trim().replace(/\/+$/, "");
  return trimmed;
}

const MAX_SOURCE_REALIGN_SPAN = 10;
const MIN_SOURCE_REALIGN_SCORE = 0.6;
const MIN_SOURCE_REALIGN_IMPROVEMENT = 0.2;
const MAX_ANALYSIS_TRANSCRIPT_CHARS = 12000;
const MAX_CONTEXT_ITEMS = 12;
const MAX_CONTEXT_TEXT_LENGTH = 180;
const AI_REQUEST_TIMEOUT_MS = 120_000;
const JSON_FORMAT_REPAIR_INSTRUCTION = `Your previous response could not be parsed as JSON.
Return the answer again as one valid JSON object only.
Do not use markdown fences, comments, explanations, or trailing commas.`;

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

export async function fetchProviderModels(provider: AiProvider, apiKey: string, baseUrl?: string) {
  const base = normalizeBaseUrl(baseUrl);
  if (provider === "gemini") return fetchGeminiModels(apiKey, base);
  if (provider === "claude") return fetchClaudeModels(apiKey, base);
  return fetchOpenAiCompatibleModels(provider, apiKey, base);
}

async function fetchOpenAiCompatibleModels(provider: AiProvider, apiKey: string, baseUrl?: string) {
  const endpoint = baseUrl || providerDefaults[provider].baseUrl;
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/models`, {
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

async function fetchGeminiModels(apiKey: string, baseUrl?: string) {
  const endpoint = baseUrl || providerDefaults.gemini.baseUrl;
  const response = await fetch(`${endpoint}/models?key=${encodeURIComponent(apiKey)}`);
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

async function fetchClaudeModels(apiKey: string, baseUrl?: string) {
  const endpoint = baseUrl || providerDefaults.claude.baseUrl;
  const response = await fetch(`${endpoint}/models`, {
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
  const request = (requestMessages: ChatMessage[], requestTemperature: number) => config.provider === "gemini"
    ? geminiChat(config, requestMessages, requestTemperature)
    : config.provider === "claude"
      ? claudeChat(config, requestMessages, requestTemperature)
      : openAiCompatibleChat(config, requestMessages, requestTemperature);

  const text = await request(messages, temperature);
  const parsed = parseJsonObject(text);
  if (parsed) return parsed;

  console.warn("AI JSON response required format repair", {
    provider: config.provider,
    model: config.model || providerDefaults[config.provider].fallbackModel,
    response: summarizeInvalidJson(text)
  });

  const repairedText = await request([
    ...messages,
    { role: "user", content: JSON_FORMAT_REPAIR_INSTRUCTION }
  ], 0);
  const repaired = parseJsonObject(repairedText);
  if (repaired) return repaired;

  console.error("AI JSON format repair failed", {
    provider: config.provider,
    model: config.model || providerDefaults[config.provider].fallbackModel,
    response: summarizeInvalidJson(repairedText)
  });
  throw new Error(`AI response was not valid JSON (${config.provider}/${config.model || providerDefaults[config.provider].fallbackModel})`);
}

async function fetchAi(url: string, init: RequestInit) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`AI request timed out after ${AI_REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  }
}

async function openAiCompatibleChat(config: AiConfig, messages: ChatMessage[], temperature: number) {
  const custom = normalizeBaseUrl(config.baseUrl);
  const baseUrl = custom || (config.providerMode === "system"
    ? env.DEEPSEEK_API_BASE
    : providerDefaults[config.provider].baseUrl);
  const body: Record<string, unknown> = {
    model: config.model || providerDefaults[config.provider].fallbackModel,
    messages,
    temperature,
    response_format: { type: "json_object" }
  };
  if (config.provider === "deepseek") body.thinking = { type: "disabled" };

  const response = await fetchAi(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
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
  const endpoint = normalizeBaseUrl(config.baseUrl) || providerDefaults.gemini.baseUrl;
  const response = await fetchAi(`${endpoint}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
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
  const endpoint = normalizeBaseUrl(config.baseUrl) || providerDefaults.claude.baseUrl;
  const response = await fetchAi(`${endpoint}/messages`, {
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
  for (const candidate of jsonObjectCandidates(trimmed)) {
    const extracted = tryParse(candidate) || tryParse(removeTrailingCommas(candidate));
    if (extracted) return extracted;
  }
  return null;
}

function jsonObjectCandidates(text: string) {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) candidates.push(text.slice(start, index + 1));
    }
  }
  return candidates;
}

function removeTrailingCommas(text: string) {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function summarizeInvalidJson(text: string) {
  const trimmed = text.trim();
  return {
    length: text.length,
    hash: crypto.createHash("sha256").update(text).digest("hex").slice(0, 12),
    startsWithFence: /^```/.test(trimmed),
    firstCharacter: trimmed[0] || "",
    lastCharacter: trimmed.at(-1) || ""
  };
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

function boundedText(value: unknown, maxLength = MAX_CONTEXT_TEXT_LENGTH) {
  if (typeof value !== "string") return "";
  const text = normalizeText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function boundedStringList(value: unknown, limit = MAX_CONTEXT_ITEMS) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => boundedText(item))
    .filter(Boolean)
    .slice(0, limit);
}

function boundedGlossary(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = boundedText((item as { source?: unknown }).source, 80);
      const target = boundedText((item as { target?: unknown }).target, 80);
      const note = boundedText((item as { note?: unknown }).note, 120);
      if (!source || !target) return null;
      return { source, target, note };
    })
    .filter((item): item is SubtitleTranslationContext["glossary"][number] => Boolean(item))
    .slice(0, MAX_CONTEXT_ITEMS);
}

function transcriptLines(cues: CleanCue[]) {
  return cues.map((cue) => `${cue.index}: ${normalizeText(cue.text)}`).filter(Boolean);
}

function transcriptDigest(cues: CleanCue[]) {
  const lines = transcriptLines(cues);
  const allText = lines.join("\n");
  if (allText.length <= MAX_ANALYSIS_TRANSCRIPT_CHARS) return allText;

  const headBudget = Math.floor(MAX_ANALYSIS_TRANSCRIPT_CHARS * 0.42);
  const middleBudget = Math.floor(MAX_ANALYSIS_TRANSCRIPT_CHARS * 0.2);
  const tailBudget = Math.floor(MAX_ANALYSIS_TRANSCRIPT_CHARS * 0.32);
  const head: string[] = [];
  const middle: string[] = [];
  const tail: string[] = [];

  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > headBudget) break;
    head.push(line);
    size += line.length + 1;
  }

  size = 0;
  const middleStart = Math.max(0, Math.floor(lines.length / 2) - Math.floor(lines.length * 0.08));
  for (const line of lines.slice(middleStart)) {
    if (size + line.length + 1 > middleBudget) break;
    middle.push(line);
    size += line.length + 1;
  }

  size = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (size + line.length + 1 > tailBudget) break;
    tail.unshift(line);
    size += line.length + 1;
  }

  return [
    ...head,
    "[...middle transcript omitted for length...]",
    ...middle,
    "[...later transcript omitted for length...]",
    ...tail
  ].join("\n");
}

function guidanceBullets(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

function strategyPromptSection(strategy: TranslationStrategy) {
  return `
Strategy:
- Strategy ID: ${strategy.id}
- Strategy version: ${strategy.version}
- Strategy name: ${strategy.displayName}
${strategy.fallbackNotes ? `- Notes: ${strategy.fallbackNotes}` : ""}
`.trim();
}

function analysisPrompt(targetLanguage: string, strategy: TranslationStrategy) {
  return `
You are preparing a translation brief for a subtitle translator.

Read the video metadata and transcript sample to infer the subject, terminology, named entities, tone, and likely audience.
The brief will be used only as context while translating subtitles into ${targetLanguage}.

${strategyPromptSection(strategy)}

Rules:
- Output strict JSON only.
- Do not translate the transcript.
- Do not invent facts that are not supported by the metadata or transcript.
- Glossary entries should cover recurring or important terms, names, product names, technical terms, jokes, idioms, and ambiguous words.
- Glossary target values must be concise ${targetLanguage} recommendations.
- Style guide items should describe practical translation choices for conversational subtitles, not generic advice.
- Prefer everyday spoken phrasing over formal, bookish, or overly literal wording.

Language-specific brief guidance:
${guidanceBullets(strategy.analysisGuidance)}

Return:
{"topic":"short topic","summary":"brief summary","tone":"tone","audience":"audience","glossary":[{"source":"term","target":"translation","note":"why or when to use it"}],"properNouns":["name"],"styleGuide":["instruction"]}
`.trim();
}

export async function analyzeSubtitleContext(input: {
  aiConfig: AiConfig;
  videoContext: VideoContext;
  cues: CleanCue[];
  sourceLanguage: string;
  targetLanguage: string;
}): Promise<SubtitleTranslationContext> {
  const strategy = getTranslationStrategy(input.targetLanguage);
  const modelInput = {
    videoContext: input.videoContext,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    translationStrategy: {
      id: strategy.id,
      version: strategy.version,
      name: strategy.displayName
    },
    transcript: transcriptDigest(input.cues)
  };
  const data = await chatJson(input.aiConfig, [
    { role: "system", content: analysisPrompt(input.targetLanguage, strategy) },
    { role: "user", content: JSON.stringify(modelInput) }
  ], 0.1);

  return {
    topic: boundedText(data.topic),
    summary: boundedText(data.summary, 500),
    tone: boundedText(data.tone),
    audience: boundedText(data.audience),
    glossary: boundedGlossary(data.glossary),
    properNouns: boundedStringList(data.properNouns),
    styleGuide: boundedStringList(data.styleGuide)
  };
}

function systemPrompt(targetLanguage: string, strategy: TranslationStrategy) {
  return `
You are a senior subtitle translator and timing editor.

Use the video title, channel, description, translation brief, previous context, and next context to understand topic, names, tone, and terminology.
Translate only raw_cues into natural, complete ${targetLanguage} subtitles.

${strategyPromptSection(strategy)}

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
- Write subtitles in conversational language that viewers can understand instantly while watching.
- Prefer short, direct clauses. Avoid formal, bookish, corporate, or translated-sounding wording unless the speaker is intentionally formal.
- Keep names, terms, numbers, examples, caveats, contrasts, and speaker intent accurate.
- Follow the translation brief for terminology and style when it matches the raw subtitle text.
- Treat the raw_cue text as the source of truth. Do not add information from the brief or neighboring context that is not present in the current raw_cue.
- Do not summarize, compress, or drop meaning-bearing details for readability.
- You may lightly reorder words within the current raw_cue so the subtitle sounds natural in ${targetLanguage}, but keep every meaning-bearing detail.
- Remove only clear ASR disfluencies like "um" or immediate accidental repetitions that carry no meaning.
- Preserve the full translation; never shorten content to meet a length target.
- Restore natural punctuation after correcting the ASR transcript, even when raw_cues contains no punctuation.
- It is okay if one output cue is a fragment; backend timing/readability cleanup will merge fragments.

Language-specific translation guidance:
${guidanceBullets(strategy.translationGuidance)}

Return:
{"cues":[{"source_indexes":[1],"source":"source text","translation":"translated subtitle"}]}
`.trim();
}

function isJapaneseTarget(targetLanguage: string) {
  return targetLanguage.trim().toLowerCase().replace(/_/g, "-").split("-")[0] === "ja";
}

export async function translateChunk(input: {
  aiConfig: AiConfig;
  videoContext: VideoContext;
  translationContext?: SubtitleTranslationContext;
  previousContext: CleanCue[];
  rawCues: CleanCue[];
  nextContext: CleanCue[];
  targetLanguage: string;
}) {
  const strategy = getTranslationStrategy(input.targetLanguage);
  const modelInput = {
    videoContext: input.videoContext,
    translationBrief: input.translationContext,
    previousContext: input.previousContext,
    rawCues: input.rawCues,
    nextContext: input.nextContext,
    targetLanguage: input.targetLanguage,
    translationStrategy: {
      id: strategy.id,
      version: strategy.version,
      name: strategy.displayName
    }
  };
  const byIndex = new Map(input.rawCues.map((cue) => [cue.index, cue]));
  const expectedIndexes = input.rawCues.map((cue) => cue.index);
  const translatedByIndex = new Map<number, TranslatedCue>();

  async function requestCues(rawCues: CleanCue[], repair = false, enforceNumericCoverage = true) {
    const requestedIndexes = new Set(rawCues.map((cue) => cue.index));
    const requestInput = { ...modelInput, rawCues };
    const repairInstruction = repair
      ? `This is a small repair request. Return exactly ${rawCues.length} cues, one for each raw cue, in this exact index order: ${rawCues.map((cue) => cue.index).join(", ")}. Do not merge fragments or complete a fragment using neighboring context. Preserve every explicit number contained in each matching raw cue.`
      : "";
    const data = await chatJson(input.aiConfig, [
      { role: "system", content: systemPrompt(input.targetLanguage, strategy) },
      { role: "user", content: JSON.stringify(requestInput) },
      ...(repairInstruction ? [{ role: "user" as const, content: repairInstruction }] : [])
    ], 0.2);

    const cues = Array.isArray(data.cues) ? data.cues : [];
    const output = new Map<number, TranslatedCue>();
    for (const item of cues) {
      if (!item || typeof item !== "object") continue;
      const sourceIndexes = Array.isArray((item as { source_indexes?: unknown }).source_indexes)
        ? (item as { source_indexes: unknown[] }).source_indexes.map(Number).filter(Number.isFinite)
        : [];
      const sourceText = String((item as { source?: unknown }).source || "");
      let sourceCues = sourceIndexes.map((index) => byIndex.get(index)).filter(Boolean) as CleanCue[];
      sourceCues = realignSourceCues({ sourceText, sourceCues, rawCues: input.rawCues });
      const translation = normalizeText(String((item as { translation?: unknown }).translation || ""));
      if (sourceCues.length !== 1 || !requestedIndexes.has(sourceCues[0].index) || !translation) continue;
      if (
        enforceNumericCoverage
        && isJapaneseTarget(input.targetLanguage)
        && !hasJapaneseNumericCoverage(sourceCues[0].text, translation)
      ) continue;
      output.set(sourceCues[0].index, {
        start: Math.min(...sourceCues.map((cue) => cue.start)),
        end: Math.max(...sourceCues.map((cue) => cue.end)),
        text: translation,
        sourceIndexes: sourceCues.map((cue) => cue.index)
      });
    }
    return output;
  }

  for (const [index, cue] of await requestCues(input.rawCues)) {
    translatedByIndex.set(index, cue);
  }

  const missingIndexes = expectedIndexes.filter((index) => !translatedByIndex.has(index));
  if (missingIndexes.length) {
    const positionsToRepair = new Set<number>();
    for (const missingIndex of missingIndexes) {
      const position = input.rawCues.findIndex((cue) => cue.index === missingIndex);
      for (let offset = -1; offset <= 1; offset += 1) {
        if (position + offset >= 0 && position + offset < input.rawCues.length) {
          positionsToRepair.add(position + offset);
        }
      }
    }
    const repairCues = [...positionsToRepair]
      .sort((a, b) => a - b)
      .map((position) => input.rawCues[position]);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const repaired = await requestCues(repairCues, true, attempt === 0);
      if (repaired.size !== repairCues.length) continue;
      for (const [index, cue] of repaired) translatedByIndex.set(index, cue);
      break;
    }
  }

  const stillMissing = expectedIndexes.filter((index) => !translatedByIndex.has(index));
  if (stillMissing.length) {
    console.error("AI subtitle source coverage repair failed", {
      expectedIndexes,
      missingIndexes: stillMissing
    });
    throw new Error("AI subtitle source coverage repair failed");
  }

  return expectedIndexes.map((index) => translatedByIndex.get(index)!);
}
