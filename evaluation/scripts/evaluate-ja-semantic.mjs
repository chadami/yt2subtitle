import { evaluationAiConfig } from "./ai-config.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const outputRoot = path.resolve(process.argv[2] || "evaluation/runs/2026-07-22-ja-pilot-001/output");
const batchSize = Number(process.env.EVAL_JUDGE_BATCH_CUES || 60);
const force = process.argv.includes("--force");
const aiConfig = evaluationAiConfig();
const apiBase = String(process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com").replace(/\/$/, "");

const categories = [
  "accuracy",
  "omission_or_addition",
  "japanese_naturalness",
  "terminology_consistency",
  "segmentation",
  "punctuation",
  "readability"
];

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function judgeBatch(video, cues, batchIndex) {
  const payload = cues.map((cue) => ({
    cue_index: cue.cueIndex,
    start: Number(cue.start.toFixed(3)),
    end: Number(cue.end.toFixed(3)),
    source: cue.sourceText || "",
    translation: cue.text
  }));
  const system = `You are a strict bilingual English-to-Japanese subtitle quality reviewer.
Evaluate clear, actionable translation problems only. Do not flag harmless stylistic preferences.
Use adjacent cues for context. Pay special attention to meaning, negation, numbers, named entities, natural spoken Japanese, terminology consistency, broken grammatical units, punctuation, and reading speed.
The source may be an imperfect YouTube transcript, so do not penalize the translation for obvious source ASR noise unless the translation makes it worse.
Return strict JSON only with this shape:
{"issues":[{"cue_index":1,"category":"accuracy","severity":"high","source":"...","translation":"...","reason_zh":"concise Chinese explanation","suggested_translation":"better Japanese"}]}
Allowed categories: ${categories.join(", ")}.
Severity high means wrong meaning or seriously misleading; medium means clearly unnatural, inconsistent, or difficult to read; low means minor but objective.
Return at most 8 highest-value issues from this batch. Return {"issues":[]} when there is no clear issue.`;

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${aiConfig.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify({ video, cues: payload }) }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
          thinking: { type: "disabled" }
        }),
        signal: AbortSignal.timeout(120_000)
      });
      if (!response.ok) throw new Error(`DeepSeek judge failed: ${response.status}`);
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
      return issues
        .filter((issue) => issue && typeof issue === "object" && Number.isInteger(Number(issue.cue_index)))
        .map((issue) => ({
          videoId: video.videoId,
          title: video.title,
          batchIndex,
          cueIndex: Number(issue.cue_index),
          category: categories.includes(String(issue.category)) ? String(issue.category) : "japanese_naturalness",
          severity: ["high", "medium", "low"].includes(String(issue.severity)) ? String(issue.severity) : "medium",
          source: String(issue.source || ""),
          translation: String(issue.translation || ""),
          reasonZh: String(issue.reason_zh || ""),
          suggestedTranslation: String(issue.suggested_translation || "")
        }));
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      console.error(`${video.videoId} judge batch ${batchIndex + 1} failed (${attempt}/3):`, error instanceof Error ? error.message : error);
      await sleep(attempt * 2_000);
    }
  }
  throw lastError;
}

function markdown(issues, videos) {
  const counts = {};
  for (const issue of issues) {
    const key = `${issue.category}:${issue.severity}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  const lines = [
    "# DeepSeek semantic review",
    "",
    `- Videos: ${videos.length}`,
    `- Reviewed issues: ${issues.length}`,
    `- Judge: ${aiConfig.provider} / ${aiConfig.model}`,
    "- Note: model-assisted findings require aggregation or human confirmation before changing production strategy.",
    "",
    "## Counts",
    "",
    "```json",
    JSON.stringify(counts, null, 2),
    "```",
    "",
    "## Evidence",
    ""
  ];
  for (const issue of issues.sort((a, b) => {
    const weight = { high: 0, medium: 1, low: 2 };
    return weight[a.severity] - weight[b.severity] || a.videoId.localeCompare(b.videoId) || a.cueIndex - b.cueIndex;
  })) {
    lines.push(
      `### ${issue.severity.toUpperCase()} · ${issue.category} · ${issue.videoId} cue ${issue.cueIndex}`,
      "",
      `- Source: ${issue.source}`,
      `- Translation: ${issue.translation}`,
      `- Reason: ${issue.reasonZh}`,
      `- Suggested: ${issue.suggestedTranslation}`,
      ""
    );
  }
  return lines.join("\n");
}

const entries = await fs.readdir(outputRoot, { withFileTypes: true });
const videos = [];
const allIssues = [];
for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const videoDirectory = path.join(outputRoot, entry.name);
  const result = JSON.parse(await fs.readFile(path.join(videoDirectory, "result.json"), "utf8"));
  const cues = JSON.parse(await fs.readFile(path.join(videoDirectory, "translated.cues.json"), "utf8"))
    .map((cue, cueIndex) => ({ ...cue, cueIndex }));
  const semanticPath = path.join(videoDirectory, "semantic-issues.json");
  videos.push({ videoId: result.videoId, title: result.title });

  if (!force) {
    try {
      const existing = JSON.parse(await fs.readFile(semanticPath, "utf8"));
      console.log(`Reusing semantic review: ${result.videoId}`);
      allIssues.push(...existing);
      continue;
    } catch {
      // No completed semantic review.
    }
  }

  console.log(`Reviewing ${result.videoId}: ${result.title}`);
  const videoIssues = [];
  for (let offset = 0; offset < cues.length; offset += batchSize) {
    const batch = cues.slice(offset, offset + batchSize);
    console.log(`  batch ${Math.floor(offset / batchSize) + 1}/${Math.ceil(cues.length / batchSize)}`);
    videoIssues.push(...await judgeBatch({
      videoId: result.videoId,
      title: result.title,
      channel: result.channel,
      captionType: result.captionType
    }, batch, Math.floor(offset / batchSize)));
  }
  await fs.writeFile(semanticPath, `${JSON.stringify(videoIssues, null, 2)}\n`, "utf8");
  allIssues.push(...videoIssues);
}

await fs.writeFile(path.join(outputRoot, "semantic-issues.json"), `${JSON.stringify(allIssues, null, 2)}\n`, "utf8");
await fs.writeFile(path.join(outputRoot, "semantic-report.md"), markdown(allIssues, videos), "utf8");
console.log(`Semantic review completed: ${allIssues.length} issues.`);
console.log(path.join(outputRoot, "semantic-report.md"));
