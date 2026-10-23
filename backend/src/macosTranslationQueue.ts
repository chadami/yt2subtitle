type Waiter = { grant: () => void };
let busy = false;
const waiting: Waiter[] = [];

/** Only one system translation helper may run, even for different videos. */
export function acquireMacOSTranslation(signal?: AbortSignal): Promise<() => void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      const index = waiting.indexOf(waiter);
      if (index >= 0) waiting.splice(index, 1);
      signal?.removeEventListener('abort', abort);
      reject(signal?.reason);
    };
    const waiter: Waiter = { grant: () => {
      signal?.removeEventListener('abort', abort);
      busy = true;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        busy = false;
        waiting.shift()?.grant();
      });
    } };
    if (!busy) waiter.grant();
    else { waiting.push(waiter); signal?.addEventListener('abort', abort, {once:true}); }
  });
}
