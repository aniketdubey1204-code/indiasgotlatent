-- Ensure service_role can write (edge function admin-save uses it)
grant all on public.videos to service_role;
grant usage on schema public to service_role;
