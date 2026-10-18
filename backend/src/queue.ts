import { env } from "./env.js";

export type SubtitleJobPayload = {
  jobId: string;
};

type QueueLike = {
  add(name: "translate", data: SubtitleJobPayload, options?: { attempts?: number }): Promise<unknown>;
};

let instance: QueueLike;

if (env.LOCAL_MODE) {
  const { enqueueLocalJob } = await import("./localQueue.js");
  instance = {
    add: (_name, data, options) => enqueueLocalJob(data.jobId, options)
  };
} else {
  const { Queue } = await import("bullmq");
  const redisUrl = new URL(env.REDIS_URL!);
  instance = new Queue<SubtitleJobPayload, void, "translate">("subtitle-jobs", {
    connection: {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      username: redisUrl.username || undefined,
      password: redisUrl.password || undefined,
      tls: redisUrl.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: null
    }
  }) as unknown as QueueLike;
}

export const subtitleQueue: QueueLike = instance;
