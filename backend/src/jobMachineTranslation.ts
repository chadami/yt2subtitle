import { query } from "./db.js";
import { machineTranslationProvider, translateMachineCues, MachineTranslationError } from "./machineTranslation.js";
import { prepareSourceCues, type RawCue } from "./subtitles.js";

const active = new Set<string>();
const activeStatuses = ['queued', 'cleaning', 'translating', 'compressing', 'finalizing'];

/** Safe to call from polling and the worker; the database claim also spans processes. */
export async function ensureJobMachineTranslation(jobId: string) {
  const provider = machineTranslationProvider();
  if (provider === 'off' || active.has(jobId)) return;
  const claimed = await query<{ source_lang: string; target_lang: string; raw_cues_json: RawCue[]; caption_type: 'manual' | 'auto' }>(
    `update translation_jobs j set machine_translation_state = 'running',
       machine_translation_error = null, machine_translation_code = null,
       machine_translation_provider = $2, machine_translation_retry_at = now() + interval '3 minutes'
     from caption_sources c
     where j.id = $1 and c.id = j.caption_source_id
       and j.status = any($3::text[])
       and (j.machine_translation_provider is distinct from $2
         or (j.machine_translation_state not in ('completed', 'failed')
           and (j.machine_translation_retry_at is null or j.machine_translation_retry_at <= now())))
       and not exists (select 1 from machine_translation_runs r
         where r.id = j.machine_run_id and r.status = 'active'
           and r.updated_at > now() - interval '3 minutes')
     returning j.source_lang, j.target_lang, c.raw_cues_json, c.caption_type`,
    [jobId, provider, activeStatuses]
  );
  const record = claimed.rows[0];
  if (!record) return;
  active.add(jobId);
  void (async () => {
    try {
      const existing = await query<{ chunk_index: number }>(
        'select chunk_index from translation_job_machine_chunks where job_id = $1 and provider = $2', [jobId, provider]
      );
      await translateMachineCues({
        cues: prepareSourceCues(record.raw_cues_json, record.caption_type),
        sourceLanguage: record.source_lang, targetLanguage: record.target_lang,
        completedBatchIndexes: new Set(existing.rows.map(row => row.chunk_index)),
        shouldContinue: async () => {
          const job = await query<{ status: string }>('select status from translation_jobs where id = $1', [jobId]);
          return activeStatuses.includes(job.rows[0]?.status);
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
