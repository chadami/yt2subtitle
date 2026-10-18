import { env } from "./env.js";

type JobHandler = (jobId: string, attempts: number) => Promise<void>;

let handler: JobHandler | null = null;
const pending: Array<{ jobId: string; attempts: number }> = [];
let running = 0;

export function setLocalJobHandler(next: JobHandler) {
  handler = next;
  pump();
}

export async function enqueueLocalJob(jobId: string, options?: { attempts?: number }) {
  pending.push({ jobId, attempts: options?.attempts ?? 1 });
  pump();
  return { id: jobId };
}

export function localQueueSnapshot() {
  return { running, pending: pending.length };
}

function pump() {
  if (!handler) return;
  while (running < env.WORKER_CONCURRENCY && pending.length > 0) {
    const task = pending.shift()!;
    running += 1;
    Promise.resolve()
      .then(() => handler!(task.jobId, task.attempts))
      .catch((error) => console.error("Local job runner error", error))
      .finally(() => {
        running -= 1;
        pump();
      });
  }
}
