export type TranslationStrategy = {
  id: string;
  version: string;
  languageCodes: string[];
  displayName: string;
  analysisGuidance: string[];
  translationGuidance: string[];
  fallbackNotes: string;
};

const defaultStrategy: TranslationStrategy = {
  id: "default",
  version: "2026-07-08.1",
  languageCodes: [],
  displayName: "Default natural subtitle strategy",
  analysisGuidance: [
    "Infer practical terminology and style choices for the requested target language.",
    "Prefer everyday phrasing that feels natural to native viewers of the target language."
  ],
  translationGuidance: [
    "Translate into fluent, natural target-language subtitles that are easy to read while watching.",
    "Avoid word-for-word source-language structure when it sounds unnatural in the target language.",
    "Keep each cue concise without dropping meaning-bearing details."
  ],
  fallbackNotes: "Used when no language-specific strategy is available."
};

export const translationStrategies: TranslationStrategy[] = [
  {
    id: "zh",
    version: "2026-07-08.1",
    languageCodes: ["zh", "zh-Hans", "zh-Hant", "zh-CN", "zh-TW", "zh-HK"],
    displayName: "Natural Chinese subtitle strategy",
    analysisGuidance: [
      "Prefer natural Mandarin that is easy to follow while watching.",
      "Glossary target values should use common Chinese viewer-facing wording, not dictionary-like phrasing."
    ],
    translationGuidance: [
      "Use natural spoken Mandarin for Chinese targets.",
      "Prefer common expressions like \"所以\", \"但\", \"还有\", \"这个/它\" over stiff wording like \"因此\", \"然而\", \"此外\", or \"该/其\" when meaning is unchanged.",
      "Avoid translated-sounding sentence structure; rewrite lightly so the subtitle sounds like something a Chinese speaker would actually say.",
      "Keep names, technical terms, examples, caveats, and contrasts accurate."
    ],
    fallbackNotes: "Also covers Traditional Chinese targets, while preserving the requested target script through the target language code."
  },
  {
    id: "ja",
    version: "2026-07-21.2",
    languageCodes: ["ja", "ja-JP"],
    displayName: "Natural Japanese subtitle strategy",
    analysisGuidance: [
      "Identify whether the speaker tone is casual, polite, expert, comedic, or explanatory so Japanese sentence endings stay consistent.",
      "Glossary targets should prefer natural Japanese terms that viewers would expect in subtitles."
    ],
    translationGuidance: [
      "Translate into natural Japanese subtitles, not literal source-language word order.",
      "Omit subjects or repeated references when Japanese naturally does so and meaning remains clear.",
      "Keep sentence endings and politeness level consistent with the speaker and video context.",
      "Avoid overusing long noun chains; use short spoken clauses that are easy to read at video speed.",
      "Never use the full-width comma ， in Japanese text. Use the Japanese comma 、 instead.",
      "Keep Japanese words and established terms intact within a cue. In particular, never split a katakana word such as スタイルガイド into partial strings.",
      "Keep file names and multiword Latin product names intact. Never split forms such as DESIGN.md, CLAUDE.md, Claude Design, or Subtle Gradient Design System across cues.",
      "Never place 、 immediately after an opening Japanese quote such as 「 or 『. Keep the quoted name with its opening quote.",
      "Do not split a Japanese attributive modifier from the noun it modifies. Keep forms such as 最適化されたスタイルガイド and この新しいチャット together."
    ],
    fallbackNotes: "Japanese-specific subtitle flow and politeness guidance."
  },
  {
    id: "ko",
    version: "2026-07-08.1",
    languageCodes: ["ko", "ko-KR"],
    displayName: "Natural Korean subtitle strategy",
    analysisGuidance: [
      "Identify the appropriate Korean register from the speaker, channel, and audience.",
      "Glossary targets should use Korean terms that feel common in conversation or media subtitles."
    ],
    translationGuidance: [
      "Translate into natural Korean subtitles with a consistent speech level.",
      "Avoid stiff literal structure and excessive Sino-Korean term stacking when a common Korean expression works better.",
      "Prefer compact spoken phrasing that viewers can read quickly.",
      "Preserve technical terms, proper nouns, numbers, examples, and speaker intent."
    ],
    fallbackNotes: "Korean-specific register and readability guidance."
  },
  {
    id: "th",
    version: "2026-07-08.1",
    languageCodes: ["th", "th-TH"],
    displayName: "Natural Thai subtitle strategy",
    analysisGuidance: [
      "Identify practical Thai terminology and the expected viewer tone from the metadata and transcript.",
      "Glossary targets should prefer natural Thai phrasing over direct source-language calques."
    ],
    translationGuidance: [
      "Translate into natural Thai subtitles that do not preserve English or source-language word order unnecessarily.",
      "Use short, readable clauses and avoid overloaded sentences.",
      "Keep tone conversational unless the speaker is intentionally formal.",
      "Preserve names, numbers, technical terms, examples, and caveats accurately."
    ],
    fallbackNotes: "Thai-specific word-order and subtitle readability guidance."
  },
  defaultStrategy
];

function normalizeLanguageCode(languageCode: string) {
  return languageCode.trim().toLowerCase().replace(/_/g, "-");
}

function languageFamily(languageCode: string) {
  return normalizeLanguageCode(languageCode).split("-")[0] || "";
}

export function getTranslationStrategy(targetLanguage: string): TranslationStrategy {
  const normalizedTarget = normalizeLanguageCode(targetLanguage);
  const exact = translationStrategies.find((strategy) => {
    return strategy.languageCodes.some((code) => normalizeLanguageCode(code) === normalizedTarget);
  });
  if (exact) return exact;

  const targetFamily = languageFamily(normalizedTarget);
  const family = translationStrategies.find((strategy) => {
    return strategy.languageCodes.some((code) => languageFamily(code) === targetFamily);
  });
  return family || defaultStrategy;
}
