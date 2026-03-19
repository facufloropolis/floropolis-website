import { NextRequest, NextResponse } from "next/server";

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { first_name, email, shop_name } = body as {
    first_name: string;
    email: string;
    shop_name: string | null;
  };

  if (!email || !first_name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const errors: string[] = [];

  // 1. Save to Supabase
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/guide_signups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          first_name,
          email,
          shop_name: shop_name || null,
          source: "floropolis.com/guide",
          created_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        errors.push(`Supabase: ${text}`);
      }
    } catch (e) {
      errors.push(`Supabase exception: ${e}`);
    }
  }

  // 2. Add to Brevo contact list "Floropolis Guide Downloads"
  if (BREVO_API_KEY) {
    try {
      const res = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY,
        },
        body: JSON.stringify({
          email,
          attributes: {
            FIRSTNAME: first_name,
            SHOPNAME: shop_name || "",
          },
          listIds: [4], // "Floropolis Guide Downloads" list — update list ID if different
          updateEnabled: true,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        errors.push(`Brevo: ${text}`);
      }
    } catch (e) {
      errors.push(`Brevo exception: ${e}`);
    }
  }

  // Always return success to the user even if backend errors occur
  // (errors are logged for Rose to hook via n8n later)
  if (errors.length > 0) {
    console.error("[guide-signup] Backend errors:", errors);
  }

  return NextResponse.json({ ok: true });
}
