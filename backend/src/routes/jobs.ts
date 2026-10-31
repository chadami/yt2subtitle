import { activePlaybackJobIds, closePlaybackForJob, hasPlaybackWindow, playbackProgressForJob, attachPlaybackJob } from "../playbackTranslation.js";
import { machineProgress } from "../jobProgress.js";
import { abortJobOperations } from "../jobControl.js";
import { removePendingJob } from "../localQueue.js";
import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { db, query } from "../db.js";
import { subtitleQueue } from "../queue.js";
import { createGenerationKey, hashRawCues, DEFAULT_STYLE_ID } from "../subtitleLibrary.js";
import { finalizeTranslatedCues, normalizeTranslatedText, prepareSourceCues, type TranslatedCue } from "../subtitles.js";
import { isChineseTarget } from "../chineseSubtitles.js";
import { getTranslationStrategy } from "../translationStrategies.js";
import { loadLocalAiConfig } from "./ai.js";

import { decodeHistoryCursor, encodeHistoryCursor } from "../historyPagination.js";

import { ensureJobMachineTranslation } from "../jobMachineTranslation.js";

export const jobsRouter = Router();

const cueSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string()
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
    const cursor = decodeHistoryCursor(req.query.cursor);
    const result = await query<{ jobId: string; _cursorTime: string } & Record<string, unknown>>(
      `select
         j.id as "jobId",
         j.created_at::text as "_cursorTime",
         j.status,
         j.machine_translation_state as "machineTranslationState",
         j.created_at as "createdAt",
         j.completed_at as "completedAt",
         j.source_lang as "sourceLang",
         j.target_lang as "targetLang",
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
         and ($2::timestamptz is null or (j.created_at, j.id) < ($2::timestamptz, $3::uuid))
       order by j.created_at desc, j.id desc
       limit 101`,
      [userId, cursor?.time ?? null, cursor?.id ?? null]
    );
    const rows = result.rows.slice(0, 100);
    const last = rows[rows.length - 1];
    const count = await query<{ count: string }>(
      "select count(*)::text as count from translation_jobs where user_id = $1", [userId]
    );
    res.json({
      history: rows.map(({ _cursorTime, ...row }) => ({...row,machineTranslationState:playbackProgressForJob(String(row.jobId))?.state||row.machineTranslationState})),
      total: Number(count.rows[0]?.count ?? 0),
      nextCursor: result.rows.length > 100 && last
        ? encodeHistoryCursor(last._cursorTime, last.jobId) : null
    });
  } catch (error) {
    next(error);
  }
});

