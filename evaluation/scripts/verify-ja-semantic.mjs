import { evaluationAiConfig } from "./ai-config.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const outputRoot = path.resolve(process.argv[2] || "evaluation/runs/2026-07-22-ja-pilot-001/output");
const force = process.argv.includes("--force");
const outputPath = path.join(outputRoot, "verified-semantic-issues.json");
const aiConfig = evaluationAiConfig();
const apiBase = String(process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com").replace(/\/$/, "");

function normalized(text) {
  return String(text || "").replace(/\s+/g, "").replace(/[。、！？,.!?]/g, "").toLowerCase();
}

function obviouslyInvalid(issue) {
  if (normalized(issue.translation) === normalized(issue.suggestedTranslation)) return "suggestion_matches_translation";
  if (/(?:无问题|無問題|翻译正确|译文正确|訳文は正しい|与原文一致|不确定|需确认|可接受)/u.test(issue.reasonZh)) return "review_admits_no_clear_error";
  return "";
}

function verifierAdmitsInvalid(decision) {
  const reason = String(decision?.reason_zh || "");
  return /(?:候选(?:问题|项)?(?:无效|不成立)|candidate\s+(?:is\s+)?invalid|翻译(?:是|为)?正确|译文(?:是|为)?正确|訳文は正しい|建议反而错误|提案の方が誤り)/iu.test(reason);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function verifyBatch(candidates) {
  const system = `You are an adversarial verifier for English-to-Japanese subtitle QA findings.
Many candidate findings are false positives. Validate each candidate against the video metadata and adjacent source/translation context.
Important rules:
- Trust clear video-title/entity context over obvious source ASR homophones, e.g. a video titled Claude Design may transcribe Claude as cloud.
- A cue may be a grammatical fragment continued by adjacent cues; do not call it omission merely because one cue is incomplete.
- If the proposed translation is effectively identical to the current translation, reject the candidate.
- Reject opinions that are only stylistic preference or whose own reason says the translation is correct/acceptable/uncertain.
- Keep a candidate only when there is a concrete mistranslation, omission/addition, unnatural Japanese, inconsistent terminology, broken segmentation/punctuation, or objectively difficult readability.
Return strict JSON only:
{"results":[{"candidate_id":1,"valid":true,"confidence":0.9,"category":"accuracy","severity":"high","reason_zh":"why it is truly valid or invalid"}]}
Return exactly one result for every candidate_id.`;
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
            { role: "user", content: JSON.stringify({ candidates }) }
          ],
          temperature: 0,
          response_format: { type: "json_object" },
          thinking: { type: "disabled" }
        }),
        signal: AbortSignal.timeout(120_000)
      });
      if (!response.ok) throw new Error(`DeepSeek verifier failed: ${response.status}`);
      const data = await response.json();
      const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
      return Array.isArray(parsed.results) ? parsed.results : [];
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      await sleep(attempt * 2_000);
    }
  }
  throw lastError;
}

function markdown(verified, rejectedCount) {
  const byCategory = {};
  const byVideo = {};
  for (const issue of verified) {
    byCategory[issue.verifiedCategory] = (byCategory[issue.verifiedCategory] || 0) + 1;
    byVideo[issue.videoId] = (byVideo[issue.videoId] || 0) + 1;
  }
  const lines = [
    "# Verified Japanese semantic findings",
    "",
    `- Accepted: ${verified.length}`,
    `- Rejected or low-confidence: ${rejectedCount}`,
    `- Verifier: ${aiConfig.provider} / ${aiConfig.model}`,
    "",
    "## Accepted counts by category",
    "",
    "```json",
    JSON.stringify(byCategory, null, 2),
    "```",
    "",
    "## Accepted counts by video",
    "",
    "```json",
    JSON.stringify(byVideo, null, 2),
    "```",
    "",
    "## Evidence",
    ""
  ];
  for (const issue of verified.sort((a, b) => b.confidence - a.confidence || a.videoId.localeCompare(b.videoId) || a.cueIndex - b.cueIndex)) {
    lines.push(
      `### ${issue.verifiedSeverity.toUpperCase()} · ${issue.verifiedCategory} · ${issue.videoId} cue ${issue.cueIndex} · ${(issue.confidence * 100).toFixed(0)}%`,
      "",
      `- Source: ${issue.source}`,
      `- Translation: ${issue.translation}`,
      `- Initial reason: ${issue.reasonZh}`,
      `- Verification: ${issue.verificationReasonZh}`,
      `- Suggested: ${issue.suggestedTranslation}`,
      ""
    );
  }
  return lines.join("\n");
}

