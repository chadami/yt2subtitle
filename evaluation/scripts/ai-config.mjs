export function evaluationAiConfig() {
  if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error("Set DEEPSEEK_API_KEY for evaluation");
  return { provider: "deepseek", apiKey: process.env.DEEPSEEK_API_KEY.trim(),
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    baseUrl: process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com" };
}
