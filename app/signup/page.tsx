"use client";
// Signup wizard -- v1 | 2026-05-17 | Job_PM [V8 SHADOW]
// 3-step signup: account -> business info -> review.
// Real Supabase auth (signUp with password OR Google OAuth).
// On submit, INSERT into client_profiles with status='pending'.
// Schema source of truth: supabase/migrations/20260323_login_mvp.sql
// Columns used: user_id, business_name, phone, status, notes
// Instagram + referral + submitted_at are packed into notes as a single string.

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Mail, Lock, ArrowRight, ArrowLeft, Loader2, CheckCircle, Phone, Instagram, Building2 } from "lucide-react";

// ----- constants -----
const STEPS = ["Account", "Business info", "Review"];
const REFERRAL_OPTIONS = ["Friend", "Google", "Instagram", "Trade show", "Other"];
const MIN_PASSWORD_LEN = 8; // Supabase default

// ----- helpers -----
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

// Format raw digits as (XXX) XXX-XXXX while typing
function formatUsPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

// ----- stepper -----
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex items-center gap-2 shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              i < current ? "bg-emerald-500 text-white" :
              i === current ? "bg-emerald-600 text-white ring-4 ring-emerald-100" :
              "bg-slate-100 text-slate-400"
            }`}>
              {i < current ? <CheckCircle className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-sm font-medium hidden sm:inline ${
              i === current ? "text-slate-900" :
              i < current ? "text-emerald-700" :
              "text-slate-400"
            }`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-3 ${i < current ? "bg-emerald-400" : "bg-slate-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ----- main wizard (wrapped in Suspense for useSearchParams) -----
function SignupWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resume step from URL (when user returns from Google OAuth callback the
  // existing /auth/callback route sends them to /auth/onboarding by default --
  // see "Open questions" in the standup. For email signups the step state stays in memory.)
  const initialStep = Number(searchParams.get("step") ?? "0");
  const [step, setStep] = useState<number>(Number.isFinite(initialStep) && initialStep >= 0 && initialStep <= 2 ? initialStep : 0);

  // Step 0: account
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountLoading, setAccountLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [step0Error, setStep0Error] = useState<string | null>(null);
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);
  const [passwordFieldError, setPasswordFieldError] = useState<string | null>(null);

  // Step 1: business info
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [referral, setReferral] = useState("");
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [businessNameError, setBusinessNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Step 2: submit
  const [submitLoading, setSubmitLoading] = useState(false);
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [submittedOk, setSubmittedOk] = useState(false);

  // Watch for an authenticated session arriving while we're on step 0 (e.g. OAuth return).
  // If user is already signed in when they land on /signup, jump them past account creation.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && step === 0 && !accountLoading && !googleLoading) {
        setStep(1);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- step 0 handlers -----
  const handleGoogle = async () => {
    setStep0Error(null);
    setGoogleLoading(true);
    const supabase = createClient();
    // After Google round-trip the existing /auth/callback route checks for an
    // existing client_profile and routes the user. New users land on
    // /auth/onboarding (the old single-form pattern). See Open Questions.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/signup?step=1`,
      },
    });
    if (error) {
      setStep0Error(error.message);
      setGoogleLoading(false);
    }
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accountLoading) return;
    setStep0Error(null);
    setEmailFieldError(null);
    setPasswordFieldError(null);

    // Inline validation
    let ok = true;
    if (!isValidEmail(email)) {
      setEmailFieldError("Enter a valid email address");
      ok = false;
    }
    if (password.length < MIN_PASSWORD_LEN) {
      setPasswordFieldError(`At least ${MIN_PASSWORD_LEN} characters`);
      ok = false;
    }
    if (!ok) return;

    setAccountLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/account`,
      },
    });
    if (error) {
      setStep0Error(error.message);
      setAccountLoading(false);
      return;
    }
    // Advance regardless of email verification state -- per spec.
    // Note: if Supabase project requires email confirmation, auth.getUser()
    // will still return the user during the confirmation grace window.
    setAccountLoading(false);
    setStep(1);
  };

  // ----- step 1 handlers -----
  const handleBusinessNext = (e: React.FormEvent) => {
    e.preventDefault();
    setStep1Error(null);
    setBusinessNameError(null);
    setPhoneError(null);

    let ok = true;
    if (!businessName.trim()) {
      setBusinessNameError("Required");
      ok = false;
    }
    const rawPhone = digitsOnly(phone);
    if (rawPhone.length !== 10) {
      setPhoneError("Enter a 10-digit US phone number");
      ok = false;
    }
    if (!ok) return;

    setStep(2);
  };

  // ----- step 2 handler -----
  const handleFinalSubmit = async () => {
    if (submitLoading) return;
    setSubmitLoading(true);
    setStep2Error(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setStep2Error("Your session expired. Please go back and create your account again.");
      setSubmitLoading(false);
      return;
    }

    // Pack optional fields + submitted_at into notes (the schema only has
    // user_id, business_name, phone, status, notes -- see Open Questions).
    const noteParts: string[] = [];
    const cleanInsta = instagram.trim().replace(/^@/, "");
    if (cleanInsta) noteParts.push(`instagram: ${cleanInsta}`);
    if (referral) noteParts.push(`referral: ${referral}`);
    noteParts.push(`submitted_at: ${new Date().toISOString()}`);
    const notes = noteParts.join(" | ");

    // Check if a profile row already exists for this user (e.g. OAuth path
    // already routed through /auth/onboarding earlier). If so, update; else insert.
    const { data: existing } = await supabase
      .from("client_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let dbError = null;
    if (existing) {
      const { error } = await supabase
        .from("client_profiles")
        .update({
          business_name: businessName.trim(),
          phone: `+1${digitsOnly(phone)}`,
          status: "approved",
          approved_at: new Date().toISOString(),
          notes,
        })
        .eq("user_id", user.id);
      dbError = error;
    } else {
      const { error } = await supabase
        .from("client_profiles")
        .insert({
          user_id: user.id,
          business_name: businessName.trim(),
          phone: `+1${digitsOnly(phone)}`,
          status: "approved",
          approved_at: new Date().toISOString(),
          notes,
        });
      dbError = error;
    }

    if (dbError) {
      setStep2Error(dbError.message);
      setSubmitLoading(false);
      return;
    }

    setSubmittedOk(true);
    setSubmitLoading(false);
    // Small delay so the user sees confirmation, then push to /account
    setTimeout(() => router.push("/account"), 1200);
  };

  // ----- success state -----
  if (submittedOk) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Application submitted</h2>
        <p className="text-slate-500 text-sm mb-4">
          Your account is pending approval. We typically respond within 1 business day.
        </p>
        <p className="text-xs text-slate-400">Redirecting to your account...</p>
      </div>
    );
  }

  // ----- wizard shell -----
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
      <StepIndicator current={step} />

      {/* ============================== STEP 0: ACCOUNT ============================== */}
      {step === 0 && (
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">Create your account</h2>
          <p className="text-slate-500 text-sm mb-6">Or use Google to skip this step</p>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading || accountLoading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-semibold py-3 rounded-xl text-sm transition-all hover:shadow-sm disabled:opacity-60 disabled:cursor-not-allowed mb-5"
          >
            {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400 font-medium">or with email</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <form onSubmit={handleAccountSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (emailFieldError) setEmailFieldError(null); }}
                  placeholder="orders@yourshop.com"
                  required
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none ${
                    emailFieldError ? "border-red-300" : "border-slate-300"
                  }`}
                />
              </div>
              {emailFieldError && <p className="text-xs text-red-600 mt-1">{emailFieldError}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Password <span className="text-slate-400 font-normal">(min {MIN_PASSWORD_LEN} chars)</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (passwordFieldError) setPasswordFieldError(null); }}
                  placeholder="Create a strong password"
                  required
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none ${
                    passwordFieldError ? "border-red-300" : "border-slate-300"
                  }`}
                />
              </div>
              {passwordFieldError && <p className="text-xs text-red-600 mt-1">{passwordFieldError}</p>}
            </div>

            {step0Error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {step0Error}
              </p>
            )}

            <button
              type="submit"
              disabled={accountLoading || googleLoading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {accountLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>Next: Business info <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ============================== STEP 1: BUSINESS INFO ============================== */}
      {step === 1 && (
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">Your business</h2>
          <p className="text-slate-500 text-sm mb-6">We use this to confirm you are a wholesale buyer</p>

          <form onSubmit={handleBusinessNext} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Business name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => { setBusinessName(e.target.value); if (businessNameError) setBusinessNameError(null); }}
                  placeholder="Miami Blooms LLC"
                  required
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none ${
                    businessNameError ? "border-red-300" : "border-slate-300"
                  }`}
                />
              </div>
              {businessNameError && <p className="text-xs text-red-600 mt-1">{businessNameError}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Phone <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(formatUsPhone(e.target.value)); if (phoneError) setPhoneError(null); }}
                  placeholder="(786) 930-8463"
                  required
                  inputMode="tel"
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none ${
                    phoneError ? "border-red-300" : "border-slate-300"
                  }`}
                />
              </div>
              {phoneError && <p className="text-xs text-red-600 mt-1">{phoneError}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Instagram <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <span className="absolute left-9 top-1/2 -translate-y-1/2 text-slate-400 text-sm">@</span>
                <input
                  type="text"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value.replace(/^@/, ""))}
                  placeholder="yourshop"
                  className="w-full pl-14 pr-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                How did you hear about us? <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <select
                value={referral}
                onChange={(e) => setReferral(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
              >
                <option value="">Select one...</option>
                {REFERRAL_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            {step1Error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {step1Error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="px-5 py-3 rounded-xl border border-slate-300 text-slate-600 text-sm font-medium hover:border-slate-400 inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="submit"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors"
              >
                Next: Review <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================== STEP 2: REVIEW ============================== */}
      {step === 2 && (
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">Review your details</h2>
          <p className="text-slate-500 text-sm mb-6">Confirm everything looks right, then start ordering</p>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5 space-y-3 text-sm">
            {email && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Email</span>
                <span className="font-medium text-slate-900 text-right break-all">{email}</span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Business</span>
              <span className="font-medium text-slate-900 text-right">{businessName}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Phone</span>
              <span className="font-medium text-slate-900 text-right">{phone}</span>
            </div>
            {instagram && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Instagram</span>
                <span className="font-medium text-slate-900 text-right">@{instagram.replace(/^@/, "")}</span>
              </div>
            )}
            {referral && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Heard about us via</span>
                <span className="font-medium text-slate-900 text-right">{referral}</span>
              </div>
            )}
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-5 text-xs text-emerald-800 leading-relaxed">
            You're set. Sign up and start ordering — first box ships in 4 days.
          </div>

          {step2Error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              {step2Error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={submitLoading}
              className="px-5 py-3 rounded-xl border border-slate-300 text-slate-600 text-sm font-medium hover:border-slate-400 disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" /> Edit info
            </button>
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={submitLoading}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {submitLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>Create account <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ----- page wrapper -----
export default function SignupPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
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
          <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
          <p className="text-slate-500 text-sm mt-1">
            Direct from Ecuador farms. Order in minutes — no application needed.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 h-96 animate-pulse" />
          }
        >
          <SignupWizard />
        </Suspense>

        <p className="text-center text-sm text-slate-500 mt-5">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-emerald-600 font-semibold hover:text-emerald-800">
            Sign in
          </Link>
        </p>
        <p className="text-center text-xs text-slate-400 mt-3">
          By applying you agree to our{" "}
          <Link href="/terms" className="hover:text-slate-600 underline underline-offset-2">terms of service</Link>.
        </p>
      </div>
    </div>
  );
}
