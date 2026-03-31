// Auth callback handler — v2 | 2026-03-23 | Job_PM
// After code exchange: checks if user has a profile.
// No profile → redirect to onboarding. Profile exists → redirect to ?next or /shop.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Validate next is a relative path (prevent open redirect)
  const rawNext = searchParams.get("next") ?? "";
  const next = rawNext.startsWith("/") ? rawNext : "/shop";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if this user already has a client profile
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("client_profiles")
          .select("id")
          .eq("user_id", user.id)
          .single();

        // First-time user — send to onboarding to collect business info
        if (!profile) {
          return NextResponse.redirect(`${origin}/auth/onboarding`);
        }
      }

      // Existing user — go to requested page or shop
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth failed — redirect to login with error param
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
