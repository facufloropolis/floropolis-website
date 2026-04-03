"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { pushEvent } from "@/lib/gtm";

const MDY_PRODUCTS = [
  {
    name: "Ranunculus Amandine Hot Pink",
    description: "Soft layered petals · Ecuador farm-direct",
    price: 1.23,
    search: "Amandine Hot Pink",
    category: "Ranunculus",
    slug: "amandine-hot-pink-30-35cm",
    image: "/images/shop/ranunculus/pink-amandine-hot-pink.jpg",
  },
  {
    name: "Anemone FullStar Red",
    description: "Bold statement flower · High stem count",
    price: 1.23,
    search: "FullStar Red",
    category: "Anemone",
    slug: "fullstar-red-35cm",
    image: "/images/shop/anemone/anemone-full-star-red.png",
  },
  {
    name: "Delphinium Sky Waltz",
    description: "Tall elegant spikes · Perfect for arrangements",
    price: 1.17,
    search: "Sky Waltz",
    category: "Delphinium",
    slug: "delphinium-light-blue-sky-waltz-60cm",
    image: "/images/shop/delphinium/blue-sky-waltz-light-blue.png",
  },
];

const TRUST_SIGNALS = [
  {
    icon: "🌿",
    title: "Farm-direct from Ecuador's Cayambe Valley",
    detail: "Grown at 3,100m elevation — longer vase life, richer color",
  },
  {
    icon: "🚚",
    title: "Delivery included — no hidden fees",
    detail: "Price per stem is the price you pay. Nothing added at checkout.",
  },
  {
    icon: "📅",
    title: "Pre-order cutoff: May 4 for May 10 delivery",
    detail: "Order ahead to lock in availability for Mother's Day.",
  },
];

