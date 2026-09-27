"""Auto-mirror: source site -> Telegram channel -> Supabase tg_path.
Runs on GitHub Actions (free). Nothing manual after one-time setup.

Uploads go through a LOCAL Bot API server (docker on the runner) so the 50MB
Bot API cap becomes 2GB. getFile (public) then gives the permanent file path.

Per run: mirrors max 8 unmirrored episodes, newest first. If none missing, exits in ~30s.
"""
import os
import sys
import time
import tempfile
import requests

OKCDN_JSON = "https://igltalent.freeforall.dev/okcdn.json"
LOCAL_API = "http://localhost:8081"  # docker local Bot API server (see workflow)
PUBLIC_API = "https://api.telegram.org"
UA = "Lavf/59.27.100"
MAX_PER_RUN = 8
MAX_BYTES = 1800 * 1024 * 1024  # Telegram 2GB cap, safety margin

BOT_TOKEN = os.environ["TG_BOT_TOKEN"]
CHANNEL_ID = os.environ["TG_CHANNEL_ID"]  # e.g. -1001234567890
CRON_SECRET = os.environ["CRON_SECRET"]  # same value as Supabase CRON_SECRET
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
    # Worker Cloudflare-blocks GitHub IPs -> resolve via our own Supabase fn.
    if ep.get("type") == "mp4" and ep.get("url"):
        return ep["url"]
    last = ""
    for i in range(3):
        try:
            r = requests.get(
                f"{SB_URL}/functions/v1/resolve",
                params={"dataId": ep["dataId"]},
                headers={"x-cron-secret": CRON_SECRET},
                timeout=120,
            )
            j = r.json()
            if j.get("url"):
                return j["url"]
            last = f"try{i + 1}: {str(j)[:100]}"
        except Exception as e:
            last = f"try{i + 1}: {str(e)[:100]}"
            time.sleep(10)
    raise RuntimeError("resolve failed: " + last)


def wait_local_api():
    for _ in range(90):
        try:
            r = requests.get(f"{LOCAL_API}/bot{BOT_TOKEN}/getMe", timeout=5)
            if r.json().get("ok"):
                print("local API server ready")
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


def upload_video(tmp, data_id):
    # via local server: up to 2GB; file lands on Telegram DCs permanently.
    with open(tmp, "rb") as f:
        r = requests.post(
            f"{LOCAL_API}/bot{BOT_TOKEN}/sendVideo",
            data={"chat_id": CHANNEL_ID, "supports_streaming": "true", "caption": data_id},
            files={"video": (data_id + ".mp4", f, "video/mp4")},
            timeout=1800,
        )
    j = r.json()
    if not j.get("ok"):
        raise RuntimeError("sendVideo: " + str(j)[:200])
    return j["result"]["video"]["file_id"]


def public_file_path(file_id):
    # metadata has no size cap; path works on public file servers forever.
    for _ in range(5):
        gf = requests.get(f"{PUBLIC_API}/bot{BOT_TOKEN}/getFile", params={"file_id": file_id}, timeout=60).json()
        if gf.get("ok"):
            return gf["result"]["file_path"]
        time.sleep(10)
    raise RuntimeError("getFile: " + str(gf)[:200])


def mirror_one(ep):
    data_id = ep["dataId"]
    url = resolve_url(ep)
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
    print(f"downloaded {data_id}: {total / 1e6:.0f}MB", flush=True)
    file_id = upload_video(tmp, data_id)
    tg_path = public_file_path(file_id)
    sb_patch_match(f"https://igltalent.freeforall.dev/player?id={data_id}", tg_path)
    print(f"MIRRORED {data_id} -> {tg_path}", flush=True)
    try:
        os.remove(tmp)
    except OSError:
        pass
    return True


def main():
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
    todo = [e for e in eps if e.get("dataId") not in have_tg and e.get("type") != "youtube" and (e.get("id") or e.get("url"))]
    todo.sort(key=lambda e: idx.get(e["dataId"], {}).get("source_index") or 0, reverse=True)
    todo = todo[:MAX_PER_RUN]
    if not todo:
        print("nothing to mirror")
        return
    print(f"mirroring {len(todo)}: {[e['dataId'] for e in todo]}", flush=True)
    if not wait_local_api():
        print("LOCAL API server missing — aborting (would hit 50MB cap)")
        return
    for ep in todo:
        try:
            mirror_one(ep)
        except Exception as e:
            print(f"FAIL {ep.get('dataId')}: {e}", flush=True)


if __name__ == "__main__":
    main()
