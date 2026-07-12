import crypto from "node:crypto";
import { Router, type Request } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../env.js";
import { db, query } from "../db.js";
import { subtitleQueue } from "../queue.js";

export const adminRouter = Router();

class AdminError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(req: Request) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw new AdminError("管理员登录已失效", 401);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { role?: string };
    if (payload.role !== "admin") throw new Error("invalid role");
  } catch { throw new AdminError("管理员登录已失效", 401); }
}

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : fallback;
}

adminRouter.post("/login", (req, res, next) => {
  try {
    const input = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    if (!env.ADMIN_PASSWORD) throw new AdminError("服务端尚未配置 ADMIN_PASSWORD", 503);
    if (!safeEqual(input.email.toLowerCase(), env.ADMIN_EMAIL.toLowerCase()) || !safeEqual(input.password, env.ADMIN_PASSWORD)) {
      throw new AdminError("邮箱或密码不正确", 401);
    }
    res.json({ token: jwt.sign({ sub: input.email, role: "admin" }, env.JWT_SECRET, { expiresIn: "12h" }), email: env.ADMIN_EMAIL });
  } catch (error) { next(error); }
});

adminRouter.use((req, _res, next) => { try { requireAdmin(req); next(); } catch (error) { next(error); } });

adminRouter.get("/dashboard", async (_req, res, next) => {
  try {
    const metrics = await query(`select
      (select count(*)::int from users) as "userCount",
      (select count(*)::int from user_entitlements where plan <> 'free' and status = 'active' and (valid_until is null or valid_until > now())) as "memberCount",
      (select count(*)::int from translation_jobs where created_at >= date_trunc('day', now())) as "jobsToday",
      (select count(*)::int from translation_jobs where status = 'failed' and created_at >= now() - interval '24 hours') as "failedJobs24h",
      (select count(*)::int from translation_jobs where status in ('queued','cleaning','translating','compressing','finalizing')) as "activeJobs",
      (select count(*)::int from translated_subtitles) as "subtitleCount",
      (select count(*)::int from videos) as "videoCount",
      (select coalesce(round(100.0 * count(*) filter (where status = 'completed') / nullif(count(*), 0), 1), 0) from translation_jobs where created_at >= now() - interval '7 days') as "successRate7d"`);
    const trend = await query(`select to_char(day, 'MM-DD') as label, count(j.id)::int total,
      count(j.id) filter (where j.status = 'completed')::int completed
      from generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') day
      left join translation_jobs j on j.created_at >= day and j.created_at < day + interval '1 day'
      group by day order by day`);
    res.json({ metrics: metrics.rows[0], trend: trend.rows });
  } catch (error) { next(error); }
});

adminRouter.get("/users", async (req, res, next) => {
  try {
    const limit = positiveInt(req.query.limit, 20); const page = positiveInt(req.query.page, 1); const offset = (page - 1) * limit;
    const search = String(req.query.search || "").trim(); const plan = String(req.query.plan || "");
    const items = await query(`select u.id, u.created_at as "createdAt", u.last_seen_at as "lastSeenAt",
      u.last_login_at as "lastLoginAt", host(u.last_login_ip) as "lastLoginIp",
      coalesce(max(i.identifier) filter (where i.type = 'email'), max(i.identifier) filter (where i.type = 'anonymous')) as identity,
      coalesce(e.plan, 'free') as plan, coalesce(e.status, 'active') as "memberStatus", e.valid_until as "validUntil",
      exists(select 1 from user_ai_settings a where a.user_id = u.id) as "hasAiConfig",
      (select count(*)::int from user_video_usage vu where vu.user_id = u.id and vu.status = 'completed') as "videoUsage",
      (select count(*)::int from translation_jobs j where j.user_id = u.id) as "jobCount"
      from users u left join identities i on i.user_id = u.id left join user_entitlements e on e.user_id = u.id
      where ($1 = '' or u.id::text ilike '%' || $1 || '%' or i.identifier ilike '%' || $1 || '%')
        and ($2 = '' or coalesce(e.plan, 'free') = $2)
      group by u.id, e.plan, e.status, e.valid_until order by u.created_at desc limit $3 offset $4`, [search, plan, limit, offset]);
    const count = await query<{ total: number }>(`select count(distinct u.id)::int total from users u left join identities i on i.user_id = u.id
      left join user_entitlements e on e.user_id = u.id where ($1 = '' or u.id::text ilike '%' || $1 || '%' or i.identifier ilike '%' || $1 || '%')
      and ($2 = '' or coalesce(e.plan, 'free') = $2)`, [search, plan]);
    res.json({ items: items.rows, total: count.rows[0].total, page, limit });
  } catch (error) { next(error); }
});

