import { Queue } from "bullmq";
import { env } from "./env.js";

const redisUrl = new URL(env.REDIS_URL);

export const redisConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  tls: redisUrl.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null
};

export type SubtitleJobPayload = {
  jobId: string;
};

export const subtitleQueue = new Queue<SubtitleJobPayload, void, "translate">("subtitle-jobs", {
  connection: redisConnection
});
