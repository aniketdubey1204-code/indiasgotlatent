"""
IGL Auto-Sync Pipeline
======================
Jab bhi igltalent.freeforall.dev pe naya video aaye, bas yeh chalao:

    python sync.py

Yeh automatically:
  1. okcdn.json fetch karta hai (source site se)
  2. Naye videos detect karta hai (jo abhi tak archive nahi hue)
  3. Unhe D:\\IGL me download karta hai (okcdn CDN se, YouTube fallback)
  4. archive.org pe upload karta hai
  5. js/videos.js catalog rebuild karta hai
  6. git commit + push karta hai (site live ho jati hai)

Flags:
  --dry-run     Kuch bhi download/upload/push nahi, sirf dikhata hai kya hoga
  --no-push     Git push skip (local test ke liye)
  --force       Already uploaded videos bhi re-upload kare
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
DOWNLOAD_DIR = Path(r"D:\IGL")

ARCHIVE_URLS_FILE = SCRIPTS_DIR / "archive_urls.json"
OKCDN_CACHE_FILE  = SCRIPTS_DIR / "okcdn_cached.json"
VIDEOS_JS_FILE    = JS_DIR / "videos.js"

SITE          = "https://igltalent.freeforall.dev"
OKCDN_JSON    = f"{SITE}/okcdn.json"
OKCDN_WORKER  = "https://okcdn.baapall2.workers.dev"

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
    """Episodes jo abhi tak download+upload nahi hue"""
    # Build set of already-handled dataIds from filenames in D:\IGL
    downloaded_ids = set()
    if DOWNLOAD_DIR.exists():
        for f in DOWNLOAD_DIR.glob("*.mp4"):
            m = re.search(r'\[([^\]]+)\]', f.stem)
            if m:
                downloaded_ids.add(m.group(1))

    # Already uploaded identifiers
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
        if FORCE:
            new_eps.append(ep)
        elif did not in downloaded_ids or did not in uploaded_idents:
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
        with urllib.request.urlopen(req, timeout=600, context=ssl_ctx) as resp:
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

def detect_category(ep, filename=""):
    s = f"{ep.get('season','')}{ep.get('dataId','')}{ep.get('title','')}{filename}".lower()
    s2 = ep.get("season") == "s2" or bool(re.search(r'\bs2\b|season 2', s))
    if re.search(r'bts|behind', s):     return "s2bts" if s2 else "s1bts"
    if re.search(r'special|kapil|documentary|still alive', s): return "special"
    if re.search(r'bonus|extra|discarded|deleted', s): return "s2bonus" if s2 else "s1bonus"
    if s2: return "season2"
    if re.match(r'^(ep-|bonus-|extra-)', ep.get("dataId","")): return "season1"
    return "s2bonus" if s2 else "s1bonus"

def extract_ep_num(title, data_id):
    m = re.search(r'EP\s*(\d+)', title, re.IGNORECASE)
    if m: return int(m.group(1))
    m2 = re.search(r'(?:ep|bonus|bts|extra)-?(\d+)', data_id, re.IGNORECASE)
    if m2: return int(m2.group(1))
    return 1

def rebuild_catalog(episodes):
    log("CATALOG", "Rebuilding js/videos.js ...")
    archive_urls = load_json(ARCHIVE_URLS_FILE)
    ep_map = {e.get("dataId"): e for e in episodes if e.get("dataId")}

    # Build filename → dataId index from D:\IGL
    files = {}
    if DOWNLOAD_DIR.exists():
        for f in DOWNLOAD_DIR.glob("*.mp4"):
            m = re.search(r'\[([^\]]+)\]', f.stem)
            if m:
                files[m.group(1)] = f

    catalog = []
    for did, ep in ep_map.items():
        ident = make_identifier(did)
        title = ep.get("title") or did
        desc  = ep.get("description", "")
        yt_id = ep.get("youtubeId")

        # Get filename from local files or reconstruct
        f = files.get(did)
        filename = f.name if f else safe_filename(title, did)

        # Thumbnail: YouTube first, then source site
        if yt_id:
            thumb = f"https://i.ytimg.com/vi/{yt_id}/hqdefault.jpg"
        elif ep.get("thumbnail") and "ytimg.com" in ep.get("thumbnail",""):
            thumb = ep["thumbnail"]
        elif ep.get("thumbnail"):
            thumb = ep["thumbnail"]
        else:
            thumb = f"https://archive.org/services/img/{ident}"

        direct_url = f"https://archive.org/download/{ident}/{urllib.parse.quote(filename)}"

        catalog.append({
            "id":            did,
            "dataId":        did,
            "archive_id":    ident,
            "title":         title,
            "description":   desc,
            "category":      detect_category(ep, filename),
            "episode_number": extract_ep_num(title, did),
            "duration":      ep.get("duration", ""),
            "thumbnail_url": thumb,
            "video_url":     direct_url,
            "archive_url":   f"https://archive.org/details/{ident}",
            "filename":      filename,
            "youtubeId":     yt_id,
        })

    def sort_key(item):
        cat_order = {"season1":1,"s1bonus":2,"s1bts":3,"season2":4,"s2bonus":5,"s2bts":6,"special":7}
        return (cat_order.get(item["category"], 99), item["episode_number"], item["title"])
    catalog.sort(key=sort_key)

    js = "// IGL Fan Archive — auto-generated catalog (archive.org hosted)\n"
    js += "// Run scripts/sync.py to update when new episodes are added\n"
    js += f"const LOCAL_VIDEOS = {json.dumps(catalog, indent=2, ensure_ascii=False)};\n\n"
    js += "if (typeof module !== 'undefined' && module.exports) { module.exports = LOCAL_VIDEOS; }\n"

    VIDEOS_JS_FILE.write_text(js, encoding="utf-8")
    log("OK", f"videos.js written — {len(catalog)} episodes")
    return catalog

# ──────────────────────────────────────────────
# Step 6 — Git commit + push
# ──────────────────────────────────────────────

def git_push(new_titles):
    if DRY_RUN or NO_PUSH:
        log("DRY" if DRY_RUN else "SKIP", "Git push skipped")
        return

    log("GIT", "Staging and committing ...")
    subprocess.run(["git", "add", "js/videos.js"], cwd=BASE_DIR)
    msg = f"sync: add {len(new_titles)} new episode(s) — {', '.join(new_titles[:3])}"
    if len(new_titles) > 3:
        msg += f" (+{len(new_titles)-3} more)"
    result = subprocess.run(
        ["git", "commit", "-m", msg],
        cwd=BASE_DIR, capture_output=True, text=True
    )
    if "nothing to commit" in result.stdout + result.stderr:
        log("GIT", "Nothing new to commit")
        return
    log("GIT", f"Commit: {result.stdout.strip()}")
    push = subprocess.run(
        ["git", "push", "origin", "main"],
        cwd=BASE_DIR, capture_output=True, text=True
    )
    if push.returncode == 0:
        log("GIT", "Pushed! Site will redeploy on Vercel automatically.")
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

    # 1. Fetch source
    episodes = fetch_episodes()

    # 2. Load existing archive data
    archive_urls = load_json(ARCHIVE_URLS_FILE)

    # 3. Find new episodes
    new_eps = find_new_episodes(episodes, archive_urls)
    if not new_eps:
        log("INFO", "No new episodes found — everything is up to date!")
        log("INFO", "Re-building catalog anyway to ensure it's fresh...")
        rebuild_catalog(episodes)
        log("DONE", "Catalog is up to date. Run with --force to re-upload everything.")
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
        print(f"\n[{i}/{len(new_eps)}] {title[:60]}")

        # 3. Download
        filepath, dl_ok = download_episode(ep)
        if not dl_ok:
            log("FAIL", f"Download failed for {data_id}")
            fail += 1
            continue

        # 4. Upload
        archive_url = upload_to_archive(filepath, title, data_id)
        if archive_url:
            archive_urls[filepath.name] = archive_url
            save_json(ARCHIVE_URLS_FILE, archive_urls)
            added_titles.append(title)
            ok += 1
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
