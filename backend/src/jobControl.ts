import { query } from './db.js';

export class JobCancelled extends Error {
  constructor() { super('任务已停止'); this.name = 'JobCancelled'; }
}
const operations = new Map<string, Set<AbortController>>();

export function abortJobOperations(jobId: string) {
  for (const controller of operations.get(jobId) || []) controller.abort(new JobCancelled());
}

export async function withJobOperation<T>(jobId: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const group = operations.get(jobId) || new Set<AbortController>();
  group.add(controller);
  operations.set(jobId, group);
  try {
    const job = await query<{status:string}>('select status from translation_jobs where id=$1',[jobId]);
    if (job.rows[0]?.status === 'cancelled') throw new JobCancelled();
    controller.signal.throwIfAborted();
    return await operation(controller.signal);
  } finally {
    group.delete(controller);
    if (!group.size) operations.delete(jobId);
  }
}