if (!force) {
  try {
    await fs.access(outputPath);
    console.log(`Reusing ${outputPath}`);
    process.exit(0);
  } catch {
    // Continue.
  }
}

const candidates = JSON.parse(await fs.readFile(path.join(outputRoot, "semantic-issues.json"), "utf8"));
const videos = new Map();
for (const entry of await fs.readdir(outputRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(outputRoot, entry.name);
  const result = JSON.parse(await fs.readFile(path.join(directory, "result.json"), "utf8"));
  const cues = JSON.parse(await fs.readFile(path.join(directory, "translated.cues.json"), "utf8"));
  videos.set(result.videoId, { result, cues });
}

const rejected = [];
const toVerify = [];
for (const [candidateId, issue] of candidates.entries()) {
  const invalidReason = obviouslyInvalid(issue);
  if (invalidReason) {
    rejected.push({ ...issue, candidateId, rejectedBy: invalidReason });
    continue;
  }
  const video = videos.get(issue.videoId);
  const start = Math.max(0, issue.cueIndex - 2);
  const context = video.cues.slice(start, issue.cueIndex + 3).map((cue, offset) => ({
    cue_index: start + offset,
    source: cue.sourceText || "",
    translation: cue.text
  }));
  toVerify.push({
    candidate_id: candidateId,
    video: {
      videoId: video.result.videoId,
      title: video.result.title,
      channel: video.result.channel,
      captionType: video.result.captionType
    },
    candidate: issue,
    adjacent_context: context
  });
}

const decisions = [];
for (let offset = 0; offset < toVerify.length; offset += 20) {
  console.log(`Verifying batch ${Math.floor(offset / 20) + 1}/${Math.ceil(toVerify.length / 20)}`);
  decisions.push(...await verifyBatch(toVerify.slice(offset, offset + 20)));
}
const byId = new Map(decisions.map((decision) => [Number(decision.candidate_id), decision]));
const verified = [];
for (const [candidateId, issue] of candidates.entries()) {
  if (rejected.some((item) => item.candidateId === candidateId)) continue;
  const decision = byId.get(candidateId);
  const confidence = Number(decision?.confidence || 0);
  if (!decision?.valid || confidence < 0.75 || verifierAdmitsInvalid(decision)) {
    rejected.push({ ...issue, candidateId, rejectedBy: "verifier", decision });
    continue;
  }
  verified.push({
    ...issue,
    candidateId,
    confidence,
    verifiedCategory: String(decision.category || issue.category),
    verifiedSeverity: ["high", "medium", "low"].includes(String(decision.severity)) ? String(decision.severity) : issue.severity,
    verificationReasonZh: String(decision.reason_zh || "")
  });
}

await fs.writeFile(outputPath, `${JSON.stringify(verified, null, 2)}\n`, "utf8");
await fs.writeFile(path.join(outputRoot, "rejected-semantic-issues.json"), `${JSON.stringify(rejected, null, 2)}\n`, "utf8");
await fs.writeFile(path.join(outputRoot, "verified-semantic-report.md"), markdown(verified, rejected.length), "utf8");
console.log(`Verified ${verified.length}; rejected ${rejected.length}.`);
console.log(path.join(outputRoot, "verified-semantic-report.md"));
