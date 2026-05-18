"use client";

// Client-side OAuth landing page — explicit PKCE exchange + visible errors.
// 2026-05-18 r8 | Job_PM AUTH-FIX [V8 SHADOW]
//
// r8: previous version relied on createBrowserClient's auto-exchange
// (detectSessionInUrl=true). When the exchange silently failed, getSession()
// kept returning null and we redirected the user to /shop signed-out.
//
// This version calls exchangeCodeForSession() explicitly so we can SEE the
// error. If anything goes wrong (missing verifier cookie, code expired,
// network), we display it on-page instead of swallowing it.

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
  const [status, setStatus] = useState<string>("Signing you in…");
  const [debug, setDebug] = useState<Record<string, unknown>>({});
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dbg: Record<string, unknown> = {
        href: typeof window !== "undefined" ? window.location.href : "(ssr)",
        hasCode: !!searchParams.get("code"),
        hasError: !!searchParams.get("error"),
        errorParam: searchParams.get("error"),
        errorDescParam: searchParams.get("error_description"),
      };

      if (searchParams.get("error")) {
        dbg.stage = "google_returned_error";
        setDebug(dbg);
        setErrored(true);
        setStatus(`Google error: ${searchParams.get("error_description") ?? searchParams.get("error")}`);
        return;
      }

      const supabase = createBackupClient();
      const rawNext = searchParams.get("next") ?? "/shop";
      const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.includes("://")
        ? rawNext
        : "/shop";
      dbg.next = next;

      const code = searchParams.get("code");
      if (!code) {
        // Maybe session arrived via URL fragment (implicit flow). Poll briefly.
        dbg.stage = "no_code_polling_session";
        for (let i = 0; i < 10 && !cancelled; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            dbg.sessionFrom = "fragment_poll";
            break;
          }
          await new Promise((r) => setTimeout(r, 300));
        }
      } else {
        // Explicit PKCE exchange. supabase-js looks up the verifier cookie
        // and POSTs to /auth/v1/token?grant_type=pkce.
        dbg.stage = "exchanging_pkce_code";
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            dbg.exchangeError = { name: error.name, message: error.message, status: (error as { status?: number }).status };
          } else {
            dbg.exchangeOk = true;
            dbg.userEmail = data.session?.user.email ?? null;
            dbg.hasSession = !!data.session;
          }
        } catch (e) {
          dbg.exchangeThrew = String(e);
        }
      }

      if (cancelled) return;

      // Final state check
      const { data: sessionData } = await supabase.auth.getSession();
      dbg.finalSessionEmail = sessionData.session?.user.email ?? null;
      dbg.finalHasSession = !!sessionData.session;

      // Visible cookie inventory (browser only)
      if (typeof document !== "undefined") {
        const names = document.cookie.split(/;\s*/).map((c) => c.split("=")[0]).filter(Boolean);
        dbg.cookieNames = names.filter((n) => n.startsWith("sb-"));
      }

      setDebug(dbg);

      if (!sessionData.session) {
        setErrored(true);
        setStatus("Sign-in did not complete. See diagnostics below.");
        return;
      }

      // Look up profile (RLS now allows authenticated user to read own row)
      const userId = sessionData.session.user.id;
      const { data: profile, error: profErr } = await supabase
        .from("client_profiles")
        .select("id, status")
        .eq("user_id", userId)
        .maybeSingle();

      if (profErr) {
        dbg.profileError = profErr.message;
        setDebug({ ...dbg });
      }

      if (!profile) {
        dbg.routing = "no_profile_to_signup";
        setDebug({ ...dbg });
        setStatus("New account — taking you to signup…");
        setTimeout(() => router.replace("/signup?step=1"), 800);
        return;
      }

      dbg.routing = `to_${next}`;
      dbg.profileStatus = profile.status;
      setDebug({ ...dbg });
      setStatus("Signed in. Redirecting…");
      setTimeout(() => router.replace(next), 400);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-50 px-4 py-12">
      <div className={`text-sm mb-6 ${errored ? "text-red-600 font-semibold" : "text-slate-600"}`}>
        {status}
      </div>
      {errored && (
        <div className="max-w-xl w-full bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500 mb-2">Diagnostics (share with support):</div>
          <pre className="text-xs text-slate-800 overflow-x-auto whitespace-pre-wrap break-all">
{JSON.stringify(debug, null, 2)}
          </pre>
          <a
            href="/auth/login"
            className="inline-block mt-4 text-sm text-emerald-700 hover:underline"
          >
            ← Back to sign in
          </a>
        </div>
      )}
    </div>
  );
}
