"use client";

import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";
import {
  getRosesByTier,
  type RoseVariety,
  type RoseTier,
} from "@/lib/shop-roses";
import { getProductBySlug } from "@/lib/data/product-helpers";

const TIER_LABELS: Record<RoseTier, { title: string; subtitle: string }> = {
  value: {
    title: "Best value",
    subtitle: "Under $1.30/stem · Same farm-direct quality",
  },
  popular: {
    title: "Popular",
    subtitle: "Tibet, Orange Crush, Free Spirit, Cool Water & favorites",
  },
  premium: {
    title: "Premium",
    subtitle: "Quicksand, Moonstone, Barista, Playa Blanca & designer varieties",
  },
  assorted: {
    title: "Assorted bundles",
    subtitle: "Mixed varieties · Great for events and sampling",
  },
};


const ROSES_FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What's the minimum order for wholesale roses?",
      acceptedAnswer: { "@type": "Answer", text: "No minimum order. Rose boxes come in 25-stem bunches — you can order 1 bunch of any variety. Mix as many varieties as you'd like in a single quote." },
    },
    {
      "@type": "Question",
      name: "Do you carry garden roses?",
      acceptedAnswer: { "@type": "Answer", text: "Yes. We carry Quicksand, Free Spirit, Antonia Garden, and several other garden-style roses with open, lush blooms. Check current availability in the shop — selection varies by season." },
    },
    {
      "@type": "Question",
      name: "How do I get the best vase life from Ecuador roses?",
      acceptedAnswer: { "@type": "Answer", text: "Re-cut stems at a 45° angle immediately on arrival, remove foliage below the waterline, and use clean buckets with floral preservative. You should expect 14-16 days consistently with proper conditioning." },
    },
  ],
};

export default function ShopRosesPage() {
  const { value, popular, premium, assorted } = getRosesByTier();
  const varietyCount = value.length + popular.length + premium.length + assorted.length;

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ROSES_FAQ_LD) }} />
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <nav className="mb-6 text-sm text-slate-500">
          <Link
            href="/shop"
            className="inline-flex items-center gap-1 hover:text-emerald-600"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Browse Catalog
          </Link>
        </nav>

        {/* Hero */}
        <section className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">
            Premium Roses — {varietyCount}+ Varieties in Stock
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Ecoroses direct from Ecuador. All prices include delivery. 25 stems per bunch.
          </p>
        </section>

        {/* Value message */}
        <section className="mb-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 px-6 py-8 md:px-10 md:py-10 text-white shadow-xl text-center">
          <p className="text-xl md:text-2xl font-bold mb-2">
            Farm-direct roses from Ecuador. Delivery included.
          </p>
          <p className="mt-4 text-emerald-100 text-sm max-w-2xl mx-auto">
            Same farms that supply the biggest wholesalers — without the middlemen. 4-day to your shop.
          </p>
        </section>

        {/* EXP-128: MDY callout on roses page — roses = top MDY flower, catch pre-order buyers at this page */}
        {new Date() < new Date("2026-04-25T23:59:59-04:00") && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-center">
            <p className="text-sm font-semibold text-rose-700">💝 Ordering roses for Mother&apos;s Day?</p>
            <p className="text-xs text-rose-500 mt-0.5">Pre-order by April 25 for guaranteed May 10 delivery. Farm-direct pricing, delivery included.</p>
            <a href="/mothers-day-2026" className="inline-block mt-2 text-xs font-bold text-rose-600 underline hover:no-underline">View Mother&apos;s Day Collection →</a>
          </div>
        )}

        {/* CTA strip */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          <Link
            href="/shop?category=Rose"
            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-emerald-700 transition-all shadow-lg"
          >
            Browse all roses in catalog
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="/sample-box"
            className="inline-flex items-center gap-2 border-2 border-emerald-600 text-emerald-600 px-6 py-3 rounded-lg font-bold hover:bg-emerald-50 transition-all"
          >
            Get a free sample box
          </Link>
        </div>

        {/* Tiers */}
        <TierSection roses={value} tier="value" />
        <TierSection roses={popular} tier="popular" />
        <TierSection roses={premium} tier="premium" />
        <TierSection roses={assorted} tier="assorted" />

        {/* FAQ — SEO content */}
        <section className="mt-16 mb-10 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Frequently Asked Questions</h2>
          <div className="space-y-5">
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">What&apos;s the minimum order for wholesale roses?</h3>
              <p className="text-slate-600 text-sm">No minimum order. Rose boxes come in 25-stem bunches — you can order 1 bunch of any variety. Mix as many varieties as you&apos;d like in a single quote.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Do you carry garden roses?</h3>
              <p className="text-slate-600 text-sm">Yes. We carry Quicksand, Free Spirit, Antonia Garden, and several other garden-style roses with open, lush blooms. Check current availability in the shop — selection varies by season.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">How do I get the best vase life from Ecuador roses?</h3>
              <p className="text-slate-600 text-sm">Re-cut stems at a 45° angle immediately on arrival, remove foliage below the waterline, and use clean buckets with floral preservative. You should expect 14-16 days consistently with proper conditioning.</p>
            </div>
          </div>
          <div className="mt-8 text-center">
            <Link href="/shop?category=Rose" className="text-emerald-600 font-semibold hover:underline text-sm">
              Read our complete wholesale roses guide &rarr;
            </Link>
            {/* EXP-103: WA escape on roses page */}
            <p className="mt-4 text-slate-500 text-sm">
              Have a specific variety in mind?{" "}
              <a
                href="https://wa.me/17869308463?text=Hi!%20I%27m%20looking%20for%20wholesale%20roses%20from%20Floropolis."
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => pushEvent("whatsapp_click", { cta_location: "roses_faq" })}
                className="text-emerald-600 font-semibold hover:underline"
              >
                Ask us on WhatsApp →
              </a>
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
    </>
  );
}

