"use client";

import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { ArrowLeft, ArrowRight, Package } from "lucide-react";
import { handleOutboundClick, CTA_EVENTS } from "@/lib/gtm";
import {
  GREENS_CATEGORIES,
  COMBO_BOXES_LINK,
  getGreensCheckoutUrl,
  type GreensCategory,
} from "@/lib/shop-greens";

export default function ShopGreensPage() {
  const trackOrderClick = (e: React.MouseEvent<HTMLAnchorElement>, name: string) => {
    handleOutboundClick(e, CTA_EVENTS.valentine_shop_click, {
      cta_location: "shop_greens_page",
      product_type: name,
    });
  };

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

        {/* Hero + volume pricing */}
        <section className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Greens & Foliage — Volume Pricing, Free Shipping
          </h1>
          <p className="text-xl text-slate-700 max-w-3xl mx-auto mb-6">
            Eucalyptus, willow, pandanus, foliage mix boxes. From $0.13/stem. All greens ship free.
          </p>
          <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 px-6 py-6 md:px-8 md:py-6 text-white shadow-lg max-w-2xl mx-auto">
            <p className="text-2xl md:text-3xl font-bold mb-1">
              Volume pricing from $0.13/stem for greens
            </p>
            <p className="text-emerald-100 text-sm">
              Bulk boxes available. Free shipping on all foliage orders.
            </p>
          </div>
        </section>

        {/* Category grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {GREENS_CATEGORIES.map((cat) => (
            <GreensCard
              key={cat.id}
              category={cat}
              onOrderClick={trackOrderClick}
            />
          ))}
        </div>

        {/* Combo boxes cross-link */}
        <section className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-6 py-8 mb-12 text-center">
          <Package className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Need flowers + greens together?
          </h2>
          <p className="text-slate-600 mb-4 max-w-xl mx-auto">
            Our combo boxes mix foliage with roses and tropicals. One order, free shipping.
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
            href="/shop?category=Greens+%26+Foliage"
            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-lg font-bold hover:bg-emerald-700 transition-all shadow-lg"
          >
            Browse all greens in catalog
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function GreensCard({
  category,
  onOrderClick,
}: {
  category: GreensCategory;
  onOrderClick: (e: React.MouseEvent<HTMLAnchorElement>, name: string) => void;
}) {
  const url = getGreensCheckoutUrl(category);

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
        <p className="text-lg font-bold text-emerald-600 mb-1">{category.priceRange}</p>
        {category.volumeNote && category.volumeNote !== category.priceRange && (
          <p className="text-sm text-slate-500 mb-4">{category.volumeNote}</p>
        )}
        {!category.volumeNote && <div className="mb-4" />}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => onOrderClick(e, category.name)}
          className="block w-full text-center bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors"
        >
          Order now
        </a>
      </div>
    </div>
  );
}
