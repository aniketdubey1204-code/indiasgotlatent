"""
IGL Archive.org Uploader — D:\IGL ki videos archive.org pe upload karta hai
Usage: python upload_to_archive.py [--dry-run]
"""

import subprocess
import sys
import os
import json
import re
from pathlib import Path

DOWNLOAD_DIR = Path(r"D:\IGL")
URLS_FILE = Path(r"C:\Users\anike\OneDrive\Documents\Default Project\scripts\archive_urls.json")

def install_ia():
    """internetarchive CLI install karta hai"""
    try:
        subprocess.run(["ia", "--version"], capture_output=True, check=True)
        print("[OK] ia CLI already installed")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("[INSTALL] internetarchive install ho raha hai...")
        subprocess.run([sys.executable, "-m", "pip", "install", "internetarchive"], check=True)
        print("[OK] ia CLI installed")

def get_video_files():
    """D:\IGL se saari MP4 files nikalta hai"""
    files = sorted(DOWNLOAD_DIR.glob("*.mp4"))
    if not files:
        print(f"[ERROR] {DOWNLOAD_DIR} me koi MP4 file nahi mili!")
        sys.exit(1)
    return files

def parse_filename(filename: str):
    """Se filename se title aur episode number nikalta hai"""
    # Pattern: "01 - India's Got Latent EP 1 ft. X.mp4"
    name = Path(filename).stem
    
    # Episode number match
    ep_match = re.search(r'EP\s*(\d+)', name, re.IGNORECASE)
    ep_num = ep_match.group(1) if ep_match else None
    
    # Title clean
    title = re.sub(r'^\d+\s*-\s*', '', name)
    title = re.sub(r'\s+', ' ', title).strip()
    
    return title, ep_num

def upload_to_archive(files, dry_run=False):
    """Saari videos archive.org pe upload karta hai"""
    urls = {}
    
    for i, f in enumerate(files, 1):
        title, ep_num = parse_filename(f.name)
        identifier = f"igl-{f.stem.lower().replace(' ', '-').replace('_', '-')}"
        # Archive.org identifier rules: lowercase, no special chars
        identifier = re.sub(r'[^a-z0-9\-]', '-', identifier)[:80]
        
        print(f"\n[{i}/{len(files)}] Uploading: {f.name}")
        print(f"  Title: {title}")
        print(f"  Size:  {f.stat().st_size / (1024**3):.2f} GB")
        print(f"  ID:    {identifier}")
        
        if dry_run:
            print("  [DRY-RUN] Skip")
            urls[f.name] = f"https://archive.org/details/{identifier}"
            continue
        
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
        
        # Upload command
        cmd = [
            "ia", "upload", identifier,
            str(f),
            "--metadata", f"title:{metadata['title']}",
            "--metadata", f"collection:{metadata['collection']}",
            "--metadata", f"mediatype:{metadata['mediatype']}",
            "--metadata", f"description:{metadata['description']}",
            "--metadata", f"creator:{metadata['creator']}",
            "--metadata", f"subject:{metadata['subject']}",
            "--metadata", f"licenseurl:{metadata['licenseurl']}",
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
            if result.returncode == 0:
                url = f"https://archive.org/details/{identifier}"
                urls[f.name] = url
                print(f"  [OK] {url}")
            else:
                print(f"  [ERROR] {result.stderr[:200]}")
                urls[f.name] = None
        except subprocess.TimeoutExpired:
            print("  [ERROR] Upload timeout (1 hour)")
            urls[f.name] = None
        except Exception as e:
            print(f"  [ERROR] {e}")
            urls[f.name] = None
    
    # Save URLs
    URLS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(URLS_FILE, "w") as fp:
        json.dump(urls, fp, indent=2)
    
    print("\n" + "=" * 60)
    print(f"[DONE] {len(urls)} videos processed")
    print(f"[INFO] URLs saved: {URLS_FILE}")
    print("=" * 60)
    
    return urls

if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    
    print("=" * 60)
    print("IGL Archive.org Uploader")
    print("=" * 60)
    
    install_ia()
    files = get_video_files()
    print(f"\n[INFO] {len(files)} files found in {DOWNLOAD_DIR}")
    
    if dry_run:
        print("[MODE] Dry-run (no actual upload)")
    
    upload_to_archive(files, dry_run=dry_run)
