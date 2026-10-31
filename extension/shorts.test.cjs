const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/contentScript.js`, 'utf8');
function extract(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}
const routing = extract('function getVideoId(', 'function ensureOverlay(');

test('Shorts never exposes a translatable video, including URLs with a watch query', () => {
  const context = vm.createContext({ URL, location: {} });
  vm.runInContext(routing, context);
  for (const path of ['/shorts/abc', '/shorts/abc?v=abc', '/shorts', '/shorts/']) {
    context.location.href = `https://www.youtube.com${path}`;
    assert.equal(vm.runInContext('getCurrentVideoContext().isVideoPage', context), false);
    assert.equal(vm.runInContext('getVideoId()', context), '');
  }
  context.location.href = 'https://www.youtube.com/watch?v=abc';
  assert.equal(vm.runInContext('getVideoId()', context), 'abc');
});

test('entering Shorts clears translation state and skips automatic work', () => {
  const calls = [];
  const context = vm.createContext({
    getVideoId: () => '', panelVideoId: 'abc', autoTranslationVideoId: 'abc', autoTranslationRun: 1,
    playbackAiCues: [{}], machinePreviewVideoId: 'abc', machinePreviewCues: [{}],
    panelActionInProgress: true, subtitlePreparationCache: {},
    stopPanelJobPolling: () => calls.push('panel'),
    stopPartialSubtitlePolling: () => calls.push('partial'),
    stopPlaybackPreview: async () => calls.push('preview'),
    cancelAutoTranslationRetry() {}, setPanelState() {},
    clearOverlay: () => calls.push('overlay'), ensurePlayerControl: () => calls.push('control'),
    syncPreferencesFromApp: () => assert.fail('must not sync on Shorts'),
    maybeAutoTranslateCurrentVideo: () => assert.fail('must not translate Shorts'), console
  });
  vm.runInContext(extract('function handlePlayerPageChange(', 'document.addEventListener("click"'), context);
  vm.runInContext('handlePlayerPageChange()', context);
  assert.deepEqual(calls, ['panel', 'partial', 'preview', 'overlay', 'control']);
  assert.equal(context.autoTranslationVideoId, '');
  assert.equal(context.panelVideoId, '');
  assert.equal(context.subtitlePreparationCache, null);
  assert.equal(context.autoTranslationRun, 2);
});

test('Shorts removes existing translation controls without attaching new ones', () => {
  const removed = [];
  const context = vm.createContext({
    getVideoId: () => '', PLAYER_BUTTON_ID: 'button', PLAYER_PANEL_ID: 'panel',
    document: {
      getElementById: id => ({ remove: () => removed.push(id) }),
      querySelector: () => assert.fail('must not attach controls on Shorts')
    }
  });
  vm.runInContext(extract('function ensurePlayerControl(', 'async function togglePlayerPanel('), context);
  assert.equal(vm.runInContext('ensurePlayerControl()', context), false);
  assert.deepEqual(removed, ['button', 'panel']);
});

test('navigating to Shorts during subtitle preparation prevents job creation', async () => {
  let currentId = 'abc';
  const context = vm.createContext({
    getVideoId: () => currentId, playbackPreview: null, clearOverlay() {},
    prepareAiSubtitles: async () => { currentId = ''; return { payload: {} }; },
    chrome: { runtime: { sendMessage: () => assert.fail('must not create a translation job') } }
  });
  vm.runInContext(extract('async function generateAiSubtitles(', 'async function collectVideoPayload('), context);
  const result = await vm.runInContext('generateAiSubtitles()', context);
  assert.equal(result.reason, 'video-changed');
});
