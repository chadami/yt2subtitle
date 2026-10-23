# Agent Guide

## Project Overview

This project is a macOS local application plus Chrome extension for generating higher-quality AI-translated YouTube subtitles. It has no cloud backend, accounts, memberships, or admin console.

The product goal is not only "translate captions", but to improve the full subtitle experience:

- Prefer manually uploaded YouTube captions.
- Fall back to YouTube auto-generated captions.
- Clean overlapping or noisy caption timelines.
- Use video title, channel, and description as translation context.
- Re-segment captions into natural subtitle units.
- Translate into concise, natural, spoken Chinese.
- Keep final subtitle timing stable by deriving timestamps from cleaned source cues, not free-form AI-generated times.
- Load completed AI subtitles automatically when the user opens the same YouTube video again.

## Runtime

- SwiftUI application in `macos/Sources/VidLingo` manages the embedded Node service and Keychain.
- `backend/src/start-local.ts` runs the API and in-process task runner.
- PGlite persists local history and subtitle data. No external database or Redis is needed.
- The Chrome extension connects only to the loopback service using a local token.
- `ai_youtube_subtitle.py` and `evaluation/` are independent developer tools.

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
- Prefer complete semantic source sentences over rigidly preserving every raw caption fragment.
- Do not overfit fixes to one video, phrase, language, or timestamp.
- Accept small timing deviations when they prevent duplicated translation, unreadably short display time, meaning drift, or clearly incorrect sentence breaks.
- Treat duplicated meaning, short unreadable cues, translation drift, and broken semantic segmentation as higher-priority defects than minor timeline differences.

Keep Chrome extension permissions minimal.

- Request only YouTube host permissions and backend API host permissions.
- Use `storage`, `alarms`, and `notifications` only when the feature needs them.
- Do not collect passive browsing history.
- Only process videos the user explicitly interacts with.

Keep the local runtime simple.

- Preserve the existing internal user ID so updates can read saved tasks and subtitles.
- Keep local token, Origin and Host checks; no JWT, email login, billing or public subtitle sharing.
- Store API keys in Keychain, never in extension storage or database configuration records.
- Keep support for the configured AI providers and custom compatible endpoints.
- Run machine translation only after AI retries are exhausted, starting at the failed AI batch.
- Reuse saved AI and machine translation batches when retrying or restarting.
- Keep existing database rows and legacy tables during additive migrations.

## Do Not Do

- Do not expose the API beyond loopback.
- Do not put AI API keys inside the Chrome extension.
- Do not run long translation tasks in the extension service worker.
- Do not reintroduce accounts, memberships, shared subtitles or a remote backend.
- Do not let AI directly control final subtitle timing without validation.
- Do not create duplicate jobs while the same local generation key is active.
- Do not restart or replace a running application as part of routine source cleanup.

## Important Product Defaults

- Connect the extension to the local app without signing in.
- Cache completed subtitles locally.
- Prefer browser notifications to external notification services.
- Preserve user-controlled generation and automatic-translation settings.
- For current setup and packaging, follow README.md and macos/README.md.
