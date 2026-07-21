import assert from "node:assert/strict";
import test from "node:test";
import { enforceSubtitleLimits, finalizeTranslatedCues, normalizeTranslatedText } from "./subtitles.js";

test("Japanese translation replaces full-width commas with Japanese commas", () => {
  assert.equal(normalizeTranslatedText("これは，日本語です", "ja-JP"), "これは、日本語です");
  assert.equal(normalizeTranslatedText("这是，中文", "zh-Hans"), "这是，中文");
});

test("Japanese finalization uses Japanese continuation punctuation", () => {
  const cues = finalizeTranslatedCues([
    { start: 0, end: 2, text: "まず概要を説明します" },
    { start: 2.2, end: 8, text: "次に詳細を確認します。" }
  ], "ja");

  assert.equal(cues[0].text.endsWith("、"), true);
  assert.equal(cues.some((cue) => cue.text.includes("，")), false);
});

test("Japanese safety splitting keeps katakana terms intact", () => {
  const cues = enforceSubtitleLimits([{
    start: 0,
    end: 12,
    text: "まず基本的な考え方を確認してから新しいスタイルガイドを使って画面全体のデザインを整える方法を詳しく説明します"
  }], "ja-JP");

  assert.ok(cues.length > 1);
  assert.ok(cues.some((cue) => cue.text.includes("スタイルガイド")));
  assert.equal(cues.some((cue) => cue.text.endsWith("スタイルガ")), false);
  assert.equal(cues.some((cue) => cue.text.startsWith("イド")), false);
});
