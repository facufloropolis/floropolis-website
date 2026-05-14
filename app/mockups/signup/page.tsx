"use client";
// Mockup: /signup — New wholesale customer registration (3-step wizard)
// v3.1 | 2026-05-14 | Job_PM [V8 SHADOW]

import { useState } from "react";
import Link from "next/link";
import { BRAND } from "../_constants/brand";

const ROLES = ["Florist / flower shop", "Event planner", "Funeral home", "Wedding studio", "Restaurant / hospitality", "Other"];
const STEPS = ["Account", "Business info", "Review"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className={`flex items-center gap-2 shrink-0`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              i < current ? "bg-emerald-500 text-white" :
              i === current ? "bg-emerald-600 text-white ring-4 ring-emerald-100" :
              "bg-slate-100 text-slate-400"
            }`}>
              {i < current ? "✓" : i + 1}
            </div>
            <span className={`text-sm font-medium ${i === current ? "text-slate-900" : i < current ? "text-emerald-700" : "text-slate-400"}`}>
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

export default function SignupMockup() {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">⏳</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Application received!</h2>
          <p className="text-slate-500 mb-5 leading-relaxed">
            We review every application to keep Floropolis a trusted wholesale community. You&apos;ll hear from us within 4 hours on business days.
          </p>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-left text-sm text-emerald-800 mb-6">
            <p className="font-semibold mb-2">While you wait</p>
            <ul className="space-y-1 text-emerald-700">
              <li>• Check out our <Link href="/shop" className="underline">product catalog</Link></li>
              <li>• Request a <Link href="/sample-box" className="underline">sample box</Link></li>
              <li>• Message us on WhatsApp with questions</li>
            </ul>
          </div>
          <a
            href={`${BRAND.whatsappUrl}?text=Hi!+I+just+applied+for+a+Floropolis+wholesale+account`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-emerald-700 transition-colors text-sm"
          >
            💬 Say hi on WhatsApp →
          </a>
          <p className="text-xs text-slate-400 mt-3">{BRAND.whatsappDisplay}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-1">
            <span className="text-3xl">🌹</span>
            <span className="text-2xl font-bold text-slate-900">Floropolis</span>
          </div>
          <p className="text-slate-500 text-sm">Apply for wholesale access</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
          <StepIndicator current={step} />

          {step === 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Create your account</h2>
              <p className="text-slate-500 text-sm mb-6">Or use Google / Apple to skip this step</p>

              <div className="space-y-3 mb-5">
                <button className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-sm font-semibold text-slate-700 bg-white">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>
                <button className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 transition-all text-sm font-semibold text-white">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  Continue with Apple
                </button>
              </div>

              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-xs text-slate-400">or with email</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              <div className="space-y-3 mb-6">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">Email</label>
                  <input type="email" placeholder="orders@yourbusiness.com" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">Password <span className="text-slate-400 font-normal">(min 12 chars)</span></label>
                  <input type="password" placeholder="Create a strong password" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              </div>
              <button onClick={() => setStep(1)} className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors">
                Next: Business info →
              </button>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Your business</h2>
              <p className="text-slate-500 text-sm mb-6">We use this to confirm you&apos;re a wholesale buyer</p>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">Business name</label>
                  <input type="text" placeholder="Miami Blooms LLC" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">Role / type of business</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map(r => (
                      <button key={r} onClick={() => setRole(r)}
                        className={`text-xs px-3 py-2 rounded-xl border text-left transition-all font-medium ${role === r ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">Shipping address <span className="text-slate-400 font-normal">(where FedEx delivers)</span></label>
                  <input type="text" placeholder="1234 Brickell Ave, Suite 100" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 mb-2" />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" placeholder="Miami" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                    <input type="text" placeholder="FL" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                    <input type="text" placeholder="33131" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">Instagram <span className="text-slate-400 font-normal">(optional — helps us understand your style)</span></label>
                  <input type="text" placeholder="@yourbusiness" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:border-slate-300">← Back</button>
                <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors">
                  Next: Review →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Almost there!</h2>
              <p className="text-slate-500 text-sm mb-6">Review your application before submitting</p>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Business</span>
                  <span className="font-medium text-slate-900">Miami Blooms LLC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Role</span>
                  <span className="font-medium text-slate-900">{role || "Florist / flower shop"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ships to</span>
                  <span className="font-medium text-slate-900">Miami, FL 33131</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email</span>
                  <span className="font-medium text-slate-900">orders@miamiblooms.com</span>
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-5 text-xs text-emerald-700">
                ✓ We&apos;ll review your application and email you within 4 hours on business days. You can also message us on WhatsApp for faster response.
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:border-slate-300">← Back</button>
                <button onClick={() => setSubmitted(true)} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors">
                  Submit application →
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-slate-500 mt-5">
          Already have an account?{" "}
          <Link href="/mockups/login" className="text-emerald-600 font-semibold hover:text-emerald-800">Sign in →</Link>
        </p>
      </div>
    </div>
  );
}
