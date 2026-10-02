"""
IGL Auto Uploader — D:\IGL ki saari videos archive.org pe upload karta hai
Usage: python auto_upload_archive.py [--dry-run]
"""

import subprocess
import sys
import os
import json
import re
import time
from pathlib import Path

DOWNLOAD_DIR = Path(r"D:\IGL")
URLS_FILE = Path(r"C:\Users\anike\OneDrive\Documents\Default Project\scripts\archive_urls.json")

# Archive.org S3-like API credentials
S3_ACCESS_KEY = "EXPsQkXe2s8ht0H"
S3_SECRET_KEY = "96xCwf8keeEf0tFj"

def get_video_files():
    """D:\IGL se saari MP4 files nikalta hai"""
    files = sorted(DOWNLOAD_DIR.glob("*.mp4"))
    # Filter out files smaller than 1MB (failed downloads)
    files = [f for f in files if f.stat().st_size > 1024 * 1024]
    if not files:
        print(f"[ERROR] {DOWNLOAD_DIR} me koi valid MP4 file nahi mili!")
        sys.exit(1)
    return files

def parse_filename(filename: str):
    """Se filename se title aur dataId nikalta hai"""
    name = Path(filename).stem
    # Pattern: "Title [dataId]"
    match = re.match(r'(.+?)\s*\[([^\]]+)\]', name)
    if match:
        title = match.group(1).strip()
        data_id = match.group(2).strip()
    else:
        title = name
        data_id = "unknown"
    return title, data_id

def upload_to_archive(filepath: Path, title: str, data_id: str, dry_run=False):
    """Video file archive.org pe upload karta hai"""
    # Archive.org identifier: lowercase, no special chars, max 80 chars
    identifier = f"igl-{data_id.lower().replace(' ', '-').replace('_', '-')}"
    identifier = re.sub(r'[^a-z0-9\-]', '-', identifier)[:80]

    print(f"\n[UPLOAD] {filepath.name}")
    print(f"  Title: {title}")
    print(f"  Size:  {filepath.stat().st_size / (1024**3):.2f} GB")
    print(f"  ID:    {identifier}")

    if dry_run:
        print("  [DRY-RUN] Skip")
        return f"https://archive.org/details/{identifier}"

    # Metadata
    metadata = {
        "title": title,
        "collection": "opensource_movies",
        "mediatype": "movies",
        "description": f"India's Got Latent — {title} (Fan Archive)",
        "creator": "India's Got Latent",
        "subject": "India's Got Latent; Comedy; Reality; Talent",
        "licenseurl": "https://creativecommons.org/licenses/by/4.0/",
    }

    # Upload using ia CLI
    cmd = [
        "ia", "upload", identifier,
        str(filepath),
        "-R", "3",
        "-s", "10",
        "--metadata", f"title:{metadata['title']}",
        "--metadata", f"collection:{metadata['collection']}",
        "--metadata", f"mediatype:{metadata['mediatype']}",
        "--metadata", f"description:{metadata['description']}",
        "--metadata", f"creator:{metadata['creator']}",
        "--metadata", f"subject:{metadata['subject']}",
        "--metadata", f"licenseurl:{metadata['licenseurl']}",
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
        if result.returncode == 0:
            url = f"https://archive.org/details/{identifier}"
            print(f"  [OK] {url}")
            return url
        else:
            err = (result.stderr or result.stdout or "Unknown error").strip()
            print(f"  [ERROR] {err[:300]}")
            return None
    except subprocess.TimeoutExpired:
        print("  [ERROR] Upload timeout (2 hours)")
        return None
    except Exception as e:
        print(f"  [ERROR] {e}")
        return None

def main():
    dry_run = "--dry-run" in sys.argv

    print("=" * 60)
    print("IGL Archive.org Auto Uploader")
    print("=" * 60)

    files = get_video_files()
    print(f"\n[INFO] {len(files)} files found in {DOWNLOAD_DIR}")

    if dry_run:
        print("[MODE] Dry-run (no actual upload)")

    urls = {}
    if URLS_FILE.exists():
        try:
            with open(URLS_FILE, "r", encoding="utf-8") as fp:
                urls = json.load(fp)
            uploaded_count = sum(1 for u in urls.values() if u)
            print(f"[INFO] Loaded existing progress from {URLS_FILE.name}: {uploaded_count} already uploaded")
        except Exception as e:
            print(f"[WARN] Could not load {URLS_FILE}: {e}")

    ok = sum(1 for u in urls.values() if u)
    fail = 0

    for i, f in enumerate(files, 1):
        title, data_id = parse_filename(f.name)
        print(f"\n[{i}/{len(files)}] {title[:60]}")

        if urls.get(f.name):
            print(f"  [SKIP] Already uploaded: {urls[f.name]}")
            continue

        url = upload_to_archive(f, title, data_id, dry_run=dry_run)
        if url:
            urls[f.name] = url
            ok += 1
        else:
            urls[f.name] = None
            fail += 1

        if not dry_run:
            URLS_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(URLS_FILE, "w", encoding="utf-8") as fp:
                json.dump(urls, fp, indent=2)

        # Small delay between uploads
        time.sleep(2)

    # Save URLs final
    if not dry_run:
        URLS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(URLS_FILE, "w", encoding="utf-8") as fp:
            json.dump(urls, fp, indent=2)

    print("\n" + "=" * 60)
    print(f"[DONE] Upload complete!")
    print(f"  OK:     {ok}")
    print(f"  Failed: {fail}")
    print(f"[INFO] URLs saved: {URLS_FILE}")
    print("=" * 60)

if __name__ == "__main__":
    main()
