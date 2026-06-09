import { Router } from "express";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";

export const subtitlesRouter = Router();

subtitlesRouter.get("/by-video/:videoId", async (req, res, next) => {
  try {
    const sourceLang = String(req.query.sourceLang || "en");
    const targetLang = String(req.query.targetLang || "zh-Hans");
    const translationMode = req.query.translationMode === "user" ? "user" : "system";
    const userId = translationMode === "user" ? await requireUserId(req.headers.authorization) : null;
    const result = await query(
      `select id as "subtitleId", video_id as "videoId", source_lang as "sourceLang",
       target_lang as "targetLang", cues_json as cues, vtt_text as "vttText"
       from translated_subtitles
       where video_id = $1 and source_lang = $2 and target_lang = $3 and provider_mode = $4
       and ($4 = 'system' or created_by_user_id = $5)
       order by created_at desc limit 1`,
      [req.params.videoId, sourceLang, targetLang, translationMode, userId]
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
