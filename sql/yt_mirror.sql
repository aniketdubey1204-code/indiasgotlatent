-- Our own YouTube mirror IDs. Run once in SQL Editor.
alter table public.videos add column if not exists yt_mirror_id text;
