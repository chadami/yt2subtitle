import { db, query } from './db.js';
import { cueBatches } from './machineTranslation.js';
import type { CleanCue, TranslatedCue } from './subtitles.js';

const cueKey = (cue: {start:number;end:number}, sourceText:string) => JSON.stringify([cue.start,cue.end,sourceText]);

/** Exact local caption identity, language and provider; never borrow another
 * user's result or align by position alone. Partial and cancelled work is useful. */
export async function restoreMachineTranslationCache(jobId:string, provider:string, cues:CleanCue[], signal:AbortSignal) {
  const rows = await query<{cues_json:TranslatedCue[]|string}>(
    `select m.cues_json from translation_job_machine_chunks m
     join translation_jobs saved on saved.id=m.job_id
     join translation_jobs current on current.id=$1
     where saved.user_id=current.user_id and saved.caption_source_id=current.caption_source_id
       and saved.target_lang=current.target_lang and m.provider=$2
     order by (saved.id=current.id) desc, saved.updated_at desc, m.chunk_index`,[jobId,provider]);
  const expected = new Map(cues.map(cue=>[cueKey(cue,cue.text),cue]));
  const cached = new Map<string,TranslatedCue>();
  for (const row of rows.rows) {
    const parsed = typeof row.cues_json==='string' ? JSON.parse(row.cues_json) : row.cues_json;
    if (!Array.isArray(parsed)) continue;
    for (const value of parsed) {
      if (!value || typeof value.text!=='string' || !value.text.trim() || typeof value.sourceText!=='string') continue;
      const key=cueKey(value,value.sourceText), source=expected.get(key);
      if (source && !cached.has(key)) cached.set(key,{...value,sourceIndexes:[source.index]});
    }
  }
  const batches=new Map<number,TranslatedCue[]>();
  cueBatches(cues).forEach((batch,index)=>{
    const saved=batch.flatMap(cue=>{const value=cached.get(cueKey(cue,cue.text));return value?[value]:[];});
    if(saved.length) batches.set(index,saved);
  });
  signal.throwIfAborted();
  const client=await db.connect();
  try {
    await client.query('begin');
    const job=await client.query<{status:string}>('select status from translation_jobs where id=$1',[jobId]);
    signal.throwIfAborted();
    if(job.rows[0]?.status!=='failed') {await client.query('rollback'); return batches;}
    // Repack old/partial batches against the remaining source cues atomically.
    await client.query('delete from translation_job_machine_chunks where job_id=$1',[jobId]);
    for(const [index,saved] of batches) await client.query(
      'insert into translation_job_machine_chunks(job_id,chunk_index,provider,cues_json) values($1,$2,$3,$4)',
      [jobId,index,provider,JSON.stringify(saved)]);
    await client.query('commit');
  } catch(error) {await client.query('rollback');throw error;}
  finally {client.release();}
  if(cached.size) console.info(`Subtitle job ${jobId}: restored ${cached.size} machine cues from local cache`);
  return batches;
}
