"use client";

import { useState } from "react";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { BookOpen, CheckCircle, ArrowRight } from "lucide-react";
import { pushEvent } from "@/lib/gtm";

const GUIDE_PERKS = [
  "How to read a wholesale price sheet and spot real value",
  "Why farm-direct pricing is 30–50% below distributor pricing",
  "Which flowers have the best margin for professional florists",
  "How to place your first Ecuador direct order",
];

export default function GuidePage() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = {
      first_name: (form.elements.namedItem("first_name") as HTMLInputElement).value.trim(),
      email: (form.elements.namedItem("email") as HTMLInputElement).value.trim(),
      shop_name: (form.elements.namedItem("shop_name") as HTMLInputElement).value.trim() || null,
    };

    try {
      const res = await fetch("/api/guide-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Request failed");

      pushEvent("guide_signup", { email: data.email });
      setStatus("success");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <section className="py-14 px-4">
        <div className="max-w-lg mx-auto">
          {status === "success" ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">You're on the list!</h2>
              <p className="text-slate-600 mb-6">
                Your guide is coming — we'll email it to you as soon as it's ready.
              </p>
              {/* EXP-117: MDY CTA in guide success state — most urgent conversion for April leads */}
              <div className="flex flex-col gap-3 max-w-xs mx-auto">
                <Link
                  href="/mothers-day-2026"
                  className="inline-flex items-center justify-center gap-2 bg-rose-600 text-white px-6 py-3.5 rounded-lg font-bold hover:bg-rose-700 transition-colors text-sm"
                  onClick={() => pushEvent("mdy_banner_click", { cta_location: "guide_success" })}
                >
                  Shop Mother&apos;s Day →
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/shop"
                  className="inline-flex items-center justify-center gap-2 border border-slate-300 text-slate-600 px-6 py-3.5 rounded-lg font-semibold hover:bg-slate-50 transition-colors text-sm"
                >
                  Browse Full Catalog
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-7 h-7 text-emerald-600" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3 leading-tight">
                  The Farm-Direct Buying Guide for Professional Florists
                </h1>
                <p className="text-lg text-slate-600">
                  How to buy direct from Ecuador, read a wholesale price sheet, and cut your flower
                  costs by 30–50%.
                </p>
              </div>

              <ul className="space-y-2.5 mb-8">
                {GUIDE_PERKS.map((perk) => (
                  <li key={perk} className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-700">{perk}</span>
                  </li>
                ))}
              </ul>

              <form onSubmit={handleSubmit} className="bg-slate-50 rounded-2xl p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    First Name <span className="text-slate-400">*</span>
                  </label>
                  <input
                    name="first_name"
                    type="text"
                    required
                    placeholder="Maria"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email <span className="text-slate-400">*</span>
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="maria@yourshop.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Shop Name{" "}
                    <span className="text-slate-400 font-normal text-xs">(optional)</span>
                  </label>
                  <input
                    name="shop_name"
                    type="text"
                    placeholder="Maria's Flowers"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                  />
                </div>
                {status === "error" && (
                  <p className="text-sm text-red-600">{errorMsg}</p>
                )}
                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="w-full bg-emerald-600 text-white py-3.5 rounded-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {status === "submitting" ? "Sending…" : "Get the free guide →"}
                </button>
                <p className="text-xs text-slate-400 text-center">
                  No spam. Just the guide. You can unsubscribe any time.
                </p>
              </form>
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
