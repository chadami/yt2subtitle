export class AiDeadlineExceeded extends Error {
  constructor(public readonly stage: string, public readonly timeoutMs: number) {
    super(`${stage}等待超时，已停止本次 AI 请求`);
    this.name = 'AiDeadlineExceeded';
  }
}

/** Await cancellation before handing off. A Promise.race would leave AI running. */
export async function withAiDeadline<T>(stage: string, timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const failure = new AiDeadlineExceeded(stage, timeoutMs);
  const timer = setTimeout(() => controller.abort(failure), Math.max(1, timeoutMs));
  try {
    const result = await operation(controller.signal);
    controller.signal.throwIfAborted();
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw failure;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
