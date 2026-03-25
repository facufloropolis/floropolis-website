import { NextRequest, NextResponse } from "next/server";
import { appendSampleBoxToSheet } from "@/lib/google-sheets";

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const FACU_EMAIL = process.env.FACU_EMAIL || "facu@floropolis.com";
const JJ_EMAIL = process.env.JJ_EMAIL || "jjp@floropolis.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Startup validation — log errors immediately so Vercel logs catch misconfiguration
if (!BREVO_API_KEY) console.error("[notify-sample-box] MISSING ENV: BREVO_API_KEY — team emails will NOT send");
if (!SUPABASE_URL) console.error("[notify-sample-box] MISSING ENV: NEXT_PUBLIC_SUPABASE_URL — submissions will NOT be saved");

interface SampleBoxPayload {
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
}

async function saveToSupabase(payload: SampleBoxPayload): Promise<{ id: number | null; error: string | null }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { id: null, error: "Supabase not configured" };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sample_box_requests`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=headers-only",
      },
      body: JSON.stringify({
        customer_name: payload.name,
        business_name: payload.company,
        email: payload.email,
        phone: payload.phone,
        shipping_address: payload.address,
        shipping_city: payload.city,
        shipping_state: payload.state,
        shipping_zip: payload.zip,
        box_choice: payload.boxChoice,
        notes: payload.notes,
        status: "new",
        source: "website",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn("[Supabase] Sample box save:", res.status, text);
      return { id: null, error: text };
    }

    const location = res.headers.get("location") || "";
    const idMatch = location.match(/id=eq\.(\d+)/);
    return { id: idMatch ? parseInt(idMatch[1], 10) : null, error: null };
  } catch (err) {
    console.error("[Supabase] Sample box exception:", err);
    return { id: null, error: String(err) };
  }
}

async function sendInternalEmail(payload: SampleBoxPayload, requestId: number | null): Promise<boolean> {
  if (!BREVO_API_KEY) return false;

  const idLabel = requestId ? `#${requestId}` : "(pending)";
  const htmlContent = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#059669;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
        <h1 style="margin:0;font-size:20px">🌸 New Sample Box Request ${idLabel}</h1>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
        <table style="font-size:14px;margin-bottom:20px">
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Name:</td><td><strong>${payload.name}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Company:</td><td>${payload.company || "—"}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Email:</td><td><a href="mailto:${payload.email}">${payload.email}</a></td></tr>
          ${payload.phone ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Phone:</td><td><a href="tel:${payload.phone}">${payload.phone}</a></td></tr>` : ""}
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Ship To:</td><td>${payload.address}, ${payload.city}, ${payload.state} ${payload.zip}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Box Choice:</td><td><strong>${payload.boxChoice}</strong></td></tr>
          ${payload.notes ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Notes:</td><td>${payload.notes}</td></tr>` : ""}
        </table>
        ${payload.phone ? `
        <div style="text-align:center">
          <a href="https://wa.me/${payload.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${payload.name}! This is Floropolis. We received your sample box request and are preparing it now.`)}"
             style="display:inline-block;background:#25D366;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;margin-right:8px">
            WhatsApp
          </a>
          <a href="mailto:${payload.email}"
             style="display:inline-block;background:#3b82f6;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">
            Reply by Email
          </a>
        </div>` : ""}
      </div>
    </div>
  `;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "Floropolis", email: "facu@floropolis.com" },
        to: [{ email: FACU_EMAIL, name: "Facu" }, { email: JJ_EMAIL, name: "JJ" }],
        subject: `🌸 Sample Box ${idLabel} — ${payload.name} (${payload.city}, ${payload.state})`,
        htmlContent,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("[Brevo] Sample box email error:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload: SampleBoxPayload = await req.json();

    // 1. Save to Supabase
    const { id: requestId } = await saveToSupabase(payload);

    // 2. Send internal email to Facu + JJ
    const emailSent = await sendInternalEmail(payload, requestId);

    // 3. Append to Google Sheet Tab 2: Sample Boxes (non-blocking)
    appendSampleBoxToSheet(payload).catch((err) =>
      console.error("[Sheets] Sample box append failed:", err)
    );

    console.log(`[SampleBox] Saved: ${requestId ?? "FAILED"} | Email: ${emailSent ? "SENT" : "FAILED"} | ${payload.name} — ${payload.city}, ${payload.state}`);

    return NextResponse.json({ success: true, request_id: requestId });
  } catch (err) {
    console.error("[SampleBox] Error:", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
