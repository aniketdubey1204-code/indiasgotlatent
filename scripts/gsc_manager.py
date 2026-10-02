import os
import sys
import json
import argparse
from datetime import datetime, timedelta

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SITE_URL = "https://indiasgotlatent-opal.vercel.app/"
SITEMAP_URL = "https://indiasgotlatent-opal.vercel.app/sitemap.xml"

CANDIDATE_KEYS = [
    "service_account.json",
    "gsc_key.json",
    "credentials.json",
    os.path.join(os.path.dirname(__file__), "..", "service_account.json"),
    os.path.join(os.path.dirname(__file__), "..", "credentials.json")
]

def find_credentials():
    env_creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if env_creds and os.path.exists(env_creds):
        return env_creds
    for path in CANDIDATE_KEYS:
        abs_path = os.path.abspath(path)
        if os.path.exists(abs_path):
            return abs_path
    return None

def get_service(api_name, api_version, scopes):
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    creds_path = find_credentials()
    if not creds_path:
        print("\n" + "="*65)
        print("❌ NO GOOGLE SERVICE ACCOUNT CREDENTIALS FOUND")
        print("="*65)
        print("To let the bot automatically manage Google Search Console & Indexing:")
        print("1. Go to Google Cloud Console (https://console.cloud.google.com)")
        print("2. Enable 'Google Search Console API' and 'Web Search Indexing API'")
        print("3. Create a Service Account -> Keys -> Add Key -> JSON")
        print("4. Save that downloaded JSON file as 'service_account.json' in this project folder.")
        print("5. In Google Search Console (search.google.com/search-console):")
        print("   Settings -> Users and permissions -> Add User")
        print("   Enter the Service Account email address with 'Owner' or 'Full' permission.")
        print("="*65 + "\n")
        sys.exit(1)

    credentials = service_account.Credentials.from_service_account_file(
        creds_path, scopes=scopes
    )
    return build(api_name, api_version, credentials=credentials)

def submit_sitemap():
    print(f"📡 Connecting to Google Search Console API for {SITE_URL}...")
    service = get_service(
        "searchconsole", "v1", ["https://www.googleapis.com/auth/webmasters"]
    )
    try:
        service.sitemaps().submit(siteUrl=SITE_URL, feedpath=SITEMAP_URL).execute()
        print(f"✅ SUCCESS: Submitted sitemap to Google Search Console: {SITEMAP_URL}")
    except Exception as e:
        print(f"❌ Error submitting sitemap: {e}")

def list_sitemaps():
    service = get_service(
        "searchconsole", "v1", ["https://www.googleapis.com/auth/webmasters"]
    )
    try:
        res = service.sitemaps().list(siteUrl=SITE_URL).execute()
        print(json.dumps(res, indent=2))
    except Exception as e:
        print(f"❌ Error listing sitemaps: {e}")

def index_urls():
    print("🚀 Pinging Google Indexing API for all site & episode URLs...")
    service = get_service(
        "indexing", "v3", ["https://www.googleapis.com/auth/indexing"]
    )
    
    # Read URLs from sitemap.xml
    with open("sitemap.xml", encoding="utf-8") as f:
        content = f.read()
    
    import re
    urls = re.findall(r"<loc>(.*?)</loc>", content)
    print(f"Found {len(urls)} URLs in sitemap to notify Google Indexing API.")
    
    success_count = 0
    for u in urls:
        body = {
            "url": u,
            "type": "URL_UPDATED"
        }
        try:
            res = service.urlNotifications().publish(body=body).execute()
            print(f"  [Indexed] {u} -> notifyTime: {res.get('urlNotificationMetadata', {}).get('latestUpdate', {}).get('notifyTime', 'OK')}")
            success_count += 1
        except Exception as e:
            print(f"  [Failed]  {u} -> {e}")

    print(f"\n🎉 Finished: Successfully notified Google Indexing API for {success_count}/{len(urls)} URLs.")

def query_performance(days=28):
    print(f"📊 Fetching Search Performance for last {days} days...")
    service = get_service(
        "searchconsole", "v1", ["https://www.googleapis.com/auth/webmasters.readonly"]
    )
    
    end_date = datetime.now() - timedelta(days=2) # GSC has a 2-day delay
    start_date = end_date - timedelta(days=days)
    
    request = {
        'startDate': start_date.strftime('%Y-%m-%d'),
        'endDate': end_date.strftime('%Y-%m-%d'),
        'dimensions': ['query'],
        'rowLimit': 25
    }
    
    try:
        response = service.searchanalytics().query(siteUrl=SITE_URL, body=request).execute()
        rows = response.get('rows', [])
        if not rows:
            print("No performance data recorded yet for this property.")
            return
        
        print("\nTop Queries:")
        print(f"{'Query':<35} | {'Clicks':<6} | {'Impressions':<11} | {'CTR':<6} | {'Position'}")
        print("-" * 75)
        for r in rows:
            q = r['keys'][0]
            clicks = r.get('clicks', 0)
            imp = r.get('impressions', 0)
            ctr = f"{r.get('ctr', 0)*100:.1f}%"
            pos = f"{r.get('position', 0):.1f}"
            print(f"{q:<35} | {clicks:<6} | {imp:<11} | {ctr:<6} | {pos}")
    except Exception as e:
        print(f"❌ Error querying analytics: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="IGL Google Search Console & Indexing Manager")
    parser.add_argument("action", choices=["submit-sitemap", "list-sitemaps", "index-all", "performance", "check-creds"])
    args = parser.parse_args()
    
    if args.action == "check-creds":
        c = find_credentials()
        if c:
            print(f"✅ Credentials found at: {c}")
        else:
            get_service("searchconsole", "v1", [])
    elif args.action == "submit-sitemap":
        submit_sitemap()
    elif args.action == "list-sitemaps":
        list_sitemaps()
    elif args.action == "index-all":
        index_urls()
    elif args.action == "performance":
        query_performance()
