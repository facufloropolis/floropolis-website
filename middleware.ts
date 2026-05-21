// Middleware -- v6 | 2026-05-19 | Job_PM [V8 SHADOW]
// v6 changes (T1 3-path picker):
//   - /checkout REMOVED from requiresAuth. Checkout now works for anon
//     (guest) AND signed-in users. The page itself offers the 3-path picker
//     (guest / sign in / sign up). API still upgrades guests transparently.
//   - /order-confirmation remains gated by token-in-URL pattern handled by
//     the page (it doesn't need a signed-in session because order numbers
//     are presented to guests in the response too).
//
// v5 history:
//   - Admin gate now checks client_profiles.status='admin' in backup, not
//     hardcoded email. Lets both Facu accounts + JJ access /admin without
//     code changes when admin list expands.
//   - Falls back to ADMIN_EMAILS allow-list if backup REST is unreachable
//     (edge environment shouldn't fail closed for transient backend issues).
//
// v4 history:
//   - All guarded routes check BACKUP supabase session, not prod.
//   - Routes: /admin, /account, /checkout, /order-confirmation.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Fallback allowlist used only if the backup REST query fails (e.g.
// transient outage). Normal path uses client_profiles.status='admin'.
const ADMIN_EMAILS = ["facu@floropolis.com", "jjpj@crescoinversiones.com", "jjpj@floropolis.com", "jjp@floropolis.com"];

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

  // Guard: /admin -- must be in ADMIN_EMAILS allowlist OR have
  // client_profiles.status='admin' in BACKUP. We check email first because
  // the Edge runtime fetch to backup has been unreliable on this Vercel
  // project (verified via /api/debug/whoami: Node sees admin, middleware
  // doesn't). Email allowlist is the deterministic path.
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(new URL("/auth/login?next=" + request.nextUrl.pathname, request.url));
    }
    let isAdmin = false;
    // PRIMARY: email allowlist (always works, no network call)
    if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      isAdmin = true;
    }
    // SECONDARY: status='admin' via service-role REST (catches admins not in
    // the hardcoded list, e.g. future admins added via DB only)
    if (!isAdmin) {
      const serviceKey = process.env.BACKUP_SUPABASE_SERVICE_KEY;
      if (serviceKey) {
        try {
          const adminRes = await fetch(
            `${backupUrl}/rest/v1/client_profiles?user_id=eq.${user.id}&select=status`,
            {
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                Accept: "application/json",
              },
            },
          );
          if (adminRes.ok) {
            const rows: Array<{ status?: string }> = await adminRes.json();
            isAdmin = rows.some((r) => r.status === "admin");
          }
        } catch {
          // network failure -- already gave up via email check
        }
      }
    }
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/shop", request.url));
    }
  }

  // Guard: /account must be signed in. /checkout is NOT gated (T1 3-path
  // picker — guest checkout is now first-class). /order-confirmation also
  // ungated; the page surfaces the order_id from the URL which a guest sees
  // immediately after submit.
  const requiresAuth =
    request.nextUrl.pathname.startsWith("/account");
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
    // /checkout removed in v6 (T1 3-path picker — see file header). The
    // checkout API route does its own auth check inline and falls back to
    // guest flow when no session is present.
    "/admin/:path*",
    "/account/:path*",
  ],
};
