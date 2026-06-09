# Frontend and Backend Technical Specification

## System Architecture

```text
Chrome Extension
  -> Backend API
  -> Job Queue
  -> Subtitle Worker
  -> AI Provider API
  -> Database
```

Main responsibilities:

- Chrome extension: YouTube integration, caption extraction, user controls, subtitle overlay, local cache, browser notifications.
- Backend API: identity resolution, task creation, task status, subtitle retrieval, quota checks.
- Worker: subtitle cleaning, AI translation, compression, validation, result persistence.
- Database: users, identities, videos, caption sources, jobs, translated subtitle results.
- Queue: asynchronous long-running subtitle tasks.

## Chrome Extension

### Files

Expected structure:

```text
extension/
  manifest.json
  background.ts
  contentScript.ts
  popup/
  options/
  overlay/
  lib/
```

### Manifest Permissions

Expected permissions:

```json
{
  "permissions": ["storage", "alarms", "notifications"],
  "host_permissions": [
    "https://www.youtube.com/*",
    "https://api.example.com/*"
  ]
}
```

### Content Script Responsibilities

- Detect YouTube video pages.
- Extract current `videoId`.
- Observe YouTube SPA navigation.
- Find caption track data when available.
- Create subtitle overlay.
- Sync rendered subtitle with the video element.
- Request existing subtitles from backend.
- Load completed subtitles automatically if enabled.

### Background Service Worker Responsibilities

- Maintain pending job checks with `chrome.alarms`.
- Query backend job status.
- Create Chrome notifications when jobs complete.
- Open YouTube video URL when user clicks notification.

### Popup Responsibilities

- Show current video subtitle status.
- Show available source caption status.
- Trigger subtitle generation.
- Show task progress.
- Load completed subtitle.

### Options Page Responsibilities

- Store target language.
- Store subtitle style settings.
- Toggle auto-load subtitles.
- Toggle notifications.
- Show current tasks.
- Show completed videos.
- Clear local cache.
- Show account status.
- Provide future login controls.

### Local Storage

Use `chrome.storage.local` or IndexedDB.

Suggested keys:

```text
clientId
settings
pendingJobs
subtitleCache:{videoId}:{sourceLang}:{targetLang}
completedVideos
```

## Backend API

### Identity Resolution

Every request from the extension includes anonymous `clientId` during MVP.

Backend should immediately resolve it:

```text
clientId -> identity -> userId
```

Business logic should use `userId`, not `clientId`.

### Endpoints

#### POST /api/identity/resolve

Creates or resolves anonymous user.

Request:

```json
{
  "clientId": "anon_uuid"
}
```

Response:

```json
{
  "userId": "user_123",
  "identityType": "anonymous"
}
```

#### POST /api/videos/lookup

Checks whether subtitles already exist.

Request:

```json
{
  "clientId": "anon_uuid",
  "videoId": "abc123",
  "sourceLang": "en",
  "targetLang": "zh-Hans"
}
```

Response:

```json
{
  "status": "completed",
  "subtitleId": "sub_123"
}
```

or:

```json
{
  "status": "missing"
}
```

#### POST /api/jobs

Creates or reuses a translation job.

Request:

```json
{
  "clientId": "anon_uuid",
  "video": {
    "videoId": "abc123",
    "url": "https://www.youtube.com/watch?v=abc123",
    "title": "Video title",
    "channel": "Channel name",
    "description": "Video description"
  },
  "sourceLang": "en",
  "targetLang": "zh-Hans",
  "captionType": "manual",
  "rawCues": [
    {
      "start": 121.04,
      "end": 123.92,
      "text": "yes."
    }
  ]
}
```

If the system uses platform credits, job creation should require a previously returned estimate or calculate a fresh estimate server-side before accepting the job.

Response:

```json
{
  "jobId": "job_123",
  "status": "queued"
}
```

#### POST /api/credits/estimate

Estimates credit cost after captions are downloaded and before a translation job is created.

Request:

```json
{
  "clientId": "anon_uuid",
  "video": {
    "videoId": "abc123",
    "duration": 1842
  },
  "sourceLang": "en",
  "targetLang": "zh-Hans",
  "captionType": "manual",
  "rawCues": [
    {
      "start": 121.04,
      "end": 123.92,
      "text": "yes."
    }
  ],
  "model": {
    "provider": "deepseek",
    "model": "deepseek-v4-pro"
  },
  "features": {
    "compression": true,
    "bilingual": false
  }
}
```

