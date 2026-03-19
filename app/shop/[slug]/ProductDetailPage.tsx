"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { ShoppingCart, Check, Package } from "lucide-react";
import type { Product } from "@/lib/data/products";
import { PRODUCT_IMAGES_BASE_URL, WHATSAPP_NUMBER } from "@/lib/catalog-constants";
import { getProductImage } from "@/lib/product-images";
import { addItem, type QuoteItem } from "@/lib/quote-cart";
import WhatsAppWidget from "@/components/WhatsAppWidget";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";
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
  bundles: Product[];
  categorySlug: string;
};

function resolveImage(path: string): string {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("/")) return path;
  const base = PRODUCT_IMAGES_BASE_URL.replace(/\/$/, "");
  return `${base}/${path}`;
}

function DeliveryDateChips({
  dates,
  selected,
  onSelect,
  tier,
}: {
  dates: Date[];
  selected: string;
  onSelect: (iso: string) => void;
  tier: string;
}) {
  // Group dates by week (Mon-Sun)
  const weeks: { weekLabel: string; dates: Date[] }[] = [];
  for (const d of dates) {
    // Week label = "Week of Mon DD"
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // roll back to Monday
    const label = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const last = weeks[weeks.length - 1];
    if (last && last.weekLabel === label) {
      last.dates.push(d);
    } else {
      weeks.push({ weekLabel: label, dates: [d] });
    }
  }
  // Only show first 4 weeks
  const visibleWeeks = weeks.slice(0, 4);
  const isFast = tier === "T1" || tier === "T2";

  return (
    <div className="space-y-3">
      {visibleWeeks.map((week) => (
        <div key={week.weekLabel}>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1.5">
            Week of {week.weekLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {week.dates.map((d) => {
              const iso = toISODate(d);
              const isSelected = selected === iso;
              const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
              const dayNum = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => onSelect(iso)}
                  className={`flex flex-col items-center px-3 py-2 rounded-xl border text-xs font-medium transition-colors min-w-[60px] ${
                    isSelected
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 text-slate-600 hover:border-emerald-400 bg-white"
                  }`}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide">{dayName}</span>
                  <span>{dayNum}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-400">
        {isFast ? "In stock · ships in ~4 days" : "Pre-order · ships in ~14 days"}
      </p>
    </div>
  );
}

function BundleGrid({ bundles, deliveryDate }: { bundles: Product[]; deliveryDate: string }) {
  const [addedSlug, setAddedSlug] = useState<string | null>(null);

  function handleAdd(b: Product) {
    const price = b.deal_price ?? b.price;
    if (price <= 0) return;
    addItem({
      slug: b.slug,
      name: b.name,
      category: b.category,
      vendor: b.vendor || "",
      price: b.price,
      deal_price: b.deal_price,
      quantity: 1,
      units_per_box: b.units_per_box || 1,
      box_type: b.box_type || "HB",
      unit: b.unit || "Stem",
      delivery_date: deliveryDate,
      stem_length: b.length || undefined,
    });
    pushEvent(CTA_EVENTS.add_to_quote, {
      product_name: b.name,
      product_category: b.category,
      product_price: price,
    });
    setAddedSlug(b.slug);
    setTimeout(() => setAddedSlug(null), 1500);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {bundles.map((b) => {
        const bImg = (Array.isArray(b.images) && b.images.length > 0)
          ? resolveImage(b.images[0])
          : getProductImage(b.variety, b.color, b.category);
        const bPrice = b.deal_price ?? b.price;
        const bUnit = b.unit === "Bunch" ? "bunch" : "stem";
        const isAdded = addedSlug === b.slug;
        return (
          <button
            key={b.slug}
            type="button"
            onClick={() => handleAdd(b)}
            className="group flex items-center gap-4 bg-emerald-50/50 rounded-xl border border-emerald-100 p-3 hover:shadow-md transition-all text-left"
          >
            <div className="relative w-16 h-16 rounded-lg bg-white overflow-hidden flex-shrink-0">
              <Image
                src={bImg}
                alt={b.name}
                fill
                className="object-contain"
                sizes="64px"
                unoptimized={bImg.startsWith("http")}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors truncate">
                {b.variety} {b.color}
              </p>
              <p className="text-xs text-slate-400">{b.category}</p>
              {bPrice > 0 && (
                <p className="text-sm font-bold text-emerald-600 mt-0.5">
                  ${bPrice.toFixed(2)}/{bUnit}
                </p>
              )}
            </div>
            <span className={`text-xs font-semibold flex-shrink-0 transition-colors ${isAdded ? "text-emerald-500" : "text-emerald-600"}`}>
              {isAdded ? (
                <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Added</span>
              ) : (
                "Add +"
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function ProductDetailPage({
  product,
  variants,
  related,
  bundles,
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

  // Normalize length for sorting: extract numeric cm value
  const parseLengthCm = (l: string): number => {
    const m = l.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 999;
  };

  // Unique lengths — use actual values from variants, sorted by cm
  const uniqueLengths = useMemo(() => {
    const set = new Set(variants.map((v) => v.length).filter((l): l is string => !!l));
    return Array.from(set).sort((a, b) => parseLengthCm(a) - parseLengthCm(b));
  }, [variants]);

  // Unique box types — use actual values, sorted by standard order
  const uniqueBoxTypes = useMemo(() => {
    const set = new Set(variants.map((v) => v.box_type).filter(Boolean));
    const order = ["EB", "QB", "HB", "FB"];
    return order.filter((bt) => set.has(bt)).concat(
      Array.from(set).filter((bt) => !order.includes(bt))
    );
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
  const [justAdded, setJustAdded] = useState(false);

  // Track product view on mount
  useEffect(() => {
    pushEvent(CTA_EVENTS.view_product, {
      product_name: [product.variety, product.color].filter(Boolean).join(" "),
      product_category: product.category,
      product_tier: product.tier,
      product_price: product.price,
      product_vendor: product.vendor || "",
    });
  }, [product]);

  // Which box types are available for the currently selected length
  const availableBoxTypesForLength = useMemo(() => {
    if (!selectedLength) return new Set(uniqueBoxTypes);
    return new Set(
      variants.filter((v) => v.length === selectedLength).map((v) => v.box_type).filter(Boolean)
    );
  }, [variants, selectedLength, uniqueBoxTypes]);

  // Which lengths are available for the currently selected box type
  const availableLengthsForBoxType = useMemo(() => {
    if (!selectedBoxType) return new Set(uniqueLengths);
    return new Set(
      variants.filter((v) => v.box_type === selectedBoxType).map((v) => v.length).filter(Boolean)
    );
  }, [variants, selectedBoxType, uniqueLengths]);

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

  const unitLabel =
    currentVariant.unit === "Bunch" ? "bunch"
    : currentVariant.unit === "Box" ? "box"
    : "stem";
  const basePrice = currentVariant.price ?? null;
  const dealPrice = currentVariant.deal_price ?? null;
  const hasDeal = !!currentVariant.is_on_deal && dealPrice != null;
  const effectivePrice = hasDeal && dealPrice != null ? dealPrice : basePrice;
  const compareAtPrice = currentVariant.compare_at_price ?? null;
  const isPriceAvailable = effectivePrice != null && effectivePrice > 0;

  // For Box products (combo boxes), stems_per_bunch × units_per_box is meaningless.
  // total_stems field will be added by Alvar for those products; for now suppress.
  const totalStems =
    currentVariant.unit === "Box"
      ? ((currentVariant as { total_stems?: number }).total_stems ?? null)
      : currentVariant.stems_per_bunch && currentVariant.units_per_box
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
      delivery_date: deliveryFrom || undefined,
      stem_length: selectedLength || undefined,
    };
    addItem(quoteItem);
    pushEvent(CTA_EVENTS.add_to_quote, {
      product_name: displayName,
      product_category: currentVariant.category,
      product_price: currentVariant.price ?? 0,
      stem_length: selectedLength || "default",
      box_type: currentVariant.box_type || "Standard",
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  // Sticky mobile CTA — show when main Add to Quote button is off-screen (EXP-024)
  const addToQuoteRef = useRef<HTMLButtonElement>(null);
  const [showStickyBtn, setShowStickyBtn] = useState(false);
  useEffect(() => {
    const el = addToQuoteRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBtn(!entry.isIntersecting),
      { rootMargin: "0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
                href={
                  product.category === "Rose" ? "/shop/roses"
                  : product.category === "Tropicals" ? "/shop/tropicals"
                  : product.category === "Greens & Foliage" ? "/shop/greens"
                  : `/shop?category=${encodeURIComponent(product.category)}`
                }
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
            <div className="flex items-center gap-3 mb-4">
              <p className="text-sm text-slate-600">
                Farm:{" "}
                <span className="font-semibold text-slate-800">
                  {product.vendor}
                </span>
              </p>
              {bestTier === "T1" || bestTier === "T2" ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  In Stock
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Pre-Order · 14 days
                </span>
              )}
            </div>

            {/* Price */}
            <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
              {effectivePrice != null && effectivePrice > 0 ? (
                <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
                  {compareAtPrice != null && compareAtPrice > effectivePrice && (
                    <span className="text-sm text-slate-400 line-through">
                      ${compareAtPrice.toFixed(2)}/{unitLabel}
                    </span>
                  )}
                  <span className="text-2xl font-bold text-emerald-600">
                    ${effectivePrice.toFixed(2)}/{unitLabel}
                  </span>
                  {compareAtPrice != null && compareAtPrice > effectivePrice && (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-semibold border border-emerald-100">
                      Save {Math.round((1 - effectivePrice / compareAtPrice) * 100)}%
                    </span>
                  )}
                  {hasDeal && !compareAtPrice &&
                    (product.deal_label || currentVariant.deal_label) && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-semibold border border-emerald-100">
                        {currentVariant.deal_label ?? product.deal_label}
                      </span>
                    )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">
                    Price pending
                  </span>
                  <span className="text-xs text-slate-400">Contact us for pricing</span>
                </div>
              )}
              {totalStems != null && (
                <p className="mt-1 text-sm text-slate-600">
                  {currentVariant.unit === "Box"
                    ? `${totalStems.toLocaleString()} stems in this box`
                    : `${totalStems.toLocaleString()} stems per ${BOX_TYPE_LABELS[currentVariant.box_type] || currentVariant.box_type} box`}
                </p>
              )}
              {effectivePrice != null && totalStems != null && (
                <p className="mt-0.5 text-sm font-semibold text-slate-500">
                  ≈ ${(effectivePrice * totalStems).toFixed(2)} for this {BOX_TYPE_LABELS[currentVariant.box_type] || currentVariant.box_type}
                </p>
              )}
            </div>

            {/* Length toggle */}
            {uniqueLengths.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-2">
                  Stem Length
                </p>
                <div className="flex flex-wrap gap-2">
                  {uniqueLengths.map((len) => {
                    const available = availableLengthsForBoxType.has(len);
                    const isSelected = selectedLength === len;
                    // Find price for this length
                    const variantForLen = variants.find(
                      (v) => v.length === len && (!selectedBoxType || v.box_type === selectedBoxType),
                    ) || variants.find((v) => v.length === len);
                    const lenPrice = variantForLen ? (variantForLen.deal_price ?? variantForLen.price) : null;
                    return (
                      <button
                        key={len}
                        type="button"
                        onClick={() => available && setSelectedLength(len)}
                        disabled={!available}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                            : available
                            ? "border-slate-300 text-slate-700 hover:border-emerald-400"
                            : "border-slate-200 text-slate-300 cursor-not-allowed bg-slate-50"
                        }`}
                      >
                        {len}
                        {lenPrice != null && uniqueLengths.length > 1 && (
                          <span className={`ml-1 text-xs ${isSelected ? "text-emerald-600" : "text-slate-400"}`}>
                            ${lenPrice.toFixed(2)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Box type toggle */}
            {uniqueBoxTypes.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-2">
                  Box Size
                </p>
                <div className="flex flex-wrap gap-2">
                  {uniqueBoxTypes.map((bt) => {
                    const available = availableBoxTypesForLength.has(bt);
                    const isSelected = selectedBoxType === bt;
                    // Find variant for this box type to show stem count
                    const variantForBt = variants.find(
                      (v) => v.box_type === bt && (!selectedLength || v.length === selectedLength),
                    ) || variants.find((v) => v.box_type === bt);
                    const stemCount = variantForBt
                      ? variantForBt.unit === "Box"
                        ? ((variantForBt as { total_stems?: number }).total_stems ?? null)
                        : Math.round((variantForBt.stems_per_bunch || 1) * (variantForBt.units_per_box || 0))
                      : null;
                    return (
                      <button
                        key={bt}
                        type="button"
                        onClick={() => available && setSelectedBoxType(bt)}
                        disabled={!available}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                            : available
                            ? "border-slate-300 text-slate-700 hover:border-emerald-400"
                            : "border-slate-200 text-slate-300 cursor-not-allowed bg-slate-50"
                        }`}
                      >
                        {BOX_TYPE_LABELS[bt] || bt}
                        {stemCount != null && stemCount > 0 && (
                          <span className={`ml-1 text-xs ${isSelected ? "text-emerald-600" : "text-slate-400"}`}>
                            ({stemCount})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* What's in this box — shown for Mixed Boxes and Assorted products */}
            {(currentVariant.category === "Mixed Boxes" || currentVariant.color === "Assorted" || currentVariant.unit === "Box") && (
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">
                  What's in this box
                </p>
                {(currentVariant as { contents_note?: string }).contents_note ? (
                  <div className="flex flex-wrap gap-1.5">
                    {((currentVariant as { contents_note?: string }).contents_note ?? "").split(",").map((v) => (
                      <span
                        key={v.trim()}
                        className="inline-block rounded-full bg-white border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                      >
                        {v.trim()}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-amber-800">
                    Curated mix — exact composition varies by season.
                  </p>
                )}
                <p className="mt-2 text-xs text-amber-600">
                  Want specific varieties? Add a note when you request your quote.
                </p>
              </div>
            )}

            {/* Delivery date — smart chips grouped by week */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-slate-700 mb-3">
                Delivery Date
              </p>
              <DeliveryDateChips
                dates={deliveryDates}
                selected={deliveryFrom}
                onSelect={(iso) => { setDeliveryFrom(iso); setDeliveryTo(iso); }}
                tier={bestTier}
              />
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
                      {displayName} · {selectedLength || "Standard"} · {deliveryFrom ? formatDeliveryDate(new Date(deliveryFrom + "T12:00:00")) : ""}
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
              {isPriceAvailable ? (
                <button
                  ref={addToQuoteRef}
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
              ) : (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold text-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all"
                >
                  Request Pricing on WhatsApp
                </a>
              )}
              <Link
                href={`/sample-box?product=${encodeURIComponent(`${product.variety} ${product.color}`)}&category=${encodeURIComponent(product.category)}`}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all text-sm"
              >
                <Package className="w-4 h-4" />
                Try a Free Sample Box
              </Link>

              {/* Social proof trust bar */}
              <div className="mt-4 flex items-center gap-4 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <div className="flex items-center gap-1">
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} className="w-3.5 h-3.5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                      </svg>
                    ))}
                  </div>
                  <span className="font-semibold text-slate-700">5.0</span>
                </div>
                <span className="text-slate-300">|</span>
                <span>Trusted by 60+ florists</span>
                <span className="text-slate-300">|</span>
                <span>Farm-direct freshness</span>
              </div>
            </div>
          </div>
        </div>

        {/* Combined cross-sell section: bundles + related */}
        {(bundles.length > 0 || relatedSorted.length > 0) && (
          <section className="mt-12 pt-10 border-t border-slate-200">
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Complete your order
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              These pair well with {product.variety} {product.color}
            </p>

            {/* Quick-add bundles from complementary categories */}
            {bundles.length > 0 && (
              <div className="mb-8">
                <BundleGrid bundles={bundles} deliveryDate={deliveryFrom || ""} />
              </div>
            )}

            {/* Related products from same category */}
            {relatedSorted.length > 0 && (
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
                          {hasDealRel && baseRel != null && p.deal_price != null && p.deal_price < baseRel && (
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
            )}
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
              {currentVariant.stems_per_bunch > 0 && currentVariant.units_per_box > 0 && (
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

      <WhatsAppWidget message={`Hi! I'm interested in ${displayName} from Floropolis.`} />

      {/* EXP-024: Sticky mobile Add to Quote bar — visible on small screens when main button off-screen */}
      {showStickyBtn && isPriceAvailable && (
        <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-white border-t border-slate-200 px-4 py-3 shadow-lg safe-area-inset-bottom">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate">{displayName}</p>
              <p className="text-sm font-bold text-emerald-600">
                ${(effectivePrice ?? 0).toFixed(2)}/{currentVariant.unit === "Bunch" ? "bunch" : "stem"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddToQuote}
              className={`flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all ${
                justAdded
                  ? "bg-emerald-700 text-white"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              {justAdded ? "Added!" : "Add to Quote"}
            </button>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
