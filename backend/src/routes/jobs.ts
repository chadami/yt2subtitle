import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { systemAiConfig } from "../ai.js";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";
import { subtitleQueue } from "../queue.js";
import { loadUserAiConfig } from "./ai.js";

export const jobsRouter = Router();

const cueSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string()
});

function hashRawCues(rawCues: Array<z.infer<typeof cueSchema>>) {
  const stableCues = rawCues.map((cue) => ({
    start: Number(cue.start.toFixed(3)),
    end: Number(cue.end.toFixed(3)),
    text: cue.text.trim()
  }));
  return crypto.createHash("sha256").update(JSON.stringify(stableCues)).digest("hex");
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
         v.title,
         v.url
       from translation_jobs j
       join videos v on v.video_id = j.video_id
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

jobsRouter.post("/", async (req, res, next) => {
  try {
    const input = z.object({
      clientId: z.string().min(8).optional(),
      video: z.object({
        videoId: z.string().min(6),
        url: z.string().url(),
        title: z.string().default(""),
        channel: z.string().default(""),
        description: z.string().default("")
      }),
      sourceLang: z.string().default("en"),
      targetLang: z.string().default("zh-Hans"),
      translationMode: z.enum(["system", "user"]).default("system"),
      forceRegenerate: z.boolean().default(false),
      captionType: z.enum(["manual", "auto"]).default("manual"),
      rawCues: z.array(cueSchema).min(1)
    }).parse(req.body);

    const userId = await requireUserId(
      req.headers.authorization,
      input.translationMode === "user" ? undefined : input.clientId
    );
    const aiConfig = input.translationMode === "user"
      ? await loadUserAiConfig(userId)
      : systemAiConfig();
    if (!input.forceRegenerate) {
      const existing = await query<{ id: string; status: string }>(
        `select id, status from translation_jobs
         where video_id = $1 and source_lang = $2 and target_lang = $3
         and provider_mode = $4
         and ($4 = 'system' or user_id = $5)
         and status in ('queued', 'cleaning', 'translating', 'compressing', 'finalizing', 'completed')
         order by created_at desc limit 1`,
        [input.video.videoId, input.sourceLang, input.targetLang, input.translationMode, userId]
      );
      if (existing.rows[0]) {
        return res.json({ jobId: existing.rows[0].id, status: existing.rows[0].status });
      }
    }

    await query(
      `insert into videos (video_id, url, title, channel, description)
       values ($1, $2, $3, $4, $5)
       on conflict (video_id) do update set title = excluded.title, channel = excluded.channel,
       description = excluded.description, updated_at = now()`,
      [input.video.videoId, input.video.url, input.video.title, input.video.channel, input.video.description]
    );

    const cueHash = hashRawCues(input.rawCues);
    const caption = await query<{ id: string }>(
      `insert into caption_sources (video_id, source_lang, caption_type, cue_hash, raw_cues_json)
       values ($1, $2, $3, $4, $5)
       on conflict (video_id, source_lang, caption_type, cue_hash)
       where cue_hash is not null
       do update set raw_cues_json = caption_sources.raw_cues_json
       returning id`,
      [input.video.videoId, input.sourceLang, input.captionType, cueHash, JSON.stringify(input.rawCues)]
    );

    const job = await query<{ id: string }>(
      `insert into translation_jobs (
         user_id, video_id, source_lang, target_lang, caption_source_id,
         provider_mode, ai_provider, ai_model, status
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'queued') returning id`,
      [
        userId,
        input.video.videoId,
        input.sourceLang,
        input.targetLang,
        caption.rows[0].id,
        aiConfig.providerMode,
        aiConfig.provider,
        aiConfig.model
      ]
    );

    await subtitleQueue.add("translate", { jobId: job.rows[0].id }, { attempts: 2 });
    res.json({ jobId: job.rows[0].id, status: "queued" });
  } catch (error) {
    next(error);
  }
});

jobsRouter.get("/:jobId", async (req, res, next) => {
  try {
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