adminRouter.patch("/users/:userId/membership", async (req, res, next) => {
  try {
    const input = z.object({ plan: z.enum(["free", "standard", "contributor"]), status: z.enum(["active", "expired", "canceled"]), validUntil: z.string().datetime().nullable() }).parse(req.body);
    const user = await query("select id from users where id = $1", [req.params.userId]);
    if (!user.rows[0]) throw new AdminError("用户不存在", 404);
    const result = await query(`insert into user_entitlements (user_id, plan, status, valid_until) values ($1,$2,$3,$4)
      on conflict (user_id) do update set plan=excluded.plan,status=excluded.status,valid_until=excluded.valid_until,updated_at=now()
      returning plan,status,valid_until as "validUntil"`, [req.params.userId, input.plan, input.status, input.validUntil]);
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

adminRouter.get("/jobs", async (req, res, next) => {
  try {
    const limit = positiveInt(req.query.limit, 20); const page = positiveInt(req.query.page, 1); const offset = (page - 1) * limit;
    const search = String(req.query.search || "").trim(); const status = String(req.query.status || "");
    const items = await query(`select j.id,j.status,j.progress,j.error,j.video_id as "videoId",v.title,j.source_lang as "sourceLang",
      j.target_lang as "targetLang",j.ai_provider as provider,j.ai_model as model,j.style_id as "styleId",j.created_at as "createdAt",
      j.updated_at as "updatedAt",j.completed_at as "completedAt",coalesce(max(i.identifier) filter (where i.type='email'),j.user_id::text) as "userIdentity"
      from translation_jobs j join videos v on v.video_id=j.video_id left join identities i on i.user_id=j.user_id
      where ($1='' or j.id::text ilike '%'||$1||'%' or j.video_id ilike '%'||$1||'%' or v.title ilike '%'||$1||'%' or i.identifier ilike '%'||$1||'%') and ($2='' or j.status=$2)
      group by j.id,v.title order by j.created_at desc limit $3 offset $4`, [search, status, limit, offset]);
    const count = await query<{ total: number }>(`select count(*)::int total from translation_jobs j join videos v on v.video_id=j.video_id
      where ($1='' or j.id::text ilike '%'||$1||'%' or j.video_id ilike '%'||$1||'%' or v.title ilike '%'||$1||'%'
        or exists(select 1 from identities i where i.user_id=j.user_id and i.identifier ilike '%'||$1||'%')) and ($2='' or j.status=$2)`, [search, status]);
    res.json({ items: items.rows, total: count.rows[0].total, page, limit });
  } catch (error) { next(error); }
});

adminRouter.get("/jobs/:jobId/download", async (req, res, next) => {
  try {
    const result = await query<{ vtt_text: string; video_id: string; target_lang: string }>(
      `select t.vtt_text,t.video_id,t.target_lang from translated_subtitles t
       where t.job_id=$1 order by t.created_at desc limit 1`,
      [req.params.jobId]
    );
    const subtitle = result.rows[0];
    if (!subtitle) throw new AdminError("该任务还没有可下载的字幕结果", 404);
    sendVtt(res, subtitle.vtt_text, `${subtitle.video_id}.${subtitle.target_lang}.vtt`);
  } catch (error) { next(error); }
});

adminRouter.post("/jobs/:jobId/retry", async (req, res, next) => {
  try {
    const result = await query(`update translation_jobs set status='queued',progress=0,error=null,completed_at=null,updated_at=now()
      where id=$1 and status='failed' returning id`, [req.params.jobId]);
    if (!result.rows[0]) throw new AdminError("只有失败任务可以重试", 409);
    try { await subtitleQueue.add("translate", { jobId: req.params.jobId }, { attempts: 2 }); }
    catch (error) {
      await query("update translation_jobs set status='failed',error=$2 where id=$1", [req.params.jobId, error instanceof Error ? error.message : String(error)]);
      throw error;
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

adminRouter.get("/subtitles", async (req, res, next) => {
  try {
    const limit = positiveInt(req.query.limit, 20); const page = positiveInt(req.query.page, 1); const offset = (page - 1) * limit;
    const search = String(req.query.search || "").trim(); const publication = String(req.query.publication || "");
    const items = await query(`select t.id,t.video_id as "videoId",v.title,t.source_lang as "sourceLang",t.target_lang as "targetLang",t.provider,t.model,
      t.style_id as "styleId",t.publication_status as "publicationStatus",t.quality_score as "qualityScore",jsonb_array_length(t.cues_json) as "cueCount",
      length(t.vtt_text) as "characterCount",t.created_at as "createdAt",coalesce(max(i.identifier) filter (where i.type='email'),t.created_by_user_id::text) as "userIdentity"
      from translated_subtitles t join videos v on v.video_id=t.video_id left join identities i on i.user_id=t.created_by_user_id
      where ($1='' or t.id::text ilike '%'||$1||'%' or t.video_id ilike '%'||$1||'%' or v.title ilike '%'||$1||'%' or i.identifier ilike '%'||$1||'%') and ($2='' or t.publication_status=$2)
      group by t.id,v.title order by t.created_at desc limit $3 offset $4`, [search, publication, limit, offset]);
    const count = await query<{ total: number }>(`select count(*)::int total from translated_subtitles t join videos v on v.video_id=t.video_id
      where ($1='' or t.id::text ilike '%'||$1||'%' or t.video_id ilike '%'||$1||'%' or v.title ilike '%'||$1||'%'
        or exists(select 1 from identities i where i.user_id=t.created_by_user_id and i.identifier ilike '%'||$1||'%')) and ($2='' or t.publication_status=$2)`, [search, publication]);
    res.json({ items: items.rows, total: count.rows[0].total, page, limit });
  } catch (error) { next(error); }
});

adminRouter.get("/subtitles/:subtitleId/download", async (req, res, next) => {
  try {
    const result = await query<{ vtt_text: string; video_id: string; target_lang: string }>(
      "select vtt_text,video_id,target_lang from translated_subtitles where id=$1",
      [req.params.subtitleId]
    );
    const subtitle = result.rows[0];
    if (!subtitle) throw new AdminError("字幕不存在", 404);
    sendVtt(res, subtitle.vtt_text, `${subtitle.video_id}.${subtitle.target_lang}.vtt`);
  } catch (error) { next(error); }
});

adminRouter.patch("/subtitles/:subtitleId", async (req, res, next) => {
  const client = await db.connect();
  try {
    const input = z.object({ publicationStatus: z.enum(["private","candidate","recommended","archived","rejected"]), qualityScore: z.number().int().min(0).max(100).nullable() }).parse(req.body);
    await client.query("begin");
    const result = await client.query(`update translated_subtitles set publication_status=$2,quality_score=$3,updated_at=now()
      where id=$1 returning id,caption_source_id,target_lang,style_id`, [req.params.subtitleId, input.publicationStatus, input.qualityScore]);
    const row = result.rows[0]; if (!row) throw new AdminError("字幕不存在", 404);
    if (input.publicationStatus === "recommended" && row.caption_source_id) {
      await client.query(`insert into public_subtitle_selections (caption_source_id,target_lang,style_id,recommended_subtitle_id) values ($1,$2,$3,$4)
        on conflict (caption_source_id,target_lang,style_id) do update set previous_subtitle_id=public_subtitle_selections.recommended_subtitle_id,
        recommended_subtitle_id=excluded.recommended_subtitle_id,updated_at=now()`, [row.caption_source_id,row.target_lang,row.style_id,row.id]);
    }
    await client.query("commit"); res.json({ ok: true });
  } catch (error) { await client.query("rollback"); next(error); } finally { client.release(); }
});

adminRouter.get("/videos", async (req, res, next) => {
  try {
    const limit = positiveInt(req.query.limit, 20); const page = positiveInt(req.query.page, 1); const offset = (page - 1) * limit;
    const search = String(req.query.search || "").trim();
    const items = await query(`select v.video_id as "videoId",v.title,v.channel,v.url,v.duration,v.created_at as "createdAt",
      (select count(*)::int from caption_sources c where c.video_id=v.video_id) as "captionCount",
      (select count(*)::int from translation_jobs j where j.video_id=v.video_id) as "jobCount",
      (select max(j.created_at) from translation_jobs j where j.video_id=v.video_id) as "lastTranslatedAt"
      from videos v where ($1='' or v.video_id ilike '%'||$1||'%' or v.title ilike '%'||$1||'%' or v.channel ilike '%'||$1||'%')
      order by v.updated_at desc limit $2 offset $3`, [search, limit, offset]);
    const count = await query<{ total: number }>(`select count(*)::int total from videos v where ($1='' or v.video_id ilike '%'||$1||'%' or v.title ilike '%'||$1||'%' or v.channel ilike '%'||$1||'%')`, [search]);
    res.json({ items: items.rows, total: count.rows[0].total, page, limit });
  } catch (error) { next(error); }
});

function sendVtt(res: import("express").Response, content: string, filename: string) {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  res.setHeader("Content-Type", "text/vtt; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
  res.send(content);
}
