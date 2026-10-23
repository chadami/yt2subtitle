import { query } from './db.js';
import { coveredSourceIndexes, type TranslatedCue } from './subtitles.js';

export async function machineProgress(jobId:string) {
  const found=await query<{total:number;completed:number;ai_chunks:TranslatedCue[][]}>(
    `select coalesce(jsonb_array_length(c.clean_cues_json),jsonb_array_length(c.raw_cues_json),0) as total,
     (select coalesce(sum(jsonb_array_length(m.cues_json)),0)::int from translation_job_machine_chunks m where m.job_id=j.id) as completed,
     (select coalesce(jsonb_agg(a.cues_json),'[]'::jsonb) from translation_job_chunks a where a.job_id=j.id) as ai_chunks
     from translation_jobs j join caption_sources c on c.id=j.caption_source_id where j.id=$1`,[jobId]);
  const row=found.rows[0];
  if(!row) return {completedCues:0,totalCues:0};
  return {completedCues:Number(row.completed),totalCues:Math.max(0,Number(row.total)-coveredSourceIndexes(row.ai_chunks.flat()).size)};
}
