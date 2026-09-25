-- Normalize leftover legacy categories (invisible in tabs)
update public.videos set category = 's2bts'
where video_url in (
  'https://iglll1.freeforall.dev/player?id=s2-bts-01',
  'https://iglll1.freeforall.dev/player?id=s2-bts-03'
);
-- Safety: any other legacy plain values -> S1 buckets
update public.videos set category = 's1bonus' where category = 'bonus';
update public.videos set category = 's1bts' where category = 'bts';
