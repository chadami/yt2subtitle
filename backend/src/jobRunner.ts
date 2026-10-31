import { hasPlaybackWindow, playbackPosition } from "./playbackTranslation.js";
import { withJobOperation, JobCancelled } from "./jobControl.js";
import { AiDeadlineExceeded, withAiDeadline } from "./aiDeadline.js";
import { machineTranslationProvider } from "./machineTranslation.js";
import {
  translateChunk,
  type AiProvider
} from "./ai.js";
import { query } from "./db.js";
import { loadLocalAiConfig } from "./routes/ai.js";
import { ensureJobMachineTranslation } from "./jobMachineTranslation.js";
import { coveredSourceIndexes, chunkCues, finalizeTranslatedCues, prepareSourceCues, toVtt, type CleanCue, type RawCue, type TranslatedCue } from "./subtitles.js";
import { getTranslationStrategy } from "./translationStrategies.js";
import {
  assessSubtitleQuality,
  cleanupSubtitleArtifacts,
  hashTranslatedCues
} from "./subtitleLibrary.js";

const FIRST_REQUEST_CUES = 3;
const REQUEST_CUES = 12;
const REQUEST_CHARACTERS = 1400;
const CONTEXT_CUES = 8;
// Requests in flight per job after the first result; the queue may run several jobs at once.
const AI_REQUEST_CONCURRENCY = 3;

type RequestUnit = { chunkIndex: number; cues: CleanCue[] };

function requestUnits(chunkIndex: number, cues: CleanCue[]) {
  const units: RequestUnit[] = [];
  let current: CleanCue[] = [];
  let characters = 0;
  for (const cue of cues) {
    if (current.length >= REQUEST_CUES || (current.length && characters + cue.text.length > REQUEST_CHARACTERS)) {
      units.push({ chunkIndex, cues: current });
      current = [];
      characters = 0;
    }
    current.push(cue);
    characters += cue.text.length;
  }
  if (current.length) units.push({ chunkIndex, cues: current });
  return units;
}

/** While the video plays, translate from the playback position onward before earlier gaps. */
export function nextUnitIndex(units: RequestUnit[], position: number | undefined) {
  if (position === undefined) return 0;
  const ahead = units.findIndex(unit => unit.cues[unit.cues.length - 1].end > position);
  return ahead < 0 ? 0 : ahead;
}

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
  return withJobOperation(jobId, signal => processSubtitleJobWithSignal(jobId, signal));
}