Response:

```json
{
  "estimateId": "est_123",
  "estimatedCredits": 18,
  "expiresAt": "2026-06-08T12:30:00Z",
  "breakdown": {
    "captionCharacters": 9800,
    "cleanedCueCount": 720,
    "modelMultiplier": 1.4,
    "compression": 2
  }
}
```

#### GET /api/billing/balance

Returns the user's credit balance.

Response:

```json
{
  "userId": "user_123",
  "balance": 240
}
```

#### POST /api/billing/checkout

Creates a payment checkout session for buying credits.

Request:

```json
{
  "clientId": "anon_uuid",
  "packageId": "credits_500",
  "paymentProvider": "stripe"
}
```

Response:

```json
{
  "checkoutUrl": "https://checkout.example.com/session/abc"
}
```

#### POST /api/ai-keys

Adds a user-owned AI API key for future advanced usage.

Request:

```json
{
  "clientId": "anon_uuid",
  "provider": "deepseek",
  "name": "My DeepSeek Key",
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-v4-pro",
  "apiKey": "sk-..."
}
```

Response:

```json
{
  "keyId": "key_123",
  "provider": "deepseek",
  "enabled": true
}
```

#### GET /api/jobs/:jobId

Returns task status.

Response:

```json
{
  "jobId": "job_123",
  "status": "translating",
  "progress": 42
}
```

#### GET /api/subtitles/:subtitleId

Returns completed subtitle.

Response:

```json
{
  "subtitleId": "sub_123",
  "videoId": "abc123",
  "sourceLang": "en",
  "targetLang": "zh-Hans",
  "format": "json",
  "cues": [
    {
      "start": 121.04,
      "end": 124.479,
      "text": "是的。你为什么开始每天跑步？"
    }
  ]
}
```

## Job Statuses

```text
queued
cleaning
translating
compressing
finalizing
completed
failed
cancelled
```

## Subtitle Worker Pipeline

```text
raw cues
  -> normalize text
  -> strip speaker markers
  -> resolve overlaps
  -> assign stable source indexes
  -> chunk cues
  -> AI translation with video context
  -> parse source_indexes
  -> calculate start/end from source cues
  -> compress long subtitle lines
  -> validate non-overlap
  -> persist JSON/VTT
```

### Timing Rule

AI must not directly control final timestamps.

Preferred AI output:

```json
{
  "cues": [
    {
      "source_indexes": [12, 13, 14],
      "source": "Why did you start running every day?",
      "translation": "你为什么开始每天跑步？"
    }
  ]
}
```

Backend calculates:

```text
start = min(cleanCues[index].start)
end = max(cleanCues[index].end)
```

## Database Design

### users

```text
id
created_at
last_seen_at
```

### identities

Supports anonymous MVP and future registered accounts.

```text
id
user_id
type: anonymous / email / google
identifier
created_at
verified_at
```

Examples:

```text
type = anonymous, identifier = clientId
type = email, identifier = user@example.com
type = google, identifier = google subject id
```

### videos

```text
id
video_id
url
title
channel
description
duration
created_at
updated_at
```

### caption_sources

```text
id
video_id
source_lang
caption_type: manual / auto
raw_cues_json
clean_cues_json
created_at
```

### translation_jobs

```text
id
user_id
video_id
source_lang
target_lang
caption_source_id
status
progress
error
created_at
updated_at
completed_at
```

### translated_subtitles

```text
id
video_id
source_lang
target_lang
provider
model
created_by_user_id
cues_json
vtt_text
created_at
updated_at
```

### credit_accounts

```text
id
user_id
balance
created_at
updated_at
```

### credit_ledger_entries

Use ledger entries for auditability instead of only mutating balances.

```text
id
user_id
type: purchase / job_debit / refund / adjustment
amount
balance_after
job_id
payment_id
metadata_json
created_at
```

### credit_estimates

```text
id
user_id
video_id
source_lang
target_lang
provider
model
estimated_credits
caption_characters
cleaned_cue_count
features_json
expires_at
created_at
```

### payments

```text
id
user_id
provider: stripe / paypal / wechat_pay / alipay / unionpay
provider_payment_id
status: pending / paid / failed / refunded
currency
amount
credit_amount
checkout_url
metadata_json
created_at
updated_at
```

