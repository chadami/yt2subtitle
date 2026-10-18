import { setLocalJobHandler } from "./localQueue.js";
import { runSubtitleJobInProcess } from "./jobRunner.js";

setLocalJobHandler((jobId, attempts) => runSubtitleJobInProcess(jobId, attempts));
await import("./server.js");
