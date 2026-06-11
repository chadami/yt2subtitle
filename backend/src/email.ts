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
      text: `Your YouTube AI Subtitle sign-in code is ${code}. It expires in 10 minutes.`,
      html: renderEmailShell({
        eyebrow: "YouTube AI Subtitle",
        title: "Sign in with this code",
        body: `
          <p style="${styles.paragraph}">Paste this one-time code into the extension settings page to finish signing in.</p>
          <div style="${styles.codeBox}" aria-label="Sign-in code">${safeCode}</div>
          <p style="${styles.muted}">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
        `
      })
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
  const subjectTitle = input.title || "YouTube video";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: email,
      subject: `AI subtitles ready: ${subjectTitle}`,
      text: `Your AI-translated subtitles are ready: ${subjectTitle}\n${input.url}`,
      html: renderEmailShell({
        eyebrow: "Completed",
        title: "Your subtitles are ready",
        body: `
          <p style="${styles.paragraph}">The AI-translated subtitles for this video have finished processing.</p>
          <div style="${styles.videoCard}">
            <div style="${styles.cardLabel}">Video</div>
            <div style="${styles.videoTitle}">${safeTitle}</div>
          </div>
          <p style="${styles.buttonRow}">
            <a href="${safeUrl}" style="${styles.button}">Open video</a>
          </p>
          <p style="${styles.muted}">You can also find this item in the extension history after signing in.</p>
        `
      })
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

function renderEmailShell(input: { eyebrow: string; title: string; body: string }) {
  return `
    <div style="${styles.page}">
      <div style="${styles.container}">
        <div style="${styles.logoRow}">
          <div style="${styles.logo}">YT</div>
          <div style="${styles.brand}">YouTube AI Subtitle</div>
        </div>
        <div style="${styles.panel}">
          <div style="${styles.eyebrow}">${escapeHtml(input.eyebrow)}</div>
          <h1 style="${styles.title}">${escapeHtml(input.title)}</h1>
          ${input.body}
        </div>
        <p style="${styles.footer}">Sent by YouTube AI Subtitle</p>
      </div>
    </div>
  `;
}

const styles = {
  page: "margin:0;padding:32px 16px;background:#f7f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2f3437;",
  container: "max-width:560px;margin:0 auto;",
  logoRow: "display:flex;align-items:center;margin:0 0 18px;",
  logo: "width:32px;height:32px;border-radius:7px;background:#2f3437;color:#fff;font-size:12px;font-weight:700;line-height:32px;text-align:center;margin-right:10px;",
  brand: "font-size:14px;font-weight:600;color:#2f3437;",
  panel: "background:#ffffff;border:1px solid #e6e4df;border-radius:10px;padding:28px;box-shadow:0 1px 2px rgba(15,15,15,0.03);",
  eyebrow: "font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#787774;margin:0 0 10px;",
  title: "font-size:24px;line-height:1.25;font-weight:700;color:#2f3437;margin:0 0 18px;",
  paragraph: "font-size:15px;line-height:1.6;color:#37352f;margin:0 0 18px;",
  codeBox: "background:#f7f6f3;border:1px solid #e6e4df;border-radius:8px;color:#2f3437;font-size:34px;font-weight:700;letter-spacing:6px;text-align:center;padding:18px 16px;margin:20px 0;",
  muted: "font-size:13px;line-height:1.55;color:#787774;margin:18px 0 0;",
  videoCard: "background:#f7f6f3;border:1px solid #e6e4df;border-radius:8px;padding:14px 16px;margin:18px 0;",
  cardLabel: "font-size:12px;font-weight:600;color:#787774;margin:0 0 6px;",
  videoTitle: "font-size:15px;line-height:1.5;font-weight:600;color:#2f3437;margin:0;",
  buttonRow: "margin:22px 0 0;",
  button: "display:inline-block;background:#2f3437;color:#ffffff;text-decoration:none;border-radius:6px;padding:10px 14px;font-size:14px;font-weight:600;",
  footer: "font-size:12px;line-height:1.5;color:#9b9a97;text-align:center;margin:18px 0 0;"
} as const;
