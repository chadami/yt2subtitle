import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { db, query } from "../db.js";
import { getUserEntitlement } from "../entitlements.js";
import { subtitleQueue } from "../queue.js";
import { createGenerationKey, hashRawCues, PUBLIC_STYLE_ID } from "../subtitleLibrary.js";
import { machineTranslationConfigured, translateMachineCues } from "../machineTranslation.js";
import { finalizeTranslatedCues, prepareSourceCues, type TranslatedCue } from "../subtitles.js";
import { getTranslationStrategy } from "../translationStrategies.js";
import { loadUserAiConfig } from "./ai.js";

export const jobsRouter = Router();

const cueSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string()
});

const machineCueSchema = cueSchema.extend({
  sourceText: z.string().optional(),
  sourceIndexes: z.array(z.number().int()).optional()
});

function primaryLanguageCode(language: string) {
  return normalizeLanguageCode(language).split("-")[0];
}

function normalizeLanguageCode(language: string) {
  return language.trim().replace(/_/g, "-").toLowerCase();
}

function chineseScript(language: string) {
  const normalized = normalizeLanguageCode(language);
  if (["zh-hans", "zh-cn", "zh-sg", "zh-my"].includes(normalized)) return "simplified";
  if (["zh-hant", "zh-tw", "zh-hk", "zh-mo"].includes(normalized)) return "traditional";
  return "";
}

function isSameLanguage(sourceLanguage: string, targetLanguage: string) {
  const normalizedSource = normalizeLanguageCode(sourceLanguage);
  const normalizedTarget = normalizeLanguageCode(targetLanguage);
  if (!normalizedSource || !normalizedTarget) return false;
  if (normalizedSource === normalizedTarget) return true;
  const source = primaryLanguageCode(sourceLanguage);
  const target = primaryLanguageCode(targetLanguage);
  if (!source || source !== target) return false;
  if (target === "zh") {
    const sourceScript = chineseScript(sourceLanguage);
    const targetScript = chineseScript(targetLanguage);
    return Boolean(sourceScript && targetScript && sourceScript === targetScript);
  }
  return true;
}

class JobRequestError extends Error {
  constructor(message: string, public status = 400, public code?: string) {
    super(message);
  }
}

jobsRouter.get("/history", async (req, res, next) => {
  try {
    const userId = await requireUserId(req.headers.authorization);
    const result = await query(
      `select
         j.id as "jobId",
         j.status,
         j.created_at as "createdAt",
         j.completed_at as "completedAt",
         j.source_lang as "sourceLang",
         j.target_lang as "targetLang",
         j.provider_mode as "providerMode",
         j.ai_provider as "provider",
         j.ai_model as "model",
         j.strategy_id as "strategyId",
         j.strategy_version as "strategyVersion",
         c.caption_type as "captionType",
         v.title,
         v.url
       from translation_jobs j
       join videos v on v.video_id = j.video_id
       left join caption_sources c on c.id = j.caption_source_id
       where j.user_id = $1
       order by j.created_at desc
       limit 100`,
      [userId]
    );
    res.json({ history: result.rows });
  } catch (error) {
    next(error);
  }
});

jobsRouter.post("/machine-preview", async (req, res, next) => {
  try {
    await requireUserId(req.headers.authorization);
    if (!machineTranslationConfigured()) {
      return res.status(503).json({ error: "Google machine translation is not configured." });
    }
    const input = z.object({
      sourceLang: z.string().default("en"),
      targetLang: z.string().default("zh-Hans"),
      captionType: z.enum(["manual", "auto"]).default("manual"),
      rawCues: z.array(cueSchema).min(1)
    }).parse(req.body);
    if (isSameLanguage(input.sourceLang, input.targetLang)) {
      throw new JobRequestError("Subtitle language already matches the target language.", 400, "SAME_LANGUAGE");
    }
    const cleanCues = prepareSourceCues(input.rawCues, input.captionType);
    const cues: TranslatedCue[] = [];
    await translateMachineCues({
      cues: cleanCues,
      sourceLanguage: input.sourceLang,
      targetLanguage: input.targetLang,
      onBatch: async ({ cues: batch }) => {
        cues.push(...batch);
      }
    });
    res.json({ ok: true, cues });
  } catch (error) {
    next(error);
  }
});

