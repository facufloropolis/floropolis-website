"use client";

import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";
import { SPRING_PRODUCTS, getSpringCheckoutUrl, type SpringProduct } from "@/lib/shop-spring";


const SPRING_FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "When is ranunculus season?",
      acceptedAnswer: { "@type": "Answer", text: "Ranunculus peak season runs January through May. We source directly from Ecuador farms that grow Amandine varieties — the most sought-after commercial ranunculus — giving you access even outside peak months." },
    },
    {
      "@type": "Question",
      name: "Do you carry anemones year-round?",
      acceptedAnswer: { "@type": "Answer", text: "Anemones are available from October through May from our Ecuador partners. We carry 17 varieties including single and double forms in white, black, lavender, and bold bi-colors." },
    },
    {
      "@type": "Question",
      name: "What makes your spring flowers exclusive?",
      acceptedAnswer: { "@type": "Answer", text: "Most wholesalers don't carry varieties like molucella, scabiosa, or specialty larkspur because they're harder to source reliably. Our direct farm relationships in Ecuador give us access to varieties traditional distributors can't offer consistently." },
    },
  ],
};

export default function SpringCollectionPage() {
  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SPRING_FAQ_LD) }} />
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

        {/* Hero + lead message */}
        <section className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Spring Flowers Collection
          </h1>
          <p className="text-xl md:text-2xl text-slate-700 font-medium max-w-3xl mx-auto mb-4">
            Spring flowers no wholesaler carries — direct from Ecuador farms.
          </p>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Ranunculus, anemone, delphinium, scabiosa, thistle, molucella, larkspur. Seasonal varieties you won’t find at traditional distributors.
          </p>
        </section>

        {/* Product grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {SPRING_PRODUCTS.map((product) => (
            <SpringProductCard
              key={product.id}
              product={product}
            />
          ))}
        </div>

        {/* CTA */}
        {/* EXP-109: MDY cross-link — ranunculus + anemone are also MDY featured products */}
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-center">
          <p className="text-sm font-semibold text-rose-700">💝 Planning for Mother&apos;s Day?</p>
          <p className="text-xs text-rose-500 mt-0.5">These spring varieties are featured in our Mother&apos;s Day collection — order by April 25 for guaranteed May 10 delivery.</p>
          <a href="/mothers-day-2026" className="inline-block mt-2 text-xs font-bold text-rose-600 underline hover:no-underline">View Mother&apos;s Day collection →</a>
        </div>
        <div className="text-center border-t border-slate-200 pt-10 mb-12">
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-lg font-bold hover:bg-emerald-700 transition-all shadow-lg"
            >
              Browse all flowers in catalog
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/sample-box"
              className="inline-flex items-center gap-2 border-2 border-emerald-600 text-emerald-700 px-8 py-4 rounded-lg font-bold hover:bg-emerald-50 transition-all"
            >
              Try a free sample box
            </Link>
          </div>
          {/* EXP-124: WA escape on spring collection */}
          <p className="mt-4 text-slate-500 text-sm">
            Have specific variety questions?{" "}
            <a
              href="https://wa.me/17869308463?text=Hi!%20I%27m%20interested%20in%20spring%20flowers%20from%20Floropolis."
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => pushEvent("whatsapp_click", { cta_location: "spring_collection_cta" })}
              className="text-emerald-600 font-semibold hover:underline"
            >
              Chat on WhatsApp →
            </a>
          </p>
        </div>

        {/* FAQ — SEO content */}
        <section className="mt-4 mb-10 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Frequently Asked Questions</h2>
          <div className="space-y-5">
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">When is ranunculus season?</h3>
              <p className="text-slate-600 text-sm">Ranunculus peak season runs January through May. We source directly from Ecuador farms that grow Amandine varieties — the most sought-after commercial ranunculus — giving you access even outside peak months.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Do you carry anemones year-round?</h3>
              <p className="text-slate-600 text-sm">Anemones are available from October through May from our Ecuador partners. We carry 17 varieties including single and double forms in white, black, lavender, and bold bi-colors.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">What makes your spring flowers exclusive?</h3>
              <p className="text-slate-600 text-sm">Most wholesalers don't carry varieties like molucella, scabiosa, or specialty larkspur because they're harder to source reliably. Our direct farm relationships in Ecuador give us access to varieties traditional distributors can't offer consistently.</p>
            </div>
          </div>

        </section>
      </main>

      <Footer />
    </div>
    </>
  );
}

function SpringProductCard({ product }: { product: SpringProduct }) {
  const url = getSpringCheckoutUrl(product);
  const priceRange = `$${product.priceMin.toFixed(2)}–$${product.priceMax.toFixed(2)}/stem`;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl transition-all flex flex-col">
      <div className="aspect-square relative bg-slate-100">
        <Image
          src={product.image}
          alt={product.name}
          fill
          className="object-contain"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        {product.badge === "EXCLUSIVE" && (
          <span className="absolute top-3 left-3 bg-amber-500 text-white text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded shadow">
            Exclusive
          </span>
        )}
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h2 className="text-xl font-bold text-slate-900 mb-2">{product.name}</h2>
        <p className="text-sm text-slate-600 mb-3 flex-1">{product.description}</p>
        <p className="text-sm text-slate-500 mb-1">
          {product.varietyCount} varieties
        </p>
        <p className="text-lg font-bold text-emerald-600 mb-1">{priceRange}</p>
        <Link
          href={url}
          onClick={() => pushEvent(CTA_EVENTS.product_click, { product_name: product.name, cta_location: "spring_collection" })}
          className="mt-4 block w-full text-center bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors"
        >
          Shop {product.name} →
        </Link>
      </div>
    </div>
  );
}
