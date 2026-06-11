import { NextRequest, NextResponse } from "next/server";
import { appendSampleBoxToSheet } from "@/lib/google-sheets";
import { getBackupServiceClient } from "@/lib/supabase/backup-server";

// ─────────────────────────────────────────────────────────────────────────────
// DB-FIRST ORDER BIRTH (the LAW): the sample-box form must birth a real order in
// the spine so the cohort-review surface is never empty. This is ADDITIVE — the
// sheet append + internal email below are kept EXACTLY as-is and must never break.
//
// IDENTITY TRADEOFF — read before changing:
//   orders has CHECK orders_identity_born_with: (is_test OR lead_master_id IS NOT NULL).
//   A real web request is NOT a test, so we cannot insert with is_test=true, and we
//   cannot insert with lead_master_id=NULL either. Creating/resolving a lead_master
//   row for a brand-new lead is Rose's lane (OUT OF SCOPE here — this file only owns
//   the intake endpoint). Therefore the HONEST design is:
//     • match an existing lead_master by email (case-insensitive, exact) →
//       order is BORN (fulfillment_state='requested', linkage_mode='exact').
//     • NO match → we do NOT fake an order and do NOT crash the form. We skip order
//       creation, still run sheet+email, and return {order_created:false,
//       reason:'lead_unresolved'} + a console.warn so the gap is visible.
//   FOLLOW-UP (Rose lane): auto-create/resolve lead_master for new web leads, which
//   will close this gap and let unresolved intakes birth orders too.
//
//   Insert is fail-OPEN: any throw is caught, logged, order_created:false, and the
//   form still proceeds to sheet+email. The florist must never see a 500.
// ─────────────────────────────────────────────────────────────────────────────

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

interface OrderBirthResult {
  order_created: boolean;
  reason: string | null;
  order_id: number | null;
  order_number: string | null;
}

// Generates SB-yyyymmdd-XXXXXX (uppercase base36 random tail). order_number is a
// NOT NULL UNIQUE text column; this satisfies both. We supply our own value rather
// than relying on the table default next_order_number() so sample orders carry the
// SB- prefix and are trivially identifiable in the spine.
function makeSampleOrderNumber(): string {
  const d = new Date();
  const yyyymmdd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const tail = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SB-${yyyymmdd}-${tail}`;
}

async function birthSampleOrder(payload: SampleBoxPayload): Promise<OrderBirthResult> {
  const skip = (reason: string): OrderBirthResult => ({
    order_created: false,
    reason,
    order_id: null,
    order_number: null,
  });

  try {
    const email = (payload.email || "").trim();
    if (!email) return skip("missing_email");

    const supabase = getBackupServiceClient();

    // Idempotency: skip if an active sample-stage order for this email was created
    // in the last 24h (states still in the early intake/qualification window).
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent, error: dupErr } = await supabase
      .from("orders")
      .select("id")
      .ilike("client_email", email)
      .eq("source", "sample")
      .in("fulfillment_state", ["requested", "address_confirmed", "qualified"])
      .gte("created_at", since)
      .limit(1);

    if (dupErr) {
      console.warn("[SampleBox][order] duplicate-check failed:", dupErr.message);
      // Fail-open: a failed dup check must not block the form. Proceed to attempt insert.
    } else if (recent && recent.length > 0) {
      return skip("recent_duplicate");
    }

    // Resolve lead identity by email (case-insensitive exact). lead_master is Rose's
    // canonical lead table; we only READ it here.
    const { data: leadRows, error: leadErr } = await supabase
      .from("lead_master")
      .select("id")
      .ilike("email", email)
      .limit(1);

    if (leadErr) {
      console.warn("[SampleBox][order] lead_master lookup failed:", leadErr.message);
      return skip("lead_lookup_failed");
    }

    const leadMasterId: number | null = leadRows && leadRows.length > 0 ? leadRows[0].id : null;
    const matched = leadMasterId != null;

    // Identity (constraint orders_identity_born_with, relaxed 2026-06-08):
    //  - matched   → born 'requested', linkage 'exact'.
    //  - unmatched → born 'exception', linkage 'unresolved' (NOT faked, NOT dropped) —
    //    visible + routed to Rose to resolve/create the lead_master row. This is the
    //    point of a sample form: capturing leads NOT yet in the CRM.
    const linkageMode = matched ? "exact" : "unresolved";
    const bornState = matched ? "requested" : "exception";
    if (!matched) {
      console.warn(
        `[SampleBox][order] lead_unresolved for ${email} — order BORN in 'exception' for Rose identity resolution.`,
      );
    }

    const leadTimeDays = 7;
    const requestedDelivery = new Date(Date.now() + leadTimeDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10); // current_date + 7 (YYYY-MM-DD)

    const { data: inserted, error: insErr } = await supabase
      .from("orders")
      .insert({
        order_number: makeSampleOrderNumber(),
        source: "sample",
        status: "no_charge",
        fulfillment_state: bornState,
        payment_mode: "mode_c",
        lead_time_days: leadTimeDays,
        requested_delivery_date: requestedDelivery,
        currency: "USD",
        subtotal: 0,
        shipping_total: 0,
        tax_total: 0,
        discount_total: 0,
        grand_total: 0,
        is_test: false,
        lead_master_id: leadMasterId,
        linkage_mode: linkageMode,
        client_name: payload.name || null,
        business_name: payload.company || null,
        client_email: email,
        client_phone: payload.phone || null,
        box_choice: payload.boxChoice || null,
      })
      .select("id, order_number")
      .single();

    if (insErr || !inserted) {
      console.error("[SampleBox][order] insert failed:", insErr?.message ?? "no row returned");
      return skip("insert_failed");
    }

    console.log(`[SampleBox][order] BORN id=${inserted.id} number=${inserted.order_number} lead=${leadMasterId ?? "unresolved"} state=${bornState}`);
    return {
      order_created: true,
      reason: matched ? null : "born_unresolved_exception",
      order_id: inserted.id,
      order_number: inserted.order_number,
    };
  } catch (err) {
    // Fail-open: never let order birth crash the form.
    console.error("[SampleBox][order] exception (fail-open):", err);
    return skip("exception");
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload: SampleBoxPayload = await req.json();

    // 0. FIRST: birth a real order in the spine (DB-first, the LAW). Additive +
    //    fail-open — never blocks the sheet/email below.
    const orderResult = await birthSampleOrder(payload);

    // 1. Save to Supabase
    const { id: requestId } = await saveToSupabase(payload);

    // 2. Send internal email to Facu + JJ
    const emailSent = await sendInternalEmail(payload, requestId);

    // 3. Append to Google Sheet Tab 2: Sample Boxes (non-blocking)
    appendSampleBoxToSheet(payload).then((ok) => {
      if (!ok) console.error("[Sheets] appendSampleBoxToSheet returned false — check service-account share on sheet 1p0Ef-czUUExHMQgtfncbu5uvOHQI4_ugNmttxQ1HqCI");
    }).catch((err) =>
      console.error("[Sheets] Sample box append failed:", err)
    );

    console.log(`[SampleBox] Saved: ${requestId ?? "FAILED"} | Email: ${emailSent ? "SENT" : "FAILED"} | Order: ${orderResult.order_created ? orderResult.order_number : `NONE(${orderResult.reason})`} | ${payload.name} — ${payload.city}, ${payload.state}`);

    return NextResponse.json({
      success: true,
      request_id: requestId,
      order_created: orderResult.order_created,
      order_id: orderResult.order_id,
      order_number: orderResult.order_number,
      reason: orderResult.reason,
    });
  } catch (err) {
    console.error("[SampleBox] Error:", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
