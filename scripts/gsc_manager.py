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
        print("   Enter the Service Account email address with 'Owner' permission.")
        print("="*65 + "\n")
        sys.exit(1)

    credentials = service_account.Credentials.from_service_account_file(
        creds_path, scopes=scopes
    )
    return build(api_name, api_version, credentials=credentials)

def check_permission():
    service = get_service(
        "searchconsole", "v1", ["https://www.googleapis.com/auth/webmasters"]
    )
    try:
        sites_res = service.sites().list().execute()
        entries = sites_res.get("siteEntry", [])
        for entry in entries:
            if entry.get("siteUrl") == SITE_URL:
                perm = entry.get("permissionLevel")
                print(f"✅ Property Found: {SITE_URL}")
                print(f"🔑 Current Permission Level: {perm}")
                if perm != "siteOwner":
                    print("\n⚠️ NOTE: Permission is currently 'siteFullUser' instead of 'siteOwner'.")
                    print("To allow the bot to force Indexing API submissions, change permission to 'Owner' in GSC:")
                    print("Search Console -> Settings -> Users & Permissions -> Click User -> Change to 'Owner'.")
                return perm
        print(f"⚠️ Property {SITE_URL} not found in user's site list.")
    except Exception as e:
        print(f"❌ Error checking permissions: {e}")
    return None

def submit_sitemap():
    print(f"📡 Submitting sitemap to Google Search Console for {SITE_URL}...")
    service = get_service(
        "searchconsole", "v1", ["https://www.googleapis.com/auth/webmasters"]
    )
    try:
        service.sitemaps().submit(siteUrl=SITE_URL, feedpath=SITEMAP_URL).execute()
        print(f"✅ SUCCESS: Submitted sitemap to Google Search Console: {SITEMAP_URL}")
    except Exception as e:
        print(f"❌ Error submitting sitemap: {e}")
        if "403" in str(e):
            print("\n💡 Reason: Google requires 'Owner' permission to submit sitemaps via API.")
            print("Please change the Service Account permission from 'Full' to 'Owner' in GSC,")
            print("OR click 'Submit' manually once in GSC Sitemaps tab!")

def list_sitemaps():
    print(f"📋 Fetching current sitemap status from Google Search Console...")
    service = get_service(
        "searchconsole", "v1", ["https://www.googleapis.com/auth/webmasters"]
    )
    try:
        res = service.sitemaps().list(siteUrl=SITE_URL).execute()
        sitemaps = res.get("sitemap", [])
        if not sitemaps:
            print("No sitemaps registered yet.")
            return
        for sm in sitemaps:
            print("\n" + "-"*55)
            print(f"Path:            {sm.get('path')}")
            print(f"Last Submitted:  {sm.get('lastSubmitted')}")
            print(f"Last Downloaded: {sm.get('lastDownloaded')}")
            print(f"Pending Status:  {sm.get('isPending')}")
            print(f"Warnings:        {sm.get('warnings')}")
            print(f"Errors:          {sm.get('errors')}")
            contents = sm.get("contents", [])
            for c in contents:
                print(f"  Type: {c.get('type')} | Submitted: {c.get('submitted')} | Indexed: {c.get('indexed')}")
            print("-"*55)
    except Exception as e:
        print(f"❌ Error listing sitemaps: {e}")

def index_urls():
    print("🚀 Pinging Google Indexing API for all site & episode URLs...")
    service = get_service(
        "indexing", "v3", ["https://www.googleapis.com/auth/indexing"]
    )
    
    with open("sitemap.xml", encoding="utf-8") as f:
        content = f.read()
    
    import re
    urls = re.findall(r"<loc>(.*?)</loc>", content)
    print(f"Found {len(urls)} URLs in sitemap to notify Google Indexing API.")
    
    success_count = 0
    fail_count = 0
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
            if fail_count == 0 and "403" in str(e):
                print(f"\n❌ Permission Error: {e}")
                print("💡 Google Indexing API requires the Service Account to be an 'Owner' in Google Search Console.")
                print("Go to GSC -> Settings -> Users and permissions -> Click gsc-bot -> Change to 'Owner'.\n")
                return
            fail_count += 1
            print(f"  [Failed]  {u} -> {e}")

    print(f"\n🎉 Finished: Successfully notified Google Indexing API for {success_count}/{len(urls)} URLs.")

def query_performance(days=28):
    print(f"📊 Fetching Search Performance from Google Search Console (Last {days} days)...")
    service = get_service(
        "searchconsole", "v1", ["https://www.googleapis.com/auth/webmasters.readonly"]
    )
    
    end_date = datetime.now() - timedelta(days=2)
    start_date = end_date - timedelta(days=days)
    
    # 1. Top Queries
    q_request = {
        'startDate': start_date.strftime('%Y-%m-%d'),
        'endDate': end_date.strftime('%Y-%m-%d'),
        'dimensions': ['query'],
        'rowLimit': 25
    }
    
    try:
        response = service.searchanalytics().query(siteUrl=SITE_URL, body=q_request).execute()
        rows = response.get('rows', [])
        print("\n🏆 Top Search Queries:")
        if not rows:
            print("  (No queries recorded yet in this time window)")
        else:
            print(f"  {'Query':<35} | {'Clicks':<6} | {'Impressions':<11} | {'CTR':<6} | {'Position'}")
            print("  " + "-" * 72)
            for r in rows:
                q = r['keys'][0]
                clicks = r.get('clicks', 0)
                imp = r.get('impressions', 0)
                ctr = f"{r.get('ctr', 0)*100:.1f}%"
                pos = f"{r.get('position', 0):.1f}"
                print(f"  {q:<35} | {clicks:<6} | {imp:<11} | {ctr:<6} | {pos}")
    except Exception as e:
        print(f"❌ Error querying query analytics: {e}")

    # 2. Top Pages
    p_request = {
        'startDate': start_date.strftime('%Y-%m-%d'),
        'endDate': end_date.strftime('%Y-%m-%d'),
        'dimensions': ['page'],
        'rowLimit': 15
    }
    try:
        p_response = service.searchanalytics().query(siteUrl=SITE_URL, body=p_request).execute()
        p_rows = p_response.get('rows', [])
        print("\n📄 Top Landing Pages:")
        if not p_rows:
            print("  (No page analytics recorded yet)")
        else:
            print(f"  {'Page URL':<55} | {'Clicks':<6} | {'Impressions':<11}")
            print("  " + "-" * 76)
            for r in p_rows:
                pg = r['keys'][0]
                clicks = r.get('clicks', 0)
                imp = r.get('impressions', 0)
                print(f"  {pg:<55} | {clicks:<6} | {imp:<11}")
    except Exception as e:
        print(f"❌ Error querying page analytics: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="IGL Google Search Console & Indexing Manager")
    parser.add_argument("action", choices=["check-creds", "check-perm", "submit-sitemap", "list-sitemaps", "index-all", "performance"])
    args = parser.parse_args()
    
    if args.action == "check-creds":
        c = find_credentials()
        if c:
            print(f"✅ Credentials found at: {c}")
        else:
            get_service("searchconsole", "v1", [])
    elif args.action == "check-perm":
        check_permission()
    elif args.action == "submit-sitemap":
        submit_sitemap()
    elif args.action == "list-sitemaps":
        list_sitemaps()
    elif args.action == "index-all":
        index_urls()
    elif args.action == "performance":
        query_performance()
