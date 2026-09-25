-- Mirror private okcdn.json order exactly (0 = top of private homepage).
-- Run once. Only touches ordering columns — titles/descriptions you edited stay intact.
update public.videos set source_index = case
  when video_url like '%id=s2-07%' then 0
  when video_url like '%id=s2-03-bonus%' then 1
  when video_url like '%id=s2-06-rakhi%' then 2
  when video_url like '%id=s2-06%' and video_url not like '%rakhi%' then 3
  when video_url like '%id=s2-05%' then 4
  when video_url like '%id=s2-stillalive%' then 5
  when video_url like '%id=s2-bonus-ep2%' then 6
  when video_url like '%id=s2-bts-04%' then 7
  when video_url like '%id=s2-bonus-clip-01%' then 8
  when video_url like '%id=s2-04%' then 9
  when video_url like '%id=s2-bonus-ep1%' then 10
  when video_url like '%id=s2-bts-03%' then 11
  when video_url like '%id=ep-01%' then 12
  when video_url like '%id=ep-02%' then 13
  when video_url like '%id=ep-03%' then 14
  when video_url like '%id=ep-04%' then 15
  when video_url like '%id=ep-05%' then 16
  when video_url like '%id=ep-06%' then 17
  when video_url like '%id=ep-07%' then 18
  when video_url like '%id=ep-08%' then 19
  when video_url like '%id=ep-09%' then 20
  when video_url like '%id=ep-10%' then 21
  when video_url like '%id=ep-11%' then 22
  when video_url like '%id=ep-12%' then 23
  when video_url like '%id=bonus-01%' then 24
  when video_url like '%id=bonus-02%' then 25
  when video_url like '%id=bonus-03%' then 26
  when video_url like '%id=bonus-04%' then 27
  when video_url like '%id=bonus-05%' then 28
  when video_url like '%id=bonus-06%' then 29
  when video_url like '%id=extra-01%' then 30
  when video_url like '%id=extra-02%' then 31
  when video_url like '%id=extra-03%' then 32
  when video_url like '%id=extra-04%' then 33
  when video_url like '%id=s2-03%' and video_url not like '%bonus%' then 34
  when video_url like '%id=s2-bts-02%' then 35
  when video_url like '%id=s2-02%' then 36
  when video_url like '%id=s2-bts-01%' then 37
  when video_url like '%id=s2-01%' then 38
  when video_url like '%id=special-01%' then 39
  when video_url like '%id=kapil-01%' then 40
  else 9999
end
where video_url like '%iglll1.freeforall.dev/player%';

-- EP badges follow the same order
update public.videos set episode_number = source_index + 1
where video_url like '%iglll1.freeforall.dev/player%';

-- Verify:
-- select episode_number, category, left(title, 45) from public.videos order by source_index;
