import { activePlaybackJobIds } from "../playbackTranslation.js";
import { Router } from "express";
import { z } from "zod";
import { env } from "../env.js";
import { getLocalUserId } from "../auth.js";
import { machineTranslationConfigured, machineTranslationProvider } from "../machineTranslation.js";
import { query } from "../db.js";

export const localRouter = Router();

const TARGET_LANGUAGES = ["zh-Hans", "zh-Hant", "en", "ja", "ko", "es", "fr", "de", "ru", "pt", "it", "ar"] as const;

const preferenceDefaults = {
  targetLang: "zh-Hans",
  showSourceText: true
};

type Preferences = typeof preferenceDefaults;

function normalizeStoredValue(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function readPreferences(userId: string): Promise<Preferences> {
  const rows = await query<{ key: string; value: unknown }>(
    "select key, value from app_preferences where user_id = $1",
    [userId]
  );
  const stored: Record<string, unknown> = {};
  for (const row of rows.rows) {
    stored[row.key] = normalizeStoredValue(row.value);
  }
  return {
    targetLang: typeof stored.targetLang === "string" ? stored.targetLang : preferenceDefaults.targetLang,
    showSourceText: typeof stored.showSourceText === "boolean" ? stored.showSourceText : preferenceDefaults.showSourceText
  };
}

localRouter.get("/session", async (_req, res, next) => {
  try {
    const userId = await getLocalUserId();
    res.json({
      token: env.LOCAL_TOKEN,
      userId,
      mode: "local",
      port: env.PORT,
      apiBase: `http://127.0.0.1:${env.PORT}`,
      version: process.env.APP_VERSION || "dev",
      ai: {
        configured: env.LOCAL_AI_API_KEY.trim().length > 0,
        provider: env.LOCAL_AI_PROVIDER,
        model: env.LOCAL_AI_MODEL
      }
    });
  } catch (error) {
    next(error);
  }
});

localRouter.get("/preferences", async (_req, res, next) => {
  try {
    const userId = await getLocalUserId();
    res.json(await readPreferences(userId));
  } catch (error) {
    next(error);
  }
});

localRouter.put("/preferences", async (req, res, next) => {
  try {
    const userId = await getLocalUserId();
    const input = z.object({
      targetLang: z.enum(TARGET_LANGUAGES).optional(),
      showSourceText: z.boolean().optional()
    }).parse(req.body);

    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      const isBoolean = typeof value === "boolean";
      await query(
        `insert into app_preferences (user_id, key, value)
         values ($1, $2, ${isBoolean ? "to_jsonb($3::boolean)" : "to_jsonb($3::text)"})
         on conflict (user_id, key)
         do update set value = excluded.value, updated_at = now()`,
        [userId, key, String(value)]
      );
    }

    res.json(await readPreferences(userId));
  } catch (error) {
    next(error);
  }
});

localRouter.get("/status", async (_req, res, next) => {
  try {
    let queue = { running: 0, pending: 0 };
    const { localQueueSnapshot } = await import("../localQueue.js");
    queue = localQueueSnapshot();
    const active = await query<{ count: string }>(
      "select count(*)::text as count from translation_jobs where status in ('queued','cleaning','translating','compressing','finalizing') or (status='failed' and (machine_translation_state in ('running','waiting') or id=any($1::uuid[])))", [activePlaybackJobIds()]
    );
    const completed = await query<{ count: string }>(
      "select count(*)::text as count from translation_jobs where status = 'completed' or (status='failed' and machine_translation_state='completed')"
    );
    res.json({
      ok: true,
      mode: "local",
      port: env.PORT,
      version: process.env.APP_VERSION || "dev",
      dataDir: env.DATA_DIR,
      ai: {
        configured: env.LOCAL_AI_API_KEY.trim().length > 0,
        provider: env.LOCAL_AI_PROVIDER,
        model: env.LOCAL_AI_MODEL
      },
      machineTranslation: machineTranslationConfigured(),
      machineTranslationProvider: machineTranslationProvider(),
      queue,
      jobs: {
        active: Number(active.rows[0]?.count || 0),
        completed: Number(completed.rows[0]?.count || 0)
      }
    });
  } catch (error) {
    next(error);
  }
});
