"""
IGL Auto-Sync Pipeline
======================
Jab bhi igltalent.freeforall.dev pe naya video aaye, yeh script:
  1. okcdn.json fetch karta hai (source site se)
  2. Naye videos detect karta hai (jo abhi tak archive.org pe nahi hain)
  3. Download karta hai (CDN se, YouTube fallback)
  4. archive.org pe upload karta hai
  5. Runner/local space bachane ke liye uploaded video delete karta hai (CI mode me)
  6. js/videos.js catalog & scripts/archive_urls.json update karta hai
  7. git commit + push karta hai (Vercel auto-deploy trigger hota hai)

Can run locally or in GitHub Actions on schedule!
"""

import subprocess
import sys
import os
import json
import re
import time
import ssl
import urllib.request
import urllib.parse
from pathlib import Path

# ──────────────────────────────────────────────
# Paths & Config
# ──────────────────────────────────────────────
BASE_DIR     = Path(__file__).parent.parent
SCRIPTS_DIR  = BASE_DIR / "scripts"
JS_DIR       = BASE_DIR / "js"

# Downloads directory (local D:\IGL fallback to repo/downloads)
DEFAULT_DL   = Path(r"D:\IGL") if os.name == "nt" and Path(r"D:\IGL").exists() else BASE_DIR / "downloads"
DOWNLOAD_DIR = Path(os.environ.get("DOWNLOAD_DIR", str(DEFAULT_DL)))

ARCHIVE_URLS_FILE = SCRIPTS_DIR / "archive_urls.json"
OKCDN_CACHE_FILE  = SCRIPTS_DIR / "okcdn_cached.json"
VIDEOS_JS_FILE    = JS_DIR / "videos.js"

SITE          = "https://igltalent.freeforall.dev"
OKCDN_JSON    = f"{SITE}/okcdn.json"
OKCDN_WORKER  = "https://okcdn.baapall2.workers.dev"

# Clean up local video after upload? True in GitHub Actions to save runner disk space
CLEANUP_AFTER_UPLOAD = os.environ.get(
    "CLEANUP_AFTER_UPLOAD",
    "true" if os.environ.get("GITHUB_ACTIONS") else "false"
).lower() == "true"

# SSL context (okcdn CDN has self-signed cert)
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Referer": SITE + "/",
    "Accept": "application/json",
    "Origin": SITE,
}

DRY_RUN  = "--dry-run" in sys.argv
NO_PUSH  = "--no-push" in sys.argv
FORCE    = "--force"   in sys.argv

# ──────────────────────────────────────────────
# Credentials
# ──────────────────────────────────────────────

def ensure_ia_config():
    """Ensure ia CLI has S3 credentials from env or fallback"""
    access = os.environ.get("IA_ACCESS_KEY_ID", "EXPs0qKXe2s8HtOH")
    secret = os.environ.get("IA_SECRET_ACCESS_KEY", "96xCWf8keeEFOtFj")
    os.environ["IA_ACCESS_KEY_ID"] = access
    os.environ["IA_SECRET_ACCESS_KEY"] = secret

    # Write ~/.config/internetarchive/ia.ini if missing
    try:
        cfg_dir = Path.home() / ".config" / "internetarchive"
        cfg_file = cfg_dir / "ia.ini"
        if not cfg_file.exists():
            cfg_dir.mkdir(parents=True, exist_ok=True)
            cfg_file.write_text(f"[s3]\naccess = {access}\nsecret = {secret}\n", encoding="utf-8")
    except Exception:
        pass

# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def log(tag, msg):
    print(f"[{tag}] {msg}")

def load_json(path):
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# ──────────────────────────────────────────────
# Step 1 — Fetch okcdn.json
# ──────────────────────────────────────────────

