// Middleware — v2 | 2026-03-23 | Job_PM
// - Refreshes Supabase session on every request (keeps cookies fresh)
// - Guards /admin routes: only facu@floropolis.com can access
// - Guards /account routes: must be signed in

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
    // Run on all paths except static assets + images
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
