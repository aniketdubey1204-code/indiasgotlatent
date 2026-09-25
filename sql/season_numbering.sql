-- Per-season numbering: S1 = 1-22, S2 = 1-16 (BTS = 13-16), Specials = 1-3.
-- Grid order (source_index) untouched — only EP badges change.
update public.videos set episode_number = case
  when video_url like '%id=ep-01%' then 1
  when video_url like '%id=ep-02%' then 2
  when video_url like '%id=ep-03%' then 3
  when video_url like '%id=ep-04%' then 4
  when video_url like '%id=ep-05%' then 5
  when video_url like '%id=ep-06%' then 6
  when video_url like '%id=ep-07%' then 7
  when video_url like '%id=ep-08%' then 8
  when video_url like '%id=ep-09%' then 9
  when video_url like '%id=ep-10%' then 10
  when video_url like '%id=ep-11%' then 11
  when video_url like '%id=ep-12%' then 12
  when video_url like '%id=bonus-01%' then 13
  when video_url like '%id=bonus-02%' then 14
  when video_url like '%id=bonus-03%' then 15
  when video_url like '%id=bonus-04%' then 16
  when video_url like '%id=bonus-05%' then 17
  when video_url like '%id=bonus-06%' then 18
  when video_url like '%id=extra-01%' then 19
  when video_url like '%id=extra-02%' then 20
  when video_url like '%id=extra-03%' then 21
  when video_url like '%id=extra-04%' then 22
  when video_url like '%id=s2-01%' and video_url not like '%bts%' then 1
  when video_url like '%id=s2-02%' then 2
  when video_url like '%id=s2-03%' and video_url not like '%bonus%' then 3
  when video_url like '%id=s2-04%' then 4
  when video_url like '%id=s2-05%' then 5
  when video_url like '%id=s2-06%' and video_url not like '%rakhi%' then 6
  when video_url like '%id=s2-06-rakhi%' then 7
  when video_url like '%id=s2-07%' then 8
  when video_url like '%id=s2-bonus-ep1%' then 9
  when video_url like '%id=s2-bonus-ep2%' then 10
  when video_url like '%id=s2-03-bonus%' then 11
  when video_url like '%id=s2-bonus-clip-01%' then 12
  when video_url like '%id=s2-bts-01%' then 13
  when video_url like '%id=s2-bts-02%' then 14
  when video_url like '%id=s2-bts-03%' then 15
  when video_url like '%id=s2-bts-04%' then 16
  when video_url like '%id=s2-stillalive%' then 1
  when video_url like '%id=special-01%' then 2
  when video_url like '%id=kapil-01%' then 3
  else episode_number
end
where video_url like '%iglll1.freeforall.dev/player%';
