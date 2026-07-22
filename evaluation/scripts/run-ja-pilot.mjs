import fs from "node:fs/promises";
import path from "node:path";
import {
  analyzeSubtitleContext,
  systemAiConfig,
  translateChunk
} from "../../backend/dist/ai.js";
import {
  chunkCues,
  finalizeTranslatedCues,
  prepareSourceCues,
  toVtt
} from "../../backend/dist/subtitles.js";
import { getTranslationStrategy } from "../../backend/dist/translationStrategies.js";

const sourceRoot = path.resolve(process.argv[2] || "evaluation/runs/2026-07-22-ja-pilot-001/source");
const outputRoot = path.resolve(process.argv[3] || "evaluation/runs/2026-07-22-ja-pilot-001/output");
const maxSeconds = Number(process.env.EVAL_MAX_VIDEO_SECONDS || 900);
const chunkCharacters = Number(process.env.EVAL_CHUNK_CHARACTERS || 2400);
const force = process.argv.includes("--force");
const targetLanguage = "ja-JP";

async function findFiles(directory, fileName) {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await findFiles(fullPath, fileName));
    else if (entry.name === fileName) output.push(fullPath);
  }
  return output.sort();
}

function rawCuesFromTranscript(snippets) {
  return snippets
    .map((snippet) => ({
      start: Number(snippet.start),
      end: Math.min(maxSeconds, Number(snippet.start) + Number(snippet.duration)),
      text: String(snippet.text || "").replace(/\s+/g, " ").trim()
    }))
    .filter((cue) => cue.text && cue.start < maxSeconds && cue.end > cue.start);
}