jobsRouter.post("/", async (req, res, next) => {
  try {
    const input = z.object({
      captionSourceId: z.string().uuid().optional(),
      video: z.object({
        videoId: z.string().min(6),
        url: z.string().url(),
        title: z.string().default(""),
        channel: z.string().default(""),
        description: z.string().default("")
      }).optional(),
      sourceLang: z.string().default("en"),
      targetLang: z.string().default("zh-Hans"),
      translationMode: z.enum(["system", "user"]).default("user"),
      forceRegenerate: z.boolean().default(false),
      captionType: z.enum(["manual", "auto"]).default("manual"),
      styleId: z.string().default(PUBLIC_STYLE_ID),
      rawCues: z.array(cueSchema).min(1).optional(),
      machineCues: z.array(machineCueSchema).optional()
    }).parse(req.body);
    if (input.translationMode !== "user") {
      throw new JobRequestError("System translation is not available. Configure a personal API key.", 400, "PERSONAL_API_REQUIRED");
    }
    const userId = await requireUserId(req.headers.authorization);
    const aiConfig = await loadUserAiConfig(userId);
    const strategy = getTranslationStrategy(input.targetLang);
    let captionSourceId = input.captionSourceId;
    if (!captionSourceId) {
      if (!input.video || !input.rawCues) throw new JobRequestError("captionSourceId or video/rawCues is required");
      await query(
        `insert into videos (video_id, url, title, channel, description)
         values ($1, $2, $3, $4, $5)
         on conflict (video_id) do update set title = excluded.title, channel = excluded.channel,
         description = excluded.description, updated_at = now()`,
        [input.video.videoId, input.video.url, input.video.title, input.video.channel, input.video.description]
      );
      const caption = await query<{ id: string }>(
        `insert into caption_sources (video_id, source_lang, caption_type, cue_hash, raw_cues_json)
         values ($1, $2, $3, $4, $5)
         on conflict (video_id, source_lang, caption_type, cue_hash)
         where cue_hash is not null
         do update set raw_cues_json = excluded.raw_cues_json returning id`,
        [input.video.videoId, input.sourceLang, input.captionType, hashRawCues(input.rawCues), JSON.stringify(input.rawCues)]
      );
      captionSourceId = caption.rows[0].id;
    }
    const caption = await query<{ video_id: string; source_lang: string }>(
      "select video_id, source_lang from caption_sources where id = $1",
      [captionSourceId]
    );
    if (!caption.rows[0]) throw new JobRequestError("Caption source not found", 404);
    if (isSameLanguage(caption.rows[0].source_lang, input.targetLang)) {
      throw new JobRequestError("Subtitle language already matches the target language.", 400, "SAME_LANGUAGE");
    }
    const baseGenerationKey = createGenerationKey({
      captionSourceId,
      targetLang: input.targetLang,
      styleId: input.styleId,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      provider: aiConfig.provider,
      model: aiConfig.model
    });
    const generationKey = input.forceRegenerate ? `${baseGenerationKey}:${crypto.randomUUID()}` : baseGenerationKey;
    const client = await db.connect();
    let jobId = "";
    let status = "queued";
    try {
      await client.query("begin");
      const entitlement = await getUserEntitlement(userId, client);
      if (entitlement.plan !== "free" && entitlement.status !== "active") {
        throw new JobRequestError("Your membership has expired. Existing private subtitles remain available.", 403, "MEMBERSHIP_EXPIRED");
      }
      const contributionEligible = entitlement.canContribute && input.styleId === PUBLIC_STYLE_ID;
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        `${contributionEligible ? "public" : userId}:${generationKey}`
      ]);
      if (!input.forceRegenerate) {
        const existing = await client.query<{ id: string; status: string; user_id: string; contribution_eligible: boolean }>(
          `select j.id, j.status, j.user_id, j.contribution_eligible from translation_jobs j
           where j.generation_key = $1
             and ((j.contribution_eligible = true and $2 = true) or j.user_id = $3)
             and j.status in ('queued', 'cleaning', 'translating', 'compressing', 'finalizing', 'completed')
             and (j.status <> 'completed' or exists (
               select 1 from translated_subtitles t where t.job_id = j.id
             ))
           order by j.created_at desc limit 1`,
          [generationKey, contributionEligible, userId]
        );
        if (existing.rows[0]) {
          jobId = existing.rows[0].id;
          status = existing.rows[0].status;
          if (existing.rows[0].user_id !== userId) {
            await client.query(
              "insert into translation_job_watchers (job_id, user_id) values ($1, $2) on conflict do nothing",
              [jobId, userId]
            );
          }
          await client.query("commit");
          return res.json({ jobId, status, shared: existing.rows[0].user_id !== userId });
        }
      }
      if (entitlement.generationVideoLimit !== null) {
        await client.query("select pg_advisory_xact_lock(hashtext($1))", [userId]);
        const usage = await client.query<{ status: string }>(
          "select status from user_video_usage where user_id = $1 and video_id = $2",
          [userId, caption.rows[0].video_id]
        );
        if (!usage.rows[0]) {
          const count = await client.query<{ count: string }>(
            "select count(*)::text as count from user_video_usage where user_id = $1",
            [userId]
          );
          if (Number(count.rows[0]?.count || 0) >= entitlement.generationVideoLimit) {
            throw new JobRequestError(
              `This account supports up to ${entitlement.generationVideoLimit} different videos.`,
              403,
              "VIDEO_LIMIT_REACHED"
            );
          }
          await client.query(
            `insert into user_video_usage (user_id, video_id, status)
             values ($1, $2, 'reserved')`,
            [userId, caption.rows[0].video_id]
          );
        }
      }
      const created = await client.query<{ id: string }>(
        `insert into translation_jobs (
           user_id, video_id, source_lang, target_lang, caption_source_id,
           provider_mode, ai_provider, ai_model, strategy_id, strategy_version,
           style_id, generation_key, contribution_eligible, consent_version, status
         ) values ($1, $2, $3, $4, $5, 'user', $6, $7, $8, $9, $10, $11, $12, $13, 'queued') returning id`,
        [userId, caption.rows[0].video_id, caption.rows[0].source_lang, input.targetLang, captionSourceId,
          aiConfig.provider, aiConfig.model, strategy.id, strategy.version, input.styleId, generationKey,
          contributionEligible, contributionEligible ? entitlement.consentVersion : null]
      );
      jobId = created.rows[0].id;
      if (input.machineCues?.length) {
        await client.query(
          `insert into translation_job_machine_chunks (job_id, chunk_index, provider, cues_json)
           values ($1, 0, 'google', $2)
           on conflict (job_id, chunk_index)
           do update set cues_json = excluded.cues_json, updated_at = now()`,
          [jobId, JSON.stringify(input.machineCues)]
        );
      }
      await client.query(
        `update user_video_usage set first_job_id = coalesce(first_job_id, $1)
         where user_id = $2 and video_id = $3`,
        [jobId, userId, caption.rows[0].video_id]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    try {
      await subtitleQueue.add("translate", { jobId }, { attempts: 2 });
    } catch (error) {
      await query("update translation_jobs set status = 'failed', error = $1, updated_at = now() where id = $2", [
        error instanceof Error ? error.message : String(error),
        jobId
      ]);
      await query(
        `delete from user_video_usage u using translation_jobs j
         where j.id = $1 and u.user_id = j.user_id and u.video_id = j.video_id and u.status = 'reserved'
           and not exists (
             select 1 from translation_jobs other
             where other.id <> j.id and other.user_id = j.user_id and other.video_id = j.video_id
               and other.status in ('queued', 'cleaning', 'translating', 'compressing', 'finalizing', 'completed')
           )`,
        [jobId]
      );
      throw error;
    }
    res.json({ jobId, status });
  } catch (error) {
    next(error);
  }
});

