-- Source order: position in private okcdn.json (0 = newest per catalog)
alter table public.videos add column if not exists source_index int default 9999;
create index if not exists videos_source_index_idx on public.videos (source_index);
