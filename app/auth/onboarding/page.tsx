"use client";
// Onboarding page — v2 | 2026-03-24 | Job_PM
// Added: address fields + Instagram + referral_source stored

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { ArrowRight, Loader2 } from "lucide-react";

const REFERRAL_OPTIONS = [
  "Google Search",
  "Instagram",
  "Referral from another florist",
  "Trade show / event",
  "Other",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [instagram, setInstagram] = useState("");
  const [referral, setReferral] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/auth/login");
      else setCheckingAuth(false);
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() || loading) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/auth/login"); return; }

    const { error: insertError } = await supabase
      .from("client_profiles")
      .insert({
        user_id: user.id,
        business_name: businessName.trim(),
        phone: phone.trim() || null,
        address_line1: addressLine1.trim() || null,
        address_line2: addressLine2.trim() || null,
        city: city.trim() || null,
        state: state || null,
        zip: zip.trim() || null,
        country: "US",
        instagram: instagram.trim().replace(/^@/, "") || null,
        referral_source: referral || null,
        status: "pending",
      });

    if (insertError && !insertError.message.includes("unique")) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
      return;
    }

    router.push("/shop");
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Link href="/">
            <Image src="/Floropolis-logo-only.png" alt="Floropolis" width={56} height={56} className="mx-auto mb-3" />
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Almost there!</h1>
          <p className="text-slate-500 text-sm mt-1">Tell us about your business so we can set up your account</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Business name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Business Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Bloom & Co. Florist"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Phone <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Delivery Address <span className="text-slate-400 font-normal">(optional — helps with shipping)</span>
              </label>
              <div className="space-y-2">
                <input
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="Street address"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
                <input
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="Suite, unit, etc. (optional)"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className="col-span-1 px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="col-span-1 px-3 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                  >
                    <option value="">State</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    placeholder="ZIP"
                    maxLength={10}
                    className="col-span-1 px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Instagram */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Instagram <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">@</span>
                <input
                  type="text"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value.replace(/^@/, ""))}
                  placeholder="yourshop"
                  className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Referral */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                How did you hear about us? <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <select
                value={referral}
                onChange={(e) => setReferral(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
              >
                <option value="">Select one…</option>
                {REFERRAL_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !businessName.trim()}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Complete My Account <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <p className="mt-5 text-xs text-slate-500 text-center leading-relaxed">
            Your account is pending approval. You can browse our full catalog now — we&apos;ll confirm your account within 24 hours before your first order.
          </p>
        </div>
      </div>
    </div>
  );
}
