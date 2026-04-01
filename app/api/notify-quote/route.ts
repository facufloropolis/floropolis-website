import { NextRequest, NextResponse } from "next/server";
import { appendQuoteToSheet } from "@/lib/google-sheets";

const FACU_EMAIL = process.env.FACU_EMAIL || "facu@floropolis.com";
const JJ_EMAIL = process.env.JJ_EMAIL || "jjp@floropolis.com";
const WHATSAPP_NUMBER = "17864603229";
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "1702689983"; // Facu's chat ID

// Validate required env vars at startup — errors visible in Vercel logs
if (!BREVO_API_KEY) console.error("[notify-quote] MISSING ENV: BREVO_API_KEY — team emails will NOT send");
if (!SUPABASE_URL) console.error("[notify-quote] MISSING ENV: NEXT_PUBLIC_SUPABASE_URL — quotes will NOT be saved");
if (!SUPABASE_ANON_KEY) console.error("[notify-quote] MISSING ENV: NEXT_PUBLIC_SUPABASE_ANON_KEY — quotes will NOT be saved");
if (!process.env.FACU_EMAIL) console.warn("[notify-quote] FACU_EMAIL not set, falling back to facu@floropolis.com");
if (!process.env.JJ_EMAIL) console.warn("[notify-quote] JJ_EMAIL not set, falling back to jjp@floropolis.com");

interface QuoteItem {
  slug: string;
  name: string;
  category: string;
  vendor: string;
  price: number;
  deal_price?: number;
  quantity: number;
  units_per_box: number;
  box_type: string;
  unit: string;
  delivery_date?: string;
  stem_length?: string;
}

interface QuotePayload {
  business_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  preferred_delivery_date: string | null;
  notes: string | null;
  wants_call: boolean;
  is_existing_client: boolean;
  items: QuoteItem[];
  subtotal: number;
  discount: number;
  total: number;
  promo_code: string | null;
}

function formatItemsText(items: QuoteItem[]): string {
  return items
    .map((item) => {
      const price = item.deal_price ?? item.price;
      const units = item.units_per_box || 1;
      const lineTotal = price * item.quantity * units;
      const stemsLabel = item.units_per_box > 0 ? `${item.units_per_box} ${item.unit === "Bunch" ? "bunches" : "stems"}` : "qty TBD";
      return `- ${item.name} (${item.category}) | ${item.stem_length || ""} | ${item.quantity}x ${item.box_type} (${stemsLabel}) | $${price.toFixed(2)}/${item.unit.toLowerCase()} | $${lineTotal.toFixed(2)}${item.delivery_date ? ` | Delivery: ${item.delivery_date}` : ""}`;
    })
    .join("\n");
}

