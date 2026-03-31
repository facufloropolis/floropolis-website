"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { WHATSAPP_NUMBER } from "@/lib/catalog-constants";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const quoteId = searchParams.get("id");

  // Fire conversion event when confirmation page loads — used as GA4 Goal
  useEffect(() => {
    pushEvent(CTA_EVENTS.quote_confirmed, { quote_id: quoteId ?? undefined });
  }, [quoteId]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <span className="text-3xl">&#10003;</span>
      </div>

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
        Quote Request Received!
      </h1>

      {quoteId && (
        <div className="inline-block bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 mb-4">
          <span className="text-sm text-emerald-700 font-medium">
            Reference: #{quoteId}
          </span>
        </div>
      )}

      <p className="text-base text-slate-600 mb-2">
        Our team will review your order and confirm availability within{" "}
        <span className="font-semibold text-slate-800">1 hour</span>{" "}
        <span className="text-sm text-slate-500">(Mon–Fri, 8 AM – 6 PM ET)</span>.
      </p>
      <p className="text-sm text-slate-500 mb-8">
        We&apos;ve sent a confirmation email with your quote details. Check your inbox (and spam folder).
      </p>

      <div className="bg-slate-50 rounded-xl p-6 mb-8 text-left">
        <h2 className="text-sm font-bold text-slate-800 mb-3">What happens next?</h2>
        <ol className="space-y-2 text-sm text-slate-600">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">1</span>
            <span>We verify product availability and confirm pricing</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">2</span>
            <span>You receive a final quote with delivery details</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">3</span>
            <span>Approve and we ship directly to your door</span>
          </li>
        </ol>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hi! I just submitted quote${quoteId ? ` #${quoteId}` : ""}. I have a question.`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white px-6 py-3 text-sm font-semibold hover:bg-emerald-700"
          onClick={() => pushEvent("whatsapp_click", { cta_location: "quote_confirmation" })}
        >
          Message us on WhatsApp
        </a>
        <Link
          href="/shop"
          className="inline-flex items-center justify-center rounded-xl border border-slate-300 text-slate-700 px-6 py-3 text-sm font-semibold hover:bg-slate-50"
        >
          Continue Shopping
        </Link>
      </div>

      {/* EXP-127: MDY upsell on confirmation page — florists who just submitted a quote for April may want MDY flowers */}
      {new Date() < new Date("2026-05-04T23:59:59-04:00") && (
        <div className="mt-8 max-w-md mx-auto rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-center">
          <p className="text-sm font-semibold text-rose-700">💝 Planning for Mother&apos;s Day?</p>
          <p className="text-xs text-rose-500 mt-0.5">Pre-order cutoff is May 4 — add ranunculus, anemone &amp; delphiniums before spots fill.</p>
          <a href="/mothers-day-2026" className="inline-block mt-2 text-xs font-bold text-rose-600 underline hover:no-underline">Browse Mother&apos;s Day Collection →</a>
        </div>
      )}
    </main>
  );
}

export default function QuoteConfirmationPage() {
  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />
      <Suspense fallback={
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">&#10003;</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Quote Request Received!</h1>
          <p className="text-slate-600">Loading details...</p>
        </main>
      }>
        <ConfirmationContent />
      </Suspense>
      <Footer />
    </div>
  );
}
