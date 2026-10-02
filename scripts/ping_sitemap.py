import urllib.request
import urllib.parse
import ssl
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SITEMAP_URL = "https://indiasgotlatent-opal.vercel.app/sitemap.xml"

# Ping endpoints
ENDPOINTS = [
    ("Bing", f"https://www.bing.com/ping?sitemap={urllib.parse.quote(SITEMAP_URL)}"),
    ("Google", f"https://www.google.com/ping?sitemap={urllib.parse.quote(SITEMAP_URL)}")
]

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

print(f"📡 Pinging search engines with: {SITEMAP_URL}\n")

for name, url in ENDPOINTS:
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            status = response.getcode()
            print(f"✅ {name}: HTTP {status} (Sitemap ping acknowledged)")
    except Exception as e:
        print(f"⚠️ {name}: {e}")

print("\nPing cycle complete.")
