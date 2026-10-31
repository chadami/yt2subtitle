const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/contentScript.js`, 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function selection() {
 const ctx = vm.createContext({});
 vm.runInContext(extract('function selectCaptionTrack(', 'function selectTargetCaptionTrack(') + extract('function isLanguageMatch(', 'function primaryLanguageCode('), ctx);
 return ctx.selectCaptionTrack;
}
const manual = { languageCode: 'en', isAuto: false, baseUrl: 'manual' };
const auto = { languageCode: 'en', isAuto: true, baseUrl: 'auto' };
test('default selects automatic English captions even if author captions come first', () => {
 assert.equal(selection()([manual, auto], 'en'), auto);
});
test('author priority selects manual captions even if automatic captions come first', () => {
 assert.equal(selection()([auto, manual], 'en', 'manual'), manual);
});
test('both priorities fall back when their preferred caption type is unavailable', () => {
 assert.equal(selection()([manual], 'en', 'auto'), manual);
 assert.equal(selection()([auto], 'en', 'manual'), auto);
});
test('language matching wins over source type, including regional language codes', () => {
 const otherAuto = { ...auto, languageCode: 'fr' };
 const otherManual = { ...manual, languageCode: 'fr' };
 assert.equal(selection()([otherAuto, manual], 'en', 'auto'), manual);
 assert.equal(selection()([otherManual, auto], 'en-US', 'manual'), auto);
});
test('missing source language still uses type preference and ignores unusable tracks', () => {
 assert.equal(selection()([{ ...auto, baseUrl: '' }, manual], 'en'), manual);
 assert.equal(selection()([manual, auto], 'de'), auto);
 assert.equal(selection()([], 'en'), null);
});
test('changing source priority preserves existing settings and clears preparation only', async () => {
 const settings = { autoTranslate: true, targetLang: 'zh-Hans', subtitleStyle: { fontSize: 28 } };
 let saved;
 const ctx = vm.createContext({ chrome: { storage: { local: { get: async () => ({settings}), set: async value => { saved = value; } } } },
  subtitlePreparationCache: { videoId: 'v' } });
 vm.runInContext(extract('async function handlePanelChange(', 'function handlePanelStyleInput('), ctx);
 await ctx.handlePanelChange({ target: { dataset: { setting: 'sourceCaptionPriority' }, value: 'manual' } });
 assert.equal(saved.settings.sourceCaptionPriority, 'manual');
 assert.equal(saved.settings.autoTranslate, true);
 assert.equal(saved.settings.subtitleStyle.fontSize, 28);
 assert.equal(ctx.subtitlePreparationCache, null);
});
test('a source preference changed in another tab cannot reuse a stale preparation', async () => {
 let priority = 'auto'; let calls = 0;
 const ctx = vm.createContext({ getVideoId: () => 'v', Date, SUBTITLE_PREPARATION_CACHE_MS: 30000,
  subtitlePreparationCache: null, chrome: { storage: { local: { get: async () => ({ settings: { sourceCaptionPriority: priority } }) } } },
  prepareAiSubtitlesForVideo: async () => ({ call: ++calls }) });
 vm.runInContext(extract('async function prepareAiSubtitles()', 'function normalizeApiBase('), ctx);
 assert.equal((await ctx.prepareAiSubtitles()).call, 1);
 assert.equal((await ctx.prepareAiSubtitles()).call, 1);
 priority = 'manual';
 assert.equal((await ctx.prepareAiSubtitles()).call, 2);
});