### user_ai_keys

Stores user-owned model keys for future advanced usage.

```text
id
user_id
provider: deepseek / openai / openai_compatible
name
base_url
default_model
encrypted_api_key
enabled
created_at
updated_at
last_used_at
```

### ai_provider_configs

Supports platform-owned AI API keys and providers.

```text
id
provider: deepseek / openai / openai_compatible
name
base_url
default_model
api_key_secret_ref
enabled
priority
created_at
updated_at
```

## Upgrade Point 1: Email / Google Registration

MVP starts with anonymous users.

The important design decision:

```text
jobs and subtitles reference user_id, not clientId
```

Anonymous usage:

```text
clientId -> identities(type=anonymous) -> userId
```

Future email registration:

```text
email magic link verified
-> add identities(type=email, identifier=email) to existing userId
```

Future Google registration:

```text
Google OAuth verified
-> add identities(type=google, identifier=googleSub) to existing userId
```

If a user logs in on a new device after using an anonymous account there, support account merge:

```text
anonymous user A
registered user B
-> move A jobs / usage / private records to B
-> disable or merge A identity
```

This keeps authentication changes isolated to the identity module.

## Upgrade Point 2: Multiple AI API Keys / Providers

Production should not hard-code DeepSeek only.

Use a provider abstraction:

```ts
interface AIProvider {
  name: string;
  translateSubtitles(input): Promise<TranslatedCue[]>;
  compressSubtitle(input): Promise<string>;
}
```

Provider config should support:

- DeepSeek
- OpenAI
- OpenAI-compatible APIs
- multiple platform-owned keys per provider
- future user-owned keys
- fallback provider
- per-user or per-plan routing
- model selection
- key rotation

Routing examples:

```text
default -> DeepSeek V4 Pro
fallback -> OpenAI-compatible provider
premium -> higher-quality model
low-cost -> cheaper model
```

Platform API keys must stay server-side.

The Chrome extension should never contain shared production AI keys.

Future user-owned API keys can be supported in two modes:

```text
recommended: encrypted server-side storage
optional advanced mode: local-only extension storage
```

Server-side storage is better for background jobs because the worker needs access to the key after the browser page closes.

## Upgrade Point 3: Credits and Payments

Future paid usage should support platform credits.

Credit flow:

```text
extension downloads captions
-> POST /api/credits/estimate
-> extension shows estimated credits
-> user confirms
-> POST /api/jobs with estimateId
-> backend validates estimate
-> backend debits credits when job starts
-> worker processes job
-> failed job may create refund ledger entry
```

Credit estimate formula should be server-owned so it can change without updating the extension.

Possible inputs:

```text
caption_characters
cleaned_cue_count
video_duration
source_lang
target_lang
provider
model
compression_enabled
bilingual_enabled
```

Payment provider abstraction:

```ts
interface PaymentProvider {
  createCheckoutSession(input): Promise<{ checkoutUrl: string }>;
  handleWebhook(request): Promise<PaymentEvent>;
}
```

International payment providers:

- Stripe for cards, Apple Pay, Google Pay where available
- PayPal if needed

China-mainland payment providers:

- WeChat Pay
- Alipay
- UnionPay / bank card if needed

Payment webhooks must be idempotent.

Credit purchases should create ledger entries only after payment is confirmed by webhook.

## Queue and Hosting

Recommended MVP:

```text
Render Web Service
Render Background Worker
Postgres
Redis / BullMQ
DeepSeek API
```

Why:

- subtitle translation is asynchronous
- long videos may take minutes
- worker can retry failed jobs
- API stays responsive
- completed subtitles can be cached and reused

## Duplicate Job Prevention

Before creating a job, check:

```text
videoId + sourceLang + targetLang
```

If completed subtitle exists:

```text
return subtitleId
```

If job is already queued/running:

```text
return existing jobId
```

Only create a new job when no result or active job exists.

## Notification Strategy

MVP uses browser plugin notifications, not email.

Flow:

```text
job queued
-> extension stores jobId
-> extension checks status via popup/content script/alarms
-> job completed
-> extension calls chrome.notifications.create
-> user clicks notification
-> extension opens YouTube URL
-> content script loads subtitle
```

Email can be added later after account registration exists.
