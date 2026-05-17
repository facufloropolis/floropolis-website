// Middleware -- v3 | 2026-05-17 | Job_PM [V8 SHADOW]
// v3 changes (cost cut):
//   - Tightened matcher to ONLY /admin, /account, /checkout (was: all paths)
//   - Prior version was running supabase.auth.getUser() on every JS chunk + CSS + asset request,
//     causing ~95% of Vercel edge requests to be middleware invocations driven by bot crawls.
//   - Trade-off: customer session refresh now happens only when they hit a protected route.
//     For public browsing /shop /quote etc, session is still valid via cookies; refresh on protected hit.
//
// Function:
//   - Guards /admin routes: only facu@floropolis.com can access
//   - Guards /account routes: must be signed in
//   - Refreshes Supabase session on protected hits

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_EMAIL = "facu@floropolis.com";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  );

  // Refresh session so it doesn't expire during browsing
  const { data: { user } } = await supabase.auth.getUser();

  // Guard: /admin — must be facu@floropolis.com
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.redirect(new URL("/shop", request.url));
    }
  }

  // Guard: /account — must be signed in
  if (request.nextUrl.pathname.startsWith("/account")) {
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
    // Session refresh still happens any time user hits a protected route, which is
    // sufficient for typical flows (browse -> add to cart -> /checkout triggers refresh).
    "/admin/:path*",
    "/account/:path*",
    "/checkout/:path*",
  ],
};
