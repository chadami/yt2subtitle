import { Router } from "express";
import { z } from "zod";
import { aiProviders, fetchProviderModels, type AiConfig } from "../ai.js";
import { env } from "../env.js";

export const aiRouter = Router();

export function loadLocalAiConfig(): AiConfig {
  if (!env.LOCAL_AI_API_KEY.trim()) {
    throw Object.assign(new Error("请在 VidLingo 应用中配置 AI API Key。"), { status: 400, code: "AI_NOT_CONFIGURED" });
  }
  return { provider: env.LOCAL_AI_PROVIDER, apiKey: env.LOCAL_AI_API_KEY.trim(),
    model: env.LOCAL_AI_MODEL.trim(), baseUrl: env.LOCAL_AI_BASE_URL.trim() || undefined };
}

aiRouter.get("/settings", (_req, res) => {
  res.json({ configured: Boolean(env.LOCAL_AI_API_KEY.trim()), provider: env.LOCAL_AI_PROVIDER,
    model: env.LOCAL_AI_MODEL, managedBy: "desktop-app" });
});

aiRouter.post("/models", async (req, res, next) => {
  try {
    const input = z.object({ provider: z.enum(aiProviders), apiKey: z.string().min(8), baseUrl: z.string().optional() }).parse(req.body);
    const baseUrl = input.baseUrl?.trim().replace(/\/+$/, "") || undefined;
    if (baseUrl && !/^https?:\/\//i.test(baseUrl)) return res.status(400).json({ error: "Base URL 需要以 http:// 或 https:// 开头" });
    res.json({ models: await fetchProviderModels(input.provider, input.apiKey.trim(), baseUrl) });
  } catch (error) { next(error); }
});
