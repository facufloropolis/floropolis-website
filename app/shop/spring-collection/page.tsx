"use client";

import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { handleOutboundClick, CTA_EVENTS } from "@/lib/gtm";
import { SPRING_PRODUCTS, getSpringCheckoutUrl, type SpringProduct } from "@/lib/shop-spring";

export default function SpringCollectionPage() {
  const trackOrderClick = (e: React.MouseEvent<HTMLAnchorElement>, name: string) => {
    handleOutboundClick(e, CTA_EVENTS.valentine_shop_click, {
      cta_location: "spring_collection",
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
              onOrderClick={trackOrderClick}
            />
          ))}
        </div>

        {/* CTA */}
        <div className="text-center border-t border-slate-200 pt-10">
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-lg font-bold hover:bg-emerald-700 transition-all shadow-lg"
          >
            Browse all flowers in catalog
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function SpringProductCard({
  product,
  onOrderClick,
}: {
  product: SpringProduct;
  onOrderClick: (e: React.MouseEvent<HTMLAnchorElement>, name: string) => void;
}) {
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
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => onOrderClick(e, product.name)}
          className="mt-4 block w-full text-center bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors"
        >
          Order now
        </a>
      </div>
    </div>
  );
}
