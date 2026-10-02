"""
IGL Catalog Generator — maps okcdn.json + D:\IGL/*.mp4 to archive.org direct links
with true chronological release order and high-res reliable thumbnails.
"""

import json
import re
from pathlib import Path
import urllib.parse
import urllib.request

BASE_DIR = Path(__file__).parent.parent
OKCDN_JSON_PATH = BASE_DIR / "scripts" / "okcdn_cached.json"
ARCHIVE_URLS_PATH = BASE_DIR / "scripts" / "archive_urls.json"
OUTPUT_VIDEOS_JS = BASE_DIR / "js" / "videos.js"
VIDEOS_DIR = Path(r"D:\IGL")

# Exact canonical release timeline of India's Got Latent
# (dataId, category, episode_number, sort_index)
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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://igltalent.freeforall.dev/"
        }
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    with open(OKCDN_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    return data

def resolve_thumbnail(ep, ident):
    """
    High-Definition thumbnail resolution:
    1. YouTube ID (from youtubeId or 11-char localImage stem):
       Use maxresdefault.jpg (1280x720 Full HD, no 4:3 black bars)
    2. Local image in assets/thumbs/ (hosted on Vercel CDN):
       Use /assets/thumbs/<localImage>
    3. Live source CDN:
       Use https://igltalent.freeforall.dev/img/<localImage>
    4. Fallback to archive.org generated thumbnail
    """
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

def build_catalog():
    eps = get_episodes()
    ep_map = {e.get("dataId"): e for e in eps if "dataId" in e}

    # Load archive_urls for exact filenames
    uploaded_urls = {}
    if ARCHIVE_URLS_PATH.exists():
        try:
            with open(ARCHIVE_URLS_PATH, "r", encoding="utf-8") as f:
                uploaded_urls = json.load(f)
        except Exception:
            pass

    files_by_id = {}
    for fname in uploaded_urls.keys():
        m = re.search(r'\[([^\]]+)\]', Path(fname).stem)
        if m:
            files_by_id[m.group(1)] = fname

    if VIDEOS_DIR.exists():
        for f in VIDEOS_DIR.glob("*.mp4"):
            m = re.search(r'\[([^\]]+)\]', f.stem)
            if m:
                files_by_id[m.group(1)] = f.name

    canon_map = {item[0]: item for item in CANONICAL_EPISODES}
    catalog = []

    # Process all episodes from okcdn
    for did, ep in ep_map.items():
        ident = f"igl-{did.lower().replace(' ', '-').replace('_', '-')}"
        ident = re.sub(r'[^a-z0-9\-]', '-', ident)[:80]

        title = ep.get("title") or did
        desc = ep.get("description", "")
        duration = ep.get("duration", "")
        loc = ep.get("localImage", "")

        fname = files_by_id.get(did) or f"{title} [{did}].mp4"
        direct_url = f"https://archive.org/download/{ident}/{urllib.parse.quote(fname)}"
        thumb, yt_id = resolve_thumbnail(ep, ident)

        if did in canon_map:
            _, category, ep_num, sort_idx = canon_map[did]
        else:
            category = "season2" if ep.get("season") == "s2" else "season1"
            ep_num = 99
            sort_idx = 250

        catalog.append({
            "id": did,
            "dataId": did,
            "archive_id": ident,
            "title": title,
            "description": desc,
            "category": category,
            "episode_number": ep_num,
            "sort_index": sort_idx,
            "duration": duration,
            "thumbnail_url": thumb,
            "video_url": direct_url,
            "archive_url": f"https://archive.org/details/{ident}",
            "filename": fname,
            "youtubeId": yt_id,
            "localImage": loc
        })

    # Sort strictly by sort_index (chronological release order)
    catalog.sort(key=lambda x: x.get("sort_index", 9999))

    js_content = "// IGL Fan Archive — chronological catalog (archive.org hosted)\n"
    js_content += "// Generated automatically — 100% reliable direct CDN & YouTube thumbnails\n"
    js_content += f"const LOCAL_VIDEOS = {json.dumps(catalog, indent=2, ensure_ascii=False)};\n\n"
    js_content += "if (typeof module !== 'undefined' && module.exports) {\n  module.exports = LOCAL_VIDEOS;\n}\n"

    with open(OUTPUT_VIDEOS_JS, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"[OK] Generated {len(catalog)} videos in {OUTPUT_VIDEOS_JS} in true chronological order!")

if __name__ == "__main__":
    build_catalog()
