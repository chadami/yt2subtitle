import { query } from "./db.js";
import { machineTranslationProvider, translateMachineCues, MachineTranslationError } from "./machineTranslation.js";
import { prepareSourceCues, chunkCues, type RawCue } from "./subtitles.js";

const active = new Set<string>();
const fallbackStatuses = ['failed'];

/** Safe to call from polling and the worker; the database claim also spans processes. */
export async function ensureJobMachineTranslation(jobId: string) {
  const provider = machineTranslationProvider();
  if (provider === 'off' || active.has(jobId)) return;
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
  void (async () => {
    try {
      const cleanCues = prepareSourceCues(record.raw_cues_json, record.caption_type);
      const savedAI = await query<{ chunk_index: number }>(
        'select chunk_index from translation_job_chunks where job_id = $1', [jobId]
      );
      const completedAI = new Set(savedAI.rows.map(row => row.chunk_index));
      const aiChunks = chunkCues(cleanCues);
      const firstFailedChunk = aiChunks.findIndex((_, index) => !completedAI.has(index));
      const fallbackCues = firstFailedChunk < 0 ? [] : aiChunks.slice(firstFailedChunk)
        .flatMap((chunk, offset) => completedAI.has(firstFailedChunk + offset) ? [] : chunk);
      // Old eager-preview batches used offsets from the start of the video.
      // Do not interpret those offsets as batches starting at the failure point.
      if (record.machine_translation_start_chunk !== firstFailedChunk) {
        await query('delete from translation_job_machine_chunks where job_id = $1', [jobId]);
        await query('update translation_jobs set machine_translation_start_chunk = $2 where id = $1', [jobId, firstFailedChunk]);
      }
      const existing = await query<{ chunk_index: number }>(
        'select chunk_index from translation_job_machine_chunks where job_id = $1 and provider = $2', [jobId, provider]
      );
      await translateMachineCues({
        cues: fallbackCues,
        sourceLanguage: record.source_lang, targetLanguage: record.target_lang,
        completedBatchIndexes: new Set(existing.rows.map(row => row.chunk_index)),
        shouldContinue: async () => {
          const job = await query<{ status: string }>('select status from translation_jobs where id = $1', [jobId]);
          return fallbackStatuses.includes(job.rows[0]?.status);
        },
        onBatch: async ({ batchIndex, cues }) => {
          await query(`insert into translation_job_machine_chunks (job_id, chunk_index, provider, cues_json)
            values ($1, $2, $3, $4) on conflict (job_id, chunk_index)
            do update set provider = excluded.provider, cues_json = excluded.cues_json, updated_at = now()`,
          [jobId, batchIndex, provider, JSON.stringify(cues)]);
          await query("update translation_jobs set machine_translation_retry_at = now() + interval '3 minutes' where id = $1", [jobId]);
        }
      });
      await query(`update translation_jobs set machine_translation_state = 'completed',
        machine_translation_error = null, machine_translation_code = null, machine_translation_retry_at = null where id = $1`, [jobId]);
    } catch (error) {
      const code = error instanceof MachineTranslationError ? error.code : 'machine_translation_failed';
      const permanent = ['macos_language_unsupported', 'macos_version_unsupported', 'macos_helper_missing'].includes(code);
      await query(`update translation_jobs set machine_translation_state = $2,
        machine_translation_error = $3, machine_translation_code = $4,
        machine_translation_retry_at = now() + interval '30 seconds' where id = $1`,
      [jobId, permanent ? 'failed' : 'waiting', error instanceof Error ? error.message : String(error), code]);
      console.warn(`Machine preview ${jobId}: ${code}`);
    } finally {
      active.delete(jobId);
    }
  })().catch(error => console.error('Could not update machine preview state', error));
}
