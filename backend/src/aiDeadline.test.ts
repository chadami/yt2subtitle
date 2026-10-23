import assert from 'node:assert/strict';
import test from 'node:test';
import { withAiDeadline, AiDeadlineExceeded } from './aiDeadline.js';
import { translateChunk } from './ai.js';

test('deadline waits for request cancellation before handing off', async () => {
  let stopped = false;
  await assert.rejects(withAiDeadline('test', 10, signal => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      setTimeout(() => { stopped = true; reject(signal.reason); }, 5);
    }, { once: true });
  })), AiDeadlineExceeded);
  assert.equal(stopped, true);
});

test('successful operations complete normally without being aborted later', async () => {
  let signal!: AbortSignal;
  assert.equal(await withAiDeadline('test', 10, async value => { signal = value; return 42; }), 42);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(signal.aborted, false);
});

for (const provider of ['openai', 'gemini', 'claude'] as const) {
  test(`${provider}: deadline cancels a stalled response body and prevents repairs`, async () => {
    const original = globalThis.fetch;
    let requests = 0;
    let aborted = false;
    globalThis.fetch = async (_url, init) => {
      requests++;
      return { ok: true, json: () => new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => { aborted = true; reject(init!.signal!.reason); }, { once: true });
      }) } as Response;
    };
    try {
      await assert.rejects(withAiDeadline('first batch', 10, signal => translateChunk({
        aiConfig: { provider, apiKey: 'test', model: 'test', signal },
        videoContext: { title: 'test', channel: '', description: '' },
        previousContext: [], nextContext: [], rawCues: [{ index: 0, start: 0, end: 2, text: 'Hello.' }], targetLanguage: 'zh-Hans'
      })), AiDeadlineExceeded);
      assert.equal(aborted, true);
      assert.equal(requests, 1);
    } finally { globalThis.fetch = original; }
  });
}
