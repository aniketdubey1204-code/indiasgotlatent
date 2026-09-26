-- Switch source site iglll1 -> igltalent. Run once in SQL Editor.
-- Rewrites stored player + thumbnail URLs to the new domain.
-- The videos_auto_category trigger fires on this update and re-tags categories.

update public.videos
set video_url = replace(video_url, 'iglll1.freeforall.dev', 'igltalent.freeforall.dev')
where video_url like '%iglll1.freeforall.dev%';

update public.videos
set thumbnail_url = replace(thumbnail_url, 'iglll1.freeforall.dev', 'igltalent.freeforall.dev')
where thumbnail_url like '%iglll1.freeforall.dev%';
