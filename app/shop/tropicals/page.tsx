"use client";

import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { ArrowLeft, ArrowRight, Package } from "lucide-react";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";
import {
  TROPICAL_CATEGORIES,
  COMBO_BOXES_LINK,
  getTropicalCheckoutUrl,
  type TropicalCategory,
} from "@/lib/shop-tropicals";

export default function ShopTropicalsPage() {
  return (
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

        {/* Hero + value props */}
        <section className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Tropicals — Heliconia, Ginger, Anthurium & Novelties
          </h1>
          <p className="text-xl text-slate-700 max-w-3xl mx-auto mb-6">
            Unique varieties direct from Ecuador. Lasts 2x longer than traditional cuts. All ship free.
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-slate-600">
            <span className="inline-flex items-center gap-2 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Lasts 2x longer than traditional cuts
            </span>
            <span className="inline-flex items-center gap-2 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              All ship free
            </span>
            <span className="inline-flex items-center gap-2 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Unique varieties you won’t find elsewhere
            </span>
          </div>
        </section>

        {/* Category grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {TROPICAL_CATEGORIES.map((cat) => (
            <TropicalCard
              key={cat.id}
              category={cat}
            />
          ))}
        </div>

        {/* Combo boxes cross-link */}
        <section className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-6 py-8 mb-12 text-center">
          <Package className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Need flowers + tropicals together?
          </h2>
          <p className="text-slate-600 mb-4 max-w-xl mx-auto">
            Our combo boxes mix tropicals with roses and seasonal blooms. One order, free shipping.
          </p>
          <Link
            href={COMBO_BOXES_LINK}
            className="inline-flex items-center gap-2 bg-slate-800 text-white px-6 py-3 rounded-lg font-bold hover:bg-slate-700 transition-all"
          >
            See combo boxes
            <ArrowRight className="w-5 h-5" />
          </Link>
        </section>

        {/* CTA */}
        <div className="text-center border-t border-slate-200 pt-10">
          <Link
            href="/shop?category=Tropicals"
            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-lg font-bold hover:bg-emerald-700 transition-all shadow-lg"
          >
            Browse all tropicals in catalog
            <ArrowRight className="w-5 h-5" />
          </Link>
          {/* EXP-095: WA escape hatch — for visitors who prefer chat over browsing */}
          <p className="mt-4 text-slate-500 text-sm">
            Prefer to chat first?{" "}
            <a
              href="https://wa.me/17869308463?text=Hi!%20I%27m%20interested%20in%20wholesale%20tropical%20flowers%20from%20Floropolis."
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => pushEvent("whatsapp_click", { cta_location: "tropicals_cta" })}
              className="text-emerald-600 font-semibold hover:underline"
            >
              Message us on WhatsApp →
            </a>
          </p>
        </div>

        {/* FAQ — SEO content */}
        <section className="mt-16 mb-10 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Frequently Asked Questions</h2>
          <div className="space-y-5">
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Do you have bird of paradise year-round?</h3>
              <p className="text-slate-600 text-sm">Yes. Bird of paradise is one of our most reliable year-round varieties, supplied from our Ecuador farm partners. Check current availability for specific stem counts.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">What&apos;s the minimum order for heliconias?</h3>
              <p className="text-slate-600 text-sm">No minimum order. Tropical flowers are sold by the stem — order as few as 1 stem of any variety. Submit a quote and we confirm availability and pricing within 1 hour.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">How do I condition tropical flowers?</h3>
              <p className="text-slate-600 text-sm">Most tropicals prefer warm water (room temperature, not cold). Re-cut stems at an angle, keep in a cool spot (not refrigerator), and avoid direct drafts. Do NOT refrigerate heliconias — they&apos;ll blacken overnight.</p>
            </div>
          </div>
          <div className="mt-8 text-center">
            <Link href="/blog/tropical-flower-guide-florists" className="text-emerald-600 font-semibold hover:underline text-sm">
              Read our complete tropical flower guide &rarr;
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

// EXP-030: Links now route to our internal catalog (42 tropicals in shop)
function TropicalCard({ category }: { category: TropicalCategory }) {
  const url = getTropicalCheckoutUrl(category);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl transition-all flex flex-col">
      <div className="aspect-[4/3] relative bg-slate-100">
        <Image
          src={category.image}
          alt={category.name}
          fill
          className="object-contain"
          sizes="(max-width: 768px) 100vw, 50vw"
        />
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h2 className="text-xl font-bold text-slate-900 mb-2">{category.name}</h2>
        <p className="text-sm text-slate-600 mb-3 flex-1">{category.description}</p>
        {category.stemsInfo && (
          <p className="text-sm text-slate-500 mb-1">{category.stemsInfo}</p>
        )}
        <p className="text-lg font-bold text-emerald-600 mb-4">{category.priceRange}</p>
        <Link
          href={url}
          onClick={() => pushEvent(CTA_EVENTS.product_click, { product_category: "Tropicals", cta_location: "tropicals_page", product_name: category.name })}
          className="block w-full text-center bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors"
        >
          Shop {category.name} →
        </Link>
      </div>
    </div>
  );
}
