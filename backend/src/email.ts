import { env } from "./env.js";

export async function sendLoginCode(email: string, code: string) {
  if (env.EMAIL_PROVIDER === "local") {
    console.log(`[login-code] ${email}: ${code}`);
    return;
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  }

  const safeCode = escapeHtml(code);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: email,
      subject: "Sign in to YouTube AI Subtitle",
      html: `
        <p>Your sign-in code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px">${safeCode}</p>
        <p>This code expires in 10 minutes.</p>
      `
    })
  });

  if (!response.ok) {
    throw new Error(`Email provider failed: ${response.status}`);
  }
}

export async function sendSubtitleReadyEmail(email: string, input: { title: string; url: string }) {
  if (env.EMAIL_PROVIDER === "local") {
    console.log(`[subtitle-ready] ${email}: ${input.title} ${input.url}`);
    return;
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  }

  const safeTitle = escapeHtml(input.title || "Your YouTube video");
  const safeUrl = escapeHtml(input.url);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: email,
      subject: `AI subtitles ready: ${input.title || "YouTube video"}`,
      html: `
        <p>Your AI-translated subtitles are ready.</p>
        <p><strong>${safeTitle}</strong></p>
        <p><a href="${safeUrl}">Open video</a></p>
      `
    })
  });

  if (!response.ok) {
    throw new Error(`Email provider failed: ${response.status}`);
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
