import { Worker } from "bullmq";
import { translateChunk, compressSubtitle } from "./ai.js";
import { query } from "./db.js";
import { sendSubtitleReadyEmail } from "./email.js";
import { redisConnection } from "./queue.js";
import { chunkCues, resolveOverlaps, sanitizeTiming, toVtt, type RawCue, type TranslatedCue } from "./subtitles.js";

function maxCharsForDuration(duration: number) {
  if (duration < 1.2) return 8;
  if (duration < 2.0) return 14;
  if (duration < 3.5) return 22;
  if (duration < 5.0) return 30;
  return 36;
}

function visibleLength(text: string) {
  return text.replace(/\s+/g, "").length;
}

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
  }>(
    `select j.video_id, j.source_lang, j.target_lang, j.caption_source_id,
     c.raw_cues_json, v.title, v.channel, v.description, v.url
     from translation_jobs j
     join caption_sources c on c.id = j.caption_source_id
     join videos v on v.video_id = j.video_id
     where j.id = $1`,
    [jobId]
  );
  const record = found.rows[0];
  if (!record) throw new Error("Job not found");

  const cleanCues = resolveOverlaps(record.raw_cues_json);
  await query(
    "update caption_sources set clean_cues_json = $1 where id = $2",
    [JSON.stringify(cleanCues), record.caption_source_id]
  );

  await query("update translation_jobs set status = 'translating', progress = 25, updated_at = now() where id = $1", [jobId]);
  const chunks = chunkCues(cleanCues);
  const translated: TranslatedCue[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const previousContext = index > 0 ? chunks[index - 1].slice(-8) : [];
    const nextContext = index < chunks.length - 1 ? chunks[index + 1].slice(0, 8) : [];
    translated.push(...await translateChunk({
      videoContext: {
        title: record.title,
        channel: record.channel,
        description: record.description
      },
      previousContext,
      rawCues: chunk,
      nextContext,
      targetLanguage: record.target_lang
    }));
    await query("update translation_jobs set progress = $1, updated_at = now() where id = $2", [
      25 + Math.round(((index + 1) / chunks.length) * 55),
      jobId
    ]);
  }

  await query("update translation_jobs set status = 'compressing', progress = 82, updated_at = now() where id = $1", [jobId]);
  const timed = sanitizeTiming(translated);
  const compressed: TranslatedCue[] = [];
  for (const cue of timed) {
    const maxChars = maxCharsForDuration(cue.end - cue.start);
    if (visibleLength(cue.text) > maxChars) {
      compressed.push({
        ...cue,
        text: await compressSubtitle(cue.text, cue.end - cue.start, maxChars, record.target_lang)
      });
    } else {
      compressed.push(cue);
    }
  }

  await query("update translation_jobs set status = 'finalizing', progress = 95, updated_at = now() where id = $1", [jobId]);
  const finalCues = sanitizeTiming(compressed);
  const vtt = toVtt(finalCues);
  await query(
    `insert into translated_subtitles (video_id, source_lang, target_lang, provider, model, cues_json, vtt_text)
     values ($1, $2, $3, 'deepseek', 'deepseek-v4-pro', $4, $5)`,
    [record.video_id, record.source_lang, record.target_lang, JSON.stringify(finalCues), vtt]
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

new Worker("subtitle-jobs", async (job) => {
  await processSubtitleJob(job.data.jobId);
}, { connection: redisConnection });

console.log("Subtitle worker started");
