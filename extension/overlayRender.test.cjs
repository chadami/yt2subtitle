const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/contentScript.js`, 'utf8');
function extract(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }

function setup() {
  const counts = { rebuilds: 0, constrains: 0 };
  const content = { replaceChildren() { counts.rebuilds++; }, textContent: '' };
  const indicator = { hidden: true };
  const overlay = { dataset: {}, style: {}, querySelector: selector => selector.includes('content') ? content : indicator };
  const player = { clientWidth: 640, clientHeight: 360, getBoundingClientRect: () => ({ width: player.clientWidth, height: player.clientHeight }) };
  const context = vm.createContext({
    OVERLAY_CONTENT_ID: 'content', OVERLAY_AI_INDICATOR_ID: 'indicator',
    currentSubtitleStyle: { showSourceText: true, positionPercent: 10 }, subtitleDragState: null,
    normalizeText: text => text.trim(), clampNumber: (value, min, max) => Math.min(max, Math.max(min, value)),
    subtitlePlayerForOverlay: () => player,
    constrainedSubtitlePosition: () => { counts.constrains++; return { xPercent: 50, bottomPercent: 10 }; },
    setSubtitleDragHandleVisible() {}, requestAnimationFrame: callback => callback(),
    document: { createElement: () => ({ style: {} }) }
  });
  vm.runInContext(extract('function constrainSubtitleOverlay(', 'function beginSubtitleDrag('), context);
  vm.runInContext(extract('function renderOverlayCue(', 'function waitForVideoElement('), context);
  return { context, overlay, player, counts };
}

test('an unchanged cue is not rebuilt on every animation frame', () => {
  const { context, overlay, counts } = setup();
  for (let frame = 0; frame < 60; frame++) context.renderOverlayCue(overlay, 'Hello', '你好', true);
  assert.equal(counts.rebuilds, 1);
  assert.equal(counts.constrains, 1);
  context.renderOverlayCue(overlay, 'Next', '下一句', true);
  assert.equal(counts.rebuilds, 2, 'a new cue must render');
  context.renderOverlayCue(overlay, 'Next', '下一句', false);
  assert.equal(counts.rebuilds, 3, 'switching from AI to machine text must update the indicator');
});

test('an unchanged cue is re-constrained after the player resizes', () => {
  const { context, overlay, player, counts } = setup();
  context.renderOverlayCue(overlay, 'Hello', '你好');
  context.renderOverlayCue(overlay, 'Hello', '你好');
  assert.equal(counts.constrains, 1);
  player.clientWidth = 1920; player.clientHeight = 1080;
  context.renderOverlayCue(overlay, 'Hello', '你好');
  assert.equal(counts.constrains, 2);
  assert.equal(counts.rebuilds, 1);
});

test('hiding the source line re-renders and an empty cue hides the overlay once', () => {
  const { context, overlay, counts } = setup();
  context.renderOverlayCue(overlay, 'Hello', '你好');
  context.currentSubtitleStyle.showSourceText = false;
  context.renderOverlayCue(overlay, 'Hello', '你好');
  assert.equal(counts.rebuilds, 2);
  context.renderOverlayCue(overlay, '', '');
  assert.equal(overlay.style.display, 'none');
  context.renderOverlayCue(overlay, 'Hello', '你好');
  assert.equal(overlay.style.display, 'block');
  assert.equal(counts.rebuilds, 3);
});
