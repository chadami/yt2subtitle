import { query } from "./db.js";
import { subtitleQueue } from "./queue.js";

/** Called before listening: new jobs cannot race with startup recovery. */
export async function recoverInterruptedJobs() {
  // The previous local process owns neither a live preview request nor a worker.
  await query("update machine_translation_runs set status = 'failed', updated_at = now() where status = 'active'");
  await query(`update translation_jobs set machine_translation_state = 'idle', machine_translation_retry_at = null
    where machine_translation_state = 'running' and status in ('queued','cleaning','translating','compressing','finalizing')`);
  let afterId = "00000000-0000-0000-0000-000000000000";
  let recovered = 0;
  while (true) {
    const batch = await query<{ id: string }>(
      `select id from translation_jobs
       where status in ('queued', 'cleaning', 'translating', 'compressing', 'finalizing')
         and id > $1::uuid
       order by id asc limit 100`,
      [afterId]
    );
    if (batch.rows.length === 0) break;
    for (const row of batch.rows) {
      await subtitleQueue.add("translate", { jobId: row.id }, { attempts: 2 });
      recovered += 1;
    }
    afterId = batch.rows[batch.rows.length - 1].id;
  }
  if (recovered) console.log(`Requeued ${recovered} interrupted job(s)`);
  return recovered;
}
