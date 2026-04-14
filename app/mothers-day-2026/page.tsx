"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { pushEvent } from "@/lib/gtm";
import { getProductImage } from "@/lib/product-images";

type MDYProduct = {
  name: string;
  description: string;
  price: number;
  slug: string;
  category: "Bouquets" | "Roses" | "Delphinium" | "Tropicals";
  variety: string;
  color: string;
  image?: string; // override; otherwise resolved via getProductImage
};

const MDY_PRODUCTS: MDYProduct[] = [
  // Bouquets — ready-made, highest AOV
  {
    name: "Round - Medium Rainbow",
    description: "Ready-made bouquet · 120 bunches · Farm-direct Ecuador",
    price: 8.70,
    slug: "round---medium-rainbow-assorted",
    category: "Bouquets",
    variety: "Round - Medium Rainbow",
    color: "Assorted",
  },
  {
    name: "Round - Plus Rainbow",
    description: "Larger bouquet · 120 bunches · Ships ready to display",
    price: 11.50,
    slug: "round---plus-rainbow-assorted",
    category: "Bouquets",
    variety: "Round - Plus Rainbow",
    color: "Assorted",
  },
  {
    name: "Round - Medium Parrot",
    description: "Premium bouquet · 210 bunches · Statement piece",
    price: 18.27,
    slug: "bouquets-assorted-round---medium-parrot-50-cm",
    category: "Bouquets",
    variety: "Round - Medium Parrot",
    color: "Assorted",
  },

  // Roses — MDY staple
  {
    name: "Assorted Rainbow Roses",
    description: "Mixed colors · 35 bunches in stock · Grower's choice",
    price: 1.47,
    slug: "assorted-rainbow",
    category: "Roses",
    variety: "Assorted",
    color: "Rainbow",
  },
  {
    name: "Assorted White Roses",
    description: "Classic white mix · 25 bunches · Perfect for MDY bouquets",
    price: 1.47,
    slug: "assorted-white",
    category: "Roses",
    variety: "Assorted",
    color: "White",
  },
  {
    name: "Explorer Red 80cm",
    description: "Long-stem red · 21 bunches · Premium grade",
    price: 1.81,
    slug: "explorer-red-80-cm",
    category: "Roses",
    variety: "Explorer",
    color: "Red",
  },
  {
    name: "Brighton Yellow 50cm",
    description: "Bright yellow · Limited stock · 8 bunches",
    price: 1.40,
    slug: "brighton-yellow-50-cm",
    category: "Roses",
    variety: "Brighton",
    color: "Yellow",
  },
  {
    name: "Cool Water Lavender 50cm",
    description: "Soft lavender · Limited stock · 7 bunches",
    price: 1.22,
    slug: "cool-water-lavender-50-cm",
    category: "Roses",
    variety: "Cool Water",
    color: "Lavender",
  },

  // Delphinium — tall, airy, MDY signature
  {
    name: "Sky Waltz Light Blue 70cm",
    description: "Tall elegant spikes · Farm-direct Ecuador",
    price: 1.10,
    slug: "sky-waltz-light-blue-70cm",
    category: "Delphinium",
    variety: "Sky Waltz",
    color: "Light Blue",
    image: "https://d3bgzcd3kwm78d.cloudfront.net/762172/product/20634686.png",
  },
  {
    name: "Bella Andes White Delphinium",
    description: "Classic white spikes · Farm-direct Ecuador",
    price: 1.03,
    slug: "bella-andes-white-90cm",
    category: "Delphinium",
    variety: "Bella Andes",
    color: "White",
    image: "/images/shop/delphinium/delphinium-bella-andes-white.png",
  },
  {
    name: "Sky Waltz Light Blue 60cm",
    description: "Tall elegant spikes · Perfect for arrangements",
    price: 1.08,
    slug: "delphinium-light-blue-sky-waltz-60cm",
    category: "Delphinium",
    variety: "Sky Waltz",
    color: "Light Blue",
    image: "/images/shop/delphinium/blue-sky-waltz-light-blue.png",
  },

  // Tropicals / Mixed — differentiator
  {
    name: "Tropical Mixes Fiesta",
    description: "Mixed tropical · 120 bunches · Assorted tropical blooms",
    price: 1.97,
    slug: "tropical-mixes-fiesta-assorted",
    category: "Tropicals",
    variety: "Tropical Mixes Fiesta",
    color: "Assorted",
  },
  {
    name: "Tropical Mixes Mini Fiesta",
    description: "Smaller mixed tropical · 120 bunches · Starter option",
    price: 1.56,
    slug: "tropical-mixes-mini-fiesta-assorted",
    category: "Tropicals",
    variety: "Tropical Mixes Mini Fiesta",
    color: "Assorted",
  },
  {
    name: "Heliconia Fire Opal Red",
    description: "Statement tropical · 120 bunches · Bold centerpiece",
    price: 1.12,
    slug: "heliconia-golden-fire-opal-red",
    category: "Tropicals",
    variety: "Heliconia Golden Fire Opal",
    color: "Red",
  },
];

