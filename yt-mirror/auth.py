"""One-time local auth: prints REFRESH_TOKEN for GitHub secrets.
Run on YOUR pc (not GitHub):  pip install google-api-python-client google-auth-oauthlib
Then:  python yt-mirror/auth.py --client-id <ID> --client-secret <SECRET>
A browser opens -> log in with the THROWAWAY YouTube account -> approve.
"""
import argparse
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--client-id", required=True)
    ap.add_argument("--client-secret", required=True)
    a = ap.parse_args()
    flow = InstalledAppFlow.from_client_config(
        {"installed": {
            "client_id": a.client_id,
            "client_secret": a.client_secret,
            "redirect_uris": ["http://localhost:8080/"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }},
        scopes=SCOPES,
    )
    creds = flow.run_local_server(port=8080)
    print("\n=== COPY THIS INTO GitHub SECRET YT_REFRESH_TOKEN ===")
    print(creds.refresh_token)
