# IGL Website — Master Context Transfer Prompt

> **Is document ko kisi bhi AI ko do aur wo directly kaam continue kar dega.**

---

## Project Overview

**Website:** India's Got Latent — Fan Archive (video streaming platform)
**Live URL:** https://indiasgotlatent-opal.vercel.app
**Source Site:** https://igltalent.freeforall.dev
**Content Owner:** User owns rights to all IGL episodes (uncopyrighted fan archive)

---

## Current Status (as of Oct 1, 2026)

### Completed
- [x] Static site with cinematic dark theme (index.html, css/styles.css, js/)
- [x] Auth: Telegram widget + Email OTP + Google OAuth
- [x] Video player v2: up-next, autoplay, resume, ambient glow, theater mode, share links
- [x] Category system: S1, S1 Bonus, S1 BTS, S2, S2 Bonus, S2 BTS, Specials
- [x] Admin panel: add/edit/delete videos
- [x] Download scripts created and working
- [x] 40+ videos downloaded to D:\IGL
- [x] 10 videos uploaded to archive.org

### In Progress
- [ ] Uploading remaining ~30 videos to archive.org
- [ ] Switching site from Supabase to archive.org direct links
- [ ] Fixing thumbnails (Supabase restricted — egress quota exceeded)

### Blocked
- **Supabase project RESTRICTED** — `exceed_egress_quota`. Database, thumb proxy, stream proxy all return 402. Owner must remove spend cap in Supabase Dashboard → Billing.
- **YouTube mirror channel blocked** — all videos show "Video unavailable" (copyright claim). Cannot download from YouTube.

---

## Key File Paths

| File | Purpose |
|---|---|
| `C:\Users\anike\OneDrive\Documents\Default Project\index.html` | Main site markup |
| `C:\Users\anike\OneDrive\Documents\Default Project\css\styles.css` | Cinematic theme |
| `C:\Users\anike\OneDrive\Documents\Default Project\js\app.js` | Main app logic (loadVideos, renderRail, openPlayer, setHero) |
| `C:\Users\anike\OneDrive\Documents\Default Project\js\config.js` | Supabase URL, keys, worker URLs |
| `C:\Users\anike\OneDrive\Documents\Default Project\js\auth.js` | Telegram/Email/Google auth |
| `C:\Users\anike\OneDrive\Documents\Default Project\js\admin.js` | Admin panel logic |
| `C:\Users\anike\OneDrive\Documents\Default Project\scripts\download_from_site.py` | Downloads videos from igltalent.freeforall.dev → D:\IGL |
| `C:\Users\anike\OneDrive\Documents\Default Project\scripts\auto_upload_archive.py` | Uploads D:\IGL videos → archive.org |
| `C:\Users\anike\OneDrive\Documents\Default Project\scripts\archive_urls.json` | Maps filename → archive.org URL |
| `D:\IGL\` | Downloaded videos storage |

---

## Credentials & Config

### Supabase (RESTRICTED — needs spend cap removal)
```
URL: https://jybncrrkygihsiyeepzq.supabase.co
ANON_KEY: sb_publishable_7zZ_4WpwXM5Dhuwbz_7iOw_1O74Dykv
```

### Archive.org S3-like API
```
ACCESS_KEY: EXPsQkXe2s8ht0H
SECRET_KEY: 96xCwf8keeEf0tFj
```

### Source Site
```
OKCDN_JSON: https://igltalent.freeforall.dev/okcdn.json
OKCDN_WORKER: https://okcdn.baapall2.workers.dev (from /config.json)
```

### Telegram Bot
```
BOT_NAME: Latentttbot
```

---

## Scripts

### 1. Download from Site
```bash
python "C:\Users\anike\OneDrive\Documents\Default Project\scripts\download_from_site.py"
```
- Fetches okcdn.json → resolves CDN URLs → downloads to D:\IGL
- Skips already downloaded files
- Handles okcdn (direct CDN) + YouTube (yt-dlp) types
- SSL verification disabled for okcdn.ru CDN

### 2. Upload to Archive.org
```bash
python "C:\Users\anike\OneDrive\Documents\Default Project\scripts\auto_upload_archive.py"
```
- Uploads all D:\IGL/*.mp4 to archive.org
- Uses `ia` CLI (already configured)
- Saves URLs to `scripts/archive_urls.json`
- Dry-run: add `--dry-run` flag

---

## What To Do Next (Priority Order)

### Step 1: Upload Remaining Videos to Archive.org
```bash
python "C:\Users\anike\OneDrive\Documents\Default Project\scripts\auto_upload_archive.py"
```
- ~30 videos still need upload (10 already done)
- Each video: 0.3-1.8 GB, takes 2-10 min per upload
- If upload fails with connection error, just re-run — it skips existing

### Step 2: Update Website to Use Archive.org Links
Once uploads complete, update `js/config.js` and `js/app.js`:
- Replace Supabase video URLs with archive.org direct MP4 links
- Archive.org direct URL format: `https://archive.org/download/<identifier>/<filename>.mp4`
- Update `thumbSrc()` to use archive.org thumbnails or direct image URLs
- Remove Supabase dependency for video playback

