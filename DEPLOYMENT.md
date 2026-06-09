# Deployment Checklist

## Current Decision

First production MVP:

- Email magic link login
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

For local development, you can temporarily switch to:

- `EMAIL_PROVIDER=local`

In local mode, magic links are printed in logs instead of being sent.

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

## Important

Do not commit real API keys.

The old local Python script now reads API keys from environment variables or CLI args. Production keys belong in Render environment variables.
