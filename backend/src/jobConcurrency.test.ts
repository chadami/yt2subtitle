import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

type MockCue = { index: number; text: string };

function aiResponse(cues: MockCue[]) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
    cues: cues.map(cue => ({ source_indexes: [cue.index], source: cue.text, translation: `译文 ${cue.index}` }))
  }) } }] }));
}

function abortable(signal: AbortSignal | null | undefined, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}

test('AI requests run concurrently after the first result and a failure keeps finished batches', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vidlingo-concurrency-'));
  Object.assign(process.env, { DATA_DIR: path.join(dir, 'data'), LOCAL_MT_PROVIDER: 'off',
    LOCAL_AI_PROVIDER: 'openai', LOCAL_AI_API_KEY: 'test', LOCAL_AI_MODEL: 'test' });
  const { initDatabase } = await import('./migrate.js');
  const { query, closeDatabase } = await import('./db.js');
  const { getLocalUserId } = await import('./auth.js');
  const { processSubtitleJob } = await import('./jobRunner.js');
  const originalFetch = globalThis.fetch;
  try {
    await initDatabase();
    const owner = await getLocalUserId();
    const raw = Array.from({ length: 60 }, (_, index) => ({ start: index * 3, end: index * 3 + 2, text: `Sentence ${index}.` }));
    await query("insert into videos(video_id,url) values('concurrency','https://youtube.com/watch?v=concurrency')");
    const source = (await query<{ id: string }>("insert into caption_sources(video_id,source_lang,caption_type,raw_cues_json) values('concurrency','en','manual',$1) returning id", [JSON.stringify(raw)])).rows[0].id;
    const job = async () => (await query<{ id: string }>("insert into translation_jobs(user_id,video_id,source_lang,target_lang,caption_source_id,status) values($1,'concurrency','en','zh-Hans',$2,'queued') returning id", [owner, source])).rows[0].id;
    const savedCues = async (id: string) => (await query<{ cues_json: Array<{ start: number }> }>('select cues_json from translation_job_chunks where job_id=$1', [id])).rows.flatMap(row => row.cues_json);

    let inFlight = 0, maxInFlight = 0;
    const sizes: number[] = [];
    globalThis.fetch = async (_url, init) => {
      const cues: MockCue[] = JSON.parse(JSON.parse(String(init?.body)).messages[1].content).rawCues;
      sizes.push(cues.length);
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        // Later batches answer first, so results arrive out of order.
        await abortable(init?.signal, cues.length === 3 ? 1 : 60 - cues[0].index);
        return aiResponse(cues);
      } finally { inFlight--; }
    };
    const completed = await job();
    await processSubtitleJob(completed);
    assert.deepEqual(sizes, [3, 12, 12, 12, 12, 9]);
    assert.equal(maxInFlight, 3);
    const stored = await savedCues(completed);
    assert.equal(stored.length, 60);
    assert.deepEqual(stored.map(cue => cue.start), raw.map(cue => cue.start), 'stored cues stay in time order');
    assert.equal((await query<{ status: string }>('select status from translation_jobs where id=$1', [completed])).rows[0].status, 'completed');

    let calls = 0, aborted = 0;
    globalThis.fetch = async (_url, init) => {
      const cues: MockCue[] = JSON.parse(JSON.parse(String(init?.body)).messages[1].content).rawCues;
      calls++;
      if (cues[0].index === 15) { await delay(50); return new Response('{}', { status: 500 }); }
      try {
        await abortable(init?.signal, cues[0].index === 3 || cues.length === 3 ? 1 : 5000);
      } catch (error) { aborted++; throw error; }
      return aiResponse(cues);
    };
    const failed = await job();
    await assert.rejects(processSubtitleJob(failed), /AI request failed: 500/);
    // The fast batch finishes first and its worker starts one more request before the failure arrives.
    assert.equal(calls, 5, 'no new request starts after a failure');
    assert.equal(aborted, 2, 'slow sibling requests are cancelled');
    assert.equal((await savedCues(failed)).length, 15, 'batches finished before the failure are kept');
  } finally {
    globalThis.fetch = originalFetch;
    await closeDatabase();
    await rm(dir, { recursive: true, force: true });
  }
});

test('requests continue from the playback position before earlier gaps', async () => {
  const { nextUnitIndex } = await import('./jobRunner.js');
  const unit = (start: number) => ({ chunkIndex: 0, cues: [{ index: start, start, end: start + 2, text: 'x' }] });
  const units = [unit(0), unit(10), unit(20)];
  assert.equal(nextUnitIndex(units, undefined), 0);
  assert.equal(nextUnitIndex(units, 11), 1);
  assert.equal(nextUnitIndex(units, 15), 2);
  assert.equal(nextUnitIndex(units, 100), 0, 'past the end falls back to the earliest gap');
});

test('Claude requests mark the shared system prompt for caching', async () => {
  const { translateChunk } = await import('./ai.js');
  const originalFetch = globalThis.fetch;
  let body: { system?: Array<{ text: string; cache_control?: { type: string } }> } = {};
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({
      cues: [{ source_indexes: [0], source: 'Hello.', translation: '你好。' }]
    }) }] }));
  };
  try {
    await translateChunk({ aiConfig: { provider: 'claude', apiKey: 'test', model: 'test' },
      videoContext: { title: '', channel: '', description: '' }, previousContext: [], nextContext: [],
      rawCues: [{ index: 0, start: 0, end: 2, text: 'Hello.' }], targetLanguage: 'zh-Hans' });
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(body.system?.length, 1);
  assert.ok(body.system?.[0].text.length);
  assert.deepEqual(body.system?.[0].cache_control, { type: 'ephemeral' });
});
