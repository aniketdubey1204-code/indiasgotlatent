"""
IGL Catalog Generator — maps okcdn.json + D:\IGL/*.mp4 to archive.org direct links
"""

import json
import re
from pathlib import Path
import urllib.parse
import urllib.request

OKCDN_JSON_PATH = Path(r"C:\Users\anike\OneDrive\Documents\Default Project\scripts\okcdn_cached.json")
ARCHIVE_URLS_PATH = Path(r"C:\Users\anike\OneDrive\Documents\Default Project\scripts\archive_urls.json")
OUTPUT_VIDEOS_JS = Path(r"C:\Users\anike\OneDrive\Documents\Default Project\js\videos.js")
VIDEOS_DIR = Path(r"D:\IGL")

def get_episodes():
    if OKCDN_JSON_PATH.exists():
        try:
            with open(OKCDN_JSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    req = urllib.request.Request(
        "https://igltalent.freeforall.dev/okcdn.json",
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
            "Referer": "https://igltalent.freeforall.dev/"
        }
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    with open(OKCDN_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    return data

def detect_category(ep, filename):
    s = f"{ep.get('season', '')} {ep.get('dataId', '')} {ep.get('title', '')} {filename}".lower()
    s2 = ep.get('season') == "s2" or bool(re.search(r'\bs2\b|season 2', s))
    if re.search(r'bts|behind', s):
        return "s2bts" if s2 else "s1bts"
    if re.search(r'special|kapil|documentary|still alive', s):
        return "special"
    if re.search(r'bonus|extra|discarded|deleted', s):
        return "s2bonus" if s2 else "s1bonus"
    if s2:
        return "season2"
    if ep.get('season') == "s1" or bool(re.match(r'^(ep-|bonus-|extra-)', ep.get('dataId', ''))):
        return "season1"
    return "s2bonus" if s2 else "s1bonus"

def extract_episode_num(title, data_id):
    m = re.search(r'EP\s*(\d+)', title, re.IGNORECASE)
    if m:
        return int(m.group(1))
    m2 = re.search(r'(?:ep|bonus|bts|extra)-?(\d+)', data_id, re.IGNORECASE)
    if m2:
        return int(m2.group(1))
    return 1

def build_catalog():
    eps = get_episodes()
    ep_map = {e.get("dataId"): e for e in eps if "dataId" in e}

    # Load archive_urls if present
    uploaded_urls = {}
    if ARCHIVE_URLS_PATH.exists():
        try:
            with open(ARCHIVE_URLS_PATH, "r", encoding="utf-8") as f:
                uploaded_urls = json.load(f)
        except Exception:
            pass

    files = sorted(VIDEOS_DIR.glob("*.mp4"))
    catalog = []

    for f in files:
        m = re.search(r'\[([^\]]+)\]', f.stem)
        did = m.group(1) if m else f.stem
        ep = ep_map.get(did, {})

        # Identifier format matching auto_upload_archive.py
        ident = f"igl-{did.lower().replace(' ', '-').replace('_', '-')}"
        ident = re.sub(r'[^a-z0-9\-]', '-', ident)[:80]

        title = ep.get("title") or re.sub(r'\s*\[[^\]]+\]', '', f.stem)
        desc = ep.get("description", "")
        category = detect_category(ep, f.name)
        ep_num = extract_episode_num(title, did)
        duration = ep.get("duration", "")
        yt_id = ep.get("youtubeId")

        # YouTube thumbnail preferred (i.ytimg.com)
        if yt_id:
            thumb = f"https://i.ytimg.com/vi/{yt_id}/hqdefault.jpg"
        elif ep.get("thumbnail") and "ytimg.com" in ep["thumbnail"]:
            thumb = ep["thumbnail"]
        elif ep.get("thumbnail"):
            thumb = ep["thumbnail"]
        else:
            thumb = f"https://archive.org/services/img/{ident}"

        # Direct MP4 URL on archive.org
        encoded_filename = urllib.parse.quote(f.name)
        direct_url = f"https://archive.org/download/{ident}/{encoded_filename}"

        catalog.append({
            "id": did,
            "dataId": did,
            "archive_id": ident,
            "title": title,
            "description": desc,
            "category": category,
            "episode_number": ep_num,
            "duration": duration,
            "thumbnail_url": thumb,
            "video_url": direct_url,
            "archive_url": f"https://archive.org/details/{ident}",
            "filename": f.name,
            "youtubeId": yt_id
        })

    # Sort order: Season 1 first, then Season 2, etc. (chronological)
    def sort_key(item):
        cat = item["category"]
        cat_order = {"season1": 1, "s1bonus": 2, "s1bts": 3, "season2": 4, "s2bonus": 5, "s2bts": 6, "special": 7}
        return (cat_order.get(cat, 99), item["episode_number"], item["title"])

    catalog.sort(key=sort_key)

    # Output as videos.js
    js_content = "// Pre-built catalog of India's Got Latent episodes hosted on archive.org\n"
    js_content += "// Generated automatically — zero Supabase dependency\n"
    js_content += f"const LOCAL_VIDEOS = {json.dumps(catalog, indent=2)};\n\n"
    js_content += "if (typeof module !== 'undefined' && module.exports) {\n  module.exports = LOCAL_VIDEOS;\n}\n"

    with open(OUTPUT_VIDEOS_JS, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"[OK] Generated {len(catalog)} videos in {OUTPUT_VIDEOS_JS}")

if __name__ == "__main__":
    build_catalog()
