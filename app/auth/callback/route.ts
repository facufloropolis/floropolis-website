// Auth callback handler — v3 | 2026-05-17 | Job_PM
// After code exchange: checks if user has a profile.
// No profile → /auth/onboarding, UNLESS next= is a safe /signup path (wizard resumes itself).
// Profile exists → redirect to ?next or /shop.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Safe relative path: starts with "/", but NOT "//" (protocol-relative).
// Rejects scheme ("://") and backslash ("\"). Prevents open redirects.
function isSafeRelativePath(p: string): boolean {
  return p.startsWith("/") && !p.startsWith("//") && !p.includes("://") && !p.includes("\\");
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Validate next is a safe relative path (prevent open redirect)
  const rawNext = searchParams.get("next") ?? "";
  const hasNext = rawNext.length > 0;
  const nextIsSafe = hasNext && isSafeRelativePath(rawNext);
  const next = nextIsSafe ? rawNext : "/shop";

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

        // First-time user
        if (!profile) {
          // If caller passed a safe /signup path, honor it (wizard resumes).
          if (nextIsSafe && rawNext.startsWith("/signup")) {
            return NextResponse.redirect(`${origin}${rawNext}`);
          }
          // Legacy/unspecified path — collect business info via onboarding.
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