jobsRouter.post("/", async (req, res, next) => {
  try {
    const input = z.object({
      captionSourceId: z.string().uuid().optional(),
      video: z.object({ videoId: z.string().min(6), url: z.string().url(), title: z.string().default(""),
        channel: z.string().default(""), description: z.string().default("") }).optional(),
      sourceLang: z.string().default("en"), targetLang: z.string().default("zh-Hans"),
      forceRegenerate: z.boolean().default(false), captionType: z.enum(["manual", "auto"]).default("manual"),
      styleId: z.string().default(DEFAULT_STYLE_ID), rawCues: z.array(cueSchema).min(1).optional()
    }).parse(req.body);
    const userId = await requireUserId(req.headers.authorization);
    const aiConfig = loadLocalAiConfig();
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
    const baseKey = createGenerationKey({ captionSourceId, targetLang: input.targetLang, styleId: input.styleId,
      strategyId: strategy.id, strategyVersion: strategy.version, provider: aiConfig.provider, model: aiConfig.model });
    const generationKey = input.forceRegenerate ? `${baseKey}:${crypto.randomUUID()}` : baseKey;
    const client = await db.connect();
    let jobId = "";
    try {
      await client.query("begin");
      if (!input.forceRegenerate) {
        const existing = await client.query<{id: string; status: string}>(
          `select j.id, j.status from translation_jobs j where j.generation_key = $1 and j.user_id = $2
           and j.status in ('queued','cleaning','translating','compressing','finalizing','completed')
           and (j.status <> 'completed' or exists(select 1 from translated_subtitles t where t.job_id = j.id))
           order by j.created_at desc limit 1`, [generationKey, userId]);
        if (existing.rows[0]) {
          await client.query("commit");
          attachPlaybackJob(userId,captionSourceId,input.targetLang,existing.rows[0].id);
          return res.json({ jobId: existing.rows[0].id, status: existing.rows[0].status });
        }
      }
      const created = await client.query<{id: string}>(
        `insert into translation_jobs (user_id,video_id,source_lang,target_lang,caption_source_id,
          provider_mode,ai_provider,ai_model,strategy_id,strategy_version,style_id,generation_key,status)
         values ($1,$2,$3,$4,$5,'user',$6,$7,$8,$9,$10,$11,'queued') returning id`,
        [userId,caption.rows[0].video_id,caption.rows[0].source_lang,input.targetLang,captionSourceId,
          aiConfig.provider,aiConfig.model,strategy.id,strategy.version,input.styleId,generationKey]);
      jobId = created.rows[0].id;
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
    attachPlaybackJob(userId,captionSourceId,input.targetLang,jobId);
    if(hasPlaybackWindow(userId,captionSourceId,input.targetLang))await query("update translation_jobs set machine_translation_mode='playback' where id=$1",[jobId]);
    try { await subtitleQueue.add("translate", { jobId }, { attempts: 2 }); }
    catch (error) {
      await query("update translation_jobs set status='failed',error=$1,updated_at=now() where id=$2",
        [error instanceof Error ? error.message : String(error),jobId]);
      throw error;
    }
    res.json({ jobId, status: "queued" });
  } catch (error) { next(error); }
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
    `select j.id from translation_jobs j where j.id = $1 and j.user_id = $2`,
    [jobId, userId]
  );
  if (!access.rows[0]) throw new JobRequestError("Job not found", 404);
}

jobsRouter.post("/:jobId/retry", async (req, res, next) => {
  try {
    await requireJobAccess(req.params.jobId, req.headers.authorization);
    const result = await query<{ caption_source_id: string; target_lang: string }>(
      `update translation_jobs set status='queued',error=null,updated_at=now()
       where id=$1 and status='failed' returning caption_source_id,target_lang`, [req.params.jobId]
    );
    if (!result.rows[0]) return res.status(409).json({ error: "此任务当前不可重试，请刷新任务状态。" });
    const userId = await requireUserId(req.headers.authorization);
    attachPlaybackJob(userId, result.rows[0].caption_source_id, result.rows[0].target_lang, req.params.jobId);
    try {
      await subtitleQueue.add("translate", { jobId: req.params.jobId }, { attempts: 2 });
    } catch (error) {
      await markRetryEnqueueFailed(req.params.jobId, error);
      throw error;
    }
    res.json({ ok: true, jobId: req.params.jobId, status: "queued" });
  } catch (error) { next(error); }
});

async function markRetryEnqueueFailed(jobId: string, error: unknown) {
  await query("update translation_jobs set status='failed',error=$1,updated_at=now() where id=$2 and status='queued'",
    [error instanceof Error ? error.message : String(error), jobId]);
}

jobsRouter.post("/:jobId/cancel", async (req, res, next) => {
  try {
    await requireJobAccess(req.params.jobId, req.headers.authorization);
    // A failed job only counts as running while machine fallback or playback preview still works on it.
    // Otherwise it keeps its 'failed' status and error so it can still be retried.
    const updated = await query(
      `update translation_jobs set status='cancelled', error=null,
       machine_translation_state='cancelled', machine_translation_error=null,
       machine_translation_code=null, machine_translation_retry_at=null, updated_at=now()
       where id=$1 and (status in ('queued','cleaning','translating','compressing','finalizing')
         or (status='failed' and (machine_translation_state in ('running','waiting') or id=any($2::uuid[]))))
       returning id`, [req.params.jobId, activePlaybackJobIds()]);
    if (!updated.rows.length) {
      // Stopping a job that already finished is a no-op, so a late click is not reported as an error.
      const current = await query<{ status: string }>("select status from translation_jobs where id=$1", [req.params.jobId]);
      return res.json({ ok: true, status: current.rows[0]?.status });
    }
    removePendingJob(req.params.jobId);
    abortJobOperations(req.params.jobId);
    await closePlaybackForJob(req.params.jobId);
    res.json({ok:true, status:'cancelled'});
  } catch (error) { next(error); }
});

jobsRouter.get("/:jobId/partial-subtitles", async (req, res, next) => {
  try {
    await requireJobAccess(req.params.jobId, req.headers.authorization);
    await ensureJobMachineTranslation(req.params.jobId);
    const job = await query(
      "select id as \"jobId\", status, progress, target_lang as \"targetLang\", json_build_object('state', machine_translation_state, 'error', machine_translation_error, 'code', machine_translation_code, 'retryAt', machine_translation_retry_at) as \"machineTranslation\" from translation_jobs where id = $1",
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
    const targetLanguage = String(job.rows[0].targetLang || "");
    const cues = finalizeTranslatedCues(translated, targetLanguage).map(({ start, end, text, sourceText }) => ({ start, end, text, sourceText }));
    const rawMachineCues = machineChunks.rows.flatMap((row) => parseChunkCues(row.cues));
    const machineCues = (isChineseTarget(targetLanguage) ? finalizeTranslatedCues(rawMachineCues, targetLanguage) : rawMachineCues)
      .map(({ start, end, text, sourceText }) => ({
        start,
        end,
        text: normalizeTranslatedText(text, targetLanguage),
        sourceText
      }));
    res.json({
      ...job.rows[0],
      hasPartial: cues.length > 0 || machineCues.length > 0,
      cues,
      aiCues: cues,
      machineCues,
      machineTranslation: { ...(job.rows[0].machineTranslation as object), ...await machineProgress(req.params.jobId), ...await playbackProgressForJob(req.params.jobId) },
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
    await ensureJobMachineTranslation(req.params.jobId);
    const result = await query(
      "select id as \"jobId\", status, progress, error, json_build_object('state', machine_translation_state, 'error', machine_translation_error, 'code', machine_translation_code, 'retryAt', machine_translation_retry_at) as \"machineTranslation\" from translation_jobs where id = $1",
      [req.params.jobId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Job not found" });
    const row = result.rows[0];
    res.json({ ...row, machineTranslation: { ...(row.machineTranslation as object), ...await machineProgress(req.params.jobId), ...await playbackProgressForJob(req.params.jobId) } });
  } catch (error) {
    next(error);
  }
});
