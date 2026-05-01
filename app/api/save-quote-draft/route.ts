import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const { email, cart_items, customer_name, business_name, phone, delivery_date } = await req.json();

    if (!email || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/quote_drafts`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        email,
        cart_items: cart_items ?? null,
        customer_name: customer_name ?? null,
        business_name: business_name ?? null,
        phone: phone ?? null,
        delivery_date: delivery_date ?? null,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[save-quote-draft] Supabase error:", res.status, text);
      return NextResponse.json({ success: false }, { status: 500 });
    }

    const rows = await res.json();
    const draftId = Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
    return NextResponse.json({ success: true, draft_id: draftId });
  } catch (err) {
    console.error("[save-quote-draft] POST error:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { draft_id } = await req.json();

    if (!draft_id || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/quote_drafts?id=eq.${draft_id}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ converted: true, updated_at: new Date().toISOString() }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[save-quote-draft] PATCH error:", res.status, text);
      return NextResponse.json({ success: false }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[save-quote-draft] PATCH error:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
