"""Mirror new + existing episodes to Cloudflare R2 (free 10GB, free egress).
Runs on GitHub Actions every 30 min. No server, no cost.
Needs env: R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET, R2_PUBLIC_BASE,
           SUPABASE_URL, SUPABASE_SERVICE_KEY, OKCDN_JSON (optional override).
"""
import json
import os
import urllib.parse
import urllib.request

import boto3

UA = {"User-Agent": "Lavf/59.27.100", "Referer": "https://igltalent.freeforall.dev/player"}
WORKER = "https://okcdn.uppcldirect.workers.dev"
OKCDN_JSON = os.environ.get("OKCDN_JSON", "https://igltalent.freeforall.dev/okcdn.json")
BUCKET = os.environ["R2_BUCKET"]
PUBLIC = os.environ["R2_PUBLIC_BASE"].rstrip("/")
SB_URL = os.environ["SUPABASE_URL"].rstrip("/")
SB_KEY = os.environ["SUPABASE_SERVICE_KEY"]
CAP_BYTES = int(os.environ.get("R2_CAP_BYTES", str(9 * 1024**3)))  # stay under free 10GB


def http_json(url):
    req = urllib.request.Request(url, headers={**UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def sb(api, method="GET", body=None):
    req = urllib.request.Request(
        SB_URL + api,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "apikey": SB_KEY,
            "Authorization": "Bearer " + SB_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else None


def pick_720p_or_lower(streams):
    def size(s):
        import re
        m = re.search(r"(\d+)p", s.get("type") or "")
        return int(m.group(1)) if m else 0

    ordered = sorted(streams, key=size, reverse=True)
    under = [s for s in ordered if 0 < size(s) <= 720]
    return (under or ordered)[0]


def main():
    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["R2_SECRET_KEY"],
        region_name="auto",
    )
    have, total = {}, 0
    token = None
    while True:
        kw = {"Bucket": BUCKET, "MaxKeys": 1000}
        if token:
            kw["ContinuationToken"] = token
        pg = s3.list_objects_v2(**kw)
        for o in pg.get("Contents", []):
            have[o["Key"]] = o
            total += o["Size"]
        token = pg.get("NextContinuationToken")
        if not token:
            break
    print(f"R2: {len(have)} files, {total / 1024**3:.2f} GB")

    eps = http_json(OKCDN_JSON)
    cands = [e for e in eps if e.get("type") == "okcdn" and e.get("id") and e.get("dataId")]
    print(f"source: {len(cands)} mirrorable episodes")

    for ep in cands:
        key = f"{ep['dataId']}.mp4"
        if key in have:
            continue
        try:
            wj = http_json(f"{WORKER}/?id={urllib.parse.quote(str(ep['id']))}")
            if wj.get("status") != "success" or not wj.get("streams"):
                print("skip (no streams):", ep["dataId"])
                continue
            src = pick_720p_or_lower(wj["streams"])["url"]
            tmp = f"/tmp/{ep['dataId']}.mp4"
            req = urllib.request.Request(src, headers=UA)
            with urllib.request.urlopen(req, timeout=600) as r, open(tmp, "wb") as f:
                while True:
                    chunk = r.read(4 * 1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
            s3.upload_file(tmp, BUCKET, key, ExtraArgs={"ContentType": "video/mp4"})
            os.remove(tmp)
            new_url = f"{PUBLIC}/{key}"
            old_player = f"%player?id={ep['dataId']}"
            sb(f"/rest/v1/videos?video_url=like.{urllib.parse.quote(old_player)}",
               "PATCH", {"video_url": new_url})
            print("mirrored:", key)
        except Exception as e:  # noqa: BLE001 - keep the run going
            print("FAILED:", ep.get("dataId"), str(e)[:120])

    # Prune oldest if over cap (rows fall back to player URLs, still playable)
    if total > CAP_BYTES:
        for o in sorted(have.values(), key=lambda x: x["LastModified"]):
            if total <= CAP_BYTES:
                break
            data_id = o["Key"].rsplit(".", 1)[0]
            s3.delete_object(Bucket=BUCKET, Key=o["Key"])
            total -= o["Size"]
            sb(f"/rest/v1/videos?video_url=eq.{urllib.parse.quote(PUBLIC + '/' + o['Key'])}",
               "PATCH", {"video_url": f"https://igltalent.freeforall.dev/player?id={data_id}"})
            print("pruned:", o["Key"])


if __name__ == "__main__":
    main()
