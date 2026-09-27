-- Telegram mirror column. Run once in SQL Editor.
-- tg_path alone is useless without the bot token (server-side only), so it stays public-readable.
alter table public.videos add column if not exists tg_path text;
