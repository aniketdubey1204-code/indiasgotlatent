-- Telegram bot-start login sessions
create table if not exists public.tg_logins (
  token text primary key,
  status text default 'pending',
  telegram_id bigint,
  telegram_username text,
  created_at timestamptz default now()
);
alter table public.tg_logins enable row level security;

drop policy if exists "Anyone can start login" on public.tg_logins;
create policy "Anyone can start login"
on public.tg_logins for insert to anon, authenticated with check (true);

drop policy if exists "Anyone can poll own token" on public.tg_logins;
create policy "Anyone can poll own token"
on public.tg_logins for select to anon, authenticated using (true);

-- Cleanup old sessions (older than 1 day)
-- delete from public.tg_logins where created_at < now() - interval '1 day';