async function processSubtitleJobWithSignal(jobId: string, jobSignal: AbortSignal) {
  await query("update translation_jobs set status = 'cleaning', progress = 10, updated_at = now() where id = $1 and status <> 'cancelled'", [jobId]);
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
    ai_provider: AiProvider | null;
    ai_model: string | null;
    strategy_id: string | null;
    strategy_version: string | null;
    style_id: string;
    generation_key: string | null;
    caption_type: "manual" | "auto";
  }>(
    `select j.video_id, j.source_lang, j.target_lang, j.caption_source_id, j.user_id,
     j.ai_provider, j.ai_model, j.strategy_id, j.strategy_version,
     j.style_id, j.generation_key,
     c.raw_cues_json, c.caption_type, v.title, v.channel, v.description, v.url
     from translation_jobs j
     join caption_sources c on c.id = j.caption_source_id
     join videos v on v.video_id = j.video_id
     where j.id = $1`,
    [jobId]
  );
  const record = found.rows[0];
  if (!record) throw new Error("Job not found");
  const aiConfig = loadLocalAiConfig();
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

  const hasMachineFallback = machineTranslationProvider() !== "off";
  // Metadata and adjacent cues already provide context. Start translating now,
  // rather than spending the short first-result budget on a separate AI brief.
  await query("update translation_jobs set status = 'translating', progress = 25, updated_at = now() where id = $1 and status <> 'cancelled'", [jobId]);
  // Keep the persisted chunk layout stable for old jobs; requests are cut inside each chunk.
  const chunks = chunkCues(cleanCues);
  const chunkResults = chunks.map((_, index) => [...(completedChunks.get(index) || [])]);
  const completedSources = new Set<number>();
  const units: RequestUnit[] = [];
  let firstUnit: RequestUnit | undefined;
  const needsFirstResult = ![...completedChunks.values()].some(cues => cues.length > 0);
  chunks.forEach((chunk, chunkIndex) => {
    const covered = coveredSourceIndexes(chunkResults[chunkIndex]);
    for (const sourceIndex of covered) completedSources.add(sourceIndex);
    let pending = chunk.filter(cue => !covered.has(cue.index));
    // Only the very first network request is small, so the first subtitles appear quickly.
    if (needsFirstResult && !firstUnit && pending.length) {
      firstUnit = { chunkIndex, cues: pending.slice(0, FIRST_REQUEST_CUES) };
      pending = pending.slice(FIRST_REQUEST_CUES);
    }
    units.push(...requestUnits(chunkIndex, pending));
  });

  const positionByIndex = new Map(cleanCues.map((cue, position) => [cue.index, position]));
  // A failed request stops its siblings; jobSignal still distinguishes a user stop.
  const pool = new AbortController();
  const poolSignal = AbortSignal.any([jobSignal, pool.signal]);
  async function runUnit(unit: RequestUnit, first: boolean) {
    poolSignal.throwIfAborted();
    const playbackActive = hasPlaybackWindow(record.user_id, record.caption_source_id, record.target_lang);
    // Playback preview supplies machine cues independently. A missing/expired
    // preview session must not shorten the first AI request to five seconds.
    const budgetMs = playbackActive || hasMachineFallback ? 60_000 : 120_000;
    const batchStartedAt = Date.now();
    console.info(`Subtitle job ${jobId}: AI chunk ${unit.chunkIndex + 1}/${chunks.length}, ${unit.cues.length} cues started (budget ${budgetMs}ms)`);
    const firstPosition = positionByIndex.get(unit.cues[0].index)!;
    const lastPosition = positionByIndex.get(unit.cues[unit.cues.length - 1].index)!;
    const previousContext = cleanCues.slice(Math.max(0, firstPosition - CONTEXT_CUES), firstPosition);
    const nextContext = cleanCues.slice(lastPosition + 1, lastPosition + 1 + CONTEXT_CUES);
    const result = attachSourceText(await withAiDeadline(
      first ? "首批 AI 字幕" : "AI 字幕批次", budgetMs, signal => translateChunk({
        aiConfig: { ...aiConfig, signal: AbortSignal.any([poolSignal, signal]) },
        videoContext: { title:record.title, channel:record.channel, description:record.description },
        previousContext, rawCues:unit.cues, nextContext, targetLanguage:record.target_lang
      })), cleanCues);
    // Save a paid result even if a sibling request failed meanwhile; only a user stop discards it.
    jobSignal.throwIfAborted();
    console.info(`Subtitle job ${jobId}: ${unit.cues.length} AI cues completed in ${Date.now() - batchStartedAt}ms`);
    const chunkResult = chunkResults[unit.chunkIndex];
    chunkResult.push(...result);
    // Concurrent requests finish out of order; partial readers expect cues in time order.
    chunkResult.sort((a, b) => a.start - b.start || a.end - b.end);
    for (const sourceIndex of coveredSourceIndexes(result)) completedSources.add(sourceIndex);
    // The snapshot is taken now and statements run in order, so the last write is the most complete.
    await query(
      `insert into translation_job_chunks (job_id, chunk_index, cues_json) values ($1,$2,$3)
       on conflict (job_id, chunk_index) do update set cues_json=excluded.cues_json, updated_at=now()`,
      [jobId,unit.chunkIndex,JSON.stringify(chunkResult)]);
    await query("update translation_jobs set progress=$1,updated_at=now() where id=$2 and status<>'cancelled'",
      [25 + Math.round(completedSources.size / Math.max(1,cleanCues.length) * 55), jobId]);
  }

  if (firstUnit) await runUnit(firstUnit, true);
  let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(AI_REQUEST_CONCURRENCY, units.length) }, async () => {
    while (units.length && !poolSignal.aborted) {
      const position = playbackPosition(record.user_id, record.caption_source_id, record.target_lang);
      const unit = units.splice(nextUnitIndex(units, position), 1)[0];
      try {
        await runUnit(unit, false);
      } catch (error) {
        if (failure === undefined) {
          failure = error;
          pool.abort(error);
        }
        return;
      }
    }
  }));
  if (failure !== undefined) throw failure;
  jobSignal.throwIfAborted();
  const translated = chunkResults.flat();

  await query("update translation_jobs set status = 'finalizing', progress = 95, updated_at = now() where id = $1 and status <> 'cancelled'", [jobId]);
  const finalized = finalizeTranslatedCues(translated, record.target_lang);
  jobSignal.throwIfAborted();
  const quality = assessSubtitleQuality(cleanCues, finalized, record.target_lang);
  const finalCues = finalized.map(({ start, end, text, sourceText }) => ({ start, end, text, sourceText }));
  const vtt = toVtt(finalCues);
  const saved = await query<{ id: string }>(
    `insert into translated_subtitles (
       video_id, source_lang, target_lang, provider_mode, provider, model,
       strategy_id, strategy_version, job_id, caption_source_id, style_id, generation_key,
       content_hash, publication_status, quality_score, quality_metrics_json,
       created_by_user_id, cues_json, vtt_text
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     returning id`,
    [
      record.video_id,
      record.source_lang,
      record.target_lang,
      "user",
      aiConfig.provider,
      aiConfig.model,
      strategyId,
      strategyVersion,
      jobId,
      record.caption_source_id,
      record.style_id,
      record.generation_key,
      hashTranslatedCues(finalCues),
      "private",
      quality.score,
      JSON.stringify(quality.metrics),
      record.user_id,
      JSON.stringify(finalCues),
      vtt
    ]
  );
  jobSignal.throwIfAborted();
  await query(
    `delete from translated_subtitles
     where id <> $1 and created_by_user_id = $2 and caption_source_id = $3
       and target_lang = $4 and style_id = $5`,
    [saved.rows[0].id, record.user_id, record.caption_source_id, record.target_lang, record.style_id]
  );
  await query("update translation_jobs set status = 'completed', progress = 100, completed_at = now(), updated_at = now() where id = $1 and status <> 'cancelled'", [jobId]);
  await cleanupSubtitleArtifacts().catch((error) => console.error("Subtitle cleanup failed", error));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function markJobAttemptFailed(jobId: string, error: unknown, finalAttempt: boolean) {
  await query(
    `update translation_jobs
     set status = $1, error = $2, updated_at = now()
     where id = $3 and status <> 'cancelled'`,
    [finalAttempt ? "failed" : "queued", errorMessage(error), jobId]
  );
  if (finalAttempt) {
    await ensureJobMachineTranslation(jobId).catch(error => console.error("Could not start machine fallback", error));

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
      const current = await query<{status:string}>("select status from translation_jobs where id=$1",[jobId]);
      if (error instanceof JobCancelled || current.rows[0]?.status === "cancelled") return;
      const handoff = error instanceof AiDeadlineExceeded && machineTranslationProvider() !== "off";
      const finalAttempt = handoff || attempt >= maxAttempts;
      console.error(`Subtitle job ${jobId} failed (attempt ${attempt}/${maxAttempts})`, error);
      await markJobAttemptFailed(jobId, error, finalAttempt).catch((markError) => {
        console.error("Failed to record job failure", markError);
      });
      if (finalAttempt) return;
    }
  }
}
