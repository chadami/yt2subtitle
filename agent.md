# Agent Guide

## Project Overview

This project is a Chrome extension plus server system for generating higher-quality AI-translated YouTube subtitles.

The product goal is not only "translate captions", but to improve the full subtitle experience:

- Prefer manually uploaded YouTube captions.
- Fall back to YouTube auto-generated captions.
- Clean overlapping or noisy caption timelines.
- Use video title, channel, and description as translation context.
- Re-segment captions into natural subtitle units.
- Translate into concise, natural, spoken Chinese.
- Keep final subtitle timing stable by deriving timestamps from cleaned source cues, not free-form AI-generated times.
- Load completed AI subtitles automatically when the user opens the same YouTube video again.

## Current Prototype

The current local prototype is:

- `ai_youtube_subtitle.py`

It can:

- List available YouTube caption tracks.
- Download raw captions.
- Clean overlapping subtitle cues.
- Use DeepSeek/OpenAI-compatible APIs for translation.
- Output VTT/SRT subtitles.
- Use video metadata as translation context.
- Optionally compress long translated subtitles.

## Engineering Principles

Keep the timing system deterministic.

- AI should not freely invent `start` / `end` timestamps.
- AI should output `source_indexes`.
- Code should calculate subtitle time ranges from cleaned source cues.

Keep translation quality context-aware.

- Always pass video title, channel, and description when available.
- Always pass nearby previous/next caption context.
- Prefer natural spoken Chinese over literal translation.
- Preserve names, terms, numbers, and speaker intent.

Keep Chrome extension permissions minimal.

- Request only YouTube host permissions and backend API host permissions.
- Use `storage`, `alarms`, and `notifications` only when the feature needs them.
- Do not collect passive browsing history.
- Only process videos the user explicitly interacts with.

Keep future account upgrades simple.

- Do not make `clientId` the permanent user model.
- Resolve anonymous client IDs into internal `userId`.
- Store jobs, subtitles, and usage against `userId`.
- Add email/Google identities later without rewriting subtitle job logic.

Keep provider support modular.

- Do not hard-code a single AI provider into business logic.
- Support provider config records such as DeepSeek, OpenAI, or future OpenAI-compatible APIs.
- Treat platform-owned API keys as server-side secrets in production.
- Future user-provided API keys should be encrypted server-side or stored only locally when explicitly designed that way.
- Business logic should support both platform credits and user-owned AI API keys.

Keep monetization extensible.

- Estimate credits after captions are downloaded, before creating a paid translation job.
- Show the estimated credit cost in the extension UI for the current video.
- Do not charge credits until a job is accepted for processing.
- Store credit ledger entries instead of mutating balances without an audit trail.
- Keep international and China payment integrations behind a payment provider abstraction.

## Suggested Runtime Architecture

MVP production architecture:

- Chrome MV3 extension
- Backend API service
- Background worker for subtitle jobs
- Postgres for users, videos, jobs, and subtitle results
- Redis/BullMQ or equivalent queue
- DeepSeek as initial AI provider

Recommended hosting for MVP:

- Render Web Service for API
- Render Background Worker for jobs
- Postgres
- Redis / Key Value

## Do Not Do

- Do not put shared production AI API keys inside the Chrome extension.
- Do not rely on Chrome extension service workers for long-running translation jobs.
- Do not make email registration mandatory for the first MVP.
- Do not let AI directly control final subtitle timing unless there is a separate validation layer.
- Do not create duplicate translation jobs for the same `videoId + sourceLang + targetLang` while an existing job is running.
- Do not bind payment or credit records directly to anonymous `clientId`; resolve to `userId` first.

## Important Product Defaults

- Start with anonymous users using a generated `clientId`.
- Add email magic link / Google login later.
- Use browser extension notifications before email notifications.
- Cache completed subtitles server-side and locally.
- Make subtitle generation explicit: user clicks to generate.
