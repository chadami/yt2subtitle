import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const flag = z
  .string()
  .optional()
  .transform((value) => value === "1" || value?.toLowerCase() === "true");

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  LOCAL_MODE: flag,
  HOST: z.string().optional(),
  DATA_DIR: z.string().optional(),
  PORT: z.coerce.number().default(3000),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  EXTENSION_ORIGIN: z.string().default("*"),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  LOCAL_TOKEN: z.string().optional(),
  LOCAL_AI_PROVIDER: z.enum(["gemini", "deepseek", "openai", "claude", "qwen", "mimo"]).default("deepseek"),
  LOCAL_AI_API_KEY: z.string().default(""),
  LOCAL_AI_MODEL: z.string().default(""),
  LOCAL_AI_BASE_URL: z.string().default(""),
  LOCAL_MT_PROVIDER: z.enum(["off", "google", "macos"]).default("off"),
  LOCAL_TRANSLATE_HELPER: z.string().default(""),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_API_BASE: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-v4-flash"),
  GOOGLE_CLOUD_TRANSLATION_API_KEY: z.string().default(""),
  GOOGLE_CLOUD_TRANSLATION_ENDPOINT: z.string().url().default("https://translation.googleapis.com"),
  EMAIL_PROVIDER: z.enum(["local", "resend"]).default("local"),
  EMAIL_FROM: z.string().default("YouTube AI Subtitle <login@example.com>"),
  RESEND_API_KEY: z.string().optional(),
  JWT_SECRET: z.string().min(24).optional(),
  ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  MAGIC_LINK_TTL_MINUTES: z.coerce.number().default(20),
  DEFAULT_TARGET_LANG: z.string().default("zh-Hans")
});

const parsed = envSchema.parse(process.env);

if (!parsed.LOCAL_MODE) {
  if (!parsed.DATABASE_URL) throw new Error("DATABASE_URL is required when LOCAL_MODE is off");
  if (!parsed.REDIS_URL) throw new Error("REDIS_URL is required when LOCAL_MODE is off");
  if (!parsed.JWT_SECRET) throw new Error("JWT_SECRET is required when LOCAL_MODE is off");
}

function localSecret() {
  const dataDir = parsed.DATA_DIR || path.join(process.cwd(), ".local-data");
  const secretFile = path.join(dataDir, "jwt-secret");
  try {
    const existing = fs.readFileSync(secretFile, "utf8").trim();
    if (existing.length >= 24) return existing;
  } catch {
    // Generate a new secret below.
  }
  const secret = crypto.randomBytes(48).toString("base64url");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  return secret;
}

const localToken = parsed.LOCAL_TOKEN?.trim()
  || (parsed.LOCAL_MODE ? crypto.randomBytes(24).toString("base64url") : "");

export const env = {
  ...parsed,
  JWT_SECRET: parsed.JWT_SECRET || localSecret(),
  LOCAL_TOKEN: localToken,
  HOST: parsed.HOST || (parsed.LOCAL_MODE ? "127.0.0.1" : "0.0.0.0"),
  DATA_DIR: parsed.DATA_DIR || path.join(process.cwd(), ".local-data")
};

export const isLocalMode = env.LOCAL_MODE;
