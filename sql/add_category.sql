-- Add category for auto-sorting: season1 | season2 | bonus | bts | special
alter table public.videos add column if not exists category text default 'bonus';

-- Backfill existing rows by title keywords
update public.videos set category = 'bts'
where category is null or category = 'bonus'
and (title ilike '%bts%' or title ilike '%behind%');
update public.videos set category = 'special'
where title ilike '%special%' or title ilike '%kapil%' or title ilike '%documentary%';
update public.videos set category = 'season2'
where category = 'bonus'
and (title ilike '%s2%' or title ilike '%season 2%' or description ilike '%season 2%');
update public.videos set category = 'season1'
where category = 'bonus'
and (title ilike '%episode%' or title ilike '%bonus segment%');
