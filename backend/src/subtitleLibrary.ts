import crypto from "node:crypto";
import { db, query } from "./db.js";
import { getUserEntitlement } from "./entitlements.js";
import type { RawCue, TranslatedCue } from "./subtitles.js";

export const PIPELINE_VERSION = "public-library-v1";
export const PUBLIC_STYLE_ID = "accurate";

export function hashRawCues(rawCues: RawCue[]) {
  const stableCues = rawCues.map((cue) => ({
    start: Number(cue.start.toFixed(3)),
    end: Number(cue.end.toFixed(3)),
    text: cue.text.trim()
  }));
  return crypto.createHash("sha256").update(JSON.stringify(stableCues)).digest("hex");
}

export function createGenerationKey(input: {
  captionSourceId: string;
  targetLang: string;
  styleId: string;
  strategyId: string;
  strategyVersion: string;
  provider: string;
  model: string;
}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    ...input,
    pipelineVersion: PIPELINE_VERSION
  })).digest("hex");
}

export function hashTranslatedCues(cues: Array<Pick<TranslatedCue, "start" | "end" | "text">>) {
  return crypto.createHash("sha256").update(JSON.stringify(cues.map((cue) => ({
    start: Number(cue.start.toFixed(3)),
    end: Number(cue.end.toFixed(3)),
    text: cue.text.trim()
  })))).digest("hex");
}

function targetLanguageScore(cues: TranslatedCue[], targetLang: string) {
  const text = cues.map((cue) => cue.text).join("");
  const letters = text.match(/[\p{L}\p{N}]/gu) || [];
  if (!letters.length) return 0;
  const normalized = targetLang.toLowerCase();
  let targetCharacters = 0;
  if (normalized.startsWith("zh")) targetCharacters = (text.match(/\p{Script=Han}/gu) || []).length;
  else if (normalized.startsWith("ja")) targetCharacters = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
  else if (normalized.startsWith("ko")) targetCharacters = (text.match(/[\p{Script=Hangul}\p{Script=Han}]/gu) || []).length;
  else return 20;
  return Math.min(20, Math.round((targetCharacters / letters.length) * 40));
}

export function assessSubtitleQuality(
  sourceCues: Array<RawCue & { index: number }>,
  translatedCues: TranslatedCue[],
  targetLang: string
) {
  const expected = new Set(sourceCues.map((cue) => cue.index));
  const covered = new Set(translatedCues.flatMap((cue) => cue.sourceIndexes || []).filter((index) => expected.has(index)));
  const coverageRatio = expected.size ? covered.size / expected.size : 0;
  const coverageScore = Math.round(coverageRatio * 40);
  const timingValid = translatedCues.length > 0 && translatedCues.every((cue, index) => (
    Number.isFinite(cue.start)
    && Number.isFinite(cue.end)
    && cue.start >= 0
    && cue.end > cue.start
    && (index === 0 || cue.start >= translatedCues[index - 1].start)
  ));
  const timingScore = timingValid ? 20 : 0;
  const languageScore = targetLanguageScore(translatedCues, targetLang);
  const hasEmpty = translatedCues.some((cue) => !cue.text.trim());
  let longestRepeat = 1;
  let repeatRun = 1;
  for (let index = 1; index < translatedCues.length; index += 1) {
    repeatRun = translatedCues[index].text.trim() === translatedCues[index - 1].text.trim() ? repeatRun + 1 : 1;
    longestRepeat = Math.max(longestRepeat, repeatRun);
  }
  const sourceLength = sourceCues.reduce((sum, cue) => sum + cue.text.length, 0);
  const translatedLength = translatedCues.reduce((sum, cue) => sum + cue.text.length, 0);
  const lengthRatio = sourceLength ? translatedLength / sourceLength : 0;
  const structureScore = !hasEmpty && longestRepeat <= 3 && lengthRatio >= 0.15 && lengthRatio <= 4 ? 10 : 0;
  let checkedNumbers = 0;
  let preservedNumbers = 0;
  for (const cue of translatedCues) {
    const sourceNumbers = (cue.sourceText || "").match(/\d+(?:[.,]\d+)*/g) || [];
    for (const number of sourceNumbers) {
      checkedNumbers += 1;
      if (cue.text.includes(number)) preservedNumbers += 1;
    }
  }
  const numberScore = checkedNumbers ? Math.round((preservedNumbers / checkedNumbers) * 10) : 10;
  const score = coverageScore + timingScore + languageScore + structureScore + numberScore;
  const hardPass = coverageRatio === 1 && timingValid && !hasEmpty && longestRepeat <= 3 && languageScore >= 16;
  return {
    score,
    hardPass,
    metrics: {
      coverageRatio,
      timingValid,
      languageScore,
      longestRepeat,
      lengthRatio,
      checkedNumbers,
      preservedNumbers,
      coverageScore,
      timingScore,
      structureScore,
      numberScore
    }
  };
}

