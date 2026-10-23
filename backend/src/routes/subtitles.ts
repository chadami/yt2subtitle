import { openPlayback, updatePlayback, closePlayback } from "../playbackTranslation.js";
import { Router } from "express";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";
import { hashRawCues, DEFAULT_STYLE_ID } from "../subtitleLibrary.js";
import { finalizeTranslatedCues, toVtt, type TranslatedCue } from "../subtitles.js";
import { isChineseTarget } from "../chineseSubtitles.js";

export const subtitlesRouter = Router();

const rawCueSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string()
});

function subtitleResponse(row: Record<string, unknown>) {
  const savedCues = (typeof row.cues === "string" ? JSON.parse(row.cues) : row.cues) as TranslatedCue[];
  // Apply the display policy to existing local subtitles without regenerating translations.
  const chinese = isChineseTarget(String(row.targetLang || ""));
  const cues = chinese ? finalizeTranslatedCues(savedCues, String(row.targetLang)) : savedCues;
  return {
    status: "completed",
    subtitleId: row.subtitleId,
    videoId: row.videoId,
    sourceLang: row.sourceLang,
    targetLang: row.targetLang,
    styleId: row.styleId,
    strategyId: row.strategyId,
    strategyVersion: row.strategyVersion,
    accessSource: "local",
    cues,
    vttText: chinese ? toVtt(cues) : row.vttText
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
      styleId: z.string().default(DEFAULT_STYLE_ID),
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
         and created_by_user_id = $4
       order by created_at desc limit 1`,
      [captionSourceId, input.targetLang, input.styleId, userId]
    );
    if (privateResult.rows[0]) {
      return res.json({ ...subtitleResponse(privateResult.rows[0]), captionSourceId, cueHash });
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
    res.json(subtitleResponse(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

subtitlesRouter.post("/playback/open", async(req,res,next)=>{
  try {
    const owner=await requireUserId(req.headers.authorization);
    const input=z.object({clientId:z.string().min(1).max(120),video:z.object({videoId:z.string().min(6),url:z.string().url(),title:z.string().default(""),channel:z.string().default(""),description:z.string().default("")}),
      sourceLang:z.string(),targetLang:z.string(),captionType:z.enum(["manual","auto"]),rawCues:z.array(rawCueSchema).min(1),position:z.number().min(0).default(0),paused:z.boolean().default(false)}).parse(req.body);
    await query(`insert into videos(video_id,url,title,channel,description) values($1,$2,$3,$4,$5)
      on conflict(video_id) do update set title=excluded.title`,[input.video.videoId,input.video.url,input.video.title,input.video.channel,input.video.description]);
    const caption=await query<{id:string}>(`insert into caption_sources(video_id,source_lang,caption_type,cue_hash,raw_cues_json) values($1,$2,$3,$4,$5)
      on conflict(video_id,source_lang,caption_type,cue_hash) where cue_hash is not null do update set raw_cues_json=excluded.raw_cues_json returning id`,
      [input.video.videoId,input.sourceLang,input.captionType,hashRawCues(input.rawCues),JSON.stringify(input.rawCues)]);
    res.json(await openPlayback({owner,clientId:input.clientId,captionId:caption.rows[0].id,source:input.sourceLang,target:input.targetLang,raw:input.rawCues,captionType:input.captionType,position:input.position,paused:input.paused}));
  }catch(error){next(error);}
});
subtitlesRouter.post("/playback/update", async(req,res,next)=>{
  try {
    const owner=await requireUserId(req.headers.authorization);
    const input=z.object({sessionId:z.string().uuid(),position:z.number().min(0),paused:z.boolean(),seeking:z.boolean().default(false),sequence:z.number().int().min(1)}).parse(req.body);
    res.json(await updatePlayback(owner,input.sessionId,input));
  }catch(error){next(error);}
});
subtitlesRouter.post("/playback/close",async(req,res,next)=>{
  try {const owner=await requireUserId(req.headers.authorization);const input=z.object({sessionId:z.string().uuid()}).parse(req.body);res.json(closePlayback(owner,input.sessionId));}
  catch(error){next(error);}
});
