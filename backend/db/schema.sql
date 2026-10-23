-- Local-only schema. Retired account tables in older databases are left untouched.
create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null default 'anonymous',
  identifier text not null,
  created_at timestamptz not null default now(),
  unique (type, identifier)
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
  provider_mode text not null default 'user' check (provider_mode in ('system', 'user')),
  ai_provider text,
  ai_model text,
  strategy_id text,
  strategy_version text,
  style_id text not null default 'accurate',
  generation_key text,
  status text not null,
  progress integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists translated_subtitles (
  id uuid primary key default gen_random_uuid(),
  video_id text not null references videos(video_id) on delete cascade,
  source_lang text not null,
  target_lang text not null,
  provider_mode text not null default 'user' check (provider_mode in ('system', 'user')),
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


-- Additive compatibility migration: existing rows and retired tables are retained.
alter table translation_jobs add column if not exists style_id text not null default 'accurate';
alter table translation_jobs add column if not exists generation_key text;
alter table translated_subtitles add column if not exists caption_source_id uuid references caption_sources(id) on delete cascade;
alter table translated_subtitles add column if not exists job_id uuid references translation_jobs(id) on delete set null;
alter table translated_subtitles add column if not exists style_id text not null default 'accurate';
alter table translated_subtitles add column if not exists generation_key text;
alter table translated_subtitles add column if not exists content_hash text;
alter table translated_subtitles add column if not exists publication_status text not null default 'private';
alter table translated_subtitles add column if not exists quality_score integer;
alter table translated_subtitles add column if not exists quality_metrics_json jsonb;
alter table caption_sources add column if not exists cue_hash text;
alter table translation_jobs add column if not exists provider_mode text not null default 'user';
alter table translation_jobs add column if not exists ai_provider text;
alter table translation_jobs add column if not exists ai_model text;
alter table translation_jobs add column if not exists strategy_id text;
alter table translation_jobs add column if not exists strategy_version text;
alter table translated_subtitles add column if not exists provider_mode text not null default 'user';
alter table translated_subtitles add column if not exists strategy_id text;
alter table translated_subtitles add column if not exists strategy_version text;
alter table translation_jobs add column if not exists machine_translation_state text not null default 'idle';
alter table translation_jobs add column if not exists machine_translation_error text;
alter table translation_jobs add column if not exists machine_translation_code text;
alter table translation_jobs add column if not exists machine_translation_retry_at timestamptz;
alter table translation_jobs add column if not exists machine_translation_provider text;
alter table translation_jobs add column if not exists machine_translation_start_chunk integer;

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
create unique index if not exists caption_sources_unique_cue_hash_idx
  on caption_sources(video_id, source_lang, caption_type, cue_hash)
  where cue_hash is not null;


create table if not exists app_preferences (
  user_id uuid not null references users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists translation_jobs_machine_cache_idx on translation_jobs(user_id,caption_source_id,target_lang);

create table if not exists local_machine_cue_cache (
  user_id uuid not null references users(id),
  caption_source_id uuid not null references caption_sources(id),
  target_lang text not null,
  provider text not null,
  source_index integer not null,
  cue_json jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(user_id,caption_source_id,target_lang,provider,source_index)
);
alter table translation_jobs add column if not exists machine_translation_mode text not null default 'full';
