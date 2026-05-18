// Auth callback handler for the BACKUP project (Phase 4 transactional auth).
// v1 | 2026-05-17 | Job_PM W5-S15 [V8 SHADOW]
//
// Mirrors /auth/callback but exchanges the OAuth code against supabase-backup
// instead of prod. After exchange:
//   - No client_profile in backup -> redirect to /signup?step=1 if next= is a
//     safe /signup path, else /auth/onboarding (which itself will write to
//     backup once converted -- TODO follow-up ticket).
//   - Profile exists -> redirect to ?next or /shop.
//
// Open-redirect protection identical to prod /auth/callback.

import { NextResponse } from "next/server";
import { createBackupServerClient } from "@/lib/supabase/backup-server-session";
import { getBackupServiceClient } from "@/lib/supabase/backup-server";

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
    let supabase;
    try {
      supabase = await createBackupServerClient();
    } catch (err) {
      // Backup env not configured -- can't complete OAuth round-trip.
      console.error("[auth/callback-backup] backup env missing:", err);
      return NextResponse.redirect(`${origin}/auth/login?error=backup_unavailable`);
    }

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if this user already has a client profile in BACKUP.
      // IMPORTANT: use service-role client for the profile lookup, NOT the
      // cookie-bound session client. Cookies set by exchangeCodeForSession
      // are not yet visible to the cookie-bound client in the same request
      // (Next.js cookie race) -- which made RLS reject the SELECT and sent
      // existing users through the signup wizard.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const serviceClient = getBackupServiceClient();
        const { data: profile } = await serviceClient
          .from("client_profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        // First-time user
        if (!profile) {
          // If caller passed a safe /signup path, honor it (wizard resumes).
          if (nextIsSafe && rawNext.startsWith("/signup")) {
            return NextResponse.redirect(`${origin}${rawNext}`);
          }
          // Legacy/unspecified path -- send them to the signup wizard to
          // collect business info instead of bouncing to /auth/onboarding
          // (which still writes against the prod project).
          return NextResponse.redirect(`${origin}/signup?step=1`);
        }
      }

      // Existing user -- go to requested page or shop
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("[auth/callback-backup] exchangeCodeForSession failed:", error);
  }

  // Auth failed -- redirect to login with error param
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
