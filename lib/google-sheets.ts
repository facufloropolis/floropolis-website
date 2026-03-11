/**
 * Google Sheets integration — appends rows to Floropolis Requests spreadsheet.
 *
 * Setup required (one-time):
 * 1. Create "Floropolis Requests" Google Sheet on facu@floropolis.com account
 * 2. Share it with a Google Service Account (or use Apps Script web app)
 * 3. Add to .env.local:
 *    GOOGLE_SHEETS_QUOTES_ID=<sheet_id_from_url>
 *    GOOGLE_SHEETS_CREDENTIALS=<service_account_json_as_single_line>
 *
 * Tab 1: "Quote Requests"   — appended on every quote submit
 * Tab 2: "Sample Boxes"      — appended on every sample box submit
 */

const SHEET_ID = process.env.GOOGLE_SHEETS_QUOTES_ID || "";
const CREDENTIALS_JSON = process.env.GOOGLE_SHEETS_CREDENTIALS || "";
const APPS_SCRIPT_URL = process.env.GOOGLE_SHEETS_APPS_SCRIPT_URL || ""; // alternative to service account

/** Get OAuth access token from service account credentials */
async function getAccessToken(): Promise<string | null> {
  if (!CREDENTIALS_JSON) return null;

  try {
    const credentials = JSON.parse(CREDENTIALS_JSON);
    const { client_email, private_key } = credentials;

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };

    // Create JWT — requires Node.js crypto (available in Next.js API routes)
    const { createSign } = await import("crypto");
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signingInput = `${header}.${body}`;
    const sign = createSign("SHA256");
    sign.update(signingInput);
    const signature = sign.sign(private_key.replace(/\\n/g, "\n"), "base64url");
    const jwt = `${signingInput}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[Sheets] Token error:", await tokenRes.text());
      return null;
    }

    const { access_token } = await tokenRes.json();
    return access_token;
  } catch (err) {
    console.error("[Sheets] getAccessToken error:", err);
    return null;
  }
}

/** Append a row to a specific tab via Google Sheets API */
async function appendRow(tab: string, values: (string | number | null)[]): Promise<boolean> {
  // Prefer Apps Script URL (simpler setup)
  if (APPS_SCRIPT_URL) {
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab, row: values }),
      });
      return res.ok || res.type === "opaque"; // no-cors returns opaque
    } catch (err) {
      console.error("[Sheets] Apps Script error:", err);
      return false;
    }
  }

  // Fallback: service account via Sheets REST API
  if (!SHEET_ID || !CREDENTIALS_JSON) {
    console.warn("[Sheets] Not configured — skipping sheet append");
    return false;
  }

  const token = await getAccessToken();
  if (!token) return false;

  try {
    const range = encodeURIComponent(`${tab}!A:Z`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [values] }),
      }
    );

    if (!res.ok) {
      console.error("[Sheets] Append error:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Sheets] Append exception:", err);
    return false;
  }
}

/** Append a quote request row to Tab 1: "Quote Requests" */
export async function appendQuoteToSheet(params: {
  quoteId: number | null;
  businessName: string;
  contactName: string;
  email: string;
  phone: string | null;
  items: { name: string; quantity: number; box_type: string; price: number; deal_price?: number | null }[];
  total: number;
  deliveryDate: string | null;
  promoCode: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  notes: string | null;
}): Promise<boolean> {
  const itemSummary = params.items
    .map((i) => `${i.quantity}x ${i.name} (${i.box_type})`)
    .join(", ");

  const row = [
    new Date().toISOString(),
    params.quoteId ?? "",
    params.businessName,
    params.contactName,
    params.email,
    params.phone ?? "",
    itemSummary,
    params.total,
    params.deliveryDate ?? "",
    params.promoCode ?? "",
    params.shippingCity ?? "",
    params.shippingState ?? "",
    "new",
    params.notes ?? "",
  ];

  return appendRow("Quote Requests", row);
}

/** Append a sample box request row to Tab 2: "Sample Boxes" */
export async function appendSampleBoxToSheet(params: {
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  boxChoice: string;
  notes: string;
}): Promise<boolean> {
  const row = [
    new Date().toISOString(),
    params.name,
    params.company,
    params.email,
    params.phone,
    params.address,
    params.city,
    params.state,
    params.zip,
    params.boxChoice,
    params.notes,
  ];

  return appendRow("Sample Boxes", row);
}
