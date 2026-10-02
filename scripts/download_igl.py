"""
IGL Video Downloader — YouTube se D:\IGL me download karta hai
Usage: python download_igl.py <playlist_url>
"""

import subprocess
import sys
import os
from pathlib import Path

DOWNLOAD_DIR = Path(r"D:\IGL")

def install_ytdlp():
    """yt-dlp install karta hai agar nahi hai"""
    try:
        subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
        print("[OK] yt-dlp already installed")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("[INSTALL] yt-dlp install ho raha hai...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-U", "yt-dlp"], check=True)
        print("[OK] yt-dlp installed")

def download_videos(playlist_url: str):
    """Saari videos ko D:\IGL me download karta hai"""
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    
    # yt-dlp command — best quality, playlist order me
    cmd = [
        "yt-dlp",
        "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        "--merge-output-format", "mp4",
        "--yes-playlist",
        "--playlist-items", "1-50",  # max 50 videos
        "-o", str(DOWNLOAD_DIR / "%(playlist_index)02d - %(title)s.%(ext)s"),
        "--no-warnings",
        "--progress",
        "--newline",
        "--write-thumbnail",
        "--write-info-json",
        playlist_url
    ]
    
    print(f"[START] Download shuru: {playlist_url}")
    print(f"[DEST]  {DOWNLOAD_DIR}")
    print("-" * 60)
    
    result = subprocess.run(cmd)
    
    if result.returncode == 0:
        print("\n" + "=" * 60)
        print("[DONE] Saari videos download ho gayi!")
        files = list(DOWNLOAD_DIR.glob("*.mp4"))
        total_size = sum(f.stat().st_size for f in files) / (1024**3)
        print(f"[INFO]  {len(files)} files, {total_size:.2f} GB total")
        print("=" * 60)
    else:
        print(f"\n[ERROR] Download failed (code: {result.returncode})")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python download_igl.py <youtube_playlist_url>")
        print("Example: python download_igl.py https://www.youtube.com/playlist?list=PLxxxx")
        sys.exit(1)
    
    install_ytdlp()
    download_videos(sys.argv[1])
