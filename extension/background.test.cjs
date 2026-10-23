const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');

function harness(initial = {}, responder) {
  const storage = structuredClone(initial);
  const calls = [];
  const listeners = {};
  const event = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
  const context = vm.createContext({
    URL, AbortSignal, TextEncoder, crypto: webcrypto,
    fetch: async (url, options = {}) => {
      calls.push({ url, ...options });
      return responder(url, options);
    },
    chrome: {
      storage: { local: {
        get: async (keys) => Object.fromEntries(keys.filter(k => k in storage).map(k => [k, structuredClone(storage[k])])),
        set: async (value) => Object.assign(storage, structuredClone(value))
      } },
      alarms: { onAlarm: event('alarm'), create() {} },
      runtime: { onMessage: event('message'), onInstalled: event('installed'), onStartup: event('startup') }
    }
  });
  vm.runInContext(fs.readFileSync(`${__dirname}/background.js`, 'utf8'), context);
  return { storage, calls, context, run: (code) => vm.runInContext(code, context),
    message: (message) => new Promise(resolve => listeners.message(message, {}, resolve)) };
}
const reply = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const saved = { settings: { apiBase: 'http://127.0.0.1:3000', targetLang: 'ja' }, sessionToken: 'old', localMode: true };

test('expired local token refreshes once and replays the original POST', async () => {
  const h = harness(saved, (url, options) => url.endsWith('/session')
    ? reply(200, { token: 'new' })
    : reply(options.headers.Authorization === 'Bearer new' ? 200 : 401));
  const response = await h.run('localFetch("http://127.0.0.1:3000", "/api/jobs", { method: "POST", body: "original" })');
  assert.equal(response.status, 200);
  assert.equal(h.storage.sessionToken, 'new');
  assert.deepEqual(h.calls.map(c => new URL(c.url).pathname), ['/api/jobs', '/api/local/session', '/api/jobs']);
  assert.equal(h.calls[2].body, 'original');
  assert.equal(h.calls[1].headers['X-VidLingo-Client'], 'extension');
});

test('concurrent rejected requests share one session refresh', async () => {
  const h = harness(saved, async (url, options) => {
    if (url.endsWith('/session')) { await new Promise(r => setTimeout(r, 15)); return reply(200, { token: 'new' }); }
    return reply(options.headers.Authorization === 'Bearer new' ? 200 : 401);
  });
  await h.run('Promise.all([localFetch("http://127.0.0.1:3000", "/api/jobs/a"), localFetch("http://127.0.0.1:3000", "/api/jobs/b")])');
  assert.equal(h.calls.filter(c => c.url.endsWith('/session')).length, 1);
});

test('old cloud settings migrate to local without losing subtitle settings or jobs', async () => {
  const h = harness({ settings: { apiBase: 'https://old.example', targetLang: 'ja' }, sessionToken: 'cloud-jwt', pendingJobs: [{ jobId: 'a' }] },
    (url) => { assert.ok(url.startsWith('http://127.0.0.1:3000/')); return reply(200, { token: 'local' }); });
  assert.equal(await h.run('ensureSessionToken()'), 'local');
  assert.equal(h.storage.settings.targetLang, 'ja');
  assert.equal(h.storage.settings.apiBase, 'http://127.0.0.1:3000');
  assert.equal(h.storage.pendingJobs[0].jobId, 'a');
});

test('subtitle resolution ignores stale tokens from existing video pages', async () => {
  const h = harness({ ...saved, sessionToken: 'current' }, (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer current');
    return reply(404, { status: 'missing' });
  });
  await h.run('resolveSubtitle({ sessionToken: "stale-page-token", video: { videoId: "a" }, rawCues: [] })');
  assert.equal(h.calls.length, 1);
});

test('popup status recovers its connection through the background worker', async () => {
  const h = harness(saved, (url, options) => url.endsWith('/session') ? reply(200, { token: 'new' })
    : options.headers.Authorization === 'Bearer new' ? reply(200, { ai: { configured: true, model: 'model' } }) : reply(401));
  const data = await h.message({ type: 'GET_LOCAL_STATUS' });
  assert.equal(data.ok, true);
  assert.equal(data.ai.configured, true);
});

test('persistent auth failure stops after one retry instead of looping', async () => {
  const h = harness(saved, (url) => url.endsWith('/session') ? reply(200, { token: 'new' }) : reply(401));
  await assert.rejects(h.run('getJobStatus("a")'), /本机连接验证失败/);
  assert.equal(h.calls.length, 3);
});

test('app offline produces a connection message and preserves pending jobs', async () => {
  const h = harness({ ...saved, pendingJobs: [{ jobId: 'a' }] }, () => { throw new Error('offline'); });
  const status = await h.message({ type: 'GET_LOCAL_STATUS' });
  assert.equal(status.ok, false);
  assert.match(status.error, /无法连接 VidLingo/);
  assert.doesNotMatch(status.error, /登录/);
  await h.run('checkSubtitleJobs()');
  assert.equal(h.storage.pendingJobs.length, 1);
});


test('stop sends authenticated cancellation and removes only the selected job', async () => {
  const h = harness({ ...saved, pendingJobs: [{jobId:'a'},{jobId:'b'}], fallbackJobs:[{jobId:'a'}] }, (url,options) => {
    assert.equal(new URL(url).pathname,'/api/jobs/a/cancel');
    assert.equal(options.method,'POST');
    assert.equal(options.headers.Authorization,'Bearer old');
    return reply(200,{ok:true,status:'cancelled'});
  });
  const result=await h.message({type:'STOP_SUBTITLE_JOB',jobId:'a'});
  assert.equal(result.ok,true);
  assert.deepEqual(h.storage.pendingJobs,[{jobId:'b'}]);
  assert.deepEqual(h.storage.fallbackJobs,[]);
});

test('machine fallback keeps a task pending until its subtitles are complete', async () => {
  let state='running';
  const h=harness({...saved,pendingJobs:[{jobId:'a'}]},()=>reply(200,{status:'failed',machineTranslation:{state}}));
  await h.run('checkSubtitleJobs()');
  assert.equal(h.storage.pendingJobs.length,1);
  state='completed';
  await h.run('checkSubtitleJobs()');
  assert.equal(h.storage.pendingJobs.length,0);
});
