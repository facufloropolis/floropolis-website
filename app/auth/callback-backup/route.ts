// Auth callback handler for the BACKUP project (Phase 4 transactional auth).
// v3 | 2026-05-18 | Job_PM AUTH-FIX [V8 SHADOW]
//
// v3 fix: replace the two-response pattern with a single response object.
// The previous v2 built a SECOND NextResponse.redirect() when the profile
// lookup said "send to signup wizard" and then copied cookies between
// responses via response.cookies.getAll(). That is exactly the failure
// mode flagged in @supabase/ssr issue #55 — ResponseCookies.getAll() is
// not symmetric with set(), so the manual copy intermittently drops the
// PKCE verifier / session cookies and the browser lands signed-out.
//
// Canonical pattern (Supabase Next.js 15 docs): build ONE response up
// front; the createServerClient cookies.setAll adapter writes cookies
// onto it; if we need to change destination after profile lookup, mutate
// the response's Location header instead of constructing a new response.
//
// Also: @supabase/ssr upgraded 0.9.0 → 0.10.3 in the same change.

import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getBackupServiceClient } from "@/lib/supabase/backup-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSafeRelativePath(p: string): boolean {
  return p.startsWith("/") && !p.startsWith("//") && !p.includes("://") && !p.includes("\\");
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "";
  const nextIsSafe = rawNext.length > 0 && isSafeRelativePath(rawNext);
  const next = nextIsSafe ? rawNext : "/shop";

  const url = process.env.NEXT_PUBLIC_BACKUP_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("[auth/callback-backup] missing NEXT_PUBLIC_BACKUP_SUPABASE_* env");
    return NextResponse.redirect(`${origin}/auth/login?error=backup_unavailable`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`);
  }

  // CANONICAL PATTERN: build ONE response up front; supabase writes cookies to it.
  // Decide final destination AFTER we know the user's profile state by mutating the
  // response's Location header (not by building a new response that loses cookies).
  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("[auth/callback-backup] exchange failed:", exchangeError);
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  // Look up profile via SERVICE role (no RLS race, no cookie dependency).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/auth/login?error=no_user`);
  }

  const service = getBackupServiceClient();
  const { data: profile } = await service
    .from("client_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    // CHANGE LOCATION on the SAME response (cookies stay attached).
    const target = (nextIsSafe && rawNext.startsWith("/signup"))
      ? `${origin}${rawNext}`
      : `${origin}/signup?step=1`;
    response.headers.set("location", target);
    return response;
  }

  return response;
}
