import { Worker } from "bullmq";
import { translateChunk, systemAiConfig, type ProviderMode, type AiProvider } from "./ai.js";
import { query } from "./db.js";
import { sendSubtitleReadyEmail } from "./email.js";
import { redisConnection } from "./queue.js";
import { loadUserAiConfig } from "./routes/ai.js";
import { chunkCues, groupBySourceTiming, prepareSourceCues, toVtt, type RawCue, type TranslatedCue } from "./subtitles.js";

async function processSubtitleJob(jobId: string) {
  await query("update translation_jobs set status = 'cleaning', progress = 10, updated_at = now() where id = $1", [jobId]);
  const found = await query<{
    video_id: string;
    source_lang: string;
    target_lang: string;
    raw_cues_json: RawCue[];
    title: string;
    channel: string;
    description: string;
    url: string;
    caption_source_id: string;
    user_id: string;
    provider_mode: ProviderMode;
    ai_provider: AiProvider | null;
    ai_model: string | null;
    caption_type: "manual" | "auto";
  }>(
    `select j.video_id, j.source_lang, j.target_lang, j.caption_source_id, j.user_id,
     j.provider_mode, j.ai_provider, j.ai_model,
     c.raw_cues_json, c.caption_type, v.title, v.channel, v.description, v.url
     from translation_jobs j
     join caption_sources c on c.id = j.caption_source_id
     join videos v on v.video_id = j.video_id
     where j.id = $1`,
    [jobId]
  );
  const record = found.rows[0];
  if (!record) throw new Error("Job not found");
  const aiConfig = record.provider_mode === "user"
    ? await loadUserAiConfig(record.user_id)
    : systemAiConfig();

  const cleanCues = prepareSourceCues(record.raw_cues_json, record.caption_type);
  await query(
    "update caption_sources set clean_cues_json = $1 where id = $2",
    [JSON.stringify(cleanCues), record.caption_source_id]
  );
  await query("delete from translation_job_chunks where job_id = $1", [jobId]);

  await query("update translation_jobs set status = 'translating', progress = 25, updated_at = now() where id = $1", [jobId]);
  const chunks = chunkCues(cleanCues);
  const translated: TranslatedCue[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const previousContext = index > 0 ? chunks[index - 1].slice(-8) : [];
    const nextContext = index < chunks.length - 1 ? chunks[index + 1].slice(0, 8) : [];
    const translatedChunk = await translateChunk({
      aiConfig,
      videoContext: {
        title: record.title,
        channel: record.channel,
        description: record.description
      },
      previousContext,
      rawCues: chunk,
      nextContext,
      targetLanguage: record.target_lang
    });
    translated.push(...translatedChunk);
    await query(
      `insert into translation_job_chunks (job_id, chunk_index, cues_json)
       values ($1, $2, $3)
       on conflict (job_id, chunk_index)
       do update set cues_json = excluded.cues_json, updated_at = now()`,
      [jobId, index, JSON.stringify(translatedChunk)]
    );
    await query("update translation_jobs set progress = $1, updated_at = now() where id = $2", [
      25 + Math.round(((index + 1) / chunks.length) * 55),
      jobId
    ]);
  }

  await query("update translation_jobs set status = 'finalizing', progress = 95, updated_at = now() where id = $1", [jobId]);
  const finalCues = groupBySourceTiming(translated).map(({ start, end, text }) => ({ start, end, text }));
  const vtt = toVtt(finalCues);
  await query(
    `insert into translated_subtitles (
       video_id, source_lang, target_lang, provider_mode, provider, model,
       created_by_user_id, cues_json, vtt_text
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      record.video_id,
      record.source_lang,
      record.target_lang,
      aiConfig.providerMode,
      aiConfig.provider,
      aiConfig.model,
      record.user_id,
      JSON.stringify(finalCues),
      vtt
    ]
  );
  await query("update translation_jobs set status = 'completed', progress = 100, completed_at = now(), updated_at = now() where id = $1", [jobId]);
  await notifyJobOwner(jobId, record.title, record.url);
}

async function notifyJobOwner(jobId: string, title: string, url: string) {
  const found = await query<{ email: string }>(
    `select i.identifier as email
     from translation_jobs j
     join identities i on i.user_id = j.user_id and i.type = 'email'
     where j.id = $1
     order by i.verified_at desc nulls last
     limit 1`,
    [jobId]
  );
  const email = found.rows[0]?.email;
  if (!email) return;

  try {
    await sendSubtitleReadyEmail(email, { title, url });
  } catch (error) {
    console.error("Failed to send subtitle ready email", error);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function markJobAttemptFailed(jobId: string, error: unknown, finalAttempt: boolean) {
  await query(
    `update translation_jobs
     set status = $1, error = $2, updated_at = now()
     where id = $3`,
    [finalAttempt ? "failed" : "queued", errorMessage(error), jobId]
  );
}

new Worker("subtitle-jobs", async (job) => {
  try {
    await processSubtitleJob(job.data.jobId);
  } catch (error) {
    const attempts = job.opts.attempts ?? 1;
    const finalAttempt = job.attemptsMade + 1 >= attempts;
    await markJobAttemptFailed(job.data.jobId, error, finalAttempt);
    throw error;
  }
}, { connection: redisConnection });

console.log("Subtitle worker started");
