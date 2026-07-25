import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";
process.env.REDIS_URL ||= "redis://localhost:6379";
process.env.JWT_SECRET ||= "placeholder-secret-at-least-24";
process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY ||= "test-google-key";

const { translateMachineCues } = await import("./machineTranslation.js");

test("machine translation stops before sending another Google batch", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  let translatedBatchCount = 0;

  globalThis.fetch = async (_input, init) => {
    requestCount += 1;
    const body = JSON.parse(String(init?.body || "{}")) as { q?: string[] };
    return new Response(JSON.stringify({
      data: {
        translations: (body.q || []).map((text) => ({ translatedText: `译文 ${text}` }))
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    await translateMachineCues({
      cues: Array.from({ length: 120 }, (_, index) => ({
        index,
        start: index,
        end: index + 1,
        text: `source ${index}`
      })),
      sourceLanguage: "en",
      targetLanguage: "zh-Hans",
      onBatch: async () => {
        translatedBatchCount += 1;
      },
      shouldContinue: async () => translatedBatchCount === 0
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestCount, 1);
  assert.equal(translatedBatchCount, 1);
});
