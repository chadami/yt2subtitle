import { hasPlaybackWindow } from "./playbackTranslation.js";
import { restoreMachineTranslationCache } from "./machineTranslationCache.js";
import { withJobOperation } from "./jobControl.js";
import { query } from "./db.js";
import { machineTranslationProvider, cueBatches, translateMachineCues, MachineTranslationError } from "./machineTranslation.js";
import { prepareSourceCues, coveredSourceIndexes, chunkCues, type RawCue, type TranslatedCue } from "./subtitles.js";

const active = new Set<string>();
const fallbackStatuses = ['failed'];

/** Safe to call from polling and the worker; the database claim also spans processes. */
export async function ensureJobMachineTranslation(jobId: string) {
  const provider = machineTranslationProvider();
  if (provider === 'off' || active.has(jobId)) return;
  const identity=(await query<{user_id:string;caption_source_id:string;target_lang:string;machine_translation_mode:string}>("select user_id,caption_source_id,target_lang,machine_translation_mode from translation_jobs where id=$1",[jobId])).rows[0];
  if(identity?.machine_translation_mode==='playback')return;
  if(identity&&hasPlaybackWindow(identity.user_id,identity.caption_source_id,identity.target_lang))return;
  const claimed = await query<{ source_lang: string; target_lang: string; raw_cues_json: RawCue[]; caption_type: 'manual' | 'auto'; machine_translation_start_chunk: number | null }>(
    `update translation_jobs j set machine_translation_state = 'running',
       machine_translation_error = null, machine_translation_code = null,
       machine_translation_provider = $2, machine_translation_retry_at = now() + interval '3 minutes'
     from caption_sources c
     where j.id = $1 and c.id = j.caption_source_id
       and j.status = any($3::text[])
       and (j.machine_translation_provider is distinct from $2
         or ((j.machine_translation_start_chunk is null or j.machine_translation_state not in ('completed', 'failed'))
           and (j.machine_translation_retry_at is null or j.machine_translation_retry_at <= now())))
     returning j.source_lang, j.target_lang, c.raw_cues_json, c.caption_type, j.machine_translation_start_chunk`,
    [jobId, provider, fallbackStatuses]
  );
  const record = claimed.rows[0];
  if (!record) return;
  active.add(jobId);
  void withJobOperation(jobId, async signal => {
    try {
      const cleanCues = prepareSourceCues(record.raw_cues_json, record.caption_type);
      const savedAI = await query<{ chunk_index: number; cues_json: TranslatedCue[] | string }>(
        'select chunk_index, cues_json from translation_job_chunks where job_id = $1', [jobId]
      );
      const coveredAI = coveredSourceIndexes(savedAI.rows.flatMap(row=>
        typeof row.cues_json === "string" ? JSON.parse(row.cues_json) : row.cues_json));
      const aiChunks = chunkCues(cleanCues);
      const firstFailedChunk = aiChunks.findIndex(chunk=>chunk.some(cue=>!coveredAI.has(cue.index)));
      const fallbackCues = cleanCues.filter(cue=>!coveredAI.has(cue.index));
      const cachedBatches = await restoreMachineTranslationCache(jobId,provider,fallbackCues,signal);
      await query("update translation_jobs set machine_translation_start_chunk=$2 where id=$1 and status='failed'",[jobId,firstFailedChunk]);
      await translateMachineCues({
        signal,
        cues: fallbackCues,
        sourceLanguage: record.source_lang, targetLanguage: record.target_lang,
        completedBatchIndexes: new Set([...cachedBatches].filter(([index,cues])=>cues.length===cueBatches(fallbackCues)[index]?.length).map(([index])=>index)),
        completedBatchCues: cachedBatches,
        shouldContinue: async () => {
          const job = await query<{ status: string }>('select status from translation_jobs where id = $1', [jobId]);
          return fallbackStatuses.includes(job.rows[0]?.status);
        },
        onBatch: async ({ batchIndex, cues }) => {
          signal.throwIfAborted();
          await query(`insert into translation_job_machine_chunks (job_id, chunk_index, provider, cues_json)
            values ($1, $2, $3, $4) on conflict (job_id, chunk_index)
            do update set provider = excluded.provider, cues_json = excluded.cues_json, updated_at = now()`,
          [jobId, batchIndex, provider, JSON.stringify(cues)]);
          await query("update translation_jobs set machine_translation_retry_at = now() + interval '3 minutes' where id = $1 and status = 'failed'", [jobId]);
        }
      });
      signal.throwIfAborted();
      await query(`update translation_jobs set machine_translation_state = 'completed',
        machine_translation_error = null, machine_translation_code = null, machine_translation_retry_at = null where id = $1 and status = 'failed'`, [jobId]);
    } catch (error) {
      if (signal.aborted) return;
      const code = error instanceof MachineTranslationError ? error.code : 'machine_translation_failed';
      const permanent = ['macos_language_unsupported', 'macos_version_unsupported', 'macos_helper_missing'].includes(code);
      await query(`update translation_jobs set machine_translation_state = $2,
        machine_translation_error = $3, machine_translation_code = $4,
        machine_translation_retry_at = now() + interval '30 seconds' where id = $1 and status = 'failed'`,
      [jobId, permanent ? 'failed' : 'waiting', error instanceof Error ? error.message : String(error), code]);
      console.warn(`Machine preview ${jobId}: ${code}`);
    } finally {
      active.delete(jobId);
    }
  }).catch(error => console.error('Could not update machine preview state', error)).finally(() => active.delete(jobId));
}