export default function MothersDayPage() {
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    pushEvent("mdy_lp_view", { page: "/mothers-day-2026" });
  }, []);

  // EXP-104: Live countdown to May 4 cutoff
  useEffect(() => {
    const CUTOFF = new Date("2026-05-04T23:59:59-04:00").getTime();
    const update = () => {
      const diff = CUTOFF - Date.now();
      if (diff <= 0) { setCountdown(""); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCountdown(d > 0 ? `${d}d ${h}h ${m}m left` : `${h}h ${m}m left`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main>
        {/* Hero */}
        <section className="bg-gradient-to-br from-rose-50 via-pink-50 to-white border-b border-rose-100">
          <div className="max-w-4xl mx-auto px-4 py-14 text-center">
            <div className="inline-block bg-rose-100 text-rose-600 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
              Mother&apos;s Day 2026
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 leading-tight mb-4">
              Mother&apos;s Day Flowers from Ecuador<br className="hidden sm:block" />
              <span className="text-rose-500"> — Farm-Direct</span>
            </h1>
            <p className="text-lg text-slate-600 mb-8 max-w-xl mx-auto">
              Order by May 4 for guaranteed May 10 delivery. Delivery included in price.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="#collection"
                className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-base"
                onClick={() => pushEvent("mdy_lp_cta_click", { cta: "hero_browse", page: "/mothers-day-2026" })}
              >
                Browse Mother&apos;s Day Collection
              </a>
              <Link
                href="/quote"
                className="inline-flex items-center justify-center gap-2 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold px-8 py-3.5 rounded-xl transition-colors text-base"
                onClick={() => pushEvent("mdy_lp_cta_click", { cta: "hero_quote", page: "/mothers-day-2026" })}
              >
                Request a quote
              </Link>
            </div>
            <p className="mt-5 text-sm text-rose-500 font-medium">
              ⏰ Pre-order cutoff: May 4, 2026 · Mother&apos;s Day: May 10, 2026
              {countdown && <span className="ml-2 font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">— {countdown}</span>}
            </p>
          </div>
        </section>

        {/* Product grid */}
        <section id="collection" className="max-w-5xl mx-auto px-4 py-14">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-2">
            Mother&apos;s Day Collection
          </h2>
          <p className="text-slate-500 text-center mb-10 text-sm">
            Farm-verified pricing · Delivery included · Order before May 4
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {MDY_PRODUCTS.map((p) => (
              <Link
                key={p.search}
                href={`/shop/${p.slug}`}
                className="group rounded-2xl border border-rose-100 bg-white hover:border-rose-300 hover:shadow-lg transition-all overflow-hidden"
                onClick={() => pushEvent("mdy_lp_cta_click", { cta: "product_card", product: p.name, page: "/mothers-day-2026" })}
              >
                {/* EXP-130: Real product photos replace emoji */}
                <div className="aspect-square relative bg-gradient-to-br from-rose-50 to-pink-50 overflow-hidden">
                  <Image
                    src={p.image}
                    alt={p.name}
                    fill
                    className="object-contain hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 640px) 100vw, 33vw"
                  />
                </div>
                <div className="p-5">
                  <p className="text-xs text-rose-400 font-semibold uppercase tracking-wide mb-1">{p.category}</p>
                  <h3 className="font-bold text-slate-900 text-lg leading-tight mb-1 group-hover:text-emerald-700 transition-colors">
                    {p.name}
                  </h3>
                  <p className="text-slate-500 text-sm mb-3">{p.description}</p>
                  <div className="flex items-end justify-between">
                    <div>
                      <span className="text-2xl font-extrabold text-emerald-600">${p.price.toFixed(2)}</span>
                      <span className="text-sm text-slate-400">/stem</span>
                    </div>
                    <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full">✓ Ships included</span>
                  </div>
                  <div className="mt-4 text-center text-sm font-semibold text-emerald-700 border border-emerald-200 rounded-lg py-2 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-all">
                    View &amp; Add to Quote →
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/shop"
              className="text-sm text-slate-500 hover:text-emerald-600 underline underline-offset-2"
              onClick={() => pushEvent("mdy_lp_cta_click", { cta: "browse_all", page: "/mothers-day-2026" })}
            >
              Browse full catalog — 270+ varieties available →
            </Link>
          </div>
        </section>

        {/* Trust section */}
        <section className="bg-slate-50 border-t border-slate-100">
          <div className="max-w-4xl mx-auto px-4 py-12">
            <h2 className="text-xl font-bold text-slate-900 text-center mb-8">
              Why florists choose Floropolis for Mother&apos;s Day
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {TRUST_SIGNALS.map((t) => (
                <div key={t.title} className="text-center">
                  <div className="text-3xl mb-3">{t.icon}</div>
                  <h3 className="font-bold text-slate-900 mb-1 text-sm">{t.title}</h3>
                  <p className="text-slate-500 text-sm">{t.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="max-w-2xl mx-auto px-4 py-14 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">
            Ready to order for Mother&apos;s Day?
          </h2>
          <p className="text-slate-500 mb-6">
            Add your varieties to a quote — we confirm within 1 hour, Mon–Fri.
          </p>
          <Link
            href="/quote"
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-10 py-4 rounded-xl transition-colors text-base"
            onClick={() => pushEvent("mdy_lp_cta_click", { cta: "bottom_quote", page: "/mothers-day-2026" })}
          >
            Request a Quote
          </Link>
          <p className="mt-4 text-xs text-slate-400">
            Pre-order cutoff: May 4 · Delivery: May 8–10 · No payment at quote stage
          </p>
          {/* EXP-098: WA fallback — MDY page is high-stakes, capture chat-preferred visitors */}
          <p className="mt-3 text-sm text-slate-500">
            Prefer to chat?{" "}
            <a
              href="https://wa.me/17869308463?text=Hi!%20I%27d%20like%20to%20order%20flowers%20for%20Mother%27s%20Day%20from%20Floropolis."
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => pushEvent("whatsapp_click", { cta_location: "mothers_day_final_cta" })}
              className="text-emerald-600 font-semibold hover:underline"
            >
              Message us on WhatsApp →
            </a>
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
