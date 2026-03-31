"use client";
// Verify page — v1 | 2026-03-23 | Job_PM
// Handles magic link clicks from email.
// Shows spinner while session establishes, then redirects.
// If no session after 4s → shows "link expired" message.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";

export default function VerifyPage() {
  const router = useRouter();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // Check if session is already established (e.g. token in URL hash handled by Supabase client)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/auth/callback");
      }
    });

    // Also listen for auth state change (magic link fires this)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/auth/callback");
      }
    });

    // If nothing happens in 4 seconds, the link is likely expired
    const timer = setTimeout(() => {
      setExpired(true);
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <Link href="/">
          <Image
            src="/Floropolis-logo-only.png"
            alt="Floropolis"
            width={48}
            height={48}
            className="mx-auto mb-6"
          />
        </Link>

        {!expired ? (
          <div className="space-y-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            </div>
            <p className="text-slate-700 font-semibold">Logging you in…</p>
            <p className="text-sm text-slate-400">This only takes a second.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-4">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Link expired</p>
              <p className="text-sm text-slate-500 mt-1">
                This sign-in link has expired or was already used.
              </p>
            </div>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors"
            >
              Request a new link →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