function sourceTextForCue(cue, cleanCues) {
  const indexes = new Set(cue.sourceIndexes || []);
  return cleanCues
    .filter((sourceCue) => indexes.has(sourceCue.index))
    .map((sourceCue) => sourceCue.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function attachSourceText(cues, cleanCues) {
  return cues.map((cue) => ({
    ...cue,
    sourceText: cue.sourceText || sourceTextForCue(cue, cleanCues)
  }));
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function evaluateDeterministic(cues) {
  const text = cues.map((cue) => cue.text).join("\n");
  const durations = cues.map((cue) => cue.end - cue.start);
  const rates = cues.map((cue) => Array.from(cue.text).length / Math.max(0.001, cue.end - cue.start));
  const adjacentPairs = cues.slice(1).map((cue, index) => [cues[index], cue]);
  return {
    cueCount: cues.length,
    fullwidthComma: countMatches(text, /，/gu),
    openingQuoteComma: countMatches(text, /[「『]、/gu),
    leadingPunctuation: cues.filter((cue) => /^[、。！？]/u.test(cue.text)).length,
    doubleJapaneseComma: countMatches(text, /、、/gu),
    detachedAttributiveModifier: countMatches(text, /(?:された|この新しい|その新しい|あの新しい)、/gu),
    splitFileExtension: adjacentPairs.filter(([first, second]) => (
      /[A-Za-z0-9_-]+\.$/u.test(first.text)
      && /^(?:md|html?|css|jsx?|tsx?|json|ya?ml|txt|pdf|pptx?|docx?)(?=[^A-Za-z]|$)/iu.test(second.text)
    )).length,
    splitLatinName: adjacentPairs.filter(([first, second]) => (
      /[A-Za-z][A-Za-z0-9'’-]*、$/u.test(first.text)
      && /^[A-Z][A-Za-z0-9'’-]*/u.test(second.text)
    )).length,
    possibleSplitKatakana: adjacentPairs.filter(([first, second]) => (
      /[\u30a0-\u30ff\u31f0-\u31ff\uff66-\uff9f]$/u.test(first.text)
      && /^[\u30a0-\u30ff\u31f0-\u31ff\uff66-\uff9f]/u.test(second.text)
    )).length,
    unbalancedJapaneseQuotes: Math.abs(countMatches(text, /「/gu) - countMatches(text, /」/gu))
      + Math.abs(countMatches(text, /『/gu) - countMatches(text, /』/gu)),
    overlaps: cues.slice(1).filter((cue, index) => cue.start < cues[index].end - 0.001).length,
    underOneSecond: durations.filter((duration) => duration < 1).length,
    overSixSeconds: durations.filter((duration) => duration > 6).length,
    overFortyTwoCharacters: cues.filter((cue) => Array.from(cue.text).length > 42).length,
    overEighteenCharactersPerSecond: rates.filter((rate) => rate > 18.05).length,
    maxCharactersPerSecond: rates.length ? Number(Math.max(...rates).toFixed(2)) : 0,
    maxCharacters: cues.length ? Math.max(...cues.map((cue) => Array.from(cue.text).length)) : 0,
    maxDuration: durations.length ? Number(Math.max(...durations).toFixed(3)) : 0
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withRetries(label, operation) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      console.error(`${label} failed (attempt ${attempt}/3):`, error instanceof Error ? error.message : error);
      await sleep(attempt * 2_000);
    }
  }
  throw lastError;
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function reportMarkdown(results, strategy, aiConfig) {
  const totals = results.reduce((summary, result) => {
    for (const [key, value] of Object.entries(result.metrics)) {
      if (typeof value === "number" && !key.startsWith("max")) summary[key] = (summary[key] || 0) + value;
    }
    return summary;
  }, {});
  const lines = [
    "# Japanese subtitle pilot report",
    "",
    `- Videos: ${results.length}`,
    `- Target: ${targetLanguage}`,
    `- Provider/model: ${aiConfig.provider} / ${aiConfig.model}`,
    `- Strategy: ${strategy.id} / ${strategy.version}`,
    `- Per-video cap: ${maxSeconds}s`,
    `- Translation chunk size: ${chunkCharacters} chars`,
    "",
    "| Video | Source | Minutes | Cues | >18 cps | >42 chars | Hard issues |",
    "|---|---|---:|---:|---:|---:|---:|"
  ];
  for (const result of results) {
    const hardIssues = result.metrics.fullwidthComma
      + result.metrics.openingQuoteComma
      + result.metrics.leadingPunctuation
      + result.metrics.doubleJapaneseComma
      + result.metrics.detachedAttributiveModifier
      + result.metrics.splitFileExtension
      + result.metrics.splitLatinName
      + result.metrics.possibleSplitKatakana
      + result.metrics.unbalancedJapaneseQuotes
      + result.metrics.overlaps;
    lines.push(`| ${result.title.replace(/\|/g, "\\|")} | ${result.captionType} | ${(result.evaluatedSeconds / 60).toFixed(1)} | ${result.metrics.cueCount} | ${result.metrics.overEighteenCharactersPerSecond} | ${result.metrics.overFortyTwoCharacters} | ${hardIssues} |`);
  }
  lines.push(
    "",
    "## Aggregate deterministic findings",
    "",
    "```json",
    JSON.stringify(totals, null, 2),
    "```",
    ""
  );
  return lines.join("\n");
}

const metaFiles = await findFiles(sourceRoot, "meta.json");
if (!metaFiles.length) throw new Error(`No meta.json files found under ${sourceRoot}`);
await fs.mkdir(outputRoot, { recursive: true });

const aiConfig = systemAiConfig();
const strategy = getTranslationStrategy(targetLanguage);
const results = [];

for (const [videoIndex, metaPath] of metaFiles.entries()) {
  const directory = path.dirname(metaPath);
  const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
  const videoId = String(meta.videoId);
  const videoOutput = path.join(outputRoot, videoId);
  const resultPath = path.join(videoOutput, "result.json");
  await fs.mkdir(videoOutput, { recursive: true });

  if (!force) {
    try {
      const existing = JSON.parse(await fs.readFile(resultPath, "utf8"));
      console.log(`[${videoIndex + 1}/${metaFiles.length}] Reusing ${videoId}: ${meta.title}`);
      results.push(existing);
      continue;
    } catch {
      // No completed result; continue from source.
    }
  }

  console.log(`[${videoIndex + 1}/${metaFiles.length}] Translating ${videoId}: ${meta.title}`);
  const snippets = JSON.parse(await fs.readFile(path.join(directory, "transcript-raw.json"), "utf8"));
  const rawCues = rawCuesFromTranscript(snippets);
  const captionType = meta.language?.isGenerated ? "auto" : "manual";
  const cleanCues = prepareSourceCues(rawCues, captionType);
  const videoContext = {
    title: String(meta.title || ""),
    channel: String(meta.channel || ""),
    description: String(meta.description || "")
  };
  const translationContext = await withRetries(`${videoId} context`, () => analyzeSubtitleContext({
    aiConfig,
    videoContext,
    cues: cleanCues,
    sourceLanguage: "en",
    targetLanguage
  }));

  const chunks = chunkCues(cleanCues, chunkCharacters);
  const translated = [];
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    console.log(`  chunk ${chunkIndex + 1}/${chunks.length}`);
    const translatedChunk = await withRetries(`${videoId} chunk ${chunkIndex + 1}`, () => translateChunk({
      aiConfig,
      videoContext,
      translationContext,
      previousContext: chunkIndex > 0 ? chunks[chunkIndex - 1].slice(-8) : [],
      rawCues: chunk,
      nextContext: chunkIndex < chunks.length - 1 ? chunks[chunkIndex + 1].slice(0, 8) : [],
      targetLanguage
    }));
    translated.push(...attachSourceText(translatedChunk, cleanCues));
  }

  const finalized = finalizeTranslatedCues(translated, targetLanguage);
  const metrics = evaluateDeterministic(finalized);
  const evaluatedSeconds = Math.min(Number(meta.duration || maxSeconds), maxSeconds);
  const result = {
    videoId,
    url: meta.url,
    title: meta.title,
    channel: meta.channel,
    captionType,
    sourceLanguage: meta.language?.code || "en",
    targetLanguage,
    provider: aiConfig.provider,
    model: aiConfig.model,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    evaluatedSeconds,
    sourceCueCount: cleanCues.length,
    translatedCueCount: finalized.length,
    metrics
  };

  await writeJson(path.join(videoOutput, "source.cues.json"), cleanCues);
  await writeJson(path.join(videoOutput, "translation-context.json"), translationContext);
  await writeJson(path.join(videoOutput, "translated.cues.json"), finalized);
  await fs.writeFile(path.join(videoOutput, `${videoId}.ja.vtt`), toVtt(finalized), "utf8");
  await writeJson(resultPath, result);
  results.push(result);
}

const manifest = {
  createdAt: new Date().toISOString(),
  sourceRoot,
  outputRoot,
  maxSeconds,
  chunkCharacters,
  targetLanguage,
  provider: aiConfig.provider,
  model: aiConfig.model,
  strategyId: strategy.id,
  strategyVersion: strategy.version,
  videos: results
};
await writeJson(path.join(outputRoot, "manifest.json"), manifest);
await fs.writeFile(path.join(outputRoot, "report.md"), reportMarkdown(results, strategy, aiConfig), "utf8");
console.log(`Completed ${results.length} videos.`);
console.log(path.join(outputRoot, "report.md"));
