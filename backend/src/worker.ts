import { Worker } from "bullmq";
import { env } from "./env.js";
import { markJobAttemptFailed, processSubtitleJob } from "./jobRunner.js";

const redisUrl = new URL(env.REDIS_URL!);

const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  tls: redisUrl.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null
};

new Worker("subtitle-jobs", async (job) => {
  try {
    await processSubtitleJob(job.data.jobId);
  } catch (error) {
    const attempts = job.opts.attempts ?? 1;
    const finalAttempt = job.attemptsMade + 1 >= attempts;
    await markJobAttemptFailed(job.data.jobId, error, finalAttempt);
    throw error;
  }
}, { connection, concurrency: env.WORKER_CONCURRENCY });

console.log(`Subtitle worker started with concurrency=${env.WORKER_CONCURRENCY}`);
