-- Diagnostic: run first to see current columns
-- select column_name, data_type from information_schema.columns where table_schema='public' and table_name='videos' order by ordinal_position;

-- Fix: clean recreate (table is empty, safe to drop)
create extension if not exists "pgcrypto";

-- Drop table first (cascade removes its policies). Do not drop policies before this.
drop table if exists public.videos cascade;

create table public.videos (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text default '',
  video_url text not null,
  thumbnail_url text default '',
  episode_number int default 0,
  created_at timestamptz default now()
);

alter table public.videos enable row level security;

create policy "Auth users can read"
on public.videos for select
to authenticated
using (true);

create policy "Auth users can insert"
on public.videos for insert
to authenticated
with check (true);

create policy "Auth users can update"
on public.videos for update
to authenticated
using (true);

create policy "Auth users can delete"
on public.videos for delete
to authenticated
using (true);
