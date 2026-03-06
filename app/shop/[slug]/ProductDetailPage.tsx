"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { ShoppingCart, Check, Package } from "lucide-react";
import type { Product } from "@/lib/data/products";
import { PRODUCT_IMAGES_BASE_URL, WHATSAPP_NUMBER } from "@/lib/catalog-constants";
import { addItem, type QuoteItem } from "@/lib/quote-cart";
import {
  getEarliestDeliveryDate,
  getDeliveryDates,
  formatDeliveryDate,
  toISODate,
} from "@/lib/delivery-dates";

type Props = {
  product: Product;
  variants: Product[];
  related: Product[];
  categorySlug: string;
};

function resolveImage(path: string): string {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("/")) return path;
  const base = PRODUCT_IMAGES_BASE_URL.replace(/\/$/, "");
  return `${base}/${path}`;
}

export default function ProductDetailPage({
  product,
  variants,
  related,
  categorySlug,
}: Props) {
  // Collect all images from all variants
  const images = useMemo(() => {
    const paths = new Set<string>();
    const all = [product, ...variants];
    for (const v of all) {
      if (Array.isArray(v.images)) {
        for (const img of v.images) {
          if (img) paths.add(img);
        }
      }
    }
    return Array.from(paths).map(resolveImage).filter(Boolean);
  }, [product, variants]);

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // --- TOGGLES ---

  // Unique lengths
  const uniqueLengths = useMemo(() => {
    const set = new Set(variants.map((v) => v.length).filter((l): l is string => !!l));
    const order = ["35cm", "40cm", "50cm", "60cm", "70cm", "80cm"];
    return order.filter((l) => set.has(l));
  }, [variants]);

  // Unique box types
  const uniqueBoxTypes = useMemo(() => {
    const set = new Set(variants.map((v) => v.box_type).filter(Boolean));
    const order = ["HB", "QB", "EB", "FB"];
    return order.filter((bt) => set.has(bt));
  }, [variants]);

  const BOX_TYPE_LABELS: Record<string, string> = {
    HB: "Half Box",
    QB: "Quarter Box",
    EB: "Eighth Box",
    FB: "Full Box",
  };

  // Delivery dates available for this product's tier
  const bestTier = useMemo(() => {
    const tiers = variants.map((v) => v.tier);
    if (tiers.includes("T1")) return "T1";
    if (tiers.includes("T2")) return "T2";
    if (tiers.includes("T3")) return "T3";
    return "T4";
  }, [variants]);

  const earliestDelivery = useMemo(() => getEarliestDeliveryDate(bestTier), [bestTier]);
  const deliveryDates = useMemo(
    () => getDeliveryDates(earliestDelivery, 4),
    [earliestDelivery],
  );

  // State — pre-populate with cheapest + earliest
  const cheapestVariant = useMemo(
    () =>
      [...variants].sort((a, b) => {
        const pa = a.deal_price ?? a.price;
        const pb = b.deal_price ?? b.price;
        return pa - pb;
      })[0] || product,
    [variants, product],
  );

  const [selectedLength, setSelectedLength] = useState<string>(
    cheapestVariant.length || uniqueLengths[0] || "",
  );
  const [selectedBoxType, setSelectedBoxType] = useState<string>(
    cheapestVariant.box_type || uniqueBoxTypes[0] || "",
  );
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState<string>(
    deliveryDates[0] ? toISODate(deliveryDates[0]) : "",
  );
  const [justAdded, setJustAdded] = useState(false);

  // Find the matching variant for current selection
  const currentVariant = useMemo(() => {
    // Try exact match
    const exact = variants.find(
      (v) =>
        (!selectedLength || v.length === selectedLength) &&
        (!selectedBoxType || v.box_type === selectedBoxType),
    );
    if (exact) return exact;
    // Fallback to length match
    const lengthMatch = variants.find((v) => v.length === selectedLength);
    if (lengthMatch) return lengthMatch;
    return cheapestVariant;
  }, [variants, selectedLength, selectedBoxType, cheapestVariant]);

  const unitLabel = currentVariant.unit === "Bunch" ? "bunch" : "stem";
  const basePrice = currentVariant.price ?? null;
  const dealPrice = currentVariant.deal_price ?? null;
  const hasDeal = !!currentVariant.is_on_deal && dealPrice != null;
  const effectivePrice = hasDeal && dealPrice != null ? dealPrice : basePrice;

  const totalStems =
    currentVariant.stems_per_bunch && currentVariant.units_per_box
      ? Math.round(currentVariant.stems_per_bunch * currentVariant.units_per_box)
      : null;

  const displayName =
    [product.variety, product.color].filter(Boolean).join(" ") || product.name;

  const relatedSorted = useMemo(
    () =>
      related
        .slice()
        .sort((a, b) => Number(b.has_photo) - Number(a.has_photo))
        .slice(0, 4),
    [related],
  );

  const handleAddToQuote = () => {
    const quoteItem: QuoteItem = {
      slug: currentVariant.slug,
      name: displayName,
      category: currentVariant.category,
      vendor: currentVariant.vendor || "",
      price: currentVariant.price ?? 0,
      deal_price: currentVariant.deal_price ?? undefined,
      quantity: 1,
      units_per_box: currentVariant.units_per_box || 0,
      box_type: currentVariant.box_type || "Standard",
      unit: currentVariant.unit || "Stem",
      delivery_date: selectedDeliveryDate || undefined,
      stem_length: selectedLength || undefined,
    };
    addItem(quoteItem);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  const whatsappText = encodeURIComponent(
    `Hi, I'm interested in ${displayName} (${currentVariant.length ?? "mixed stems"}) from Floropolis.`,
  );
  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappText}`;

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-slate-600" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <li>
              <Link href="/" className="hover:text-emerald-700 hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href="/shop" className="hover:text-emerald-700 hover:underline">
                Shop
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link
                href={`/shop?category=${encodeURIComponent(product.category)}`}
                className="hover:text-emerald-700 hover:underline"
              >
                {product.category}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="text-slate-900 font-medium" aria-current="page">
              {displayName}
            </li>
          </ol>
        </nav>

        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          {/* Image column */}
          <div className="space-y-3">
            {images.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 aspect-square text-slate-400">
                <span className="text-sm font-medium text-slate-500">
                  {product.category}
                </span>
              </div>
            ) : (
              <>
                <div className="relative w-full aspect-square rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <Image
                    src={images[selectedImageIndex] ?? images[0]}
                    alt={displayName}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-contain"
                    unoptimized={(
                      images[selectedImageIndex] ?? images[0]
                    ).startsWith("http")}
                  />
                  {hasDeal &&
                    (product.deal_label || currentVariant.deal_label) && (
                      <span className="absolute top-3 left-3 text-white text-xs font-semibold px-3 py-1 rounded-full shadow bg-emerald-600">
                        {currentVariant.deal_label ?? product.deal_label}
                      </span>
                    )}
                </div>
                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {images.map((src, idx) => (
                      <button
                        key={src + idx}
                        type="button"
                        onClick={() => setSelectedImageIndex(idx)}
                        className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border ${
                          idx === selectedImageIndex
                            ? "border-emerald-600"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <Image
                          src={src}
                          alt=""
                          fill
                          className="object-contain"
                          sizes="64px"
                          unoptimized={src.startsWith("http")}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Info column */}
          <div>
            <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-semibold border border-slate-200 mb-3">
              {product.category}
            </span>

            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-1">
              {displayName}
            </h1>
            <p className="text-sm text-slate-600 mb-4">
              Farm:{" "}
              <span className="font-semibold text-slate-800">
                {product.vendor}
              </span>
            </p>

            {/* Price */}
            <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
              {effectivePrice != null ? (
                <div className="flex items-baseline gap-3">
                  {hasDeal && basePrice != null && (
                    <span className="text-sm text-slate-400 line-through">
                      ${basePrice.toFixed(2)}/{unitLabel}
                    </span>
                  )}
                  <span className="text-2xl font-bold text-emerald-600">
                    ${effectivePrice.toFixed(2)}/{unitLabel}
                  </span>
                  {hasDeal &&
                    (product.deal_label || currentVariant.deal_label) && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-semibold border border-emerald-100">
                        {currentVariant.deal_label ?? product.deal_label}
                      </span>
                    )}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Pricing on request.</p>
              )}
              {totalStems != null && (
                <p className="mt-1 text-sm text-slate-600">
                  {totalStems.toLocaleString()} stems per{" "}
                  {BOX_TYPE_LABELS[currentVariant.box_type] || currentVariant.box_type} box
                  {currentVariant.stems_per_bunch > 1 && (
                    <span className="text-slate-400">
                      {" "}
                      ({currentVariant.stems_per_bunch} stems/bunch ×{" "}
                      {currentVariant.units_per_box}{" "}
                      {currentVariant.unit === "Bunch" ? "bunches" : "units"})
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Length toggle */}
            {uniqueLengths.length > 1 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-2">
                  Stem Length
                </p>
                <div className="flex flex-wrap gap-2">
                  {uniqueLengths.map((len) => (
                    <button
                      key={len}
                      type="button"
                      onClick={() => setSelectedLength(len)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        selectedLength === len
                          ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                          : "border-slate-300 text-slate-700 hover:border-emerald-400"
                      }`}
                    >
                      {len}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Box type toggle */}
            {uniqueBoxTypes.length > 1 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-2">
                  Box Size
                </p>
                <div className="flex flex-wrap gap-2">
                  {uniqueBoxTypes.map((bt) => (
                    <button
                      key={bt}
                      type="button"
                      onClick={() => setSelectedBoxType(bt)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        selectedBoxType === bt
                          ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                          : "border-slate-300 text-slate-700 hover:border-emerald-400"
                      }`}
                    >
                      {BOX_TYPE_LABELS[bt] || bt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery date toggle */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-slate-700 mb-2">
                Delivery Date
              </p>
              <div className="flex flex-wrap gap-2">
                {deliveryDates.slice(0, 8).map((date) => {
                  const iso = toISODate(date);
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setSelectedDeliveryDate(iso)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        selectedDeliveryDate === iso
                          ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                          : "border-slate-300 text-slate-700 hover:border-emerald-400"
                      }`}
                    >
                      {formatDeliveryDate(date)}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Delivery days: Mon, Tue, Thu, Fri · Cutoff: 12pm PST
              </p>
            </div>

            {/* Add to Quote — PROMINENT */}
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={handleAddToQuote}
                className={`w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold text-lg shadow-md hover:shadow-lg transition-all ${
                  justAdded
                    ? "bg-emerald-700 text-white"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {justAdded ? (
                  <>
                    <Check className="w-5 h-5" />
                    Added to Quote!
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-5 h-5" />
                    Add to Quote
                  </>
                )}
              </button>
              <div className="flex gap-3">
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold border border-emerald-600 text-emerald-700 hover:bg-emerald-50 transition-all text-sm"
                >
                  Ask About This
                </a>
                <Link
                  href="/sample-box"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all text-sm"
                >
                  <Package className="w-4 h-4" />
                  Try Sample Box
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Related products */}
        {relatedSorted.length > 0 && (
          <section className="mt-16 pt-12 border-t border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              You may also like
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {relatedSorted.map((p) => {
                const img =
                  (Array.isArray(p.images) &&
                    p.images.length > 0 &&
                    resolveImage(p.images[0])) ||
                  "/Floropolis-logo-only.png";
                const hasDealRel = !!p.is_on_deal && p.deal_price != null;
                const unitRel = p.unit === "Bunch" ? "bunch" : "stem";
                const baseRel = p.price;
                const dealRel = p.deal_price ?? p.price;

                return (
                  <Link
                    key={p.slug}
                    href={`/shop/${encodeURIComponent(p.slug)}`}
                    className="group bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all flex flex-col"
                  >
                    <div className="aspect-square relative bg-slate-50">
                      <Image
                        src={img}
                        alt={p.name}
                        fill
                        className="object-contain group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 25vw"
                        unoptimized={img.startsWith("http")}
                      />
                      {hasDealRel && p.deal_label && (
                        <span className="absolute top-2 left-2 rounded-full bg-emerald-600 text-white text-[10px] font-semibold px-2 py-0.5 shadow">
                          {p.deal_label}
                        </span>
                      )}
                    </div>
                    <div className="p-3 flex-1 flex flex-col">
                      <h3 className="font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors text-sm mb-1 line-clamp-2">
                        {(p.variety || p.name) +
                          (p.color ? ` ${p.color}` : "")}
                      </h3>
                      <div className="mt-auto flex items-baseline gap-1">
                        {hasDealRel && baseRel != null && (
                          <span className="text-xs text-slate-400 line-through">
                            ${baseRel.toFixed(2)}/{unitRel}
                          </span>
                        )}
                        <span className="text-sm font-bold text-emerald-700">
                          ${dealRel.toFixed(2)}/{unitRel}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
