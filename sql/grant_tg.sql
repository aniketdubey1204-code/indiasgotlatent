-- Webhook (service_role) needs full access to tg_logins
grant all on public.tg_logins to service_role;
grant usage on schema public to service_role;
