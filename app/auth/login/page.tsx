"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Mail, ArrowRight, CheckCircle } from "lucide-react";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorParam = searchParams.get("error");
  const nextParam = searchParams.get("next") ?? "/account";

  useEffect(() => {
    if (errorParam === "auth_failed") {
      setError("The sign-in link expired or is invalid. Please request a new one.");
    }
  }, [errorParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isLoading) return;

    setIsLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextParam)}`,
      },
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
    } else {
      setIsSent(true);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/">
            <Image
              src="/Floropolis-logo-only.png"
              alt="Floropolis"
              width={56}
              height={56}
              className="mx-auto mb-3"
            />
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Sign in to Floropolis</h1>
          <p className="text-slate-500 text-sm mt-1">
            Farm-direct wholesale flowers for florists
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {isSent ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-7 h-7 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Check your email</h2>
                <p className="text-sm text-slate-600 mt-2">
                  We sent a sign-in link to <strong>{email}</strong>.
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  The link expires in 60 minutes. Check your spam folder if you don't see it.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setIsSent(false); setEmail(""); }}
                className="text-sm text-emerald-600 hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-900 mb-1">Sign in with email</h2>
                <p className="text-sm text-slate-500">
                  We'll send you a secure sign-in link — no password needed.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@yourshop.com"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !email}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {isLoading ? (
                    "Sending link..."
                  ) : (
                    <>
                      Send sign-in link
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-500">
                  New to Floropolis?{" "}
                  <Link href="/sample-box" className="text-emerald-600 font-semibold hover:underline">
                    Try a free sample box →
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          <Link href="/" className="hover:text-slate-600">← Back to floropolis.com</Link>
        </p>
      </div>
    </div>
  );
}
