"use client";
// Mockup: /login-admin — Admin console login (Facu + JJ)
// v3.1 | 2026-05-14 | Job_PM [V8 SHADOW]
// States: ?state=default|password-entered|device-pending|device-approved

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BRAND } from "../_constants/brand";

function AdminLoginContent() {
  const searchParams = useSearchParams();
  const state = searchParams.get("state") ?? "default";
  const [showTotp, setShowTotp] = useState(state === "password-entered");
  const [totpValue, setTotpValue] = useState("");

  if (state === "device-pending") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <span className="text-2xl font-bold text-white">🌹 Floropolis</span>
            <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-semibold">Admin Console</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 text-center">
            <div className="w-16 h-16 bg-amber-900/40 border border-amber-600/30 rounded-full flex items-center justify-center mx-auto mb-5">
              <span className="text-3xl">🔐</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Device approval pending</h2>
            <p className="text-slate-400 text-sm mb-5 leading-relaxed">
              This device hasn&apos;t been approved yet. An email has been sent to <strong className="text-white">facu@floropolis.com</strong> with an approval link.
            </p>
            <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4 text-left text-sm mb-6">
              <p className="text-slate-300 font-semibold mb-2">Security details</p>
              <div className="space-y-1 text-xs text-slate-400 font-mono">
                <p>User: jjp@floropolis.com</p>
                <p>Device: Chrome / macOS 14.4</p>
                <p>IP: 186.42.xxx.xxx (Quito, Ecuador)</p>
                <p>Time: May 14, 2026 09:23 ECT</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">Once Facu approves, refresh this page to continue.</p>
            <div className="mt-6 pt-5 border-t border-slate-700">
              <p className="text-xs text-slate-500">
                Wrong device?{" "}
                <Link href="/mockups/login-admin" className="text-emerald-400 font-medium">Start over</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (state === "device-approved-by-Facu") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <span className="text-2xl font-bold text-white">🌹 Floropolis</span>
            <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-semibold">Admin Console</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 text-center">
            <div className="w-16 h-16 bg-emerald-900/40 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-5">
              <span className="text-3xl">✅</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Device approved by Facu</h2>
            <p className="text-slate-400 text-sm mb-6">You&apos;re in. Redirecting to admin dashboard...</p>
            <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full animate-pulse" style={{ width: "70%" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-1">
            <span className="text-2xl">🌹</span>
            <span className="text-2xl font-bold text-white">Floropolis</span>
          </div>
          <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold mt-1">Admin Console</p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8">

          {/* Security notice */}
          <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 mb-6 flex items-start gap-2.5">
            <span className="text-amber-400 text-sm mt-0.5">🔒</span>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              Admin access is restricted to authorized users only. All logins are logged and monitored.
            </p>
          </div>

          {!showTotp ? (
            <>
              <div className="space-y-4 mb-5">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1.5">Email</label>
                  <input
                    type="email"
                    defaultValue="jjp@floropolis.com"
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1.5">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••••••••••"
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder-slate-500"
                  />
                </div>
              </div>
              <button
                onClick={() => setShowTotp(true)}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors shadow-lg"
              >
                Continue →
              </button>
            </>
          ) : (
            <>
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-400">Authenticator code</label>
                  <span className="text-xs text-slate-500">Google Authenticator or 1Password</span>
                </div>
                <div className="flex gap-2">
                  {[...Array(6)].map((_, i) => (
                    <input
                      key={i}
                      type="text"
                      maxLength={1}
                      value={totpValue[i] ?? ""}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, "");
                        setTotpValue(prev => {
                          const arr = (prev + "      ").split("");
                          arr[i] = v;
                          return arr.join("").trimEnd();
                        });
                      }}
                      className="w-full aspect-square border border-slate-600 bg-slate-700 rounded-xl text-center text-xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">Enter the 6-digit code from your authenticator app. Codes refresh every 30 seconds.</p>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer mb-5">
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-emerald-500" />
                <span className="text-xs text-slate-400">Trust this device for 8 hours</span>
              </label>

              <Link
                href="/mockups/login-admin?state=device-pending"
                className="block w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm text-center transition-colors shadow-lg mb-3"
              >
                Sign in to admin →
              </Link>
              <button onClick={() => setShowTotp(false)} className="w-full text-xs text-slate-500 hover:text-slate-300 py-1">
                ← Back
              </button>
            </>
          )}

          <div className="mt-6 pt-5 border-t border-slate-700">
            <p className="text-xs text-slate-600 text-center">
              First time on this device?{" "}
              <Link href="/mockups/login-admin?state=device-pending" className="text-emerald-400 font-medium">
                Ask Facu to approve
              </Link>
            </p>
          </div>
        </div>

        {/* State navigator */}
        <div className="mt-6 bg-slate-800/50 border border-slate-700 rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">MOCKUP: Preview states</p>
          <div className="flex flex-wrap gap-2">
            {["default","password-entered","device-pending","device-approved-by-Facu"].map(s => (
              <Link key={s} href={`/mockups/login-admin?state=${s}`}
                className={`text-xs px-2.5 py-1 rounded-lg font-mono ${state === s ? "bg-emerald-600 text-white" : "bg-slate-700 border border-slate-600 text-slate-400 hover:border-slate-500"}`}>
                {s}
              </Link>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Not an admin?{" "}
          <Link href="/mockups/login" className="text-emerald-400 font-medium">Customer login →</Link>
        </p>
      </div>
    </div>
  );
}

export default function AdminLoginMockup() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="text-slate-500">Loading...</div></div>}>
      <AdminLoginContent />
    </Suspense>
  );
}