def fetch_episodes():
    log("FETCH", OKCDN_JSON)
    req = urllib.request.Request(OKCDN_JSON, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    save_json(OKCDN_CACHE_FILE, data)
    log("INFO", f"{len(data)} episodes found on source site")
    return data

# ──────────────────────────────────────────────
# Step 2 — Detect new episodes
# ──────────────────────────────────────────────

def find_new_episodes(episodes, archive_urls):
    """Detect episodes that are not yet uploaded to archive.org"""
    uploaded_idents = set()
    for filename, url in archive_urls.items():
        if url:
            m = re.search(r'\[([^\]]+)\]', Path(filename).stem)
            if m:
                uploaded_idents.add(m.group(1))

    new_eps = []
    for ep in episodes:
        did = ep.get("dataId", "")
        if not did:
            continue
        if FORCE or (did not in uploaded_idents):
            new_eps.append(ep)

    return new_eps

# ──────────────────────────────────────────────
# Step 3 — Download
# ──────────────────────────────────────────────

def safe_filename(title, data_id):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', title)
    name = re.sub(r'\s+', ' ', name).strip()[:80]
    return f"{name} [{data_id}].mp4"

def resolve_okcdn_url(ep_id):
    try:
        req = urllib.request.Request(f"{OKCDN_WORKER}/?id={ep_id}", headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        streams = data.get("streams", [])
        if streams:
            def q(s):
                t = s.get("type", "0").lower().replace("p", "")
                if t == "2k": return 2160
                if t == "4k": return 4320
                try: return int(t)
                except: return 0
            best = max(streams, key=q)
            return best.get("url")
        return data.get("url") or data.get("stream_url") or data.get("download_url")
    except Exception as e:
        log("WARN", f"CDN resolve failed for {ep_id}: {e}")
        return None

def download_file(url, dest):
    log("DL", f"{dest.name} from CDN")
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": HEADERS["User-Agent"],
            "Referer": SITE + "/"
        })
        total = 0
        with urllib.request.urlopen(req, timeout=900, context=ssl_ctx) as resp:
            with open(dest, "wb") as f:
                while True:
                    chunk = resp.read(1024 * 1024)  # 1 MB chunks
                    if not chunk:
                        break
                    f.write(chunk)
                    total += len(chunk)
                    print(f"\r  {total / (1024*1024):.1f} MB downloaded...", end="", flush=True)
        print()
        log("OK", f"{dest.stat().st_size / (1024*1024):.1f} MB — {dest.name}")
        return True
    except Exception as e:
        log("ERROR", f"Download failed: {e}")
        if dest.exists():
            dest.unlink()
        return False

