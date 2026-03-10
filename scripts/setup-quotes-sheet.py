#!/usr/bin/env python3
"""
One-time setup: creates "Floropolis Requests" Google Sheet on facu@floropolis.com
with two tabs (Quote Requests + Sample Boxes) and headers.

Run once:
  python3 scripts/setup-quotes-sheet.py

Requires: pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client
"""

import os
import json
import sys

try:
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
except ImportError:
    print("Installing dependencies...")
    os.system("pip3 install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client -q")
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"]
TOKEN_PATH = os.path.expanduser("~/.google_workspace_mcp/credentials/sheets-setup-token.json")
# Use existing floropolis credentials if available
EXISTING_CREDS = os.path.expanduser("~/.google_workspace_mcp/credentials/facu@floropolis.com.json")

def get_credentials():
    creds = None

    # Try existing token first (if we ran before)
    if os.path.exists(TOKEN_PATH):
        with open(TOKEN_PATH) as f:
            data = json.load(f)
        creds = Credentials(
            token=data.get("token"),
            refresh_token=data.get("refresh_token"),
            token_uri=data.get("token_uri", "https://oauth2.googleapis.com/token"),
            client_id=data.get("client_id"),
            client_secret=data.get("client_secret"),
            scopes=SCOPES,
        )

    # Check if existing floropolis creds have client_id/secret we can reuse
    client_config = None
    if os.path.exists(EXISTING_CREDS):
        with open(EXISTING_CREDS) as f:
            existing = json.load(f)
        if existing.get("client_id") and existing.get("client_secret"):
            client_config = {
                "installed": {
                    "client_id": existing["client_id"],
                    "client_secret": existing["client_secret"],
                    "redirect_uris": ["http://localhost"],
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            }

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not client_config:
                print("\nNeed OAuth client credentials.")
                print("Go to: https://console.cloud.google.com/apis/credentials")
                print("Create OAuth 2.0 Client ID → Desktop App → download JSON")
                client_json = input("Paste path to downloaded client_secret.json: ").strip()
                flow = InstalledAppFlow.from_client_secrets_file(client_json, SCOPES)
            else:
                flow = InstalledAppFlow.from_client_config(client_config, SCOPES)

            print("\nOpening browser for Google auth (sign in as facu@floropolis.com)...")
            creds = flow.run_local_server(port=0)

        # Save token for next time
        with open(TOKEN_PATH, "w") as f:
            json.dump({
                "token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scopes": list(creds.scopes),
            }, f, indent=2)

    return creds

def create_spreadsheet(service):
    body = {
        "properties": {"title": "Floropolis Requests"},
        "sheets": [
            {
                "properties": {"sheetId": 0, "title": "Quote Requests", "index": 0},
            },
            {
                "properties": {"sheetId": 1, "title": "Sample Boxes", "index": 1},
            },
        ],
    }
    result = service.spreadsheets().create(body=body, fields="spreadsheetId,spreadsheetUrl").execute()
    return result["spreadsheetId"], result["spreadsheetUrl"]

def add_headers(service, spreadsheet_id):
    quote_headers = [[
        "Date", "Quote ID", "Business Name", "Contact", "Email", "Phone",
        "Items Summary", "Total ($)", "Delivery Date", "Promo Code",
        "Shipping City", "Shipping State", "Status", "Notes"
    ]]
    sample_headers = [[
        "Date", "Name", "Company", "Email", "Phone",
        "Address", "City", "State", "ZIP", "Box Choice", "Notes"
    ]]

    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="Quote Requests!A1",
        valueInputOption="RAW",
        body={"values": quote_headers},
    ).execute()

    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="Sample Boxes!A1",
        valueInputOption="RAW",
        body={"values": sample_headers},
    ).execute()

def format_headers(service, spreadsheet_id):
    """Bold headers, freeze first row, set column widths."""
    requests = [
        # Bold + background for Quote Requests headers (row 1)
        {
            "repeatCell": {
                "range": {"sheetId": 0, "startRowIndex": 0, "endRowIndex": 1},
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.02, "green": 0.59, "blue": 0.41},
                        "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": True},
                    }
                },
                "fields": "userEnteredFormat(backgroundColor,textFormat)",
            }
        },
        # Bold + background for Sample Boxes headers
        {
            "repeatCell": {
                "range": {"sheetId": 1, "startRowIndex": 0, "endRowIndex": 1},
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.94, "green": 0.60, "blue": 0.0},
                        "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": True},
                    }
                },
                "fields": "userEnteredFormat(backgroundColor,textFormat)",
            }
        },
        # Freeze row 1 on both sheets
        {"updateSheetProperties": {"properties": {"sheetId": 0, "gridProperties": {"frozenRowCount": 1}}, "fields": "gridProperties.frozenRowCount"}},
        {"updateSheetProperties": {"properties": {"sheetId": 1, "gridProperties": {"frozenRowCount": 1}}, "fields": "gridProperties.frozenRowCount"}},
    ]
    service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()

def update_env(spreadsheet_id):
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    env_path = os.path.abspath(env_path)

    with open(env_path, "r") as f:
        content = f.read()

    if "GOOGLE_SHEETS_QUOTES_ID" in content:
        import re
        content = re.sub(r"GOOGLE_SHEETS_QUOTES_ID=.*", f"GOOGLE_SHEETS_QUOTES_ID={spreadsheet_id}", content)
    else:
        content += f"\nGOOGLE_SHEETS_QUOTES_ID={spreadsheet_id}\n"

    with open(env_path, "w") as f:
        f.write(content)

    print(f"✅ Updated .env.local with GOOGLE_SHEETS_QUOTES_ID={spreadsheet_id}")

def main():
    print("🌸 Floropolis Requests — Google Sheet Setup")
    print("=" * 50)

    creds = get_credentials()
    service = build("sheets", "v4", credentials=creds)

    print("\n📊 Creating spreadsheet...")
    spreadsheet_id, url = create_spreadsheet(service)
    print(f"✅ Created: {url}")

    print("📝 Adding headers...")
    add_headers(service, spreadsheet_id)

    print("🎨 Formatting headers...")
    format_headers(service, spreadsheet_id)

    print("⚙️  Updating .env.local...")
    update_env(spreadsheet_id)

    print("\n" + "=" * 50)
    print("✅ DONE! Sheet is ready.")
    print(f"\n📋 Sheet URL: {url}")
    print(f"🔑 Sheet ID: {spreadsheet_id}")
    print("\nNext: restart the dev server to pick up the new env var.")
    print("Phase 3 is now LIVE — every quote and sample box will appear in the sheet automatically.")

if __name__ == "__main__":
    main()