function TierSection({
  roses,
  tier,
}: {
  roses: RoseVariety[];
  tier: RoseTier;
}) {
  if (roses.length === 0) return null;

  const { title, subtitle } = TIER_LABELS[tier];

  return (
    <section className="mb-14">
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900">{title}</h2>
        <p className="text-slate-600">{subtitle}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {roses.map((rose) => (
          <RoseCard key={rose.id} rose={rose} />
        ))}
      </div>
    </section>
  );
}

function RoseCard({ rose }: { rose: RoseVariety }) {
  const detailProduct = getProductBySlug(rose.id);
  const orderUrl = detailProduct ? `/shop/${rose.id}` : `/shop?category=Rose`;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all flex flex-col">
      <Link href={orderUrl} className="block aspect-square relative bg-slate-100">
        <Image
          src={rose.image}
          alt={rose.name}
          fill
          className="object-contain hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
        />
        {rose.badge && (
          <span className="absolute top-2 left-2 bg-emerald-600 text-white text-xs font-semibold px-2 py-0.5 rounded">
            {rose.badge}
          </span>
        )}
      </Link>
      <div className="p-3 flex flex-col flex-1">
        <Link
          href={orderUrl}
          className="font-bold text-slate-900 hover:text-emerald-600 transition-colors text-sm leading-tight"
        >
          {rose.name}
        </Link>
        <p className="text-xs text-slate-500 mt-0.5">Color: {rose.color}</p>
        <p className="text-xs text-slate-600 mt-1">Lengths: {rose.availableLengths}</p>
        <p className="text-sm font-bold text-emerald-600 mt-1">{rose.priceRange}/stem</p>
        <p className="text-xs text-slate-500">{rose.stemsPerBunch} stems per bunch</p>
        <Link
          href={orderUrl}
          onClick={() => pushEvent(CTA_EVENTS.product_click, { product_name: rose.name, product_category: "Rose", cta_location: "roses_page" })}
          className="mt-3 block w-full text-center bg-emerald-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
        >
          View & Add to Quote
        </Link>
      </div>
    </div>
  );
}
