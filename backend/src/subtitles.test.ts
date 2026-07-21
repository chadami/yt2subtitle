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

test("Japanese boundary repair keeps an opening quote with its quoted product name", () => {
  const cues = finalizeTranslatedCues([
    { start: 0, end: 1.296, text: "そして名前を「" },
    { start: 1.296, end: 2.591, text: "Subtle Gradient Design System」に変更します。" }
  ], "ja-JP");
  const text = cues.map((cue) => cue.text).join("");

  assert.ok(text.includes("「Subtle Gradient Design System」"));
  assert.equal(text.includes("「、"), false);
  assert.equal(cues.some((cue) => cue.text.endsWith("「")), false);
  assert.ok(cues.every((cue) => visibleTestLength(cue.text) / (cue.end - cue.start) <= 18));
});

test("Japanese boundary repair keeps attributive modifiers with their nouns", () => {
  const cues = finalizeTranslatedCues([
    { start: 0, end: 3.333, text: "簡単に言うと、デザインシステムはClaude Design用に最適化された" },
    { start: 3.333, end: 6.666, text: "スタイルガイドで、生のDESIGN.mdファイルを変換します。" },
    { start: 7, end: 9, text: "なぜなら、この新しい" },
    { start: 9, end: 12, text: "チャットはすべてのファイルにアクセスできるからです。" }
  ], "ja");
  const text = cues.map((cue) => cue.text).join("");

  assert.ok(text.includes("最適化されたスタイルガイド"));
  assert.ok(text.includes("この新しいチャット"));
  assert.equal(text.includes("最適化された、"), false);
  assert.equal(text.includes("この新しい、"), false);
});

test("Japanese subtitle splitting gives longer text proportionally more display time", () => {
  const cues = enforceSubtitleLimits([{
    start: 0,
    end: 6.318,
    text: "はい、しばらく待つとChatGPTがファイルの処理を完了しました。「Subtle Gradient Design System」と名前を変えたクリーンなマークダウンコピーができました。"
  }], "ja");

  assert.ok(cues.length > 1);
  const longestTextCue = [...cues].sort((a, b) => visibleTestLength(b.text) - visibleTestLength(a.text))[0];
  const shortestTextCue = [...cues].sort((a, b) => visibleTestLength(a.text) - visibleTestLength(b.text))[0];
  assert.ok(longestTextCue.end - longestTextCue.start > shortestTextCue.end - shortestTextCue.start);
});

function visibleTestLength(text: string) {
  return Array.from(text.replace(/\s+/g, " ").trim()).length;
}
