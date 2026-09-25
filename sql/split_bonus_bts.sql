-- Split bonus/bts by season: s1bonus | s1bts | s2bonus | s2bts
update public.videos set category = 's2bts'
where category = 'bts'
and (title ilike '%s2%' or title ilike '%season 2%' or description ilike '%season 2%');
update public.videos set category = 's1bts'
where category = 'bts' and category != 's2bts';

update public.videos set category = 's2bonus'
where category = 'bonus'
and (title ilike '%s2%' or title ilike '%season 2%' or description ilike '%season 2%');
update public.videos set category = 's1bonus'
where category = 'bonus' and category != 's2bonus';