def download_youtube(yt_id, dest):
    log("YT", f"Downloading youtube.com/watch?v={yt_id}")
    if DRY_RUN:
        log("DRY", "Skip YouTube download")
        return False
    cmd = [
        "yt-dlp",
        "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        "--merge-output-format", "mp4",
        "--no-warnings",
        "-o", str(dest),
        f"https://www.youtube.com/watch?v={yt_id}"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0 and dest.exists() and dest.stat().st_size > 1024*1024:
        log("OK", f"{dest.stat().st_size / (1024*1024):.1f} MB — {dest.name}")
        return True
    log("ERROR", result.stderr[-300:])
    return False

def download_episode(ep):
    data_id  = ep.get("dataId", "")
    title    = ep.get("title", data_id)
    ep_type  = ep.get("type", "okcdn")
    yt_id    = ep.get("youtubeId", "")
    cdn_id   = ep.get("id", "")

    filename = safe_filename(title, data_id)
    dest     = DOWNLOAD_DIR / filename

    if dest.exists() and dest.stat().st_size > 1024 * 1024:
        log("SKIP", f"Already downloaded: {filename}")
        return dest, True

    if DRY_RUN:
        log("DRY", f"Would download: {filename} (type={ep_type})")
        return dest, True

    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

    if ep_type == "okcdn" and cdn_id:
        cdn_url = resolve_okcdn_url(cdn_id)
        if cdn_url:
            ok = download_file(cdn_url, dest)
            if ok:
                return dest, True
        # Fallback to YouTube
        if yt_id:
            log("FALLBACK", "CDN failed, trying YouTube")
            ok = download_youtube(yt_id, dest)
            return dest, ok
    elif ep_type == "youtube" and yt_id:
        ok = download_youtube(yt_id, dest)
        return dest, ok

    log("ERROR", f"Could not download {data_id}")
    return dest, False

# ──────────────────────────────────────────────
# Step 4 — Upload to archive.org
# ──────────────────────────────────────────────

def make_identifier(data_id):
    ident = f"igl-{data_id.lower().replace(' ', '-').replace('_', '-')}"
    return re.sub(r'[^a-z0-9\-]', '-', ident)[:80]

def upload_to_archive(filepath, title, data_id):
    identifier = make_identifier(data_id)
    log("UPLOAD", f"{filepath.name} → {identifier}")
    log("INFO", f"  Size: {filepath.stat().st_size / (1024**3):.2f} GB")

    if DRY_RUN:
        log("DRY", f"Would upload as {identifier}")
        return f"https://archive.org/details/{identifier}"

    cmd = [
        "ia", "upload", identifier, str(filepath),
        "-R", "3", "-s", "10",
        "--metadata", f"title:{title}",
        "--metadata", "collection:opensource_movies",
        "--metadata", "mediatype:movies",
        "--metadata", f"description:India's Got Latent — {title} (Fan Archive)",
        "--metadata", "creator:India's Got Latent",
        "--metadata", "subject:India's Got Latent; Comedy; Reality; Talent",
        "--metadata", "licenseurl:https://creativecommons.org/licenses/by/4.0/",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
        if result.returncode == 0:
            url = f"https://archive.org/details/{identifier}"
            log("OK", url)
            return url
        err = (result.stderr or result.stdout or "Unknown").strip()
        log("ERROR", err[:300])
        return None
    except subprocess.TimeoutExpired:
        log("ERROR", "Upload timeout")
        return None
    except Exception as e:
        log("ERROR", str(e))
        return None

# ──────────────────────────────────────────────
# Step 5 — Rebuild videos.js catalog
# ──────────────────────────────────────────────

CANONICAL_EPISODES = [
    # Season 1 Main Episodes (1 to 12)
    ('ep-01', 'season1', 1, 101),
    ('ep-02', 'season1', 2, 102),
    ('ep-03', 'season1', 3, 103),
    ('ep-04', 'season1', 4, 104),
    ('ep-05', 'season1', 5, 105),
    ('ep-06', 'season1', 6, 106),
    ('ep-07', 'season1', 7, 107),
    ('ep-08', 'season1', 8, 108),
    ('ep-09', 'season1', 9, 109),
    ('ep-10', 'season1', 10, 110),
    ('ep-11', 'season1', 11, 111),
    ('ep-12', 'season1', 12, 112),

    # Season 1 Bonus Segments & Extras (in order of release)
    ('bonus-01', 's1bonus', 1, 151),
    ('bonus-02', 's1bonus', 2, 152),
    ('bonus-03', 's1bonus', 3, 153),
    ('bonus-04', 's1bonus', 4, 154),
    ('bonus-05', 's1bonus', 5, 155),
    ('bonus-06', 's1bonus', 6, 156),
    ('extra-01', 's1bonus', 7, 157),
    ('extra-02', 's1bonus', 8, 158),
    ('extra-03', 's1bonus', 9, 159),
    ('extra-04', 's1bonus', 10, 160),

    # Season 2 Episodes, Bonus & BTS (in exact release chronology)
    ('s2-01', 'season2', 1, 201),
    ('s2-bts-01', 's2bts', 1, 202),
    ('s2-02', 'season2', 2, 203),
    ('s2-bts-02', 's2bts', 2, 204),
    ('s2-03', 'season2', 3, 205),
    ('s2-bts-03', 's2bts', 3, 206),
    ('s2-bonus-ep1', 's2bonus', 1, 207),
    ('s2-04', 'season2', 4, 208),
    ('s2-bonus-clip-01', 's2bonus', 2, 209),
    ('s2-bts-04', 's2bts', 4, 210),
    ('s2-bonus-ep2', 's2bonus', 3, 211),
    ('s2-05', 'season2', 5, 212),
    ('s2-06', 'season2', 6, 213),
    ('s2-06-rakhi', 'season2', 6, 214),
    ('s2-03-bonus', 's2bonus', 4, 215),
    ('s2-07', 'season2', 7, 216),
    ('s2-08', 'season2', 8, 217),  # Latest Drop!

    # Specials
    ('special-01', 'special', 1, 301),
    ('s2-stillalive', 'special', 2, 302),
    ('kapil-01', 'special', 3, 303),
]

def resolve_thumbnail(ep, ident):
    yt = ep.get("youtubeId")
    loc = ep.get("localImage", "")
    loc_stem = loc.replace(".webp", "").strip() if loc.endswith(".webp") else ""
    resolved_yt = yt or (loc_stem if len(loc_stem) == 11 else None)

    if resolved_yt:
        return f"https://i.ytimg.com/vi/{resolved_yt}/maxresdefault.jpg", resolved_yt
    if loc:
        local_path = BASE_DIR / "assets" / "thumbs" / loc
        if local_path.exists():
            return f"/assets/thumbs/{loc}", None
        return f"https://igltalent.freeforall.dev/img/{loc}", None
    raw_thumb = ep.get("thumbnail", "")
    if "ytimg.com" in raw_thumb:
        return raw_thumb.replace("hqdefault.jpg", "maxresdefault.jpg"), None
    if "indiassgottlatent" in raw_thumb:
        return raw_thumb.replace("indiassgottlatent.freeforall.dev", "igltalent.freeforall.dev"), None
    if raw_thumb.startswith("http"):
        return raw_thumb, None
    return f"https://archive.org/services/img/{ident}", None

def rebuild_catalog(episodes):
    log("CATALOG", "Rebuilding js/videos.js ...")
    archive_urls = load_json(ARCHIVE_URLS_FILE)
    ep_map = {e.get("dataId"): e for e in episodes if e.get("dataId")}

    # Index filenames from archive_urls keys or local directory
    files_by_id = {}
    for fname in archive_urls.keys():
        m = re.search(r'\[([^\]]+)\]', Path(fname).stem)
        if m:
            files_by_id[m.group(1)] = fname

    if DOWNLOAD_DIR.exists():
        for f in DOWNLOAD_DIR.glob("*.mp4"):
            m = re.search(r'\[([^\]]+)\]', f.stem)
            if m:
                files_by_id[m.group(1)] = f.name

    canon_map = {item[0]: item for item in CANONICAL_EPISODES}
    catalog = []

    for did, ep in ep_map.items():
        ident = make_identifier(did)
        title = ep.get("title") or did
        desc  = ep.get("description", "")
        duration = ep.get("duration", "")
        loc = ep.get("localImage", "")

        filename = files_by_id.get(did) or safe_filename(title, did)
        direct_url = f"https://archive.org/download/{ident}/{urllib.parse.quote(filename)}"
        thumb, yt_id = resolve_thumbnail(ep, ident)

        if did in canon_map:
            _, category, ep_num, sort_idx = canon_map[did]
        else:
            category = "season2" if ep.get("season") == "s2" else "season1"
            ep_num = 99
            sort_idx = 250

        catalog.append({
            "id":            did,
            "dataId":        did,
            "archive_id":    ident,
            "title":         title,
            "description":   desc,
            "category":      category,
            "episode_number": ep_num,
            "sort_index":    sort_idx,
            "duration":      duration,
            "thumbnail_url": thumb,
            "video_url":     direct_url,
            "archive_url":   f"https://archive.org/details/{ident}",
            "filename":      filename,
            "youtubeId":     yt_id,
            "localImage":    loc,
        })

    catalog.sort(key=lambda x: x.get("sort_index", 9999))

    js = "// IGL Fan Archive — chronological catalog (archive.org hosted)\n"
    js += "// Generated automatically — 100% reliable direct CDN & YouTube thumbnails\n"
    js += f"const LOCAL_VIDEOS = {json.dumps(catalog, indent=2, ensure_ascii=False)};\n\n"
    js += "if (typeof module !== 'undefined' && module.exports) { module.exports = LOCAL_VIDEOS; }\n"

    VIDEOS_JS_FILE.write_text(js, encoding="utf-8")
    log("OK", f"videos.js written — {len(catalog)} episodes in true chronological order")
    return catalog

def ensure_thumbnail(ep):
    """
    Downloads high-res WebP thumbnail for new episodes directly to assets/thumbs/
    so Vercel serves it in Full HD with zero latency.
    """
    loc = ep.get("localImage", "")
    if loc:
        thumbs_dir = BASE_DIR / "assets" / "thumbs"
        thumbs_dir.mkdir(parents=True, exist_ok=True)
        dest = thumbs_dir / loc
        if not dest.exists() or dest.stat().st_size == 0:
            url = f"https://igltalent.freeforall.dev/img/{loc}"
            try:
                req = urllib.request.Request(url, headers={
                    "User-Agent": HEADERS["User-Agent"],
                    "Referer": SITE + "/"
                })
                with urllib.request.urlopen(req, timeout=15) as res:
                    dest.write_bytes(res.read())
                log("THUMB", f"Saved high-res thumbnail: {loc} ({dest.stat().st_size / 1024:.1f} KB)")
            except Exception as e:
                log("WARN", f"Could not pre-download thumbnail {loc}: {e}")

# ──────────────────────────────────────────────
# Step 6 — Git commit + push
# ──────────────────────────────────────────────

def git_push(new_titles):
    if DRY_RUN or NO_PUSH:
        log("DRY" if DRY_RUN else "SKIP", "Git push skipped")
        return

    log("GIT", "Configuring git user...")
    subprocess.run(["git", "config", "user.name", "github-actions[bot]"], cwd=BASE_DIR)
    subprocess.run(["git", "config", "user.email", "github-actions[bot]@users.noreply.github.com"], cwd=BASE_DIR)

    log("GIT", "Staging files...")
    subprocess.run(["git", "add", "js/videos.js", "scripts/archive_urls.json", "scripts/okcdn_cached.json", "assets/thumbs/"], cwd=BASE_DIR)

    msg = f"auto-sync: add {len(new_titles)} new episode(s) — {', '.join(new_titles[:3])}"
    if len(new_titles) > 3:
        msg += f" (+{len(new_titles)-3} more)"

    result = subprocess.run(
        ["git", "commit", "-m", msg],
        cwd=BASE_DIR, capture_output=True, text=True
    )
    if "nothing to commit" in (result.stdout + result.stderr):
        log("GIT", "Nothing new to commit")
        return

    log("GIT", f"Commit: {result.stdout.strip()}")
    push = subprocess.run(
        ["git", "push", "origin", "main"],
        cwd=BASE_DIR, capture_output=True, text=True
    )
    if push.returncode == 0:
        log("GIT", "Pushed successfully! Vercel redeploy triggered.")
    else:
        log("ERROR", f"Push failed: {push.stderr.strip()}")

# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────

def main():
    print("=" * 60)
    print("IGL Auto-Sync Pipeline")
    if DRY_RUN: print("[MODE] DRY RUN — nothing will actually change")
    print("=" * 60)

    ensure_ia_config()

    # 1. Fetch source
    episodes = fetch_episodes()

    # 2. Load existing archive data
    archive_urls = load_json(ARCHIVE_URLS_FILE)

    # 3. Find new episodes
    new_eps = find_new_episodes(episodes, archive_urls)
    if not new_eps:
        log("INFO", "No new episodes found — all episodes already archived!")
        log("INFO", "Re-building catalog anyway to ensure fresh state...")
        rebuild_catalog(episodes)
        log("DONE", "Everything up to date.")
        return

    print(f"\n{'='*60}")
    print(f"New episodes found: {len(new_eps)}")
    for ep in new_eps:
        print(f"  + [{ep.get('dataId')}] {ep.get('title','')[:60]}")
    print(f"{'='*60}\n")

    added_titles = []
    ok = fail = 0

    for i, ep in enumerate(new_eps, 1):
        data_id = ep.get("dataId", "")
        title   = ep.get("title", data_id)
        # 3a. Pre-download HD thumbnail to assets/thumbs/
        ensure_thumbnail(ep)

        # 3b. Download video
        filepath, dl_ok = download_episode(ep)
        if not dl_ok:
            log("FAIL", f"Download failed for {data_id}")
            fail += 1
            continue

        # 4. Upload to Archive.org
        archive_url = upload_to_archive(filepath, title, data_id)
        if archive_url:
            archive_urls[filepath.name] = archive_url
            save_json(ARCHIVE_URLS_FILE, archive_urls)
            added_titles.append(title)
            ok += 1

            # Clean up local file if requested (CI mode)
            if CLEANUP_AFTER_UPLOAD and filepath.exists():
                try:
                    filepath.unlink()
                    log("CLEANUP", f"Deleted local file to free disk space: {filepath.name}")
                except Exception as e:
                    log("WARN", f"Could not delete local file: {e}")
        else:
            archive_urls[filepath.name] = None
            save_json(ARCHIVE_URLS_FILE, archive_urls)
            log("FAIL", f"Upload failed for {data_id}")
            fail += 1

        time.sleep(2)

    # 5. Rebuild catalog
    rebuild_catalog(episodes)

    # 6. Git push
    if added_titles:
        git_push(added_titles)

    print(f"\n{'='*60}")
    print(f"[DONE] Sync complete!")
    print(f"  Added:  {ok}")
    print(f"  Failed: {fail}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
