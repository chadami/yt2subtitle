const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(`${__dirname}/contentScript.js`, 'utf8');
const extract = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
const proof = 'https://www.youtube.com/api/timedtext?v=v&lang=en&kind=asr&pot=proof';
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup({ pressed = 'false', entries = [] } = {}) {
  let observe;
  const classes = new Set(), appended = [];
  const button = { classList: { add: c => classes.add(c), remove: c => classes.delete(c) },
    getAttribute: () => pressed, getBoundingClientRect: () => ({ left: 500, width: 48 }) };
  const player = { querySelector: () => button, getBoundingClientRect: () => ({ left: 100 }),
    appendChild: node => { node.isConnected = true; appended.push(node); } };
  const ctx = vm.createContext({
    URL, CAPTION_GUIDE_ID: 'guide', captionGuide: null, recentCaptionRequestUrls: [], subtitlePreparationCache: {},
    getVideoId: () => 'v', ensurePlayerControlStyles() {},
    performance: { getEntriesByType: () => entries },
    PerformanceObserver: class { constructor(callback) { observe = callback; } observe() {} },
    document: {
      querySelector: selector => selector.includes('subtitles') ? button : player,
      createElement: () => ({ style: {}, setAttribute() {}, remove() { this.isConnected = false; } }),
      getElementById: () => appended.find(node => node.isConnected) || null
    }
  });
  vm.runInContext(extract('function observeCaptionRequests(', 'async function warmUpCaptionSession('), ctx);
  vm.runInContext(extract('function isCaptionProofUrl(', 'function captionsNeededError('), ctx);
  ctx.observeCaptionRequests();
  return { ctx, classes, appended, request: name => observe({ getEntries: () => [{ name }] }) };
}

test('the guide points at CC and continues once the player requests captions', async () => {
  const h = setup(); let resumed = 0;
  h.ctx.showCaptionGuide('v', () => { resumed++; });
  assert.ok(h.classes.has('yt-ai-cc-highlight'));
  assert.match(h.appended[0].textContent, /点击 CC/);
  assert.equal(h.appended[0].style.left, '424px');
  h.request(proof.replace('v=v', 'v=other'));
  h.request(proof.replace('&pot=proof', ''));
  await flush();
  assert.equal(resumed, 0, 'other videos and requests without proof do not count');
  h.request(proof); h.request(proof); await flush();
  assert.equal(resumed, 1);
  assert.equal(h.classes.size, 0);
  assert.equal(h.appended[0].isConnected, false);
  assert.equal(h.ctx.subtitlePreparationCache, null, 'the empty caption result is not reused');
});

test('CC already on asks the user to play, and an existing proof continues at once', async () => {
  const on = setup({ pressed: 'true' });
  on.ctx.showCaptionGuide('v', () => {});
  assert.match(on.appended[0].textContent, /播放几秒/);
  const ready = setup({ entries: [{ name: proof }] }); let resumed = 0;
  ready.ctx.showCaptionGuide('v', () => { resumed++; });
  await flush();
  assert.equal(resumed, 1);
  assert.equal(ready.appended.length, 0);
});
