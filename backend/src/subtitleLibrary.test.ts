import assert from "node:assert/strict";
import test from "node:test";
import { assessSubtitleQuality, createGenerationKey, hashRawCues } from "./subtitleLibrary.js";

test("raw cue hash is stable and changes with source timing or text", () => {
  const cues = [{ start: 0, end: 1.23456, text: " Hello " }];
  assert.equal(hashRawCues(cues), hashRawCues([{ start: 0, end: 1.235, text: "Hello" }]));
  assert.notEqual(hashRawCues(cues), hashRawCues([{ start: 0, end: 1.236, text: "Hello" }]));
  assert.notEqual(hashRawCues(cues), hashRawCues([{ start: 0, end: 1.23456, text: "Hi" }]));
});

test("generation key separates source, target, strategy and model", () => {
  const base = {
    captionSourceId: "caption-a",
    targetLang: "zh-Hans",
    styleId: "accurate",
    strategyId: "zh",
    strategyVersion: "1",
    provider: "deepseek",
    model: "chat"
  };
  assert.equal(createGenerationKey(base), createGenerationKey({ ...base }));
  assert.notEqual(createGenerationKey(base), createGenerationKey({ ...base, model: "reasoner" }));
  assert.notEqual(createGenerationKey(base), createGenerationKey({ ...base, styleId: "creative" }));
});

test("quality gate accepts complete valid Chinese subtitles", () => {
  const result = assessSubtitleQuality(
    [
      { index: 0, start: 0, end: 1, text: "Hello 2026" },
      { index: 1, start: 1, end: 2, text: "Welcome" }
    ],
    [
      { start: 0, end: 1, text: "你好 2026", sourceText: "Hello 2026", sourceIndexes: [0] },
      { start: 1, end: 2, text: "欢迎观看", sourceText: "Welcome", sourceIndexes: [1] }
    ],
    "zh-Hans"
  );
  assert.equal(result.hardPass, true);
  assert.ok(result.score >= 90);
});

test("quality gate rejects missing source coverage", () => {
  const result = assessSubtitleQuality(
    [
      { index: 0, start: 0, end: 1, text: "Hello" },
      { index: 1, start: 1, end: 2, text: "World" }
    ],
    [{ start: 0, end: 1, text: "你好", sourceText: "Hello", sourceIndexes: [0] }],
    "zh-Hans"
  );
  assert.equal(result.hardPass, false);
  assert.ok(result.metrics.coverageRatio < 1);
});
