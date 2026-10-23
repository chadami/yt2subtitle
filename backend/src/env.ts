import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const parsed = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().default(path.join(process.cwd(), ".local-data")),
  EXTENSION_ORIGIN: z.string().default("*"),
  LOCAL_TOKEN: z.string().optional(),
  LOCAL_AI_PROVIDER: z.enum(["gemini", "deepseek", "openai", "claude", "qwen", "mimo"]).default("deepseek"),
  LOCAL_AI_API_KEY: z.string().default(""),
  LOCAL_AI_MODEL: z.string().default(""),
  LOCAL_AI_BASE_URL: z.string().default(""),
  LOCAL_MT_PROVIDER: z.enum(["off", "google", "macos"]).default("off"),
  LOCAL_TRANSLATE_HELPER: z.string().default(""),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  GOOGLE_CLOUD_TRANSLATION_API_KEY: z.string().default(""),
  GOOGLE_CLOUD_TRANSLATION_ENDPOINT: z.string().url().default("https://translation.googleapis.com")
}).parse(process.env);

function localToken() {
  if (parsed.LOCAL_TOKEN?.trim()) return parsed.LOCAL_TOKEN.trim();
  const file = path.join(parsed.DATA_DIR, "local-token");
  try {
    const token = fs.readFileSync(file, "utf8").trim();
    if (token.length >= 24) return token;
  } catch { /* Create a persistent development token below. */ }
  const token = crypto.randomBytes(32).toString("base64url");
  fs.mkdirSync(parsed.DATA_DIR, { recursive: true });
  fs.writeFileSync(file, token, { mode: 0o600 });
  return token;
}

// This service is always local; an environment variable cannot expose it on a LAN.
export const env = { ...parsed, HOST: "127.0.0.1", LOCAL_TOKEN: localToken() };
