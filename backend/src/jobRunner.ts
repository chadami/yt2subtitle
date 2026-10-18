import {
  analyzeSubtitleContext,
  translateChunk,
  systemAiConfig,
  type ProviderMode,
  type AiProvider,
  type SubtitleTranslationContext
} from "./ai.js";
import { query } from "./db.js";
import { sendSubtitleReadyEmail } from "./email.js";
import { loadUserAiConfig } from "./routes/ai.js";
import { ensureJobMachineTranslation } from "./jobMachineTranslation.js";
import { chunkCues, finalizeTranslatedCues, prepareSourceCues, toVtt, type RawCue, type TranslatedCue } from "./subtitles.js";
import { getTranslationStrategy } from "./translationStrategies.js";
import {
  assessSubtitleQuality,
  cleanupSubtitleArtifacts,
  hashTranslatedCues,
  promotePublicSubtitle
} from "./subtitleLibrary.js";

function sourceTextForCue(cue: TranslatedCue, cleanCues: Array<RawCue & { index: number }>) {
  const indexes = new Set(cue.sourceIndexes || []);
  const sourceCues = cleanCues.filter((sourceCue) => indexes.has(sourceCue.index));
  return sourceCues.map((sourceCue) => sourceCue.text).join(" ").replace(/\s+/g, " ").trim();
}

function attachSourceText(cues: TranslatedCue[], cleanCues: Array<RawCue & { index: number }>) {
  return cues.map((cue) => ({
    ...cue,
    sourceText: cue.sourceText || sourceTextForCue(cue, cleanCues)
  }));
}

