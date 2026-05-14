"use client";
// Mockup: /login — Customer login + registration
// v3.1 | 2026-05-14 | Job_PM
// States: ?state=default|email-sent|device-verify
// Auth options: Google, Apple, Email magic link, Email+password
// No pending-approval step on login — approved customers go straight in

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BRAND } from "../_constants/brand";

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const state = searchParams.get("state") ?? "default";
  const [showPassword, setShowPassword] = useState(false);
  const [emailValue, setEmailValue] = useState("");

  if (state === "email-sent") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <span className="text-3xl">📧</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Check your inbox</h2>
            <p className="text-slate-500 mb-1">We sent a magic link to</p>
            <p className="font-semibold text-slate-900 mb-5">orders@miamiblooms.com</p>
            <p className="text-sm text-slate-400 mb-6">Click the link in the email to sign in. It expires in 15 minutes.</p>
            <Link href="/mockups/login" className="text-sm text-emerald-600 hover:text-emerald-800 font-medium">
              ← Use a different method
            </Link>
            <div className="mt-6 pt-5 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Didn&apos;t get it?{" "}
                <a href={`${BRAND.whatsappUrl}?text=Hi+I+can't+log+in`} className="text-emerald-600 font-medium">WhatsApp us</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (state === "device-verify") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center">
            <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <span className="text-3xl">📱</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">New device detected</h2>
            <p className="text-slate-500 mb-5">We sent a 6-digit code to <strong>o***@miamiblooms.com</strong> to confirm it&apos;s you.</p>
            <div className="flex gap-2 justify-center mb-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={`w-11 h-14 border-2 rounded-xl flex items-center justify-center text-2xl font-bold ${i < 3 ? "border-emerald-400 text-slate-900 bg-emerald-50" : "border-slate-200 text-slate-300"}`}>
                  {i < 3 ? ["4","2","9"][i] : "·"}
                </div>
              ))}
            </div>
            <button className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-base hover:bg-emerald-700 transition-colors mb-4">
              Verify & continue
            </button>
            <p className="text-xs text-slate-400">Code expires in 14:32 · <button className="text-emerald-600 font-medium">Resend</button></p>
          </div>
        </div>
      </div>
    );
  }

  // Default state
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-3xl">🌹</span>
            <span className="text-2xl font-bold text-slate-900">Floropolis</span>
          </div>
          <p className="text-slate-500 text-sm">Wholesale flowers from Ecuador farms</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-1 text-center">Welcome back</h1>
          <p className="text-slate-500 text-sm text-center mb-7">Sign in to your Floropolis account</p>

          {/* OAuth buttons */}
          <div className="space-y-3 mb-5">
            <button className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-sm font-semibold text-slate-700 bg-white shadow-sm">
              <GoogleIcon />
              Continue with Google
            </button>
            <button className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 transition-all text-sm font-semibold text-white shadow-sm">
              <AppleIcon />
              Continue with Apple
            </button>
            <Link href="/mockups/login?state=email-sent" className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 transition-all text-sm font-semibold text-white shadow-sm">
              <span>✉️</span>
              Continue with Email (magic link)
            </Link>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-xs text-slate-400 font-medium">or</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {/* Password toggle */}
          {!showPassword ? (
            <button
              onClick={() => setShowPassword(true)}
              className="w-full text-sm text-slate-500 hover:text-slate-800 py-2 font-medium transition-colors"
            >
              Sign in with email + password ↓
            </button>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">Email</label>
                <input
                  type="email"
                  value={emailValue}
                  onChange={e => setEmailValue(e.target.value)}
                  placeholder="orders@yourbusiness.com"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">Password</label>
                <input
                  type="password"
                  placeholder="••••••••••••"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                />
              </div>
              <div className="flex justify-end">
                <button className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Forgot password?</button>
              </div>
              <Link href="/mockups/login?state=device-verify" className="block w-full py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm text-center hover:bg-slate-800 transition-colors">
                Sign in →
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 space-y-2">
          <p className="text-sm text-slate-500">
            New to Floropolis?{" "}
            <Link href="/mockups/signup" className="text-emerald-600 font-semibold hover:text-emerald-800">
              Apply for wholesale access →
            </Link>
          </p>
          <p className="text-xs text-slate-400">
            Questions?{" "}
            <a href={BRAND.whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 font-medium">
              WhatsApp {BRAND.whatsappDisplay}
            </a>
          </p>
        </div>

        {/* State navigator (mockup helper) */}
        <div className="mt-8 bg-violet-50 border border-violet-200 rounded-2xl p-4">
          <p className="text-xs font-semibold text-violet-700 mb-2">MOCKUP: Preview states</p>
          <div className="flex flex-wrap gap-2">
            {["default","email-sent","device-verify"].map(s => (
              <Link key={s} href={`/mockups/login?state=${s}`}
                className={`text-xs px-2.5 py-1 rounded-lg font-mono ${state === s ? "bg-violet-600 text-white" : "bg-white border border-violet-200 text-violet-700 hover:border-violet-400"}`}>
                {s}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginMockup() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-emerald-50 flex items-center justify-center"><div className="text-slate-400">Loading...</div></div>}>
      <LoginContent />
    </Suspense>
  );
}
