"""
IGL Site Downloader — igltalent.freeforall.dev se saari videos download karta hai
Supports: okcdn (direct CDN) + youtube (yt-dlp)
Usage: python download_from_site.py
"""

import subprocess
import sys
import os
import json
import re
import time
import urllib.request
import ssl
from pathlib import Path

# Disable SSL verification for okcdn CDN (self-signed certs)
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

DOWNLOAD_DIR = Path(r"D:\IGL")
SITE = "https://igltalent.freeforall.dev"
OKCDN_JSON = f"{SITE}/okcdn.json"
OKCDN_WORKER = "https://okcdn.baapall2.workers.dev"

def ensure_deps():
    """yt-dlp install karta hai agar nahi hai"""
    try:
        subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
        print("[OK] yt-dlp already installed")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("[INSTALL] yt-dlp install ho raha hai...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-U", "yt-dlp"], check=True)
        print("[OK] yt-dlp installed")

def fetch_episodes():
    """okcdn.json se saari episodes fetch karta hai"""
    print(f"[FETCH] {OKCDN_JSON}")
    req = urllib.request.Request(OKCDN_JSON, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": SITE
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    print(f"[INFO] {len(data)} episodes mile")
    return data

def resolve_okcdn_url(ep_id: str) -> str | None:
    """okcdn video ka direct CDN URL resolve karta hai"""
    try:
        url = f"{OKCDN_WORKER}/?id={ep_id}"
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Origin": SITE,
            "Referer": SITE + "/",
            "Accept": "application/json"
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        # Response me "streams" array hota hai with multiple qualities
        streams = data.get("streams", [])
        if streams:
            # Best quality = highest resolution number (handle 2k, 4k, 1080p, etc.)
            def parse_quality(s):
                t = s.get("type", "0").lower().replace("p", "")
                if t == "2k": return 2160
                if t == "4k": return 4320
                try: return int(t)
                except: return 0
            best = max(streams, key=parse_quality)
            return best.get("url")
        # Fallback: direct url field
        return data.get("url") or data.get("stream_url") or data.get("download_url") or data.get("file")
    except Exception as e:
        print(f"  [WARN] Resolve failed for {ep_id}: {e}")
        return None

def download_file(url: str, dest: Path, label: str = ""):
    """Direct URL se file download karta hai"""
    print(f"  [DOWNLOAD] {label or dest.name}")
    print(f"  URL: {url[:100]}...")
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Referer": SITE + "/"
        })
        with urllib.request.urlopen(req, timeout=300, context=ssl_ctx) as resp:
            with open(dest, "wb") as f:
                f.write(resp.read())
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"  [OK] {size_mb:.1f} MB")
        return True
    except Exception as e:
        print(f"  [ERROR] {e}")
        return False

def download_youtube(video_id: str, dest: Path):
    """YouTube video yt-dlp se download karta hai"""
    print(f"  [YOUTUBE] {video_id}")
    cmd = [
        "yt-dlp",
        "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        "--merge-output-format", "mp4",
        "--no-warnings",
        "--newline",
        "-o", str(dest),
        f"https://www.youtube.com/watch?v={video_id}"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0 and dest.exists():
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"  [OK] {size_mb:.1f} MB")
        return True
    else:
        print(f"  [ERROR] {result.stderr[-200:]}")
        return False

def safe_filename(title: str, data_id: str) -> str:
    """Safe filename banata hai"""
    # Title se safe name
    name = re.sub(r'[^\w\s\-.]', '', title)
    name = re.sub(r'\s+', ' ', name).strip()
    name = name[:80]  # Limit length
    return f"{name} [{data_id}].mp4"

def main():
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ensure_deps()
    episodes = fetch_episodes()

    # Stats
    ok = fail = skip = 0
    failed = []

    for i, ep in enumerate(episodes, 1):
        data_id = ep.get("dataId", "")
        title = ep.get("title", data_id)
        ep_type = ep.get("type", "okcdn")
        yt_id = ep.get("youtubeId", "")

        filename = safe_filename(title, data_id)
        dest = DOWNLOAD_DIR / filename

        print(f"\n[{i}/{len(episodes)}] {title[:60]}")
        print(f"  Type: {ep_type} | ID: {data_id}")

        # Skip if already downloaded
        if dest.exists() and dest.stat().st_size > 1024 * 1024:
            print(f"  [SKIP] Already exists ({dest.stat().st_size / (1024*1024):.1f} MB)")
            skip += 1
            continue

        success = False
        if ep_type == "okcdn":
            # Resolve CDN URL and download (use ep.id, not dataId)
            ep_cdn_id = ep.get("id", "")
            cdn_url = resolve_okcdn_url(ep_cdn_id) if ep_cdn_id else None
            if cdn_url:
                success = download_file(cdn_url, dest, f"{data_id} ({ep_type})")
            else:
                # Fallback: try YouTube if available
                if yt_id:
                    print(f"  [FALLBACK] Trying YouTube...")
                    success = download_youtube(yt_id, dest)
        elif ep_type == "youtube" and yt_id:
            success = download_youtube(yt_id, dest)
        else:
            print(f"  [ERROR] Unknown type: {ep_type}")

        if success:
            ok += 1
        else:
            fail += 1
            failed.append({"dataId": data_id, "title": title, "type": ep_type})

        # Small delay to avoid rate limiting
        time.sleep(1)

    # Summary
    print("\n" + "=" * 60)
    print(f"[DONE] Download complete!")
    print(f"  OK:     {ok}")
    print(f"  Failed: {fail}")
    print(f"  Skipped: {skip}")
    if failed:
        print(f"\n[FAILED LIST]")
        for f in failed:
            print(f"  - {f['dataId']}: {f['title'][:50]} ({f['type']})")
    print("=" * 60)

if __name__ == "__main__":
    main()