### Step 3: Fix Thumbnails
- Supabase thumb proxy is down (402)
- Use archive.org thumbnails directly, or
- Use YouTube thumbnail URLs from okcdn.json (i.ytimg.com)

### Step 4: Fix Video Playback
- Supabase stream proxy is down (402)
- Use archive.org direct MP4 links in `<video>` tag
- For YouTube videos: use YouTube embed (if not blocked) or archive.org mirror

### Step 5: Redeploy to Vercel
```bash
git add -A
git commit -m "Switch to archive.org hosting, fix thumbnails"
git push origin main
```

---

## Video Data Structure (okcdn.json)

Each episode has:
```json
{
  "id": "6ab8f388c14cb415cd377a11",        // CDN ID (for worker)
  "dataId": "s2-08",                        // Display ID
  "title": "INDIA'S GOT LATENT S2 Bonus EP 4 ft. ...",
  "type": "okcdn" | "youtube" | "mp4",
  "youtubeId": "NQ6gWHMvna8",              // YouTube ID (if available)
  "thumbnail": "https://i.ytimg.com/vi/.../hqdefault.jpg",
  "season": "s2",
  "duration": "34m",
  "description": "..."
}
```

### Worker Response Format
```
GET https://okcdn.baapall2.workers.dev/?id=<ep.id>
Headers: Origin: https://igltalent.freeforall.dev, Referer: https://igltalent.freeforall.dev/

Response: {
  "status": "success",
  "streams": [
    {"url": "https://vd691.okcdn.ru/...", "type": "144p"},
    {"url": "https://vd691.okcdn.ru/...", "type": "240p"},
    {"url": "https://vd691.okcdn.ru/...", "type": "360p"},
    {"url": "https://vd691.okcdn.ru/...", "type": "2k"}
  ]
}
```

---

## Archive.org Upload Format

```bash
ia upload <identifier> <filepath> \
  --metadata "title:<title>" \
  --metadata "collection:opensource_movies" \
  --metadata "mediatype:movies" \
  --metadata "description:India's Got Latent — <title> (Fan Archive)" \
  --metadata "creator:India's Got Latent" \
  --metadata "subject:India's Got Latent; Comedy; Reality; Talent" \
  --metadata "licenseurl:https://creativecommons.org/licenses/by/4.0/"
```

Identifier format: `igl-<dataId>` (e.g., `igl-s2-08`, `igl-ep-01`)

---

## Important Notes

1. **Supabase is RESTRICTED** — do not try to use Supabase APIs until owner removes spend cap
2. **YouTube downloads blocked** — use okcdn worker or already downloaded files
3. **okcdn.ru CDN has SSL issues** — script already handles with SSL verification disabled
4. **Worker needs Origin + Referer headers** — without them returns 403
5. **ia CLI already configured** — user ran `ia configure` with archive.org credentials
6. **D:\IGL path** — use raw strings in Python (r"D:\IGL") to avoid escape issues
7. **Pipe characters in filenames** — use `-LiteralPath` in PowerShell, not regular paths

---

## Quick Start for New AI

1. Read this document
2. Run: `python "C:\Users\anike\OneDrive\Documents\Default Project\scripts\auto_upload_archive.py"`
3. Wait for upload to complete (2-4 hours for ~30 videos)
4. Read `scripts/archive_urls.json` for all uploaded URLs
5. Update `js/config.js` and `js/app.js` to use archive.org links
6. Redeploy: `git add -A && git commit -m "Archive.org hosting" && git push origin main`
