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

test("Japanese boundary repair keeps file names and Latin product names intact", () => {
  const cues = finalizeTranslatedCues([
    { start: 0, end: 2, text: "主要ブランドのDESIGN." },
    { start: 2, end: 4, text: "mdファイルが公開されています。" },
    { start: 5, end: 7, text: "Claude、" },
    { start: 7, end: 9, text: "Designにファイルを追加します。" }
  ], "ja-JP");
  const text = cues.map((cue) => cue.text).join("");

  assert.ok(text.includes("DESIGN.mdファイル"));
  assert.ok(text.includes("Claude Design"));
  assert.equal(cues.some((cue) => cue.text.endsWith("DESIGN.")), false);
  assert.equal(cues.some((cue) => cue.text.startsWith("mdファイル")), false);
  assert.equal(cues.some((cue) => cue.text.endsWith("Claude、")), false);
});

test("Japanese boundary repair reconnects particles, endings, and leading punctuation", () => {
  const cues = finalizeTranslatedCues([
    { start: 0, end: 2, text: "Claude Design用に最適化されたスタイルガイド、" },
    { start: 2, end: 4, text: "で、生のDESIGN.mdを変換します。" },
    { start: 5, end: 7, text: "新しいチャットを開始すればいいので、" },
    { start: 7, end: 9, text: "す。なぜなら、学びが引き継がれるからです。" },
    { start: 10, end: 12, text: "ファイルを開けば、" },
    { start: 12, end: 14, text: "、どんなブラウザでも表示できます。" }
  ], "ja");
  const text = cues.map((cue) => cue.text).join("");

  assert.ok(text.includes("スタイルガイドで、"));
  assert.ok(text.includes("開始すればいいのです。"));
  assert.equal(text.includes("、、"), false);
  assert.equal(cues.some((cue) => cue.text.startsWith("、")), false);
});

test("Japanese punctuation cleanup does not append punctuation after a quoted sentence", () => {
  const cues = finalizeTranslatedCues([
    { start: 0, end: 2, text: "「そのままにしてください。」、" }
  ], "ja");

  assert.equal(cues[0].text, "「そのままにしてください。」");
});
