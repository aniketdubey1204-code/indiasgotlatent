-- Allow frontend (Telegram demo + email) to read/write videos without Supabase login.
-- Run in Supabase SQL Editor.
alter table public.videos enable row level security;

drop policy if exists "Public read videos" on public.videos;
create policy "Public read videos"
on public.videos for select
to anon, authenticated
using (true);

drop policy if exists "Public insert videos" on public.videos;
create policy "Public insert videos"
on public.videos for insert
to anon, authenticated
with check (true);

drop policy if exists "Public update videos" on public.videos;
create policy "Public update videos"
on public.videos for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public delete videos" on public.videos;
create policy "Public delete videos"
on public.videos for delete
to anon, authenticated
using (true);
