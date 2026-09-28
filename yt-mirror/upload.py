"""Auto-upload: source site -> YOUR YouTube (unlisted) -> Supabase yt_mirror_id.
Runs on GitHub Actions (free), daily. YouTube API quota = 10k units/day,
one upload costs 1600 -> max 6 uploads/run (quota-safe).
"""
import os
import tempfile
import requests
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

OKCDN_JSON = "https://igltalent.freeforall.dev/okcdn.json"
UA = "Lavf/59.27.100"
MAX_PER_RUN = 6  # 6 x 1600 = 9600 units, under the 10k daily quota
MAX_BYTES = 1800 * 1024 * 1024

CLIENT_ID = os.environ["YT_CLIENT_ID"]
CLIENT_SECRET = os.environ["YT_CLIENT_SECRET"]
REFRESH_TOKEN = os.environ["YT_REFRESH_TOKEN"]
CRON_SECRET = os.environ["CRON_SECRET"]
SB_URL = os.environ["SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_KEY"]
H = {"apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY, "Content-Type": "application/json"}


def sb_get(path):
    r = requests.get(SB_URL + path, headers=H, timeout=30)
    r.raise_for_status()
    return r.json()


def sb_patch(video_url, yt_id):
    r = requests.patch(
        SB_URL + "/rest/v1/videos?video_url=eq." + requests.utils.quote(video_url, safe=""),
        headers={**H, "Prefer": "return=minimal"},
        json={"yt_mirror_id": yt_id},
        timeout=30,
    )
    r.raise_for_status()


def resolve_url(ep):
    if ep.get("type") == "mp4" and ep.get("url"):
        return ep["url"]
    r = requests.get(
        f"{SB_URL}/functions/v1/resolve",
        params={"dataId": ep["dataId"]},
        headers={"x-cron-secret": CRON_SECRET},
        timeout=120,
    ).json()
    if not r.get("url"):
        raise RuntimeError("resolve: " + str(r)[:120])
    return r["url"]


def yt_client():
    creds = Credentials(
        None,
        refresh_token=REFRESH_TOKEN,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        scopes=["https://www.googleapis.com/auth/youtube.upload"],
    )
    return build("youtube", "v3", credentials=creds)


def upload_one(youtube, ep):
    data_id = ep["dataId"]
    url = resolve_url(ep)
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
                    raise RuntimeError("too big")
                f.write(chunk)
    print(f"downloaded {data_id}: {total / 1e6:.0f}MB", flush=True)
    title = (ep.get("title") or data_id)[:95]
    body = {
        "snippet": {
            "title": title,
            "description": (ep.get("description") or "Fan archive mirror.")[:4000],
            "categoryId": "23",
        },
        "status": {
            "privacyStatus": "unlisted",
            "selfDeclaredMadeForKids": False,
        },
    }
    req = youtube.videos().insert(
        part="snippet,status",
        body=body,
        media_body=MediaFileUpload(tmp, mimetype="video/mp4", resumable=True, chunksize=8 * 1024 * 1024),
    )
    resp = None
    while resp is None:
        _, resp = req.next_chunk()
    yt_id = resp["id"]
    sb_patch(f"https://igltalent.freeforall.dev/player?id={data_id}", yt_id)
    print(f"UPLOADED {data_id} -> https://youtu.be/{yt_id}", flush=True)
    try:
        os.remove(tmp)
    except OSError:
        pass
    return True


def main():
    eps = requests.get(OKCDN_JSON, timeout=60).json()
    rows = sb_get("/rest/v1/videos?select=video_url,yt_mirror_id,source_index")
    have = set()
    idx = {}
    for r in rows:
        try:
            did = requests.utils.urlparse(r["video_url"]).query.split("id=")[-1].split("&")[0]
        except Exception:
            continue
        idx[did] = r
        if r.get("yt_mirror_id"):
            have.add(did)
    todo = [e for e in eps if e.get("dataId") not in have and e.get("type") != "youtube" and (e.get("id") or e.get("url"))]
    todo.sort(key=lambda e: idx.get(e["dataId"], {}).get("source_index") or 0, reverse=True)
    todo = todo[:MAX_PER_RUN]
    if not todo:
        print("nothing to upload")
        return
    print(f"uploading {len(todo)}: {[e['dataId'] for e in todo]}", flush=True)
    youtube = yt_client()
    for ep in todo:
        try:
            upload_one(youtube, ep)
        except Exception as e:
            print(f"FAIL {ep.get('dataId')}: {str(e)[:200]}", flush=True)


if __name__ == "__main__":
    main()
