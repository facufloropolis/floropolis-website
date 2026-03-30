"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { ShoppingCart, Check } from "lucide-react";
import { products } from "@/lib/data/products";
import { addItem } from "@/lib/quote-cart";
import { getEarliestDeliveryDate, toISODate } from "@/lib/delivery-dates";
import { pushEvent } from "@/lib/gtm";

// Vendor sections shown on this page
const VENDOR_SECTIONS = [
  {
    id: "Ecoroses",
    label: "Ecoroses",
    tagline: "Assorted Rose Boxes",
    description:
      "Pre-sorted rose boxes from Ecuador. Same premium quality as single-variety orders — mixed colors, same farm.",
    color: "from-rose-50 to-pink-50",
    accent: "text-rose-600",
    border: "border-rose-200",
    badge: "bg-rose-100 text-rose-700",
  },
  {
    id: "Magic Flowers",
    label: "Magic Flowers",
    tagline: "Assorted Bouquet Boxes",
    description:
      "Tropical & specialty pre-made bouquets, assorted by style. Ready-to-display, 21 stems per bouquet.",
    color: "from-violet-50 to-purple-50",
    accent: "text-violet-600",
    border: "border-violet-200",
    badge: "bg-violet-100 text-violet-700",
  },
];

type ProductType = (typeof products)[0];

function AssortedCard({
  product,
  onAdd,
  added,
}: {
  product: ProductType;
  onAdd: () => void;
  added: boolean;
}) {
  const effectivePrice = product.deal_price ?? product.price;
  const image = product.images?.[0];
  const stemsPerBox = product.units_per_box ?? 1;
  const unit = product.unit ?? "Stem";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {image && (
        <div className="relative w-full aspect-[4/3] bg-slate-50">
          <Image
            src={image}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
          {product.is_on_deal && product.deal_label && (
            <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white px-2 py-0.5 rounded-full">
              {product.deal_label}
            </span>
          )}
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <p className="font-semibold text-slate-900 text-sm leading-snug mb-1">
          {product.name}
        </p>
        <p className="text-xs text-slate-500 mb-3">
          {product.vendor} · {stemsPerBox} {unit.toLowerCase()}s/box · T2 (5–10 days)
        </p>
        <div className="mt-auto flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-emerald-600">
              ${effectivePrice.toFixed(2)}
              <span className="text-xs font-normal text-slate-400">
                /{unit.toLowerCase()}
              </span>
            </p>
            {product.is_on_deal && product.compare_at_price && (
              <p className="text-xs text-slate-400 line-through">
                ${product.compare_at_price.toFixed(2)}
              </p>
            )}
          </div>
          <button
            onClick={onAdd}
            disabled={added}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              added
                ? "bg-emerald-100 text-emerald-700 cursor-default"
                : "bg-slate-900 text-white hover:bg-slate-700 active:scale-95"
            }`}
          >
            {added ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Added
              </>
            ) : (
              <>
                <ShoppingCart className="w-3.5 h-3.5" />
                Add to Quote
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AssortedBoxesPage() {
  const router = useRouter();
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [cartCount, setCartCount] = useState(0);

  // Group assorted products by vendor, de-duped by slug
  const productsByVendor = useMemo(() => {
    const map: Record<string, ProductType[]> = {};
    for (const v of VENDOR_SECTIONS) map[v.id] = [];

    const seen = new Map<string, ProductType>();
    for (const p of products) {
      const isAssorted =
        p.color?.toLowerCase().includes("assorted") ||
        p.variety?.toLowerCase().includes("assorted") ||
        p.name?.toLowerCase().includes("assorted");
      const isKnownVendor = VENDOR_SECTIONS.some((v) => v.id === p.vendor);
      if (!isAssorted || !isKnownVendor || p.price <= 0) continue;
      const existing = seen.get(p.slug);
      if (!existing || p.price < existing.price) seen.set(p.slug, p);
    }

    for (const p of seen.values()) {
      if (p.vendor && map[p.vendor]) map[p.vendor].push(p);
    }

    for (const v of VENDOR_SECTIONS) {
      map[v.id].sort((a, b) => a.name.localeCompare(b.name));
    }

    return map;
  }, []);

  function handleAdd(product: ProductType) {
    const deliveryDate = toISODate(getEarliestDeliveryDate("T2"));
    addItem({
      slug: product.slug,
      name: product.name,
      category: product.category,
      vendor: product.vendor ?? "",
      price: product.price,
      deal_price: product.deal_price ?? null,
      quantity: 1,
      units_per_box: product.units_per_box ?? 1,
      box_type: product.box_type ?? "QB",
      unit: product.unit ?? "Stem",
      delivery_date: deliveryDate,
    });
    pushEvent("assorted_add_to_quote", {
      slug: product.slug,
      vendor: product.vendor,
      price: product.deal_price ?? product.price,
    });
    setAdded((prev) => ({ ...prev, [product.slug]: true }));
    setCartCount((c) => c + 1);
  }

  function goToQuote() {
    pushEvent("assorted_go_to_quote", { item_count: cartCount });
    router.push("/quote");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumb + header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Link href="/shop" className="text-sm text-slate-400 hover:text-slate-600">
              Shop
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm text-slate-600 font-medium">Assorted Boxes</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Assorted Boxes
          </h1>
          <p className="text-slate-500 max-w-2xl">
            Pre-sorted boxes from our farm partners. Same farm-direct quality as
            single-variety orders — perfect when you want variety without the complexity.
            All T2 · Farm-direct from Ecuador · Delivery in 5–10 days.
          </p>
        </div>

        {/* Sticky quote CTA (shows when items added) */}
        {cartCount > 0 && (
          <div className="sticky top-4 z-20 mb-6">
            <div className="bg-slate-900 text-white rounded-2xl px-5 py-3 flex items-center justify-between shadow-lg">
              <p className="text-sm font-medium">
                {cartCount} item{cartCount > 1 ? "s" : ""} added to your quote
              </p>
              <button
                onClick={goToQuote}
                className="bg-white text-slate-900 text-sm font-bold px-4 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                Review Quote →
              </button>
            </div>
          </div>
        )}

        {/* Vendor sections */}
        {VENDOR_SECTIONS.map((section) => {
          const vendorProds = productsByVendor[section.id] ?? [];
          if (vendorProds.length === 0) return null;

          return (
            <div key={section.id} className="mb-12">
              <div
                className={`rounded-2xl bg-gradient-to-r ${section.color} border ${section.border} px-5 py-4 mb-5`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-xl font-bold text-slate-900">
                        {section.label}
                      </h2>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${section.badge}`}
                      >
                        {section.tagline}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 max-w-xl">
                      {section.description}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${section.accent} hidden sm:block`}>
                    {vendorProds.length} {vendorProds.length === 1 ? "variety" : "varieties"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {vendorProds.map((p) => (
                  <AssortedCard
                    key={p.slug}
                    product={p}
                    onAdd={() => handleAdd(p)}
                    added={!!added[p.slug]}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Bottom CTA — link to custom box builder */}
        <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <h3 className="text-lg font-bold text-slate-900 mb-2">
            Need a custom mix?
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Use our Box Builder to choose exactly which varieties go into your assorted box.
          </p>
          <Link
            href="/box-builder"
            className="inline-flex items-center gap-2 bg-violet-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-violet-700 transition-colors"
          >
            Open Box Builder →
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
