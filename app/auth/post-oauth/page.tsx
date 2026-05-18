"use client";

// Client-side OAuth landing page — replaces the server callback for Google.
// 2026-05-18 | Job_PM AUTH-FIX r3 [V8 SHADOW]
//
// Why this exists:
//   Server-side exchangeCodeForSession() kept losing the PKCE verifier cookie
//   across the Google -> Supabase -> our-callback redirect chain (supabase/ssr
//   #55, plus more). We tried upgrading the lib (0.10.3), the canonical
//   single-response pattern, and switching to implicit flow — none survived
//   real-world testing.
//
//   The robust path: let supabase-js do PKCE end-to-end in the BROWSER. The
//   browser-side client wrote the verifier (localStorage + cookie), and the
//   browser-side client should read it back. Server doesn't touch it.
//
//   This page is the redirectTo target for OAuth. supabase-js with
//   detectSessionInUrl=true auto-parses `?code=...` from window.location,
//   exchanges it, writes the session to cookies, and we then push the user
//   to their destination.
//
// Reads ?next= for the post-auth destination. Falls back to /shop.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createBackupClient } from "@/lib/supabase/backup-client";

export const dynamic = "force-dynamic";

export default function PostOAuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-slate-600">Loading…</div>}>
      <PostOAuthInner />
    </Suspense>
  );
}

function PostOAuthInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createBackupClient();

      const rawNext = searchParams.get("next") ?? "/shop";
      const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.includes("://")
        ? rawNext
        : "/shop";

      // Give supabase-js a tick to parse the URL (it does this on createBrowserClient).
      // detectSessionInUrl runs synchronously on construction but the actual
      // exchangeCodeForSession is async. Poll briefly for a session.
      const startedAt = Date.now();
      const deadline = startedAt + 8000;
      let session = null;
      let lastError: unknown = null;
      while (Date.now() < deadline) {
        const { data, error } = await supabase.auth.getSession();
        if (error) lastError = error;
        if (data.session) {
          session = data.session;
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }

      if (cancelled) return;

      if (!session) {
        console.error("[post-oauth] no session after 8s", { lastError });
        setErrored(true);
        setMessage("Sign-in did not complete. Returning to login…");
        setTimeout(() => router.replace("/auth/login?error=oauth_no_session"), 1500);
        return;
      }

      // Check if profile exists -> route to signup wizard if not (mirrors prior callback behavior).
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth/login?error=no_user");
        return;
      }

      const { data: profile } = await supabase
        .from("client_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile) {
        router.replace("/signup?step=1");
        return;
      }

      // Clean the URL fragment / query before navigating so we don't leak tokens.
      router.replace(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-50 px-4">
      <div className={`text-sm ${errored ? "text-red-600" : "text-slate-600"}`}>
        {message}
      </div>
    </div>
  );
}