export async function processSubtitleJob(jobId: string) {
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
    strategy_id: string | null;
    strategy_version: string | null;
    style_id: string;
    generation_key: string | null;
    contribution_eligible: boolean;
    consent_version: string | null;
    machine_run_id: string | null;
    caption_type: "manual" | "auto";
  }>(
    `select j.video_id, j.source_lang, j.target_lang, j.caption_source_id, j.user_id,
     j.provider_mode, j.ai_provider, j.ai_model, j.strategy_id, j.strategy_version,
     j.style_id, j.generation_key, j.contribution_eligible, j.consent_version, j.machine_run_id,
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
  const strategy = getTranslationStrategy(record.target_lang);
  const strategyId = record.strategy_id || strategy.id;
  const strategyVersion = record.strategy_version || strategy.version;
  if (!record.strategy_id || !record.strategy_version) {
    await query(
      "update translation_jobs set strategy_id = $1, strategy_version = $2, updated_at = now() where id = $3",
      [strategyId, strategyVersion, jobId]
    );
  }

  const cleanCues = prepareSourceCues(record.raw_cues_json, record.caption_type);
  await query(
    "update caption_sources set clean_cues_json = $1 where id = $2",
    [JSON.stringify(cleanCues), record.caption_source_id]
  );
  // A desktop restart must not discard AI batches already paid for and stored.
  const savedChunks = await query<{ chunk_index: number; cues_json: TranslatedCue[] | string }>(
    "select chunk_index, cues_json from translation_job_chunks where job_id = $1", [jobId]
  );
  const completedChunks = new Map<number, TranslatedCue[]>();
  for (const row of savedChunks.rows) {
    const cues = typeof row.cues_json === "string" ? JSON.parse(row.cues_json) : row.cues_json;
    if (Array.isArray(cues) && cues.length && cues.every(cue =>
      typeof cue.text === "string" && Number.isFinite(cue.start) && Number.isFinite(cue.end))) {
      completedChunks.set(row.chunk_index, cues);
    }
  }

  await query("update translation_jobs set progress = 20, updated_at = now() where id = $1", [jobId]);
  let translationContext: SubtitleTranslationContext | undefined;
  try {
    translationContext = await analyzeSubtitleContext({
      aiConfig,
      videoContext: {
        title: record.title,
        channel: record.channel,
        description: record.description
      },
      cues: cleanCues,
      sourceLanguage: record.source_lang,
      targetLanguage: record.target_lang
    });
  } catch (error) {
    console.error("Failed to analyze subtitle context; continuing with chunk-only translation", error);
  }

  await query("update translation_jobs set status = 'translating', progress = 25, updated_at = now() where id = $1", [jobId]);
  const chunks = chunkCues(cleanCues);
  const translated: TranslatedCue[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const saved = completedChunks.get(index);
    if (saved) {
      translated.push(...saved);
      await query("update translation_jobs set progress = $1, updated_at = now() where id = $2", [
        25 + Math.round(((index + 1) / chunks.length) * 55), jobId
      ]);
      continue;
    }
    const previousContext = index > 0 ? chunks[index - 1].slice(-8) : [];
    const nextContext = index < chunks.length - 1 ? chunks[index + 1].slice(0, 8) : [];
    const translatedChunk = attachSourceText(await translateChunk({
      aiConfig,
      videoContext: {
        title: record.title,
        channel: record.channel,
        description: record.description
      },
      translationContext,
      previousContext,
      rawCues: chunk,
      nextContext,
      targetLanguage: record.target_lang
    }), cleanCues);
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
  const finalized = finalizeTranslatedCues(translated, record.target_lang);
  const quality = assessSubtitleQuality(cleanCues, finalized, record.target_lang);
  const finalCues = finalized.map(({ start, end, text, sourceText }) => ({ start, end, text, sourceText }));
  const vtt = toVtt(finalCues);
  const initialPublicationStatus = record.contribution_eligible && quality.hardPass ? "candidate" : "private";
  const saved = await query<{ id: string }>(
    `insert into translated_subtitles (
       video_id, source_lang, target_lang, provider_mode, provider, model,
       strategy_id, strategy_version, job_id, caption_source_id, style_id, generation_key,
       content_hash, publication_status, quality_score, quality_metrics_json, consent_version,
       created_by_user_id, cues_json, vtt_text
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     returning id`,
    [
      record.video_id,
      record.source_lang,
      record.target_lang,
      aiConfig.providerMode,
      aiConfig.provider,
      aiConfig.model,
      strategyId,
      strategyVersion,
      jobId,
      record.caption_source_id,
      record.style_id,
      record.generation_key,
      hashTranslatedCues(finalCues),
      initialPublicationStatus,
      quality.score,
      JSON.stringify(quality.metrics),
      record.consent_version,
      record.user_id,
      JSON.stringify(finalCues),
      vtt
    ]
  );
  if (initialPublicationStatus === "candidate") {
    await promotePublicSubtitle({
      subtitleId: saved.rows[0].id,
      userId: record.user_id,
      captionSourceId: record.caption_source_id,
      targetLang: record.target_lang,
      styleId: record.style_id,
      qualityScore: quality.score
    });
  } else {
    await query(
      `delete from translated_subtitles
       where id <> $1 and created_by_user_id = $2 and caption_source_id = $3
         and target_lang = $4 and style_id = $5 and publication_status = 'private'`,
      [saved.rows[0].id, record.user_id, record.caption_source_id, record.target_lang, record.style_id]
    );
  }
  await query(
    `update user_video_usage set status = 'completed', completed_at = now()
     where user_id = $1 and video_id = $2`,
    [record.user_id, record.video_id]
  );
  await query("update translation_jobs set status = 'completed', progress = 100, completed_at = now(), updated_at = now() where id = $1", [jobId]);
  await cleanupSubtitleArtifacts().catch((error) => console.error("Subtitle cleanup failed", error));
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

export async function markJobAttemptFailed(jobId: string, error: unknown, finalAttempt: boolean) {
  await query(
    `update translation_jobs
     set status = $1, error = $2, updated_at = now()
     where id = $3`,
    [finalAttempt ? "failed" : "queued", errorMessage(error), jobId]
  );
  if (finalAttempt) {
    await ensureJobMachineTranslation(jobId).catch(error => console.error("Could not start machine fallback", error));
    await query(
      `delete from user_video_usage u
       using translation_jobs j
       where j.id = $1 and u.user_id = j.user_id and u.video_id = j.video_id
         and u.status = 'reserved'
         and not exists (
           select 1 from translation_jobs other
           where other.id <> j.id and other.user_id = j.user_id and other.video_id = j.video_id
             and other.status in ('queued', 'cleaning', 'translating', 'compressing', 'finalizing', 'completed')
         )`,
      [jobId]
    );
  }
}

/** In-process runner used by the macOS app: retries without an external queue. */
export async function runSubtitleJobInProcess(jobId: string, attempts = 1) {
  const maxAttempts = Math.max(1, attempts);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await processSubtitleJob(jobId);
      return;
    } catch (error) {
      const finalAttempt = attempt >= maxAttempts;
      console.error(`Subtitle job ${jobId} failed (attempt ${attempt}/${maxAttempts})`, error);
      await markJobAttemptFailed(jobId, error, finalAttempt).catch((markError) => {
        console.error("Failed to record job failure", markError);
      });
    }
  }
}
