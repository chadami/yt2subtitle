# Product Feature Specification

## Product Name

Working name: YouTube AI Subtitle

## Problem

YouTube already provides translated subtitles, but the quality is often poor for serious viewing:

- Machine translation is too literal.
- Captions are segmented unnaturally.
- Auto-generated captions may overlap or contain timing issues.
- Translation ignores video title, description, speaker context, and domain terms.
- Long translated subtitles are hard to read at video speed.

The product solves this by generating AI-translated subtitles that are more accurate, natural, and readable.

## Target Users

- Users watching foreign-language YouTube videos.
- Users who need accurate Chinese subtitles for interviews, lectures, podcasts, tutorials, and long-form content.
- Users who care about context-aware translation, not just word-by-word translation.

## Core User Flow

1. User opens a YouTube video.
2. Chrome extension detects the video.
3. Extension checks whether AI subtitles already exist for this video.
4. If subtitles exist, the extension can auto-load them.
5. If subtitles do not exist, user clicks "Generate AI Subtitles".
6. Extension extracts video metadata and available captions.
7. Extension submits the task to the backend.
8. Backend processes subtitles asynchronously.
9. Extension shows task progress.
10. When completed, the extension shows a browser notification.
11. User opens or returns to the video.
12. Extension loads and renders the AI subtitles over the YouTube player.

## MVP Features

### YouTube Detection

- Detect YouTube watch pages.
- Extract `videoId`.
- Handle YouTube single-page navigation.
- Detect when the user switches videos without a full page reload.

### Caption Extraction

- List available caption tracks.
- Prefer manually uploaded captions.
- Fall back to auto-generated captions.
- Capture:
  - source language
  - caption type: manual / auto
  - raw cue list
  - start/end timestamps
  - cue text

### Video Context

Capture and send to backend:

- video title
- channel name
- video description
- YouTube URL
- videoId

This context is used only to improve translation accuracy.

### AI Subtitle Processing

Backend processing should:

- clean overlapping raw captions
- remove speaker markers like `>>`
- merge short backchannel replies when appropriate
- create a non-overlapping single-track timeline
- split captions into model-friendly chunks
- send video context and nearby cue context to AI
- ask AI to output `source_indexes + translation`
- calculate final timing from cleaned source cues
- compress overly long translated subtitles
- validate final subtitle timing

### Subtitle Rendering

Extension should:

- overlay subtitles on the YouTube player
- sync subtitles with `video.currentTime`
- handle pause, seek, playback speed, fullscreen, and theater mode
- allow subtitles to be turned on/off
- support local cached subtitles

### Browser Plugin Notification

MVP notification should use Chrome extension notifications, not email.

Flow:

1. Backend marks job completed.
2. Extension checks job status via polling / alarms.
3. Extension shows Chrome notification.
4. User clicks notification.
5. Extension opens YouTube video and loads subtitles.

### Options Page

Provide a Chrome extension options page at:

```text
chrome-extension://<extension-id>/options.html
```

Options page sections:

- Account
  - anonymous user status
  - future login entry point
  - usage quota
  - credit balance
  - buy credits
- Translation
  - target language
  - translation style
  - auto-load AI subtitles
  - future user-provided AI API keys
  - preferred AI model/provider
- Subtitle Style
  - font size
  - subtitle position
  - background opacity
  - bilingual display option
- Notifications
  - enable task completion notification
- Tasks
  - current task list
  - completed video list
- Cache
  - clear local subtitle cache
  - clear local task records
- Service
  - backend API URL
  - connection test

### Credit Estimate

After the extension downloads captions, it should estimate the current video's credit cost before submitting the translation job.

The estimate should be visible in the popup or video page UI:

```text
Estimated cost: 18 credits
Source captions: 1,240 cues / about 9,800 characters
Model: DeepSeek V4 Pro
```

The user should confirm before spending credits.

Estimate inputs:

- caption text length
- cleaned cue count
- video duration
- source language
- target language
- selected model/provider
- whether compression or bilingual output is enabled

The estimate is not expected to be exact, but it should be close enough to avoid surprising users.

## User Identity

### MVP

Use anonymous identity.

- Extension generates a random `clientId`.
- Store it in `chrome.storage.local`.
- Send it with backend requests.
- Backend resolves it into internal `userId`.

### Future Upgrade

Support email magic link and Google login.

- Anonymous user can upgrade to a registered user.
- Existing jobs and subtitles remain linked to the same `userId`.
- No subtitle data migration should be required for the common upgrade case.

## Non-MVP Features

These should be deferred:

- email notifications
- no-caption audio transcription
- playlist batch translation
- subtitle editor
- team sharing
- custom terminology glossary

## Future Paid Features

The product should support two payment/usage modes.

### Platform Credits

Users buy credits from the product and spend them on subtitle generation.

Expected features:

- show current credit balance
- show estimated credits for the current video
- confirm before spending credits
- deduct credits when a job starts
- refund credits automatically if the job fails before usable output is produced
- keep a credit transaction history
- support credit packages and future subscriptions

### User-Owned AI API Keys

Advanced users can manually add one or more AI model API keys.

Expected features:

- add provider: DeepSeek / OpenAI / OpenAI-compatible
- add API base URL
- add model name
- test connection
- choose default provider/model
- optionally use user key instead of platform credits

Platform-owned API keys should remain server-side. User-provided keys should be protected carefully and never exposed to unrelated pages.

### Payment Methods

Future payment should support both international and China-mainland payment methods.

International:

- credit card
- Apple Pay / Google Pay where supported
- PayPal if needed
- Stripe as the likely first integration

China-mainland:

- WeChat Pay
- Alipay
- UnionPay / bank card where needed

Payment provider selection should be abstracted so the product can start with one provider and add more later.

## Success Criteria

MVP is successful if:

- Caption extraction works for common YouTube videos.
- Translated subtitles are visibly better than YouTube auto-translation.
- Timing feels accurate during playback.
- Long subtitles remain readable.
- Completed subtitles load automatically on repeat visits.
- The system avoids duplicate processing for the same video/language pair.
- Future paid flow can show an estimated credit cost before translation.
