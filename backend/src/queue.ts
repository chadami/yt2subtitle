import { enqueueLocalJob } from "./localQueue.js";

export const subtitleQueue = {
  add(_name: "translate", data: { jobId: string }, options?: { attempts?: number }) {
    return enqueueLocalJob(data.jobId, options);
  }
};
