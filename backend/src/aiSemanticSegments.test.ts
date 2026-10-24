import assert from 'node:assert/strict';
import test from 'node:test';
import { translateChunk } from './ai.js';
import { finalizeTranslatedCues } from './subtitles.js';
import { validatedSemanticSegments } from './chineseSubtitles.js';

test('AI semantic fragments survive parsing, storage and display without mechanical resegmentation', async () => {
  const original = globalThis.fetch;
  const translation = '欢迎收看新一期的《Audio Confidential》。';
  const segments = ['欢迎收看新一期的', '《Audio Confidential》。'];
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    assert.match(request.messages[0].content, /Chinese display segmentation/);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ cues: [{
      source_indexes: [7], source: 'Welcome to a new episode of Audio Confidential.', translation, segments,
      start: 999, end: 1000
    }] }) } }] }));
  };
  try {
    const cues = await translateChunk({ aiConfig: { provider: 'openai', apiKey: 'test', model: 'test' },
      videoContext: { title: 'Stockholm HQ', channel: '', description: '' }, previousContext: [], nextContext: [],
      rawCues: [{ index: 7, start: 66, end: 70, text: 'Welcome to a new episode of Audio Confidential.' }], targetLanguage: 'zh-Hans' });
    assert.deepEqual(cues[0].semanticSegments, segments);
    const display = finalizeTranslatedCues(JSON.parse(JSON.stringify(cues)), 'zh-Hans');
    assert.deepEqual(display.map(cue => cue.text), segments);
    assert.equal(display[0].start, 66);
    assert.equal(display.at(-1)?.end, 70);
    assert.ok(display.every(cue => cue.sourceIndexes?.[0] === 7));
    assert.deepEqual(finalizeTranslatedCues(display, 'zh-Hans'), display);
  } finally { globalThis.fetch = original; }
});

test('invalid AI display fragments cannot omit, repeat, reorder or split Latin names', () => {
  for (const parts of [ ['先打开。'], ['再保存。', '先打开。'], ['先打开。', '先打开。', '再保存。'], ['', '先打开。再保存。'], [12] ]) {
    assert.equal(validatedSemanticSegments(parts, '先打开。再保存。'), undefined);
  }
  assert.equal(validatedSemanticSegments(['Teenage', 'Engineering 办公室'], 'Teenage Engineering 办公室'), undefined);
  assert.equal(validatedSemanticSegments(['先打开', '，再保存。'], '先打开，再保存。'), undefined);
  const cue = {start: 0, end: 8, text: '先打开文件。然后点击保存。', semanticSegments: ['遗漏内容。']};
  assert.deepEqual(finalizeTranslatedCues([cue], 'zh').map(cue => cue.text), ['先打开文件。', '然后点击保存。']);
});

test('semantic phrase boundaries outweigh length balancing while timing still avoids flashes', () => {
  const text = '我们后来请了一个程序员，还有一个技术支持，负责回复最早的邮件。';
  const semanticSegments = ['我们后来请了一个程序员，', '还有一个技术支持，', '负责回复最早的邮件。'];
  const display = finalizeTranslatedCues([{start: 309, end: 318, text, semanticSegments}], 'zh');
  assert.deepEqual(display.map(cue => cue.text), semanticSegments);
  const fast = finalizeTranslatedCues([{start: 0, end: 1, text, semanticSegments}], 'zh');
  assert.equal(fast.length, 1);
  assert.equal(fast[0].text, text);
});
