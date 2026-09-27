"""Auto-mirror: source site -> Telegram channel -> Supabase tg_path.
Runs on GitHub Actions (free). Nothing manual after one-time setup.

Per run: mirrors max 8 unmirrored episodes, newest first. If none missing, exits in ~30s.
First runs backfill the 42 existing episodes automatically over a few cycles.
"""
import os
import sys
import tempfile
import requests
import asyncio
from pyrogram import Client

OKCDN_JSON = "https://igltalent.freeforall.dev/okcdn.json"
WORKER = "https://okcdn.uppcldirect.workers.dev"
REFERER = "https://igltalent.freeforall.dev/player"
UA = "Lavf/59.27.100"
MAX_PER_RUN = 8
MAX_BYTES = 1800 * 1024 * 1024  # Telegram 2GB cap, safety margin

BOT_TOKEN = os.environ["TG_BOT_TOKEN"]
API_ID = int(os.environ["TG_API_ID"])
API_HASH = os.environ["TG_API_HASH"]
CHANNEL_ID = os.environ["TG_CHANNEL_ID"]  # e.g. -1001234567890
SB_URL = os.environ["SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_KEY"]
H = {"apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY, "Content-Type": "application/json"}


def sb_get(path):
    r = requests.get(SB_URL + path, headers=H, timeout=30)
    r.raise_for_status()
    return r.json()


def sb_patch_match(video_url, tg_path):
    r = requests.patch(
        SB_URL + "/rest/v1/videos?video_url=eq." + requests.utils.quote(video_url, safe=""),
        headers={**H, "Prefer": "return=minimal"},
        json={"tg_path": tg_path},
        timeout=30,
    )
    r.raise_for_status()


def resolve_url(ep):
    if ep.get("type") == "mp4" and ep.get("url"):
        return ep["url"]
    wj = requests.get(f"{WORKER}/?id={ep['id']}", headers={"Referer": REFERER}, timeout=60).json()
    if wj.get("status") != "success" or not wj.get("streams"):
        raise RuntimeError("worker: " + str(wj.get("message", "no streams")))
    streams = sorted(wj["streams"], key=lambda s: int((str(s.get("type") or "0p").split("p")[0] or 0)), reverse=True)
    return streams[0]["url"]


async def mirror_one(app, ep, rows_by_id):
    data_id = ep["dataId"]
    url = resolve_url(ep)
    # size guard via HEAD (fall back to allow if unknown)
    try:
        h = requests.head(url, headers={"User-Agent": UA}, timeout=30, allow_redirects=True)
        size = int(h.headers.get("content-length") or 0)
        if size and size > MAX_BYTES:
            print(f"SKIP {data_id}: {size / 1e9:.1f}GB too big")
            return False
    except Exception as e:
        print(f"HEAD warn {data_id}: {e}")
    tmp = tempfile.mktemp(suffix=".mp4")
    with requests.get(url, headers={"User-Agent": UA}, timeout=600, stream=True) as r:
        r.raise_for_status()
        total = 0
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1024 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > MAX_BYTES:
                    raise RuntimeError("exceeds cap during download")
                f.write(chunk)
    print(f"downloaded {data_id}: {total / 1e6:.0f}MB")
    msg = await app.send_video(CHANNEL_ID, tmp, supports_streaming=True, caption=data_id)
    file_id = msg.video.file_id
    gf = requests.get(
        f"https://api.telegram.org/bot{BOT_TOKEN}/getFile",
        params={"file_id": file_id},
        timeout=60,
    ).json()
    if not gf.get("ok"):
        raise RuntimeError("getFile: " + str(gf))
    tg_path = gf["result"]["file_path"]
    video_url = f"https://igltalent.freeforall.dev/player?id={data_id}"
    sb_patch_match(video_url, tg_path)
    print(f"MIRRORED {data_id} -> {tg_path}")
    try:
        os.remove(tmp)
    except OSError:
        pass
    return True


async def main():
    eps = requests.get(OKCDN_JSON, timeout=60).json()
    rows = sb_get("/rest/v1/videos?select=video_url,tg_path,source_index")
    have_tg = set()
    idx = {}
    for r in rows:
        try:
            did = requests.utils.urlparse(r["video_url"]).query.split("id=")[-1].split("&")[0]
        except Exception:
            continue
        idx[did] = r
        if r.get("tg_path"):
            have_tg.add(did)
    todo = [e for e in eps if e.get("dataId") not in have_tg and (e.get("id") or e.get("url"))]
    # newest source entries first
    todo.sort(key=lambda e: idx.get(e["dataId"], {}).get("source_index") or 0, reverse=True)
    todo = todo[:MAX_PER_RUN]
    if not todo:
        print("nothing to mirror")
        return
    print(f"mirroring {len(todo)}: {[e['dataId'] for e in todo]}")
    async with Client("mirror", api_id=API_ID, api_hash=API_HASH, bot_token=BOT_TOKEN, in_memory=True) as app:
        for ep in todo:
            try:
                await mirror_one(app, ep, idx)
            except Exception as e:
                print(f"FAIL {ep.get('dataId')}: {e}")


if __name__ == "__main__":
    asyncio.run(main())
