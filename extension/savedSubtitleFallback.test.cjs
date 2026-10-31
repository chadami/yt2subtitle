const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(`${__dirname}/contentScript.js`, 'utf8');
const extract = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));

function setup(saved) {
  const rendered = [];
  const ctx = vm.createContext({
    getVideoId: () => 'v', clearOverlay() {}, playbackPreview: null,
    prepareAiSubtitles: async () => { throw new Error('已找到字幕轨道，但 YouTube 未返回可用字幕内容'); },
    chrome: { runtime: { sendMessage: async message => {
      assert.deepEqual({ ...message }, { type: 'GET_SAVED_SUBTITLE', videoId: 'v' });
      return saved;
    } } },
    renderSubtitles: async (cues, videoId) => { rendered.push({ cues, videoId }); return { loaded: true, cueCount: cues.length }; }
  });
  vm.runInContext(extract('async function tryLoadSubtitle(', 'function startPartialSubtitlePolling('), ctx);
  return { ctx, rendered };
}

test('opening a translated video shows its saved translation when YouTube captions fail', async () => {
  const cues = [{ start: 0, end: 2, text: '已保存译文', sourceText: 'Saved' }];
  const h = setup({ status: 'completed', accessSource: 'local', cues });
  const result = await h.ctx.tryLoadSubtitle();
  assert.equal(result.loaded, true);
  assert.equal(result.status, 'completed');
  assert.deepEqual(h.rendered, [{ cues, videoId: 'v' }]);
});

test('without a saved translation the caption error is still reported', async () => {
  const h = setup({ status: 'missing' });
  await assert.rejects(h.ctx.tryLoadSubtitle(), /未返回可用字幕内容/);
  assert.equal(h.rendered.length, 0);
});