function formatItemsHtml(items: QuoteItem[]): string {
  const rows = items
    .map((item) => {
      const price = item.deal_price ?? item.price;
      const units = item.units_per_box || 1;
      const lineTotal = price * item.quantity * units;
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${item.name}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${item.stem_length || "-"}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${item.quantity}x ${item.box_type}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">$${price.toFixed(2)}/${item.unit.toLowerCase()}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>$${lineTotal.toFixed(2)}</strong></td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${item.delivery_date || "-"}</td>
      </tr>`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead><tr style="background:#f1f5f9">
      <th style="padding:8px;text-align:left">Product</th>
      <th style="padding:8px;text-align:left">Length</th>
      <th style="padding:8px;text-align:left">Qty</th>
      <th style="padding:8px;text-align:left">Price</th>
      <th style="padding:8px;text-align:left">Total</th>
      <th style="padding:8px;text-align:left">Delivery</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// 1. Save to Supabase — retries up to 3 times before giving up
async function saveToSupabase(payload: QuotePayload): Promise<{ id: number | null; error: string | null }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { id: null, error: "Supabase not configured" };
  }

  const body = {
    customer_name: payload.contact_name,
    business_name: payload.business_name,
    email: payload.email,
    phone: payload.phone || "",
    is_existing_client: payload.is_existing_client || false,
    items: payload.items,
    subtotal: payload.subtotal,
    promo_code: payload.promo_code,
    discount_amount: payload.discount,
    grand_total: payload.total,
    delivery_date: payload.preferred_delivery_date,
    notes: payload.notes,
    wants_call: payload.wants_call,
    shipping_address: payload.shipping_address,
    shipping_city: payload.shipping_city,
    shipping_state: payload.shipping_state,
    shipping_zip: payload.shipping_zip,
    status: "new",
    source: "website",
  };

  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/quote_requests`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=headers-only",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        lastError = text;
        console.error(`[Supabase] Save error (attempt ${attempt}/3):`, res.status, text);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }

      // Extract ID from Location header: /quote_requests?id=eq.21
      const location = res.headers.get("location") || "";
      const idMatch = location.match(/id=eq\.(\d+)/);
      const id = idMatch ? parseInt(idMatch[1], 10) : null;
      return { id, error: null };
    } catch (err) {
      lastError = String(err);
      console.error(`[Supabase] Save exception (attempt ${attempt}/3):`, err);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  return { id: null, error: lastError };
}

// 2. Send email via Brevo
async function sendBrevoEmail(payload: QuotePayload, quoteId: number | null, dbFailed: boolean): Promise<{ ok: boolean; detail?: string }> {
  if (!BREVO_API_KEY) {
    console.error("[Brevo] MISSING BREVO_API_KEY — team notification email NOT sent for this quote");
    return { ok: false, detail: "BREVO_API_KEY missing in env" };
  }

  const itemsHtml = formatItemsHtml(payload.items);
  const quoteIdLabel = quoteId ? `#${quoteId}` : "(NO DB ID)";
  const dbFailureBanner = dbFailed
    ? `<div style="background:#dc2626;color:white;padding:14px 20px;font-size:15px;font-weight:bold;text-align:center;letter-spacing:0.5px">
        ⚠️ DATABASE SAVE FAILED — ENTER THIS QUOTE MANUALLY IN SUPABASE
      </div>`
    : "";

  const htmlContent = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
      ${dbFailureBanner}
      <div style="background:${dbFailed ? "#7f1d1d" : "#059669"};color:white;padding:16px 24px;border-radius:${dbFailed ? "0" : "8px 8px"} 0 0">
        <h1 style="margin:0;font-size:20px">🌸 New Quote Request ${quoteIdLabel}</h1>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
        <h2 style="margin:0 0 16px;font-size:16px;color:#334155">Customer Info</h2>
        <table style="font-size:14px;margin-bottom:20px">
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Business:</td><td><strong>${payload.business_name}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Contact:</td><td>${payload.contact_name}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Email:</td><td><a href="mailto:${payload.email}">${payload.email}</a></td></tr>
          ${payload.phone ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Phone:</td><td><a href="tel:${payload.phone}">${payload.phone}</a></td></tr>` : ""}
          ${payload.is_existing_client ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Status:</td><td>🟢 Existing Client</td></tr>` : ""}
          ${payload.shipping_address ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Ship To:</td><td>${payload.shipping_address}, ${payload.shipping_city}, ${payload.shipping_state} ${payload.shipping_zip}</td></tr>` : ""}
          ${payload.wants_call ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Wants Call:</td><td>✅ Yes</td></tr>` : ""}
        </table>

        <h2 style="margin:0 0 12px;font-size:16px;color:#334155">Order Items</h2>
        ${itemsHtml}

        <div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:8px;font-size:14px">
          <div style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>$${payload.subtotal.toFixed(2)}</span></div>
          ${payload.discount > 0 ? `<div style="display:flex;justify-content:space-between;color:#059669"><span>Discount (${payload.promo_code}):</span><span>-$${payload.discount.toFixed(2)}</span></div>` : ""}
          <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:16px;margin-top:8px;padding-top:8px;border-top:2px solid #e2e8f0"><span>Total:</span><span>$${payload.total.toFixed(2)}</span></div>
        </div>

        ${payload.notes ? `<div style="margin-top:16px;padding:12px;background:#fffbeb;border-radius:8px;font-size:14px"><strong>Notes:</strong> ${payload.notes}</div>` : ""}

        ${payload.phone ? `<div style="margin-top:24px;text-align:center">
          <a href="https://wa.me/${payload.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${payload.contact_name}, this is Floropolis. We received your quote request and will confirm shortly!`)}" style="display:inline-block;background:#25D366;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;margin-right:8px">WhatsApp Client</a>
          <a href="sms:${payload.phone.replace(/\D/g, "")}?body=${encodeURIComponent(`Hi ${payload.contact_name}, this is Floropolis. We received your quote request and will confirm shortly!`)}" style="display:inline-block;background:#3b82f6;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">Text Client</a>
        </div>` : `<div style="margin-top:24px;text-align:center;color:#64748b;font-size:13px">No phone provided — reply via <a href="mailto:${payload.email}">email</a></div>`}
      </div>
    </div>
  `;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Floropolis Orders", email: "facu@floropolis.com" },
        to: [
          { email: FACU_EMAIL, name: "Facu" },
          { email: JJ_EMAIL, name: "JJ" },
        ],
        subject: `${dbFailed ? "⚠️ DB FAILED — " : ""}🌸 New Quote ${quoteIdLabel} — ${payload.business_name} — $${payload.total.toFixed(2)}`,
        htmlContent,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[Brevo] Email error:", res.status, text);
      return { ok: false, detail: `Brevo HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[Brevo] Email exception:", err);
    return { ok: false, detail: String(err) };
  }
}

// 3. Send customer confirmation email
async function sendCustomerConfirmation(payload: QuotePayload, quoteId: number | null): Promise<boolean> {
  if (!BREVO_API_KEY || !payload.email) {
    return false;
  }

  const itemsHtml = formatItemsHtml(payload.items);
  const quoteRef = quoteId ? `#${quoteId}` : "";

  const htmlContent = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#059669;color:white;padding:20px 24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="margin:0;font-size:22px">Quote Request Received ${quoteRef}</h1>
        <p style="margin:8px 0 0;font-size:14px;opacity:0.9">Thank you for choosing Floropolis!</p>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-top:none">
        <p style="font-size:14px;color:#334155;margin:0 0 16px">
          Hi ${payload.contact_name},<br><br>
          We've received your quote request${quoteRef ? ` (Reference: <strong>${quoteRef}</strong>)` : ""} and our team is reviewing it now.
          <strong>We'll confirm availability and pricing within 1 hour</strong> during business hours (Mon–Fri, 8 AM – 6 PM ET).
        </p>

        <h2 style="margin:0 0 12px;font-size:16px;color:#334155">Your Quote Summary</h2>
        ${itemsHtml}

        <div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:8px;font-size:14px">
          <div style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>$${payload.subtotal.toFixed(2)}</span></div>
          ${payload.discount > 0 ? `<div style="display:flex;justify-content:space-between;color:#059669"><span>Discount (${payload.promo_code}):</span><span>-$${payload.discount.toFixed(2)}</span></div>` : ""}
          <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:16px;margin-top:8px;padding-top:8px;border-top:2px solid #e2e8f0"><span>Estimated Total:</span><span>$${payload.total.toFixed(2)}</span></div>
        </div>

        <div style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
          <h3 style="margin:0 0 8px;font-size:14px;color:#166534">What happens next?</h3>
          <ol style="margin:0;padding-left:20px;font-size:13px;color:#334155;line-height:1.6">
            <li>We verify product availability and confirm final pricing</li>
            <li>You receive a final quote with delivery details</li>
            <li>You approve, and we ship farm-direct to your door</li>
          </ol>
        </div>

        <div style="margin-top:24px;text-align:center">
          <a href="https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hi! I just submitted quote ${quoteRef}. I have a question about my order.`)}"
             style="display:inline-block;background:#25D366;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;margin-right:8px">
            WhatsApp Us
          </a>
          <a href="tel:+17864603229"
             style="display:inline-block;background:#3b82f6;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">
            Call Us: (786) 460-3229
          </a>
        </div>
      </div>
      <div style="padding:16px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;text-align:center">
        <p style="margin:0;font-size:12px;color:#94a3b8">
          Floropolis — Farm-Direct Wholesale Flowers<br>
          <a href="https://www.floropolis.com" style="color:#059669">floropolis.com</a> · <a href="tel:+17864603229" style="color:#059669">(786) 460-3229</a>
        </p>
      </div>
    </div>
  `;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Floropolis", email: "facu@floropolis.com" },
        to: [{ email: payload.email, name: payload.contact_name }],
        subject: `Your Floropolis Quote ${quoteRef} — We're on it!`,
        htmlContent,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[Brevo] Customer email error:", res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Brevo] Customer email exception:", err);
    return false;
  }
}

