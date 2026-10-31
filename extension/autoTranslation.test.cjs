const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(`${__dirname}/contentScript.js`, 'utf8');
const extract = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup() {
  const states = [], timers = new Map();
  const action = { dataset: {} };
  let timerId = 0, starts = 0, preparations = 0;
  const ctx = vm.createContext({
    autoTranslationVideoId: '', autoTranslationRun: 0, autoTranslationRetryTimer: null,
    autoTranslationRetryCount: 0, panelActionInProgress: false, panelStateRevision: 0,
    panelVideoId: 'v', machinePreviewVideoId: '', machinePreviewCues: [], machinePreviewFeedback: null,
    subtitlePreparationCache: {}, PLAYER_PANEL_ID: 'panel', DEFAULT_SUBTITLE_STYLE: {},
    getVideoId: () => 'v',
    document: { getElementById: () => ({ querySelector: () => action }) },
    chrome: { storage: { local: { get: async () => ({ settings: { autoTranslate: true }, sessionToken: 'token' }) } },
      runtime: { sendMessage: async () => ({ ok: true }) } },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setPanelState(state, message) { ctx.panelStateRevision++; action.dataset.state = state; states.push({state, message}); },
    prepareAiSubtitles: async () => {
      if (++preparations === 1) throw new Error('已找到字幕轨道，但 YouTube 未返回可用字幕内容');
      return { payload: { rawCues: [{start:0,end:1,text:'Hello'}], sourceLang: 'en', targetLang: 'zh-Hans' } };
    },
    startPlaybackPreview: async () => {}, stopPlaybackPreview: async () => {},
    tryLoadSubtitle: async () => ({loaded: false}),
    loadSavedSubtitle: async () => ({loaded: false}),
    isSameTranslationLanguage: () => false, waitForVideoElement: async () => ({}),
    startTranslationFromPlayer: async () => { starts++; }, syncPanelStyleControls() {}, engineDisplayName: () => '',
  });
  vm.runInContext(extract('function cancelAutoTranslationRetry(', 'function handlePlayerPageChange('), ctx);
  vm.runInContext(extract('async function refreshPlayerPanel(', 'function engineDisplayName('), ctx);
  return { ctx, states, timers, action, preparations: () => preparations, starts: () => starts,
    async retry() { const [id, timer] = [...timers.entries()][0]; timers.delete(id); timer.fn(); await flush(); } };
}

test('auto translation retries empty captions and starts once when captions become available', async () => {
  const h = setup();
  await Promise.all([h.ctx.maybeAutoTranslateCurrentVideo(), h.ctx.maybeAutoTranslateCurrentVideo()]);
  assert.equal(h.preparations(), 1, 'concurrent page events share one attempt');
  assert.equal(h.states.at(-1).state, 'waiting');
  assert.equal([...h.timers.values()][0].ms, 3000);
  await h.ctx.refreshPlayerPanel();
  assert.equal(h.states.at(-1).state, 'waiting', 'opening the panel preserves the retry status');
  await h.retry();
  assert.equal(h.preparations(), 2);
  assert.equal(h.starts(), 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.ctx.subtitlePreparationCache, null, 'retry must fetch fresh caption session data');
});

test('a saved translation is shown instead of retrying when YouTube captions fail', async () => {
  const h = setup(); const loaded = [];
  h.ctx.loadSavedSubtitle = async videoId => { loaded.push(videoId); return { loaded: true }; };
  await h.ctx.maybeAutoTranslateCurrentVideo();
  assert.deepEqual(loaded, ['v']);
  assert.equal(h.timers.size, 0, 'no caption retry is scheduled');
  assert.equal(h.starts(), 0, 'no new translation starts');
  assert.deepEqual(h.states.at(-1), { state: 'ready', message: '已加载现有 AI 字幕' });
});

test('repeated caption failures stop after three retries and retain the error', async () => {
  const h = setup(); let attempts = 0;
  h.ctx.prepareAiSubtitles = async () => { attempts++; throw new Error('YouTube 未返回可用字幕内容'); };
  await h.ctx.maybeAutoTranslateCurrentVideo();
  for (const ms of [3000, 6000, 12000]) {
    assert.equal([...h.timers.values()][0].ms, ms);
    await h.retry();
  }
  assert.equal(attempts, 4);
  assert.equal(h.timers.size, 0);
  assert.equal(h.states.at(-1).state, 'error');
  await h.ctx.refreshPlayerPanel();
  assert.equal(h.states.at(-1).state, 'error');
});

test('turning automatic translation off or changing video invalidates a pending retry', async () => {
  for (const changedVideo of [false, true]) {
    const h = setup(); await h.ctx.maybeAutoTranslateCurrentVideo();
    if (changedVideo) h.ctx.getVideoId = () => 'next';
    else h.ctx.chrome.storage.local.get = async () => ({settings:{autoTranslate:false}});
    await h.retry();
    assert.equal(h.preparations(), 1);
    assert.equal(h.starts(), 0);
  }
});

test('a late failure for the previous video cannot change the current panel', async () => {
  const h = setup(); let reject;
  h.ctx.prepareAiSubtitles = () => new Promise((_, fail) => { reject = fail; });
  const attempt = h.ctx.maybeAutoTranslateCurrentVideo(); await flush();
  h.ctx.getVideoId = () => 'next'; h.ctx.autoTranslationRun++;
  h.ctx.setPanelState('working', '新视频翻译中');
  reject(new Error('字幕获取失败')); await attempt;
  assert.equal(h.states.at(-1).message, '新视频翻译中');
  assert.equal(h.timers.size, 0);
});

test('panel caption failure stays an error instead of becoming ready', async () => {
  const h = setup();
  await h.ctx.refreshPlayerPanel();
  assert.equal(h.states.at(-1).state, 'error');
  assert.match(h.states.at(-1).message, /未返回可用字幕内容/);
});

test('a late panel refresh cannot overwrite a newly started automatic attempt', async () => {
  const h = setup(); let release;
  h.ctx.prepareAiSubtitles = () => new Promise(resolve => { release = resolve; });
  const refresh = h.ctx.refreshPlayerPanel(); await flush();
  h.ctx.setPanelState('waiting', '字幕暂未获取成功，3 秒后自动重试');
  release({payload:{sourceLang:'en',targetLang:'zh-Hans'}}); await refresh;
  assert.equal(h.states.at(-1).state, 'waiting');
});
