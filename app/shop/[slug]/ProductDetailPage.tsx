"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { ShoppingCart, Check, Package, ChevronDown } from "lucide-react";
import type { Product } from "@/lib/data/products";
import { PRODUCT_IMAGES_BASE_URL, WHATSAPP_NUMBER } from "@/lib/catalog-constants";
import { getProductImage } from "@/lib/product-images";
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
  // Collect all images from all variants, with fallback to image mapper
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
    const resolved = Array.from(paths).map(resolveImage).filter(Boolean);
    // If no images from DB, use our image mapper
    if (resolved.length === 0) {
      const mapped = getProductImage(product.variety, product.color, product.category);
      if (mapped && mapped !== "/Floropolis-logo-only.png") {
        resolved.push(mapped);
      }
    }
    return resolved;
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
    () => getDeliveryDates(earliestDelivery, 12),
    [earliestDelivery],
  );
  const [showAllDates, setShowAllDates] = useState(false);

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
  const [deliveryFrom, setDeliveryFrom] = useState<string>(
    deliveryDates[0] ? toISODate(deliveryDates[0]) : "",
  );
  const [deliveryTo, setDeliveryTo] = useState<string>(
    deliveryDates[0] ? toISODate(deliveryDates[0]) : "",
  );
  const [selectingTo, setSelectingTo] = useState(false);
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

  const deliveryLabel = deliveryFrom === deliveryTo
    ? deliveryFrom
    : `${deliveryFrom} to ${deliveryTo}`;

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
      delivery_date: deliveryFrom || undefined,
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

            {/* Delivery date range — from / to */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-semibold text-slate-700">
                  Delivery Window
                </p>
                {deliveryFrom && deliveryTo && deliveryFrom !== deliveryTo && (
                  <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    {formatDeliveryDate(new Date(deliveryFrom + "T12:00:00"))} — {formatDeliveryDate(new Date(deliveryTo + "T12:00:00"))}
                  </span>
                )}
              </div>

              {/* From / To labels */}
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setSelectingTo(false)}
                  className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                    !selectingTo
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  From: {deliveryFrom ? formatDeliveryDate(new Date(deliveryFrom + "T12:00:00")) : "Select"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectingTo(true)}
                  className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                    selectingTo
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  To: {deliveryTo ? formatDeliveryDate(new Date(deliveryTo + "T12:00:00")) : "Select"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {(showAllDates ? deliveryDates : deliveryDates.slice(0, 8)).map((date) => {
                  const iso = toISODate(date);
                  const isFrom = deliveryFrom === iso;
                  const isTo = deliveryTo === iso;
                  const isInRange = deliveryFrom && deliveryTo && iso >= deliveryFrom && iso <= deliveryTo;
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => {
                        if (!selectingTo) {
                          setDeliveryFrom(iso);
                          if (iso > deliveryTo) setDeliveryTo(iso);
                          setSelectingTo(true);
                        } else {
                          if (iso < deliveryFrom) {
                            setDeliveryFrom(iso);
                          } else {
                            setDeliveryTo(iso);
                          }
                          setSelectingTo(false);
                        }
                      }}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        isFrom || isTo
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : isInRange
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-slate-300 text-slate-700 hover:border-emerald-400"
                      }`}
                    >
                      {formatDeliveryDate(date)}
                    </button>
                  );
                })}
              </div>
              {deliveryDates.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllDates(!showAllDates)}
                  className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
                >
                  {showAllDates ? "Show fewer dates" : `Show all ${deliveryDates.length} dates (up to 12 weeks)`}
                  <ChevronDown className={`w-3 h-3 transition-transform ${showAllDates ? "rotate-180" : ""}`} />
                </button>
              )}
              <p className="mt-1 text-xs text-slate-400">
                {selectingTo ? "Now select your latest acceptable delivery date" : "Select your earliest delivery date"} · Mon, Tue, Thu, Fri
              </p>
            </div>

            {/* Add to Quote — PROMINENT */}
            <div className="mt-4 space-y-3">
              {/* Success confirmation banner */}
              {justAdded && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 animate-in slide-in-from-top">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-emerald-800">Added to your quote!</p>
                    <p className="text-xs text-emerald-600">
                      {displayName} · {selectedLength || "Standard"} · {deliveryFrom === deliveryTo ? formatDeliveryDate(new Date(deliveryFrom + "T12:00:00")) : `${formatDeliveryDate(new Date(deliveryFrom + "T12:00:00"))} — ${formatDeliveryDate(new Date(deliveryTo + "T12:00:00"))}`}
                    </p>
                  </div>
                  <Link
                    href="/quote"
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline flex-shrink-0"
                  >
                    View Quote →
                  </Link>
                </div>
              )}
              <button
                type="button"
                onClick={handleAddToQuote}
                className={`w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold text-lg shadow-md hover:shadow-lg transition-all ${
                  justAdded
                    ? "bg-emerald-700 text-white ring-2 ring-emerald-300"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {justAdded ? (
                  <>
                    <Check className="w-5 h-5" />
                    Added! Add Another?
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
                  href={`/sample-box?product=${encodeURIComponent(`${product.variety} ${product.color}`)}&category=${encodeURIComponent(product.category)}`}
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
                const dbImg = Array.isArray(p.images) && p.images.length > 0
                  ? resolveImage(p.images[0])
                  : null;
                const img = dbImg || getProductImage(p.variety, p.color, p.category);
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

        {/* Product details / SEO section — below the fold */}
        <section className="mt-16 pt-12 border-t border-slate-200">
          <div className="grid md:grid-cols-3 gap-8">
            {/* About this product */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3">
                About {product.variety || displayName}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {product.category === "Rose" && (
                  <>{product.variety} is a premium {product.color?.toLowerCase()} rose variety, sourced fresh from top Colombian and Ecuadorian farms. Known for its large head size, vibrant color, and excellent vase life of 7–12 days.</>
                )}
                {product.category === "Ranunculus" && (
                  <>{product.variety} is a beautiful {product.color?.toLowerCase()} ranunculus with delicate, layered petals. Perfect for bridal bouquets, centerpieces, and spring arrangements. Vase life of 5–8 days.</>
                )}
                {product.category === "Anemone" && (
                  <>{product.variety} is a striking {product.color?.toLowerCase()} anemone with its signature dark center. A favorite for weddings and upscale arrangements. Vase life of 5–7 days.</>
                )}
                {product.category === "Tropicals" && (
                  <>{product.variety} is an exotic tropical flower that adds drama and structure to any arrangement. Hardy and long-lasting with a vase life of 10–14 days.</>
                )}
                {(product.category === "Greens" || product.category === "Greens & Foliage") && (
                  <>{product.variety} is a premium foliage variety used to add texture and volume to arrangements. Sourced fresh for maximum freshness and longevity.</>
                )}
                {product.category === "Bouquets" && (
                  <>The {product.variety} bouquet is a curated mix of premium flowers, professionally assembled and ready to sell or display. Each bouquet is designed for maximum visual impact.</>
                )}
                {product.category === "Mixed Boxes" && (
                  <>The {product.variety} box is a curated assortment of premium flowers, perfect for florists who want variety without the commitment of full boxes. Each box is designed with complementary colors and textures.</>
                )}
                {!["Rose", "Ranunculus", "Anemone", "Tropicals", "Greens", "Greens & Foliage", "Bouquets", "Mixed Boxes"].includes(product.category) && (
                  <>{product.variety} {product.color} is a premium {product.category.toLowerCase()} variety, sourced directly from top farms for guaranteed freshness and quality.</>
                )}
              </p>
              {currentVariant.stems_per_bunch && (
                <p className="text-sm text-slate-500 mt-3">
                  Packed {currentVariant.stems_per_bunch} stems per bunch · {currentVariant.units_per_box} {currentVariant.unit === "Bunch" ? "bunches" : "units"} per {BOX_TYPE_LABELS[currentVariant.box_type] || currentVariant.box_type || "box"}
                </p>
              )}
            </div>

            {/* Expected delivery */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3">
                Delivery & Availability
              </h3>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  Earliest delivery: <span className="font-semibold text-slate-800">{formatDeliveryDate(earliestDelivery)}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  Delivery days: Monday, Tuesday, Thursday, Friday
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  {bestTier === "T1" || bestTier === "T2"
                    ? "In stock — ships within 5 days of order"
                    : "Pre-order — ships within 14 days of order"
                  }
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  Cold chain shipping from farm to your door
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  Free delivery on orders over $500
                </li>
              </ul>
            </div>

            {/* Farm info */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3">
                About the Farm
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {product.vendor ? (
                  <>Sourced from <span className="font-semibold text-slate-800">{product.vendor}</span>, one of our trusted partner farms. All Floropolis partner farms maintain strict quality standards, sustainable growing practices, and Rainforest Alliance or similar certifications.</>
                ) : (
                  <>Sourced from one of our trusted partner farms in Colombia or Ecuador. All Floropolis partner farms maintain strict quality standards, sustainable growing practices, and fair labor conditions.</>
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-1 font-medium">
                  Farm Direct
                </span>
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-1 font-medium">
                  Quality Guaranteed
                </span>
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-1 font-medium">
                  Cold Chain
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
