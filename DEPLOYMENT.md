# Deployment Checklist

## Current Decision

First production MVP:

- Email sign-in code login
- No paid feature yet
- DeepSeek API key stored on the server
- Render API service + Render background worker
- Render Postgres + Render Key Value
- Chrome extension notifications instead of email notifications for job completion

## What You Need To Provide

- GitHub repository URL
- Render account access
- DeepSeek API key
- Domain name for the backend API
- Email sending provider choice

Email login is configured for Resend:

- `EMAIL_PROVIDER=resend`
- `EMAIL_FROM=noreply@yt.invisiblewind.cn`
- `RESEND_API_KEY` must be set as a Render secret environment variable
- API custom domain: `subtitle.invisiblewind.cn`

For local development, you can temporarily switch to:

- `EMAIL_PROVIDER=local`

In local mode, sign-in codes are printed in logs instead of being sent.

## Email Login Flow

Chrome blocks normal web pages from redirecting directly into `chrome-extension://...` pages.

For that reason, email login uses a one-time code that the user copies into the extension settings page.

Flow:

1. User enters email in the extension options page.
2. Backend sends an 8-character login code by email.
3. User pastes the code into the extension options page.
4. Extension exchanges the code for a session token.

## Render Setup Order

1. Push this project to GitHub.
2. In Render, create from `render.yaml` if using Blueprint.
3. Set required secret environment variables:
   - `DEEPSEEK_API_KEY`
   - `EXTENSION_ORIGIN`
   - `RESEND_API_KEY`
4. Run `backend/db/schema.sql` against Render Postgres.
5. Deploy API and worker.
6. Open `/health` on the API domain.
7. Put the API domain in the extension options page.

## Free Render Setup

The current `render.yaml` is configured for a free MVP deployment:

- Free Web Service
- Free Postgres
- Free Key Value
- Worker runs inside the Web Service process

This avoids the separate paid Background Worker during early testing.

Limitations:

- Free Web Services can spin down when idle.
- Background processing can pause if the Web Service sleeps.
- Free Postgres has Render free-tier limits.
- This is suitable for validation, not production.

When moving to production, split the worker back into a dedicated Render Background Worker and upgrade Postgres/Key Value plans.

## Important

Do not commit real API keys.

The old local Python script now reads API keys from environment variables or CLI args. Production keys belong in Render environment variables.
