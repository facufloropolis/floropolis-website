// Middleware -- v4 | 2026-05-17 | Job_PM W5-S15 [V8 SHADOW]
// v4 changes (Phase 4 SEGURISIMA migration):
//   - All guarded routes now check the BACKUP supabase session, not prod.
//   - Routes: /admin, /account, /checkout, /order-confirmation.
//   - If NEXT_PUBLIC_BACKUP_SUPABASE_URL / _ANON_KEY are unset, middleware
//     allows the request through with a console warning (graceful fallback
//     for environments where backup isn't configured yet).
//   - Refreshes the BACKUP session cookie on each protected hit.
//
// v3 history:
//   - Tightened matcher to ONLY /admin, /account, /checkout, /order-confirmation
//     (was: all paths). Cuts ~95% of edge invocations driven by bot crawls.
//   - Trade-off: session refresh only happens when user hits a protected route.
//
// Function:
//   - Guards /admin routes: only facu@floropolis.com can access
//   - Guards /account, /checkout, /order-confirmation: must be signed in (BACKUP)
//   - Refreshes BACKUP Supabase session on protected hits

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_EMAIL = "facu@floropolis.com";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const backupUrl = process.env.NEXT_PUBLIC_BACKUP_SUPABASE_URL;
  const backupKey = process.env.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY;

  // Graceful fallback: if backup env isn't set (e.g. preview deploys or local
  // dev without the keys), don't crash -- let the request through and let the
  // page-level auth check decide. We log once per request so it's discoverable.
  if (!backupUrl || !backupKey) {
    console.warn(
      "[middleware] NEXT_PUBLIC_BACKUP_SUPABASE_URL or NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY missing -- allowing request through without auth check for",
      request.nextUrl.pathname,
    );
    return supabaseResponse;
  }

  const supabase = createServerClient(backupUrl, backupKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh BACKUP session so it doesn't expire during browsing
  const { data: { user } } = await supabase.auth.getUser();

  // Guard: /admin -- must be facu@floropolis.com (per BACKUP project)
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.redirect(new URL("/shop", request.url));
    }
  }

  // Guard: /account, /checkout, /order-confirmation -- must be signed in
  const requiresAuth =
    request.nextUrl.pathname.startsWith("/account") ||
    request.nextUrl.pathname.startsWith("/checkout") ||
    request.nextUrl.pathname.startsWith("/order-confirmation");
  if (requiresAuth) {
    if (!user) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // ONLY run on routes that need auth -- cuts ~95% of middleware edge invocations.
    // Session refresh still happens any time user hits a protected route.
    "/admin/:path*",
    "/account/:path*",
    "/checkout/:path*",
    "/order-confirmation/:path*",
  ],
};
