-- Missing GRANTs cause 401 even with policies. Run this.
grant select, insert, update, delete on public.videos to anon, authenticated;
-- Verify:
-- select * from public.videos limit 1;
