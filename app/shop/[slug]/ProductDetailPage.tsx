"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import QuoteBar from "@/components/QuoteBar";
import TopBanner from "@/components/TopBanner";
import { ShoppingCart, Check, Package } from "lucide-react";
import AssortedMixBuilder from "@/components/AssortedMixBuilder";
import type { Product } from "@/lib/data/products";
import { PRODUCT_IMAGES_BASE_URL, WHATSAPP_NUMBER } from "@/lib/catalog-constants";
import { getProductImage } from "@/lib/product-images";
import { addItem, getItemCount, type QuoteItem } from "@/lib/quote-cart";
import WhatsAppWidget from "@/components/WhatsAppWidget";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";
import {
  getEarliestDeliveryDate,
  getDeliveryDates,
  formatDeliveryDate,
  toISODate,
} from "@/lib/delivery-dates";
import { getCategoryPageUrl } from "@/lib/shop-search";
import { COMBO_BOX_CONTENTS } from "@/lib/data/combo-box-contents";

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
  // EXP-047: Collapsed by default — show selected date as single row, expand to pick a different date
  const [expanded, setExpanded] = useState(false);

  // Group dates by week (Mon-Sun)
  const weeks: { weekLabel: string; dates: Date[] }[] = [];
  for (const d of dates) {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const label = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const last = weeks[weeks.length - 1];
    if (last && last.weekLabel === label) {
      last.dates.push(d);
    } else {
      weeks.push({ weekLabel: label, dates: [d] });
    }
  }
  const visibleWeeks = weeks.slice(0, 4);
  const isFast = tier === "T1" || tier === "T2";

  // Format the currently selected date for the collapsed row
  const selectedLabel = selected
    ? new Date(selected + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "Not set";

  if (!expanded) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <p className="text-xs text-slate-500">{isFast ? "In stock · ships ~4 days" : "Pre-order · ships ~14 days"}</p>
          <p className="text-sm font-semibold text-slate-900">{selectedLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 underline underline-offset-2"
        >
          Change date
        </button>
      </div>
    );
  }

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
                  onClick={() => { onSelect(iso); setExpanded(false); }}
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
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {isFast ? "In stock · ships in ~4 days" : "Pre-order · ships in ~14 days"}
        </p>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
        >
          Collapse ↑
        </button>
      </div>
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
                unoptimized
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
  // EXP-028: Box quantity selector — florists often need 2-5 boxes, reduce quote-page round-trip
  const [boxQty, setBoxQty] = useState(1);
  // EXP-020: Per-item customization note for mixed/combo boxes
  const [customizationNote, setCustomizationNote] = useState("");

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

  // EXP-020: contents note from static catalogue lookup (survives generate-products re-runs)
  const contentsNote =
    COMBO_BOX_CONTENTS[product.slug] ??
    (currentVariant as { contents_note?: string }).contents_note ??
    null;

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
      quantity: boxQty,
      units_per_box: currentVariant.units_per_box || 0,
      box_type: currentVariant.box_type || "Standard",
      unit: currentVariant.unit || "Stem",
      delivery_date: deliveryFrom || undefined,
      stem_length: selectedLength || undefined,
      customization_note: customizationNote.trim() || undefined,
    };
    addItem(quoteItem);
    pushEvent(CTA_EVENTS.add_to_quote, {
      product_name: displayName,
      product_category: currentVariant.category,
      product_price: currentVariant.price ?? 0,
      stem_length: selectedLength || "default",
      box_type: currentVariant.box_type || "Standard",
    });
    // EXP-046: Persistent success banner — no auto-dismiss, user navigates or closes manually
    // Previously 2s auto-dismiss caused "View Quote →" to vanish before many users saw it
    setJustAdded(true);
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

  // EXP-024 conflict fix: hide sticky mobile CTA when QuoteBar is showing (both occupy fixed bottom-0)
  const [cartCount, setCartCount] = useState(0);
  useEffect(() => {
    const update = () => setCartCount(getItemCount());
    update();
    window.addEventListener("quote-cart-updated", update);
    return () => window.removeEventListener("quote-cart-updated", update);
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
                href={getCategoryPageUrl(product.category as import("@/lib/shop-search").ProductCategory)}
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
                <div className="relative w-full aspect-[4/3] sm:aspect-square rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <Image
                    src={images[selectedImageIndex] ?? images[0]}
                    alt={displayName}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-contain"
                    unoptimized
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
                          unoptimized
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
              {/* EXP-032: "Shipping included" signal near price — feedback item 4 */}
              {isPriceAvailable && (
                <p className="mt-1 text-xs text-emerald-600 font-medium">✓ Price includes free shipping to your door</p>
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

            {/* EXP-072: Unified variant selector — replaces separate Length + Box pill selectors.
                Shows all variants as tap cards with price/stem + total box cost at a glance.
                One tap selects both length and box type simultaneously. */}
            {(uniqueLengths.length > 1 || uniqueBoxTypes.length > 1) && (
              <div className="mb-5">
                <p className="text-sm font-semibold text-slate-700 mb-2">Choose Your Option</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[...variants]
                    .sort((a, b) => (a.deal_price ?? a.price) - (b.deal_price ?? b.price))
                    .map((v) => {
                      const vPrice = v.deal_price ?? v.price;
                      const vStems =
                        v.unit === "Box"
                          ? ((v as { total_stems?: number }).total_stems ?? null)
                          : v.stems_per_bunch && v.units_per_box
                          ? Math.round(v.stems_per_bunch * v.units_per_box)
                          : null;
                      const vTotal = vPrice > 0 && vStems ? vPrice * vStems : null;
                      const isSelected = v.length === selectedLength && v.box_type === selectedBoxType;
                      const dimLabel = [
                        v.length,
                        BOX_TYPE_LABELS[v.box_type ?? ""] || v.box_type,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <button
                          key={v.slug}
                          type="button"
                          onClick={() => {
                            if (v.length) setSelectedLength(v.length);
                            if (v.box_type) setSelectedBoxType(v.box_type);
                          }}
                          className={`text-left rounded-xl border p-3 transition-colors ${
                            isSelected
                              ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-500"
                              : "border-slate-200 hover:border-emerald-300 bg-white"
                          }`}
                        >
                          <p
                            className={`text-sm font-semibold leading-snug ${
                              isSelected ? "text-emerald-800" : "text-slate-800"
                            }`}
                          >
                            {dimLabel || v.name}
                          </p>
                          {vStems != null && vStems > 0 && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              {vStems.toLocaleString()} stems
                            </p>
                          )}
                          {vPrice > 0 && (
                            <p
                              className={`text-sm font-bold mt-1 ${
                                isSelected ? "text-emerald-700" : "text-slate-700"
                              }`}
                            >
                              ${vPrice.toFixed(2)}/{v.unit === "Bunch" ? "bunch" : "stem"}
                            </p>
                          )}
                          {vTotal != null && vTotal > 0 && (
                            <p
                              className={`text-xs mt-0.5 ${
                                isSelected ? "text-emerald-600" : "text-slate-400"
                              }`}
                            >
                              ≈ ${vTotal.toFixed(0)} box total
                            </p>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
            {/* Single-variant: show box info as read-only label */}
            {uniqueLengths.length <= 1 && uniqueBoxTypes.length <= 1 && uniqueBoxTypes.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Box Size</p>
                <p className="text-sm text-slate-700 font-semibold">
                  {BOX_TYPE_LABELS[uniqueBoxTypes[0]] || uniqueBoxTypes[0]}
                  {uniqueLengths[0] ? ` · ${uniqueLengths[0]}` : ""}
                </p>
              </div>
            )}

            {/* EXP-020: What's in this box + customization note — shown for Mixed Boxes and combo products */}
            {(currentVariant.category === "Mixed Boxes" || currentVariant.color === "Assorted" || currentVariant.unit === "Box") && (
              <>
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">
                    What&apos;s in this box
                  </p>
                  {contentsNote ? (
                    <div className="flex flex-wrap gap-1.5">
                      {contentsNote!.split(",").map((v) => (
                        <span
                          key={v.trim()}
                          className="inline-block rounded-full bg-white border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                        >
                          {v.trim()}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-amber-900">
                        Seasonal curated mix
                        {(currentVariant as { total_stems?: number }).total_stems
                          ? ` · ~${(currentVariant as { total_stems?: number }).total_stems} stems`
                          : ""}
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        Exact varieties change week to week based on what&apos;s at peak. Ask us below — we&apos;ll tell you what&apos;s in this week&apos;s box.
                      </p>
                    </div>
                  )}
                </div>
                <div className="mb-5">
                  <label htmlFor="customization-note" className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                    Want to customize? <span className="font-normal text-slate-400 normal-case">(optional)</span>
                  </label>
                  <textarea
                    id="customization-note"
                    rows={2}
                    value={customizationNote}
                    onChange={(e) => setCustomizationNote(e.target.value)}
                    placeholder="e.g. more heliconias, swap roses for ranunculus, no red tones — anything helps"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 resize-none"
                  />
                  <p className="mt-1 text-xs text-slate-400">We&apos;ll do our best to accommodate — we&apos;ll confirm when we review your quote.</p>
                </div>
              </>
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

            {/* EXP-028: Box quantity selector — reduces quote-page round-trip for multi-box orders */}
            {isPriceAvailable && (
              <div className="mb-4 flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-700">Boxes:</span>
                <div className="flex items-center rounded-lg border border-slate-300 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setBoxQty((q) => Math.max(1, q - 1))}
                    className="px-3 py-2 text-slate-600 hover:bg-slate-100 transition-colors font-bold text-base leading-none"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="px-4 py-2 text-sm font-bold text-slate-900 min-w-[2.5rem] text-center border-x border-slate-300">
                    {boxQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setBoxQty((q) => Math.min(20, q + 1))}
                    className="px-3 py-2 text-slate-600 hover:bg-slate-100 transition-colors font-bold text-base leading-none"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                {totalStems != null && (
                  <span className="text-xs text-slate-500">
                    = {(totalStems * boxQty).toLocaleString()} stems total
                  </span>
                )}
              </div>
            )}

            {/* Add to Quote — PROMINENT */}
            <div className="mt-4 space-y-3">
              {/* EXP-046: Persistent success banner — stays until user navigates or closes (was 2s auto-dismiss) */}
              {justAdded && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 animate-in slide-in-from-top">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-emerald-800">Added to your quote!</p>
                    <p className="text-xs text-emerald-600 truncate">
                      {displayName} · {selectedLength || "Standard"} · {deliveryFrom ? formatDeliveryDate(new Date(deliveryFrom + "T12:00:00")) : ""}
                    </p>
                  </div>
                  <Link
                    href="/quote"
                    className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors"
                  >
                    View Quote →
                  </Link>
                  <button
                    type="button"
                    onClick={() => setJustAdded(false)}
                    className="text-emerald-400 hover:text-emerald-600 flex-shrink-0 p-1"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
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
              {/* Process hint — reduces "what happens next?" confusion */}
              <p className="text-center text-xs text-slate-500">
                No payment now — we confirm pricing &amp; delivery within 1 hour.
              </p>


              {/* EXP-062: WhatsApp quick path on PDP — skip the form for users who prefer instant chat */}
              {isPriceAvailable && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => pushEvent(CTA_EVENTS.quote_whatsapp_click, { source: "pdp", product_name: displayName })}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-all text-sm"
                >
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Prefer WhatsApp? Chat directly
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

        {/* EXP-077: Assorted Mix Builder — shown on assorted PDPs so buyers can specify exact varieties + lengths */}
        {(product.variety?.toLowerCase() === "assorted" || product.color?.toLowerCase().includes("assorted")) && product.vendor && (
          <AssortedMixBuilder
            vendor={product.vendor}
            deliveryDate={deliveryFrom || toISODate(earliestDelivery)}
            onSent={() => setJustAdded(true)}
          />
        )}

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
                          unoptimized
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
                        <div className="mt-auto">
                          <div className="flex items-baseline gap-1">
                            {hasDealRel && baseRel != null && p.deal_price != null && p.deal_price < baseRel && (
                              <span className="text-xs text-slate-400 line-through">
                                ${baseRel.toFixed(2)}/{unitRel}
                              </span>
                            )}
                            <span className="text-sm font-bold text-emerald-700">
                              ${dealRel.toFixed(2)}/{unitRel}
                            </span>
                          </div>
                          {dealRel > 0 && <p className="text-[9px] text-emerald-600 mt-0.5">✓ Shipping included</p>}
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
                  Shipping always included — price shown is all-in
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
      {showStickyBtn && isPriceAvailable && cartCount === 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-white border-t border-slate-200 px-4 py-3 shadow-lg pb-safe">
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

      <QuoteBar />
      <Footer />
    </div>
  );
}
