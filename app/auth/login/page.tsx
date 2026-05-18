"use client";
// Login page — v3 | 2026-05-17 | Job_PM W5-S15 [V8 SHADOW]
// Migrated from prod Supabase to BACKUP Supabase (Phase 4 SEGURISIMA rule).
// All sign-in methods now run against supabase-backup (auth.users in backup).
// OAuth/magic-link callbacks go to /auth/callback-backup (not /auth/callback).

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createBackupClient } from "@/lib/supabase/backup-client";
import { Mail, Phone, ArrowRight, CheckCircle, Loader2 } from "lucide-react";

// --- Google SVG icon (inline, no external dependency) ---
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-xs text-slate-400 font-medium">{label}</span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  )
}

function LoginContent() {
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? "/account";

  // Email OTP (6-digit code) state — switched from magic link 2026-05-18
  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailStep, setEmailStep] = useState<"input" | "verify">("input");
  const [emailCode, setEmailCode] = useState("");
  const [emailVerifyLoading, setEmailVerifyLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Phone OTP state
  const [phone, setPhone] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneStep, setPhoneStep] = useState<"input" | "verify">("input");
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Google state
  const [googleLoading, setGoogleLoading] = useState(false);

  // Global error (e.g. from callback redirect)
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "auth_failed") {
      setGlobalError("The sign-in link expired or is invalid. Please request a new one.");
    }
  }, [searchParams]);

  // --- Google OAuth ---
  const handleGoogle = async () => {
    setGoogleLoading(true);
    setGlobalError(null);
    const supabase = createBackupClient();
    // 2026-05-18 r3: redirect Google to a CLIENT-side page (/auth/post-oauth)
    // so supabase-js can complete PKCE in the browser where the verifier was
    // written. Server callback (/auth/callback-backup) repeatedly lost the
    // verifier; kept only as a fallback for magic links.
    const redirectTo = `${window.location.origin}/auth/post-oauth?next=${encodeURIComponent(nextParam)}`;
    console.log("[auth/login] starting Google OAuth, redirectTo:", redirectTo);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) {
        console.error("[auth/login] OAuth init error:", error);
        setGlobalError(`OAuth init failed: ${error.message}`);
        setGoogleLoading(false);
        return;
      }
      // Force a manual redirect if the SDK didn't auto-redirect (popup blockers etc).
      if (data?.url) {
        console.log("[auth/login] redirecting to:", data.url);
        window.location.assign(data.url);
        setTimeout(() => setGoogleLoading(false), 5000);
      } else {
        console.warn("[auth/login] no redirect URL returned", data);
        setGlobalError("OAuth returned no redirect URL. Check browser console.");
        setGoogleLoading(false);
      }
    } catch (e) {
      console.error("[auth/login] OAuth threw:", e);
      setGlobalError(`OAuth threw: ${e instanceof Error ? e.message : String(e)}`);
      setGoogleLoading(false);
    }
  };

  // --- Email OTP (6-digit code, NOT magic link) ---
  // FIX 2026-05-18: Magic link via emailRedirectTo was failing because Supabase
  // PKCE flow required the verifier cookie to survive a cross-domain redirect
  // chain (Gmail → Supabase verify → our callback), which it didn't.
  // OTP code is bypass-the-callback: user types code into the form, we call
  // verifyOtp() directly, session is returned in the API response and
  // supabase-js writes cookies to BOTH localStorage + cookies in same context.
  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || emailLoading) return;
    setEmailLoading(true);
    setEmailError(null);
    const supabase = createBackupClient();
    // No emailRedirectTo -> Supabase sends 6-digit code instead of magic link
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,  // don't auto-create; user must exist (signed up via /signup)
      },
    });
    if (error) {
      setEmailError(error.message);
    } else {
      setEmailSent(true);
      setEmailStep("verify");
    }
    setEmailLoading(false);
  };

  // --- Email OTP step 2: verify the code typed by the user ---
  const handleEmailVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailCode || emailVerifyLoading) return;
    setEmailVerifyLoading(true);
    setEmailError(null);
    const supabase = createBackupClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: emailCode.trim(),
      type: "email",
    });
    if (error) {
      setEmailError(`Code rejected: ${error.message}. Try again or request a new code.`);
      setEmailVerifyLoading(false);
      return;
    }
    // Session is set in cookies by supabase-js. Navigate to the requested next.
    window.location.assign(nextParam || "/shop");
  };

  // --- Phone OTP step 1: send code ---
  const handlePhoneSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phoneLoading) return;
    setPhoneLoading(true);
    setPhoneError(null);
    const supabase = createBackupClient();
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) {
      setPhoneError(error.message);
      setPhoneLoading(false);
    } else {
      setPhoneStep("verify");
      setPhoneLoading(false);
    }
  };

  // --- Phone OTP step 2: verify code ---
  const handlePhoneVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otpLoading) return;
    setOtpLoading(true);
    setPhoneError(null);
    const supabase = createBackupClient();
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: "sms",
    });
    if (error) {
      setPhoneError(error.message);
      setOtpLoading(false);
    }
    // On success, onAuthStateChange fires → middleware/callback handles redirect
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-1">
      {globalError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {globalError}
        </p>
      )}

      {/* ── Google OAuth (re-enabled 2026-05-18 by AUTH-FIX) ──
          PKCE callback rewritten to single-response pattern + @supabase/ssr
          upgraded 0.9.0 → 0.10.3 to fix the verifier cookie persistence bug. */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-semibold py-3 rounded-xl text-sm transition-all hover:shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {googleLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Continue with Google
      </button>

      <Divider label="or sign in with email" />

      {/* ── Email OTP (6-digit code) ── */}
      {emailStep === "verify" ? (
        <form onSubmit={handleEmailVerify} className="space-y-3 py-2">
          <div className="text-center mb-3">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="font-semibold text-slate-900 text-sm">Code sent to <strong>{email}</strong></p>
            <p className="text-xs text-slate-500 mt-1">Type the 6-digit code from the email below.</p>
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={emailCode}
            onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ""))}
            placeholder="6-digit code"
            required
            className="w-full text-center tracking-[0.5em] text-lg font-mono py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          />
          {emailError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {emailError}
            </p>
          )}
          <button
            type="submit"
            disabled={emailVerifyLoading || emailCode.length !== 6}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {emailVerifyLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>Verify code <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
          <button
            type="button"
            onClick={() => { setEmailStep("input"); setEmailSent(false); setEmailCode(""); setEmailError(null); }}
            className="text-xs text-emerald-600 hover:underline block mx-auto"
          >
            Use a different email or resend code
          </button>
        </form>
      ) : (
        <form onSubmit={handleEmail} className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourshop.com"
              required
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>
          {emailError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {emailError}
            </p>
          )}
          <button
            type="submit"
            disabled={emailLoading || !email}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {emailLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>Send 6-digit code <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>
      )}

      {/* Phone OTP HIDDEN 2026-05-18 — Twilio not configured on backup project.
          Supabase auth returns "Unsupported phone provider" (phone_provider_disabled).
          Re-enable after wiring Twilio in Supabase backup dashboard → Auth → Providers. */}
      {false && (
        <>
      <Divider label="or sign in with phone" />

      {/* ── Phone OTP ── */}
      {phoneStep === "input" ? (
        <form onSubmit={handlePhoneSend} className="space-y-3">
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 000 0000"
              required
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>
          {phoneError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {phoneError}
            </p>
          )}
          <button
            type="submit"
            disabled={phoneLoading || !phone}
            className="w-full flex items-center justify-center gap-2 border border-slate-300 text-slate-700 py-3 rounded-xl font-semibold text-sm hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {phoneLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={handlePhoneVerify} className="space-y-3">
          <p className="text-xs text-slate-500 text-center">
            Enter the 6-digit code sent to <strong>{phone}</strong>
          </p>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            required
            className="w-full text-center tracking-widest py-3 rounded-xl border border-slate-300 text-lg font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          />
          {phoneError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {phoneError}
            </p>
          )}
          <button
            type="submit"
            disabled={otpLoading || otp.length !== 6}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify code <ArrowRight className="w-4 h-4" /></>}
          </button>
          <button
            type="button"
            onClick={() => { setPhoneStep("input"); setOtp(""); setPhoneError(null); }}
            className="w-full text-xs text-slate-400 hover:text-slate-600 py-1"
          >
            Wrong number? Try again
          </button>
        </form>
      )}
        </>
      )}

      <div className="pt-5 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-500">
          New to Floropolis?{" "}
          <Link href="/sample-box" className="text-emerald-600 font-semibold hover:underline">
            Try a free sample box →
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo + heading */}
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
            New here? Creating an account takes 30 seconds.
          </p>
        </div>

        <Suspense fallback={<div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 h-80 animate-pulse" />}>
          <LoginContent />
        </Suspense>

        <p className="text-center text-xs text-slate-400 mt-5">
          By signing in you agree to our{" "}
          <Link href="/terms" className="hover:text-slate-600 underline underline-offset-2">
            terms of service
          </Link>
          .
        </p>
        <p className="text-center text-xs text-slate-400 mt-2">
          <Link href="/" className="hover:text-slate-600">← Back to floropolis.com</Link>
        </p>
      </div>
    </div>
  );
}