// Flag quote in Supabase when notifications fail
async function flagQuoteNotificationFailure(quoteId: number, reason: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !quoteId) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/quote_requests?id=eq.${quoteId}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ internal_notes: `NOTIFICATION FAILED: ${reason}` }),
    });
  } catch (err) {
    console.error("[Quote] Could not flag notification failure:", err);
  }
}


// 4b. Send Telegram alert to Facu
async function sendTelegramAlert(payload: QuotePayload, quoteId: number | null): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  const clientPhone = payload.phone?.replace(/\D/g, "") || "";
  const itemLines = payload.items.slice(0, 5).map(item => {
    const price = item.deal_price ?? item.price;
    return `  · ${item.name} ×${item.quantity} ${item.box_type} — $${(price * item.quantity * (item.units_per_box || 1)).toFixed(0)}`;
  }).join("\n");
  const moreItems = payload.items.length > 5 ? `\n  · +${payload.items.length - 5} more` : "";

  const text = [
    `🌸 *New Quote${quoteId ? ` #${quoteId}` : ""}* — *$${payload.total.toFixed(0)}*`,
    ``,
    `👤 ${payload.contact_name} — ${payload.business_name}`,
    payload.phone ? `📱 ${payload.phone}` : null,
    `✉️ ${payload.email}`,
    payload.shipping_state ? `📍 ${payload.shipping_city}, ${payload.shipping_state}` : null,
    ``,
    `🌹 ${payload.items.length} item${payload.items.length !== 1 ? "s" : ""}:`,
    itemLines + moreItems,
    ``,
    payload.preferred_delivery_date ? `📅 Delivery: ${payload.preferred_delivery_date}` : null,
    payload.notes ? `📝 ${payload.notes}` : null,
    clientPhone ? `\n📲 [WhatsApp client](https://wa.me/${clientPhone})` : null,
  ].filter(Boolean).join("\n");

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error("[Telegram] Alert failed:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload: QuotePayload = await req.json();

    // 1. Save to Supabase — retries 3x; if all fail, continue anyway (client never blocked)
    const { id: quoteId, error: dbError } = await saveToSupabase(payload);
    const dbFailed = !!dbError;
    if (dbFailed) {
      console.error("[Quote] DB save FAILED after 3 attempts:", dbError, "— sending flagged team email");
    }

    // 2. Send internal notification email via Brevo — always fires; banner if DB failed
    const { ok: emailSent, detail: emailErrorDetail } = await sendBrevoEmail(payload, quoteId, dbFailed);
    if (!emailSent) {
      console.error(`[Quote] Team email FAILED for #${quoteId} (${payload.business_name}) — ${emailErrorDetail}`);
      if (quoteId) flagQuoteNotificationFailure(quoteId, `Team email not sent: ${emailErrorDetail ?? "unknown"}`);
    }

    // 2b. Append to Google Sheet (Tab 1: Quote Requests) — non-blocking
    appendQuoteToSheet({
      quoteId,
      businessName: payload.business_name,
      contactName: payload.contact_name,
      email: payload.email,
      phone: payload.phone,
      items: payload.items,
      total: payload.total,
      deliveryDate: payload.preferred_delivery_date,
      promoCode: payload.promo_code,
      shippingCity: payload.shipping_city,
      shippingState: payload.shipping_state,
      notes: payload.notes,
    }).catch((err) => console.error("[Sheets] Quote append FAILED:", err));

    // 3. Send customer confirmation email
    const customerEmailSent = await sendCustomerConfirmation(payload, quoteId);
    if (!customerEmailSent) {
      console.error(`[Quote] Customer confirmation email FAILED for #${quoteId} — ${payload.email}`);
    }

    // 4. Build WhatsApp URL for client
    const itemsText = formatItemsText(payload.items);
    const clientPhone = payload.phone?.replace(/\D/g, "") || "";
    const summary = [
      `NEW QUOTE REQUEST${quoteId ? ` #${quoteId}` : ""}`,
      `Business: ${payload.business_name}`,
      `Contact: ${payload.contact_name}`,
      `Email: ${payload.email}`,
      payload.phone ? `Phone: ${payload.phone}` : null,
      ``,
      `ITEMS:`,
      itemsText,
      ``,
      `TOTAL: $${payload.total.toFixed(2)}`,
      ``,
      clientPhone ? `📲 WhatsApp client: https://wa.me/${clientPhone}` : null,
      clientPhone ? `💬 Text client: sms:${clientPhone}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const whatsappText = encodeURIComponent(`🌸 New Quote Request!\n\n${summary}`);
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappText}`;

    // 4b. Telegram alert — fire and forget, never blocks
    sendTelegramAlert(payload, quoteId).catch(err => console.error("[Telegram] alert error:", err));

    // Log result
    console.log(`[Quote] #${quoteId ?? "NO_ID"} | db:${dbError ? "FAILED" : "OK"} | team_email:${emailSent ? "OK" : "FAILED"} | customer_email:${customerEmailSent ? "OK" : "FAILED"} | ${payload.business_name} | $${payload.total.toFixed(2)}`);

    const warnings: string[] = [];
    if (!emailSent) warnings.push("Team notification email failed — check Vercel logs");
    if (!customerEmailSent) warnings.push("Customer confirmation email failed");
    if (dbError) warnings.push("Quote may not have saved to database");

    return NextResponse.json({
      success: true,
      quote_id: quoteId,
      email_sent: emailSent,
      customer_email_sent: customerEmailSent,
      warnings: warnings.length > 0 ? warnings : undefined,
      whatsapp_url: whatsappUrl,
    });
  } catch (err) {
    console.error("Quote notification error:", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
