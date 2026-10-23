import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireMacOSTranslation } from './macosTranslationQueue.js';

test('system translation is serial across tasks and queued cancellation is immediate', async () => {
  const releaseFirst = await acquireMacOSTranslation();
  const stop = new AbortController();
  const cancelled = acquireMacOSTranslation(stop.signal);
  let acquiredNext = false;
  const next = acquireMacOSTranslation().then(release => {acquiredNext=true; return release;});
  await Promise.resolve();
  assert.equal(acquiredNext,false);
  stop.abort(new Error('stop queued task'));
  await assert.rejects(cancelled,/stop queued task/);
  assert.equal(acquiredNext,false);
  releaseFirst();
  const releaseNext = await next;
  assert.equal(acquiredNext,true);
  releaseNext();
  releaseNext(); // Release is idempotent.
  (await acquireMacOSTranslation())();
});
