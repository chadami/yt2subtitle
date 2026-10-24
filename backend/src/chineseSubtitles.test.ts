import assert from "node:assert/strict";
import test from "node:test";
import { finalizeTranslatedCues, enforceSubtitleLimits, toVtt, type TranslatedCue } from "./subtitles.js";

const length = (text: string) => (text.match(/[\p{L}\p{N}]/gu) || []).length;
const compact = (text: string) => text.replace(/\s/gu, "");

function verify(input: TranslatedCue[], output: TranslatedCue[]) {
  assert.equal(output.map(cue => compact(cue.text)).join(""), input.map(cue => compact(cue.text)).join(""));
  assert.equal(output[0].start, input[0].start);
  assert.equal(output.at(-1)?.end, input.at(-1)?.end);
  assert.ok(output.every((cue, index) => Number.isFinite(cue.start) && cue.end > cue.start
    && (index === 0 || cue.start >= output[index - 1].end)));
  assert.deepEqual(finalizeTranslatedCues(output, "zh-Hans"), output, "formatting a saved subtitle is idempotent");
}

test("Chinese finalization preserves independent short source cues and their original gaps", () => {
  const input = [
    { start: 0, end: 0.8, text: "我们先看看，", sourceIndexes: [0] },
    { start: 0.8, end: 2, text: "这个办法行不行。", sourceIndexes: [1] },
    { start: 2.3, end: 3, text: "可以。", sourceIndexes: [2] }
  ];
  const result = finalizeTranslatedCues(input, "zh-CN");
  assert.deepEqual(result, input, "short cues must not be merged to meet the previous 1.2s minimum");
  verify(input, result);
});

test("Chinese separates complete sentences even when their combined length is below twenty", () => {
  const input = [{ start: 3, end: 9, text: "先打开文件。然后点击保存。最后关闭窗口。", sourceIndexes: [2] }];
  const result = finalizeTranslatedCues(input, "zh-Hans");
  assert.deepEqual(result.map(cue => cue.text), ["先打开文件。", "然后点击保存。", "最后关闭窗口。"]);
  assert.ok(result.every(cue => length(cue.text) <= 20));
  assert.ok(result.every(cue => cue.sourceIndexes?.[0] === 2));
  verify(input, result);
});

test("Chinese long clauses split at punctuation with proportional estimated times", () => {
  const input = [{ start: 10, end: 18, text: "我们先看一下研究结果，然后再解释这些数据到底意味着什么。" }];
  const result = enforceSubtitleLimits(input, "zh-Hant");
  assert.equal(result.length, 2);
  assert.equal(result[0].text, "我们先看一下研究结果，");
  const total = length(input[0].text);
  assert.equal(result[0].end, 10 + 8 * length(result[0].text) / total);
  assert.ok(result[1].end - result[1].start > result[0].end - result[0].start);
  assert.ok(result.every(cue => length(cue.text) <= 20));
  verify(input, result);
});

test("Chinese unpunctuated text splits at word boundaries without losing content", () => {
  const input = [{ start: 0, end: 16, text: "这段没有任何标点的中文字幕需要按照自然中文词语边界拆成适合观看的短字幕而且所有信息都应该完整保留" }];
  const result = finalizeTranslatedCues(input, "zh_TW");
  assert.ok(result.length >= 3);
  assert.ok(result.every(cue => length(cue.text) <= 20));
  assert.ok(result.every(cue => !/^[的地得]/u.test(cue.text)));
  verify(input, result);
});

test("Chinese splitting protects decimals, percentages, filenames and quotes", () => {
  const text = "他说：“今天我们使用DESIGN.md文件，费用是1,234.56美元，增长了12.5%，然后打开ChatGPT。”我们继续。";
  const input = [{ start: 2, end: 19, text }];
  const result = finalizeTranslatedCues(input, "zh");
  for (const token of ["DESIGN.md", "1,234.56", "12.5%", "ChatGPT"]) {
    assert.ok(result.some(cue => cue.text.includes(token)), token);
  }
  assert.ok(result.every(cue => !/^[，。！？：；”」]/u.test(cue.text) && !/[“「]$/u.test(cue.text)));
  verify(input, result);
});

test("Chinese estimates bilingual source boundaries without repeating or losing words", () => {
  const input = [{ start: 0, end: 8, text: "先打开文件。然后点击保存。最后关闭窗口。",
    sourceText: "First open the file. Then click save. Finally close the window.", sourceIndexes: [4, 5] }];
  const result = finalizeTranslatedCues(input, "zh");
  assert.equal(result.map(cue => compact(cue.sourceText || "")).join(""), compact(input[0].sourceText));
  assert.ok(result.every(cue => !/^[.,!?]/u.test(cue.sourceText || "")));
  assert.ok(result.every(cue => assert.deepEqual(cue.sourceIndexes, [4, 5]) === undefined));
  verify(input, result);
  assert.equal((toVtt(result).match(/-->/g) || []).length, result.length);
});

test("Chinese very fast speech relaxes twenty-character target instead of creating flashes", () => {
  const input = [{ start: 0, end: 1, text: "我们先看一下这项研究的结果，然后再解释这些数据到底意味着什么。" }];
  const result = finalizeTranslatedCues(input, "zh");
  assert.equal(result.length, 1);
  assert.equal(result[0].text, input[0].text);
  verify(input, result);
});

