import { Router } from "express";
import { z } from "zod";
import { aiProviders, decryptApiKey, encryptApiKey, fetchProviderModels, type AiProvider } from "../ai.js";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";
import { env } from "../env.js";

export const aiRouter = Router();

const providerSchema = z.enum(aiProviders);

function localAiConfig() {
  if (!env.LOCAL_MODE) return null;
  const apiKey = env.LOCAL_AI_API_KEY.trim();
  if (!apiKey) return null;
  const baseUrl = env.LOCAL_AI_BASE_URL.trim().replace(/\/+$/, "");
  return {
    providerMode: "user" as const,
    provider: env.LOCAL_AI_PROVIDER,
    apiKey,
    model: env.LOCAL_AI_MODEL.trim(),
    ...(baseUrl ? { baseUrl } : {})
  };
}

function requireLoggedInUser(authHeader: string | undefined) {
  return requireUserId(authHeader);
}

aiRouter.get("/settings", async (req, res, next) => {
  try {
    const local = localAiConfig();
    if (local) {
      return res.json({
        configured: true,
        provider: local.provider,
        model: local.model,
        baseUrl: local.baseUrl || "",
        models: local.model ? [local.model] : [],
        hasApiKey: true,
        managedBy: "desktop-app"
      });
    }
    const userId = await requireLoggedInUser(req.headers.authorization);
    const found = await query<{
      provider: AiProvider;
      model: string;
      available_models_json: unknown;
    }>(
      `select provider, model, available_models_json
       from user_ai_settings
       where user_id = $1`,
      [userId]
    );
    const row = found.rows[0];
    if (!row) return res.json({ configured: false });
    res.json({
      configured: true,
      provider: row.provider,
      model: row.model,
      models: typeof row.available_models_json === "string"
        ? JSON.parse(row.available_models_json)
        : row.available_models_json,
      hasApiKey: true
    });
  } catch (error) {
    next(error);
  }
});

aiRouter.post("/models", async (req, res, next) => {
  try {
    await requireLoggedInUser(req.headers.authorization);
    const input = z.object({
      provider: providerSchema,
      apiKey: z.string().min(8),
      baseUrl: z.string().optional()
    }).parse(req.body);
    const baseUrl = input.baseUrl?.trim().replace(/\/+$/, "") || "";
    if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
      return res.status(400).json({ error: "Base URL 需要以 http:// 或 https:// 开头" });
    }
    const models = await fetchProviderModels(input.provider, input.apiKey.trim(), baseUrl || undefined);
    res.json({ models });
  } catch (error) {
    next(error);
  }
});

aiRouter.post("/settings", async (req, res, next) => {
  try {
    if (env.LOCAL_MODE) {
      return res.status(400).json({
        error: "本机模式请在 VidLingo 应用里配置 API Key。",
        code: "LOCAL_MODE_MANAGED"
      });
    }
    const userId = await requireLoggedInUser(req.headers.authorization);
    const input = z.object({
      provider: providerSchema,
      apiKey: z.string().min(8).optional(),
      model: z.string().min(1),
      models: z.array(z.string()).default([])
    }).parse(req.body);
    const existing = await query<{ api_key_ciphertext: string }>(
      "select api_key_ciphertext from user_ai_settings where user_id = $1",
      [userId]
    );
    const apiKeyCiphertext = input.apiKey
      ? encryptApiKey(input.apiKey.trim())
      : existing.rows[0]?.api_key_ciphertext;
    if (!apiKeyCiphertext) {
      return res.status(400).json({ error: "API Key is required before saving AI settings" });
    }

    await query(
      `insert into user_ai_settings (user_id, provider, api_key_ciphertext, model, available_models_json)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id) do update set
         provider = excluded.provider,
         api_key_ciphertext = excluded.api_key_ciphertext,
         model = excluded.model,
         available_models_json = excluded.available_models_json,
         updated_at = now()`,
      [
        userId,
        input.provider,
        apiKeyCiphertext,
        input.model.trim(),
        JSON.stringify(input.models)
      ]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export async function loadUserAiConfig(userId: string) {
  const local = localAiConfig();
  if (local) return local;

  const found = await query<{
    provider: AiProvider;
    api_key_ciphertext: string;
    model: string;
  }>(
    "select provider, api_key_ciphertext, model from user_ai_settings where user_id = $1",
    [userId]
  );
  const row = found.rows[0];
  if (!row) {
    const error = new Error("User AI API key is not configured") as Error & { status: number };
    error.status = 400;
    throw error;
  }
  return {
    providerMode: "user" as const,
    provider: row.provider,
    apiKey: decryptApiKey(row.api_key_ciphertext),
    model: row.model
  };
}
