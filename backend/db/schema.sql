create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

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
  provider text not null,
  model text not null,
  created_by_user_id uuid references users(id) on delete set null,
  cues_json jsonb not null,
  vtt_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists translation_jobs_video_lang_idx on translation_jobs(video_id, source_lang, target_lang, status);
create index if not exists translated_subtitles_video_lang_idx on translated_subtitles(video_id, source_lang, target_lang);
