import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  EXTENSION_ORIGIN: z.string().default("*"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_API_BASE: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-v4-flash"),
  EMAIL_PROVIDER: z.enum(["local", "resend"]).default("local"),
  EMAIL_FROM: z.string().default("YouTube AI Subtitle <login@example.com>"),
  RESEND_API_KEY: z.string().optional(),
  JWT_SECRET: z.string().min(24),
  ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  MAGIC_LINK_TTL_MINUTES: z.coerce.number().default(20),
  DEFAULT_TARGET_LANG: z.string().default("zh-Hans")
});

export const env = envSchema.parse(process.env);