export async function promotePublicSubtitle(input: {
  subtitleId: string;
  userId: string;
  captionSourceId: string;
  targetLang: string;
  styleId: string;
  qualityScore: number;
}) {
  const entitlement = await getUserEntitlement(input.userId);
  if (!entitlement.canContribute || input.styleId !== PUBLIC_STYLE_ID || input.qualityScore < 90) {
    await query(
      "update translated_subtitles set publication_status = 'private' where id = $1",
      [input.subtitleId]
    );
    return "private" as const;
  }

  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `${input.captionSourceId}:${input.targetLang}:${input.styleId}`
    ]);
    const current = await client.query<{ recommended_subtitle_id: string; quality_score: number | null }>(
      `select s.recommended_subtitle_id, t.quality_score
       from public_subtitle_selections s
       join translated_subtitles t on t.id = s.recommended_subtitle_id
       where s.caption_source_id = $1 and s.target_lang = $2 and s.style_id = $3`,
      [input.captionSourceId, input.targetLang, input.styleId]
    );
    const existing = current.rows[0];
    const shouldPromote = !existing || input.qualityScore >= Number(existing.quality_score || 0) + 5;
    if (shouldPromote) {
      if (existing) {
        await client.query(
          "update translated_subtitles set publication_status = 'archived', updated_at = now() where id = $1",
          [existing.recommended_subtitle_id]
        );
      }
      await client.query(
        "update translated_subtitles set publication_status = 'recommended', updated_at = now() where id = $1",
        [input.subtitleId]
      );
      await client.query(
        `insert into public_subtitle_selections (
           caption_source_id, target_lang, style_id, recommended_subtitle_id, previous_subtitle_id
         ) values ($1, $2, $3, $4, $5)
         on conflict (caption_source_id, target_lang, style_id)
         do update set previous_subtitle_id = public_subtitle_selections.recommended_subtitle_id,
           recommended_subtitle_id = excluded.recommended_subtitle_id, updated_at = now()`,
        [input.captionSourceId, input.targetLang, input.styleId, input.subtitleId, existing?.recommended_subtitle_id || null]
      );
      await client.query(
        `delete from translated_subtitles
         where caption_source_id = $1 and target_lang = $2 and style_id = $3
           and publication_status = 'archived' and id <> $4`,
        [input.captionSourceId, input.targetLang, input.styleId, existing?.recommended_subtitle_id || input.subtitleId]
      );
    }
    await client.query("commit");
    return shouldPromote ? "recommended" as const : "candidate" as const;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function cleanupSubtitleArtifacts() {
  await query("delete from translation_job_chunks where updated_at < now() - interval '7 days'");
  await query("delete from translation_job_machine_chunks where updated_at < now() - interval '7 days'");
  await query(
    `delete from translated_subtitles
     where publication_status = 'candidate'
       and created_at < now() - interval '30 days'
       and id not in (
         select id from (
           select id, row_number() over (
             partition by caption_source_id, target_lang, style_id
             order by quality_score desc nulls last, created_at desc
           ) as rank
           from translated_subtitles where publication_status = 'candidate'
         ) ranked where rank <= 2
       )`
  );
}
