-- Fix the S2 Bonus EP4 thumbnail (sync saved a fabricated /img/<id>/hq720.jpg URL).
-- Run once in SQL Editor.

update public.videos
set thumbnail_url = 'https://igltalent.freeforall.dev/img/NQ6gWHMvna8.webp'
where video_url = 'https://igltalent.freeforall.dev/player?id=s2-08';

-- Find any other rows with the same broken pattern (freeforall /img/ urls ending in hq720.jpg):
-- select title, thumbnail_url from public.videos
-- where thumbnail_url like '%freeforall.dev/img%/hq720.jpg';
