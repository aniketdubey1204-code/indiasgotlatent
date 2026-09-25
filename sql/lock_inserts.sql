-- Lock writes: keep public read for grid, remove anon insert/update/delete.
-- Admin saves go via Edge Function admin-save (service_role), not direct table writes.
drop policy if exists "Public insert videos" on public.videos;
drop policy if exists "Public update videos" on public.videos;
drop policy if exists "Public delete videos" on public.videos;

-- Ensure public read stays
drop policy if exists "Public read videos" on public.videos;
create policy "Public read videos"
on public.videos for select
to anon, authenticated
using (true);

-- Revoke direct write grants from anon (keep authenticated for emergency email-admin)
revoke insert, update, delete on public.videos from anon;
grant select on public.videos to anon, authenticated;
grant insert, update, delete on public.videos to authenticated;
