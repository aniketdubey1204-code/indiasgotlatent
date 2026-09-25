-- One-shot: set correct category for every synced row by private dataId.
-- Run in SQL Editor. Fixes sorting without redeploying anything.
update public.videos set category = case
  when video_url like '%id=s2-bts-01%' then 's2bts'
  when video_url like '%id=s2-bts-02%' then 's2bts'
  when video_url like '%id=s2-bts-03%' then 's2bts'
  when video_url like '%id=s2-bts-04%' then 's2bts'
  when video_url like '%id=s2-bonus-ep1%' then 's2bonus'
  when video_url like '%id=s2-bonus-ep2%' then 's2bonus'
  when video_url like '%id=s2-03-bonus%' then 's2bonus'
  when video_url like '%id=s2-bonus-clip-01%' then 's2bonus'
  when video_url like '%id=special-01%' then 'special'
  when video_url like '%id=kapil-01%' then 'special'
  when video_url like '%id=s2-stillalive%' then 'special'
  when video_url like '%id=s2-01%' then 'season2'
  when video_url like '%id=s2-02%' then 'season2'
  when video_url like '%id=s2-03%' then 'season2'
  when video_url like '%id=s2-04%' then 'season2'
  when video_url like '%id=s2-05%' then 'season2'
  when video_url like '%id=s2-06%' then 'season2'
  when video_url like '%id=s2-06-rakhi%' then 'season2'
  when video_url like '%id=s2-07%' then 'season2'
  when video_url like '%id=ep-01%' then 'season1'
  when video_url like '%id=ep-02%' then 'season1'
  when video_url like '%id=ep-03%' then 'season1'
  when video_url like '%id=ep-04%' then 'season1'
  when video_url like '%id=ep-05%' then 'season1'
  when video_url like '%id=ep-06%' then 'season1'
  when video_url like '%id=ep-07%' then 'season1'
  when video_url like '%id=ep-08%' then 'season1'
  when video_url like '%id=ep-09%' then 'season1'
  when video_url like '%id=ep-10%' then 'season1'
  when video_url like '%id=ep-11%' then 'season1'
  when video_url like '%id=ep-12%' then 'season1'
  else 's1bonus'
end
where video_url like '%iglll1.freeforall.dev/player%';

-- Verify:
-- select category, count(*) from public.videos group by category;