function parseChunkCues(value: unknown): TranslatedCue[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((cue): cue is TranslatedCue => {
    return cue
      && typeof cue === "object"
      && typeof (cue as { start?: unknown }).start === "number"
      && typeof (cue as { end?: unknown }).end === "number"
      && typeof (cue as { text?: unknown }).text === "string";
  });
}

async function requireJobAccess(jobId: string, authorization: string | undefined) {
  const userId = await requireUserId(authorization);
  const access = await query(
    `select j.id from translation_jobs j
     where j.id = $1 and (
       j.user_id = $2 or exists (
         select 1 from translation_job_watchers w where w.job_id = j.id and w.user_id = $2
       )
     )`,
    [jobId, userId]
  );
  if (!access.rows[0]) throw new JobRequestError("Job not found", 404);
}

jobsRouter.get("/:jobId/partial-subtitles", async (req, res, next) => {
  try {
    await requireJobAccess(req.params.jobId, req.headers.authorization);
    const job = await query(
      "select id as \"jobId\", status, progress from translation_jobs where id = $1",
      [req.params.jobId]
    );
    if (!job.rows[0]) return res.status(404).json({ error: "Job not found" });

    const chunks = await query<{ cues: unknown }>(
      `select cues_json as cues
       from translation_job_chunks
       where job_id = $1
       order by chunk_index asc`,
      [req.params.jobId]
    );
    const machineChunks = await query<{ cues: unknown }>(
      `select cues_json as cues
       from translation_job_machine_chunks
       where job_id = $1
       order by chunk_index asc`,
      [req.params.jobId]
    );
    const translated = chunks.rows.flatMap((row) => parseChunkCues(row.cues));
    const cues = finalizeTranslatedCues(translated).map(({ start, end, text, sourceText }) => ({ start, end, text, sourceText }));
    const machineCues = machineChunks.rows.flatMap((row) => parseChunkCues(row.cues))
      .map(({ start, end, text, sourceText }) => ({ start, end, text, sourceText }));
    res.json({
      ...job.rows[0],
      hasPartial: cues.length > 0 || machineCues.length > 0,
      cues,
      aiCues: cues,
      machineCues,
      cueCount: cues.length,
      chunkCount: chunks.rows.length,
      aiChunkCount: chunks.rows.length,
      machineChunkCount: machineChunks.rows.length
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.get("/:jobId", async (req, res, next) => {
  try {
    await requireJobAccess(req.params.jobId, req.headers.authorization);
    const result = await query(
      "select id as \"jobId\", status, progress, error from translation_jobs where id = $1",
      [req.params.jobId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Job not found" });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