test("Chinese formatting keeps an indivisible long Latin token and standalone music intact", () => {
  const input = [{ start: 0, end: 8, text: "请打开SuperLongUnbrokenProductName2026并继续操作。" },
    { start: 10, end: 13, text: "[音乐]" }];
  const result = finalizeTranslatedCues(input, "zh");
  assert.ok(result.some(cue => cue.text.includes("SuperLongUnbrokenProductName2026")));
  assert.equal(result.at(-1)?.text, "[音乐]");
  verify(input, result);
});

test("Chinese keeps the 21-character clause in the reported Apple video intact", () => {
  const input = [{ start: 173.4, end: 180.8,
    text: "苹果希望用户会像对待其他钟爱的苹果产品一样，让这部手机融入日常。" }];
  const result = finalizeTranslatedCues(input, "zh-Hans");
  assert.deepEqual(result.map(cue => cue.text), [
    "苹果希望用户会像对待其他钟爱的苹果产品一样，", "让这部手机融入日常。"
  ]);
  assert.equal(length(result[0].text), 21);
  assert.equal(result[0].end, 173.4 + (180.8 - 173.4) * 21 / 30);
  verify(input, result);
});

test("Chinese allows natural punctuation at 21 through 24 characters without a video-specific dictionary", () => {
  for (let count = 21; count <= 24; count += 1) {
    const clause = "这".repeat(count - 4) + "非常合理";
    const input = [{ start: 0, end: 12, text: clause + "，接下来我们再看实际结果。" }];
    const result = finalizeTranslatedCues(input, "zh");
    assert.equal(result[0].text, clause + "，");
    assert.ok(result.every(cue => length(cue.text) <= 24));
    verify(input, result);
  }
});

test("Chinese keeps an unpunctuated 21 to 24 character phrase intact but still splits longer text", () => {
  for (let count = 21; count <= 24; count += 1) {
    const input = [{ start: 0, end: 6, text: "这".repeat(count) }];
    assert.equal(finalizeTranslatedCues(input, "zh").length, 1);
  }
  const input = [{ start: 0, end: 12, text: "这".repeat(25) + "，接下来继续。" }];
  const result = finalizeTranslatedCues(input, "zh");
  assert.ok(result.every(cue => length(cue.text) <= 24));
  verify(input, result);
});

test("Chinese keeps multiword English names with the following Chinese word", () => {
  for (const name of ["teenage engineering", "Teenage Engineering", "teenager engineering", "Subtle Gradient Design System"]) {
    const input = [{ start: 0, end: 16, text: `今天我们来到斯德哥尔摩参观${name}总部看看他们如何设计这些有趣的产品。` }];
    const result = finalizeTranslatedCues(input, "zh-Hans");
    assert.ok(result.some(cue => cue.text.includes(`${name}总部`)), name);
    verify(input, result);
  }
});

test("Chinese keeps English names and their linking particle plus noun together", () => {
  for (const tail of ["的办公室", "的总部"]) {
    const input = [{ start: 0, end: 16, text: `从那以后我就明白Teenage Engineering ${tail}里一定在发生着了不起的事情。` }];
    const result = finalizeTranslatedCues(input, "zh");
    assert.ok(result.some(cue => cue.text.includes(`Teenage Engineering ${tail}`)));
    verify(input, result);
  }
});

test("Chinese protects the actual guest and office examples from the Stockholm video", () => {
  for (const [text, protectedPhrase] of [
    ["本期我们会坐下来聊聊，嘉宾是 Teenage Engineering 创始人之一 David Eriksson，还有其他设计师。", "Teenage Engineering 创始人"],
    ["这张桌子是你走进 Teenage Engineering 办公室看到的第一样东西，上面摆着 TE 创立以来推出的全部产品。", "Teenage Engineering 办公室"]
  ]) {
    const input = [{ start: 129, end: 145, text, sourceIndexes: [22] }];
    const result = finalizeTranslatedCues(input, "zh");
    assert.ok(result.some(cue => cue.text.includes(protectedPhrase)));
    verify(input, result);
  }
});

test("Chinese punctuation after an English name remains a valid boundary", () => {
  const input = [{ start: 0, end: 12, text: "我们特别喜欢teenage engineering，这家公司的产品总是充满有趣的想法。" }];
  const result = finalizeTranslatedCues(input, "zh");
  assert.deepEqual(result.map(cue => cue.text), [
    "我们特别喜欢teenage engineering，", "这家公司的产品总是充满有趣的想法。"
  ]);
  verify(input, result);
});

test("English names preserve contractions and do not consume the following complete Chinese sentence", () => {
  const input = [{ start: 0, end: 12, text: "今天我们参观don't panic design工作室看看他们最新的产品。随后离开。" }];
  const result = finalizeTranslatedCues(input, "zh");
  assert.ok(result.some(cue => cue.text.includes("don't panic design工作室")));
  assert.equal(result.at(-1)?.text, "随后离开。");
  verify(input, result);
});
