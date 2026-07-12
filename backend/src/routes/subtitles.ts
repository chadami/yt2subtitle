import { Router } from "express";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";
import { getUserEntitlement } from "../entitlements.js";
import { hashRawCues, PUBLIC_STYLE_ID } from "../subtitleLibrary.js";

export const subtitlesRouter = Router();

const rawCueSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string()
});

function subtitleResponse(row: Record<string, unknown>, accessSource: "private" | "public") {
  const cues = typeof row.cues === "string" ? JSON.parse(row.cues) : row.cues;
  return {
    status: "completed",
    subtitleId: row.subtitleId,
    videoId: row.videoId,
    sourceLang: row.sourceLang,
    targetLang: row.targetLang,
    styleId: row.styleId,
    strategyId: row.strategyId,
    strategyVersion: row.strategyVersion,
    accessSource,
    publicLabel: accessSource === "public" ? "AI 公共字幕 · 精准翻译" : undefined,
    cues,
    vttText: row.vttText
  };
}

subtitlesRouter.post("/resolve", async (req, res, next) => {
  try {
    const userId = await requireUserId(req.headers.authorization);
    const input = z.object({
      video: z.object({
        videoId: z.string().min(6),
        url: z.string().url(),
        title: z.string().default(""),
        channel: z.string().default(""),
        description: z.string().default("")
      }),
      sourceLang: z.string().default("en"),
      targetLang: z.string().default("zh-Hans"),
      captionType: z.enum(["manual", "auto"]).default("manual"),
      styleId: z.string().default(PUBLIC_STYLE_ID),
      rawCues: z.array(rawCueSchema).min(1)
    }).parse(req.body);

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
       do update set raw_cues_json = excluded.raw_cues_json returning id`,
      [input.video.videoId, input.sourceLang, input.captionType, cueHash, JSON.stringify(input.rawCues)]
    );
    const captionSourceId = caption.rows[0].id;
    const privateResult = await query(
      `select id as "subtitleId", video_id as "videoId", source_lang as "sourceLang",
       target_lang as "targetLang", style_id as "styleId", strategy_id as "strategyId",
       strategy_version as "strategyVersion", cues_json as cues, vtt_text as "vttText"
       from translated_subtitles
       where caption_source_id = $1 and target_lang = $2 and style_id = $3
         and created_by_user_id = $4 and publication_status = 'private'
       order by created_at desc limit 1`,
      [captionSourceId, input.targetLang, input.styleId, userId]
    );
    if (privateResult.rows[0]) {
      return res.json({ ...subtitleResponse(privateResult.rows[0], "private"), captionSourceId, cueHash });
    }

    const sharedResult = await query(
      `select t.id as "subtitleId", t.video_id as "videoId", t.source_lang as "sourceLang",
       t.target_lang as "targetLang", t.style_id as "styleId", t.strategy_id as "strategyId",
       t.strategy_version as "strategyVersion", t.cues_json as cues, t.vtt_text as "vttText"
       from translated_subtitles t
       join translation_job_watchers w on w.job_id = t.job_id
       where w.user_id = $1 and t.caption_source_id = $2 and t.target_lang = $3 and t.style_id = $4
       order by t.created_at desc limit 1`,
      [userId, captionSourceId, input.targetLang, input.styleId]
    );
    if (sharedResult.rows[0]) {
      return res.json({ ...subtitleResponse(sharedResult.rows[0], "private"), captionSourceId, cueHash });
    }

    const entitlement = await getUserEntitlement(userId);
    if (entitlement.canUsePublicSubtitles && input.styleId === PUBLIC_STYLE_ID) {
      const publicResult = await query(
        `select t.id as "subtitleId", t.video_id as "videoId", t.source_lang as "sourceLang",
         t.target_lang as "targetLang", t.style_id as "styleId", t.strategy_id as "strategyId",
         t.strategy_version as "strategyVersion", t.cues_json as cues, t.vtt_text as "vttText"
         from public_subtitle_selections s
         join translated_subtitles t on t.id = s.recommended_subtitle_id
         where s.caption_source_id = $1 and s.target_lang = $2 and s.style_id = $3
           and t.publication_status = 'recommended'`,
        [captionSourceId, input.targetLang, input.styleId]
      );
      if (publicResult.rows[0]) {
        return res.json({ ...subtitleResponse(publicResult.rows[0], "public"), captionSourceId, cueHash });
      }
    }
    return res.status(404).json({ status: "missing", captionSourceId, cueHash });
  } catch (error) {
    next(error);
  }
});

subtitlesRouter.get("/by-video/:videoId", async (req, res, next) => {
  try {
    const sourceLang = typeof req.query.sourceLang === "string" && req.query.sourceLang
      ? req.query.sourceLang
      : null;
    const targetLang = String(req.query.targetLang || "zh-Hans");
    const userId = await requireUserId(req.headers.authorization);
    const result = await query(
      `select id as "subtitleId", video_id as "videoId", source_lang as "sourceLang",
       target_lang as "targetLang", strategy_id as "strategyId", strategy_version as "strategyVersion",
       cues_json as cues, vtt_text as "vttText"
       from translated_subtitles
       where video_id = $1 and ($2::text is null or source_lang = $2) and target_lang = $3
       and provider_mode = 'user' and created_by_user_id = $4
       order by created_at desc limit 1`,
      [req.params.videoId, sourceLang, targetLang, userId]
    );
    if (!result.rows[0]) return res.status(404).json({ status: "missing" });
    const row = result.rows[0] as { cues?: unknown };
    res.json({
      status: "completed",
      ...result.rows[0],
      cues: typeof row.cues === "string" ? JSON.parse(row.cues) : row.cues
    });
  } catch (error) {
    next(error);
  }
});