const CATEGORIES = ["All", "Bouquets", "Roses", "Delphinium", "Tropicals"] as const;
type CategoryFilter = typeof CATEGORIES[number];

const TRUST_SIGNALS = [
  {
    title: "Farm-direct from Ecuador's Cayambe Valley",
    detail: "Grown at 3,100m elevation — longer vase life, richer color",
  },
  {
    title: "Delivery included — no hidden fees",
    detail: "Price per stem is the price you pay. Nothing added at checkout.",
  },
  {
    title: "Pre-order cutoff: May 4 for May 10 delivery",
    detail: "Order ahead to lock in availability for Mother's Day.",
  },
];

export default function MothersDayPage() {
  const [countdown, setCountdown] = useState("");
  const [filter, setFilter] = useState<CategoryFilter>("All");

  useEffect(() => {
    pushEvent("mdy_lp_view", { page: "/mothers-day-2026" });
  }, []);

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

  const filtered = useMemo(() => {
    if (filter === "All") return MDY_PRODUCTS;
    return MDY_PRODUCTS.filter(p => p.category === filter);
  }, [filter]);

  const resolveImage = (p: MDYProduct): string => {
    if (p.image) return p.image;
    // Map category name to the resolver's expected category
    const cat = p.category === "Tropicals" ? "Tropicals" :
                p.category === "Bouquets" ? "Bouquets" :
                p.category === "Roses" ? "Rose" : "Delphinium";
    return getProductImage(p.variety, p.color, cat);
  };

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
              <Link
                href="/sample-box"
                className="inline-flex items-center justify-center gap-2 border border-rose-400 text-rose-600 hover:bg-rose-50 font-semibold px-8 py-3.5 rounded-xl transition-colors text-base"
                onClick={() => pushEvent("mdy_lp_cta_click", { cta: "hero_sample_box", page: "/mothers-day-2026" })}
              >
                Try a free sample box
              </Link>
            </div>
            <p className="mt-5 text-sm text-rose-500 font-medium">
              Pre-order cutoff: May 4, 2026 · Mother&apos;s Day: May 10, 2026
              {countdown && <span className="ml-2 font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">— {countdown}</span>}
            </p>
          </div>
        </section>

        {/* Product grid with category filter */}
        <section id="collection" className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-2">
            Mother&apos;s Day Collection — {MDY_PRODUCTS.length} varieties
          </h2>
          <p className="text-slate-500 text-center mb-6 text-sm">
            Farm-verified pricing · Delivery included · Order before May 4
          </p>

          {/* Category filter */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {CATEGORIES.map(c => {
              const count = c === "All" ? MDY_PRODUCTS.length : MDY_PRODUCTS.filter(p => p.category === c).length;
              const active = filter === c;
              return (
                <button
                  key={c}
                  onClick={() => {
                    setFilter(c);
                    pushEvent("mdy_lp_filter_click", { category: c, page: "/mothers-day-2026" });
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    active
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {c} <span className={active ? "text-emerald-100" : "text-slate-400"}>({count})</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((p) => (
              <Link
                key={p.slug}
                href={`/shop/${p.slug}`}
                className="group rounded-2xl border border-rose-100 bg-white hover:border-rose-300 hover:shadow-lg transition-all overflow-hidden"
                onClick={() => pushEvent("mdy_lp_cta_click", { cta: "product_card", product: p.name, category: p.category, page: "/mothers-day-2026" })}
              >
                <div className="aspect-square relative bg-gradient-to-br from-rose-50 to-pink-50 overflow-hidden">
                  <Image
                    src={resolveImage(p)}
                    alt={p.name}
                    fill
                    className="object-contain hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
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
                      <span className="text-sm text-slate-400">/{p.category === "Bouquets" ? "bunch" : "stem"}</span>
                    </div>
                    <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full">Ships included</span>
                  </div>
                  <div className="mt-4 text-center text-sm font-semibold text-emerald-700 border border-emerald-200 rounded-lg py-2 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-all">
                    View &amp; Add to Quote →
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/shop"
              className="text-sm text-slate-500 hover:text-emerald-600 underline underline-offset-2"
              onClick={() => pushEvent("mdy_lp_cta_click", { cta: "browse_all", page: "/mothers-day-2026" })}
            >
              Browse full catalog — 1,000+ varieties available →
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
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/quote"
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-10 py-4 rounded-xl transition-colors text-base"
              onClick={() => pushEvent("mdy_lp_cta_click", { cta: "bottom_quote", page: "/mothers-day-2026" })}
            >
              Request a Quote
            </Link>
            <Link
              href="/sample-box"
              className="inline-flex items-center justify-center gap-2 border border-rose-400 text-rose-600 hover:bg-rose-50 font-semibold px-10 py-4 rounded-xl transition-colors text-base"
              onClick={() => pushEvent("mdy_lp_cta_click", { cta: "bottom_sample_box", page: "/mothers-day-2026" })}
            >
              Get a free sample box
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Pre-order cutoff: May 4 · Delivery: May 8–10 · No payment at quote stage
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
