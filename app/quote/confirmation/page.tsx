"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { WHATSAPP_NUMBER } from "@/lib/catalog-constants";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";
import type { QuoteItem } from "@/lib/quote-cart";

interface LastQuote {
  contact_name: string;
  phone: string | null;
  items: QuoteItem[];
  total: number;
  delivery_dates: string[];
}

function formatDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const quoteId = searchParams.get("id");
  const [lastQuote, setLastQuote] = useState<LastQuote | null>(null);

  useEffect(() => {
    pushEvent(CTA_EVENTS.quote_confirmed, { quote_id: quoteId ?? undefined });
    // Read personalization data saved at submit time
    try {
      const raw = localStorage.getItem("fp_last_submitted_quote");
      if (raw) setLastQuote(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [quoteId]);

  const firstName = lastQuote?.contact_name?.split(" ")[0] ?? null;
  const phone = lastQuote?.phone ?? null;

  return (
    <main className="max-w-2xl mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
          {firstName ? `${firstName}, your order is in ✓` : "Quote Request Received!"}
        </h1>

        {quoteId && (
          <div className="inline-block bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 mb-4">
            <span className="text-sm text-emerald-700 font-medium">Reference: #{quoteId}</span>
          </div>
        )}

        {phone ? (
          <p className="text-base text-slate-700 font-medium mb-1">
            Facu will text you at <span className="text-emerald-700">{phone}</span> within{" "}
            <span className="font-bold">1 hour</span>{" "}
            <span className="text-sm font-normal text-slate-500">(Mon–Fri, 8 AM – 6 PM ET)</span>
          </p>
        ) : (
          <p className="text-base text-slate-600 mb-1">
            Our team will review your order and confirm availability within{" "}
            <span className="font-semibold text-slate-800">1 hour</span>{" "}
            <span className="text-sm text-slate-500">(Mon–Fri, 8 AM – 6 PM ET)</span>.
          </p>
        )}
        <p className="text-sm text-slate-500">
          We've also sent a confirmation email. Check your inbox (and spam folder).
        </p>
      </div>

      {/* Order summary */}
      {lastQuote && lastQuote.items.length > 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 mb-6">
          <h2 className="text-sm font-bold text-slate-800 mb-3">Your order</h2>
          <div className="space-y-2">
            {lastQuote.items.map((item) => {
              const unitPrice = item.deal_price ?? item.price;
              const lineTotal = unitPrice * item.quantity * (item.units_per_box || 1);
              return (
                <div key={item.slug} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-slate-800">{item.name}</span>
                    <span className="text-slate-500 ml-1.5">{item.quantity}× {item.box_type}</span>
                    {item.delivery_date && (
                      <span className="ml-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">
                        {formatDate(item.delivery_date)}
                      </span>
                    )}
                  </div>
                  <span className="font-semibold text-slate-900 ml-4">${lineTotal.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between font-bold text-slate-900">
            <span>Estimated total</span>
            <span>${lastQuote.total.toFixed(2)}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Delivery included · subject to availability confirmation</p>
        </div>
      )}

      {/* What happens next */}
      <div className="bg-slate-50 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-bold text-slate-800 mb-3">What happens next</h2>
        <ol className="space-y-2.5 text-sm text-slate-600">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">1</span>
            <span>
              {phone
                ? <>Facu texts you at <strong>{phone}</strong> to confirm availability &amp; final pricing</>
                : "We verify product availability and confirm pricing"}
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">2</span>
            <span>You approve the final quote with delivery date</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">3</span>
            <span>We ship direct from farm — delivery included in price</span>
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
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Message us on WhatsApp
        </a>
        <Link
          href="/shop"
          className="inline-flex items-center justify-center rounded-xl border border-slate-300 text-slate-700 px-6 py-3 text-sm font-semibold hover:bg-slate-50"
        >
          Continue Shopping
        </Link>
      </div>

      {/* EXP-127: MDY upsell */}
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
          <p className="text-slate-600">Loading your confirmation...</p>
        </main>
      }>
        <ConfirmationContent />
      </Suspense>
      <Footer />
    </div>
  );
}
