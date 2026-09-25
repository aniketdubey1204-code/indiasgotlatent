-- Run in Supabase SQL Editor
create table if not exists public.videos (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text default '',
  video_url text not null,
  thumbnail_url text default '',
  episode_number int default 0,
  created_at timestamptz default now()
);

alter table public.videos enable row level security;

-- Public read (authenticated users only, since site is auth-gated)
drop policy if exists "Auth users can read" on public.videos;
create policy "Auth users can read"
on public.videos for select
to authenticated
using (true);

-- Admin write: replace ADMIN_EMAIL with your email
-- Option 1: allow authenticated to insert (simple, gate admin UI by email check in JS)
drop policy if exists "Auth users can insert" on public.videos;
create policy "Auth users can insert"
on public.videos for insert
to authenticated
with check (true);

drop policy if exists "Auth users can update" on public.videos;
create policy "Auth users can update"
on public.videos for update
to authenticated
using (true);

drop policy if exists "Auth users can delete" on public.videos;
create policy "Auth users can delete"
on public.videos for delete
to authenticated
using (true);

-- Profiles table for Telegram-linked users (optional)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  telegram_id bigint unique,
  telegram_username text,
  email text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "Users upsert own profile" on public.profiles;
create policy "Users upsert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
