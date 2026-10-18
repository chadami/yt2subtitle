create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table users add column if not exists last_login_ip inet;
alter table users add column if not exists last_login_at timestamptz;

create table if not exists identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('anonymous', 'email', 'google')),
  identifier text not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (type, identifier)
);

create table if not exists magic_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists login_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  email text,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table login_codes add column if not exists email text;

create table if not exists user_ai_settings (
  user_id uuid primary key references users(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'deepseek', 'openai', 'claude', 'qwen', 'mimo')),
  api_key_ciphertext text not null,
  model text not null default '',
  available_models_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_entitlements (
  user_id uuid primary key references users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'standard', 'contributor')),
  status text not null default 'active' check (status in ('active', 'expired', 'canceled')),
  valid_until timestamptz,
  generation_video_limit integer check (generation_video_limit is null or generation_video_limit >= 0),
  contribution_consent_version text,
  contribution_consented_at timestamptz,
  contribution_withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists videos (
  video_id text primary key,
  url text not null,
  title text not null default '',
  channel text not null default '',
  description text not null default '',
  duration integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists caption_sources (
  id uuid primary key default gen_random_uuid(),
  video_id text not null references videos(video_id) on delete cascade,
  source_lang text not null,
  caption_type text not null check (caption_type in ('manual', 'auto')),
  cue_hash text,
  raw_cues_json jsonb not null,
  clean_cues_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists translation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  video_id text not null references videos(video_id) on delete cascade,
  source_lang text not null,
  target_lang text not null,
  caption_source_id uuid not null references caption_sources(id) on delete cascade,
  provider_mode text not null default 'system' check (provider_mode in ('system', 'user')),
  ai_provider text,
  ai_model text,
  strategy_id text,
  strategy_version text,
  style_id text not null default 'accurate',
  generation_key text,
  contribution_eligible boolean not null default false,
  consent_version text,
  machine_run_id uuid,
  status text not null,
  progress integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists machine_translation_runs (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists translated_subtitles (
  id uuid primary key default gen_random_uuid(),
  video_id text not null references videos(video_id) on delete cascade,
  source_lang text not null,
  target_lang text not null,
  provider_mode text not null default 'system' check (provider_mode in ('system', 'user')),
  provider text not null,
  model text not null,
  strategy_id text,
  strategy_version text,
  job_id uuid references translation_jobs(id) on delete set null,
  caption_source_id uuid references caption_sources(id) on delete cascade,
  style_id text not null default 'accurate',
  generation_key text,
  content_hash text,
  publication_status text not null default 'private'
    check (publication_status in ('private', 'candidate', 'recommended', 'archived', 'rejected')),
  quality_score integer,
  quality_metrics_json jsonb,
  consent_version text,
  created_by_user_id uuid references users(id) on delete set null,
  cues_json jsonb not null,
  vtt_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists translation_job_chunks (
  job_id uuid not null references translation_jobs(id) on delete cascade,
  chunk_index integer not null,
  cues_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (job_id, chunk_index)
);

create table if not exists translation_job_machine_chunks (
  job_id uuid not null references translation_jobs(id) on delete cascade,
  chunk_index integer not null,
  provider text not null default 'google',
  cues_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (job_id, chunk_index)
);

create table if not exists translation_job_watchers (
  job_id uuid not null references translation_jobs(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, user_id)
);

create table if not exists user_video_usage (
  user_id uuid not null references users(id) on delete cascade,
  video_id text not null references videos(video_id) on delete cascade,
  status text not null check (status in ('reserved', 'completed')),
  first_job_id uuid references translation_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, video_id)
);

create table if not exists public_subtitle_selections (
  caption_source_id uuid not null references caption_sources(id) on delete cascade,
  target_lang text not null,
  style_id text not null default 'accurate',
  recommended_subtitle_id uuid not null references translated_subtitles(id) on delete cascade,
  previous_subtitle_id uuid references translated_subtitles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (caption_source_id, target_lang, style_id)
);

-- Existing installations need the new columns before indexes referencing them are created.
alter table user_entitlements add column if not exists generation_video_limit integer;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_entitlements_generation_video_limit_check'
  ) then
    alter table user_entitlements
      add constraint user_entitlements_generation_video_limit_check
      check (generation_video_limit is null or generation_video_limit >= 0);
  end if;
end $$;
alter table translation_jobs add column if not exists style_id text not null default 'accurate';
alter table translation_jobs add column if not exists generation_key text;
alter table translation_jobs add column if not exists contribution_eligible boolean not null default false;
alter table translation_jobs add column if not exists consent_version text;
alter table translation_jobs add column if not exists machine_run_id uuid;
alter table translated_subtitles add column if not exists caption_source_id uuid references caption_sources(id) on delete cascade;
alter table translated_subtitles add column if not exists job_id uuid references translation_jobs(id) on delete set null;
alter table translated_subtitles add column if not exists style_id text not null default 'accurate';
alter table translated_subtitles add column if not exists generation_key text;
alter table translated_subtitles add column if not exists content_hash text;
alter table translated_subtitles add column if not exists publication_status text not null default 'private';
alter table translated_subtitles add column if not exists quality_score integer;
alter table translated_subtitles add column if not exists quality_metrics_json jsonb;
alter table translated_subtitles add column if not exists consent_version text;

create index if not exists translation_jobs_video_lang_idx on translation_jobs(video_id, source_lang, target_lang, status);
create index if not exists translated_subtitles_video_lang_idx on translated_subtitles(video_id, source_lang, target_lang);
create index if not exists translation_job_chunks_job_idx on translation_job_chunks(job_id, chunk_index);
create index if not exists translation_job_machine_chunks_job_idx on translation_job_machine_chunks(job_id, chunk_index);
alter table translation_job_machine_chunks alter column provider set default 'google';
create index if not exists translated_subtitles_identity_idx
  on translated_subtitles(caption_source_id, target_lang, style_id, publication_status);
create index if not exists translated_subtitles_content_hash_idx on translated_subtitles(content_hash);
create unique index if not exists translated_subtitles_private_generation_idx
  on translated_subtitles(created_by_user_id, generation_key)
  where publication_status = 'private' and generation_key is not null;
create unique index if not exists translated_subtitles_public_generation_idx
  on translated_subtitles(generation_key)
  where publication_status in ('candidate', 'recommended', 'archived') and generation_key is not null;
create unique index if not exists translation_jobs_active_public_generation_idx
  on translation_jobs(generation_key)
  where contribution_eligible = true
    and generation_key is not null
    and status in ('queued', 'cleaning', 'translating', 'compressing', 'finalizing');
alter table caption_sources add column if not exists cue_hash text;
create unique index if not exists caption_sources_unique_cue_hash_idx
  on caption_sources(video_id, source_lang, caption_type, cue_hash)
  where cue_hash is not null;

alter table translation_jobs add column if not exists provider_mode text not null default 'system';
alter table translation_jobs add column if not exists ai_provider text;
alter table translation_jobs add column if not exists ai_model text;
alter table translation_jobs add column if not exists strategy_id text;
alter table translation_jobs add column if not exists strategy_version text;
alter table translation_jobs add column if not exists style_id text not null default 'accurate';
alter table translation_jobs add column if not exists generation_key text;
alter table translation_jobs add column if not exists contribution_eligible boolean not null default false;
alter table translation_jobs add column if not exists consent_version text;
alter table translation_jobs add column if not exists machine_run_id uuid;
alter table translated_subtitles add column if not exists provider_mode text not null default 'system';
alter table translated_subtitles add column if not exists strategy_id text;
alter table translated_subtitles add column if not exists strategy_version text;
alter table translated_subtitles add column if not exists caption_source_id uuid references caption_sources(id) on delete cascade;
alter table translated_subtitles add column if not exists job_id uuid references translation_jobs(id) on delete set null;
alter table translated_subtitles add column if not exists style_id text not null default 'accurate';
alter table translated_subtitles add column if not exists generation_key text;
alter table translated_subtitles add column if not exists content_hash text;
alter table translated_subtitles add column if not exists publication_status text not null default 'private';
alter table translated_subtitles add column if not exists quality_score integer;
alter table translated_subtitles add column if not exists quality_metrics_json jsonb;
alter table translated_subtitles add column if not exists consent_version text;

create table if not exists app_preferences (
  user_id uuid not null references users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Machine preview has its own lifecycle; failures must not fail the AI job.
alter table translation_jobs add column if not exists machine_translation_state text not null default 'idle';
alter table translation_jobs add column if not exists machine_translation_error text;
alter table translation_jobs add column if not exists machine_translation_code text;
alter table translation_jobs add column if not exists machine_translation_retry_at timestamptz;
alter table translation_jobs add column if not exists machine_translation_provider text;
