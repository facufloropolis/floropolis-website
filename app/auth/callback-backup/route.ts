// Auth callback handler for the BACKUP project (Phase 4 transactional auth).
// v2 | 2026-05-18 | Job_PM [V8 SHADOW]
//
// v2 fix: cookies are attached to the REDIRECT response (not via next/headers).
// The previous implementation used createBackupServerClient which wrote cookies
// via cookieStore.set — those didn't reliably make it onto the 307 redirect,
// so the browser landed back at /auth/login with no session cookies set,
// even though exchangeCodeForSession had succeeded server-side (auth.users
// last_sign_in_at WAS updating).
//
// This v2 follows the Supabase Next.js 15 documented pattern for route handlers:
// build the response FIRST, pass it to the createServerClient cookies.setAll,
// then RETURN that response. Set-Cookie headers travel with the redirect.

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
  const hasNext = rawNext.length > 0;
  const nextIsSafe = hasNext && isSafeRelativePath(rawNext);
  const defaultNext = nextIsSafe ? rawNext : "/shop";

  const backupUrl = process.env.NEXT_PUBLIC_BACKUP_SUPABASE_URL;
  const backupKey = process.env.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY;
  if (!backupUrl || !backupKey) {
    console.error("[auth/callback-backup] missing NEXT_PUBLIC_BACKUP_SUPABASE_* env");
    return NextResponse.redirect(`${origin}/auth/login?error=backup_unavailable`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`);
  }

  // Build the redirect response UP FRONT. Cookies get attached to THIS response.
  // We may overwrite the destination after profile lookup, but cookies persist.
  const response = NextResponse.redirect(`${origin}${defaultNext}`);

  const supabase = createServerClient(backupUrl, backupKey, {
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
    console.error("[auth/callback-backup] exchangeCodeForSession failed:", exchangeError);
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  // Session cookies are now attached to `response`. Decide final destination.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Shouldn't happen if exchange succeeded, but guard anyway.
    return NextResponse.redirect(`${origin}/auth/login?error=no_user`);
  }

  // Look up profile via service role (RLS bypass; works regardless of cookie race).
  const serviceClient = getBackupServiceClient();
  const { data: profile } = await serviceClient
    .from("client_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // No profile → send to signup wizard (cookies still on the response).
  if (!profile) {
    const target = (nextIsSafe && rawNext.startsWith("/signup"))
      ? `${origin}${rawNext}`
      : `${origin}/signup?step=1`;
    const wizardResponse = NextResponse.redirect(target);
    // Copy cookies from the original response (the ones supabase set during exchange)
    response.cookies.getAll().forEach((c) => {
      wizardResponse.cookies.set(c.name, c.value, c);
    });
    return wizardResponse;
  }

  // Profile exists → use the already-built response (it has the cookies + the
  // /shop or `next` URL).
  return response;
}
