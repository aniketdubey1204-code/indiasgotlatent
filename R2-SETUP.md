# Free video hosting: Cloudflare R2 + GitHub Actions (Rs 0)

## Why this
- R2 free tier: **10GB storage, unlimited downloads (zero egress fees)** — all 42
  episodes at 720p fit (~4GB) with room to grow.
- GitHub Actions free tier runs the uploader every 30 min. New videos on the
  source site get mirrored automatically, site rows switch to R2 URLs, playback
  bypasses Supabase entirely.

## Your 10-minute setup
1. **Cloudflare dashboard** (free account) > R2 > Create bucket, e.g. `igl-vault`.
2. Same bucket > Settings > Public access > **Allow public access** via r2.dev.
   Note the public URL: `https://<bucket>.<account-id>.r2.dev`.
3. R2 > Manage R2 API tokens > Create token (Object Read & Write on that bucket).
   Copy Account ID + Access Key + Secret Key.
4. **Supabase** > Project Settings > API > copy `service_role` key
   (secret — never put it in site code, only in GitHub Secrets below).
5. **GitHub repo** > Settings > Secrets and variables > Actions > add:
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`
   - `R2_PUBLIC_BASE` = the r2.dev URL from step 2
   - `SUPABASE_URL` = `https://jybncrrkygihsiyeepzq.supabase.co`
   - `SUPABASE_SERVICE_KEY`
6. Actions tab > `mirror-to-r2` > Run workflow. First run backfills everything
   (~30-60 min). Watch it turn green.

## Notes
- Episodes mirror at **720p max** to stretch the 10GB. Quality picker still works
  for source-proxied rows; R2 rows play direct mp4.
- If R2 fills up, the script auto-deletes oldest files and those rows fall back
  to player URLs (still playable via Supabase proxy, burns a little quota).
- Keep `sync-iglll1` cron running — it inserts new rows, the mirror upgrades them.
