-- Auto-sync setup: new iglll1 uploads appear here automatically every 10 min.
-- 1. Deploy edge function sync-iglll1 (JWT OFF)
-- 2. Secrets: add CRON_SECRET = <long random> (Edge Functions > Secrets)
-- 3. Run this SQL (replace <CRON_SECRET> and project ref):

-- Unique guard so re-syncs never duplicate
create unique index if not exists videos_video_url_key on public.videos (video_url);

-- Enable scheduling (one time)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Every 10 minutes: call sync function with secret
-- NOTE: replace <CRON_SECRET> and confirm URL matches your project
select cron.schedule(
  'sync-iglll1-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://jybncrrkygihsiyeepzq.supabase.co/functions/v1/sync-iglll1',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Manual trigger test (run once, replace secret):
-- select net.http_post(
--   url := 'https://jybncrrkygihsiyeepzq.supabase.co/functions/v1/sync-iglll1',
--   headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb,
--   body := '{}'::jsonb
-- );

-- View jobs: select * from cron.job;
-- Unschedule: select cron.unschedule('sync-iglll1-10min');
