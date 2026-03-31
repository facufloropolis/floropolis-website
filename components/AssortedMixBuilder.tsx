"use client";

/**
 * AssortedMixBuilder — shown on PDP when product.variety === "Assorted"
 *
 * - Color/variety/length filters + search (same as box-builder)
 * - initialColor pre-filters by color family (Red, Pink, Cream, White, Rainbow=all)
 * - Product photo on each row
 * - QB/HB capacity logic with live indicator
 *
 * v3 | 2026-03-31 | Job_PM
 */

import { useState, useMemo } from "react";
import Image from "next/image";
import { Minus, Plus, Trash2, ChevronDown, Search, X } from "lucide-react";
import { products } from "@/lib/data/products";
import { getProductImage } from "@/lib/product-images";
import { addItem } from "@/lib/quote-cart";
import { pushEvent } from "@/lib/gtm";

type ProductType = (typeof products)[0];
type Selections = Record<string, number>;

interface Props {
  vendor: string;
  deliveryDate: string;
  initialColor?: string;
  onSent?: () => void;
}

// Expand a single color name into its family for pre-filtering
const COLOR_FAMILY: Record<string, string[]> = {
  Cream:   ["Cream", "White", "Champagne", "Beige", "Ivory"],
  White:   ["White", "Cream", "Champagne"],
  Red:     ["Red", "Dark Red", "Burgundy"],
  Pink:    ["Pink", "Hot Pink", "Dark Pink", "Soft Pink", "Light Pink", "Peach Pink", "Coral", "Peach"],
  Rainbow: [], // no pre-filter
};

function getInitialColors(initialColor?: string): string[] {
  if (!initialColor || initialColor.toLowerCase() === "rainbow") return [];
  return COLOR_FAMILY[initialColor] ?? [initialColor];
}

function bunchSize(p: ProductType): number {
  const spb = p.stems_per_bunch;
  return spb && spb >= 5 ? spb : 25;
}

function parseCm(len: string | null | undefined): number {
  return parseInt(len?.match(/(\d+)/)?.[1] ?? "999");
}

function qbCapacity(selectedLengths: string[]): number {
  if (selectedLengths.length === 0) return 100;
  return Math.max(...selectedLengths.map(parseCm)) <= 40 ? 125 : 100;
}

const HB_CAPACITY = 200;

function resolveImage(p: ProductType): string {
  const first = p.images?.[0];
  if (first) return first;
  return getProductImage(p.variety ?? p.name, p.color ?? "", p.category ?? "Rose");
}

export default function AssortedMixBuilder({ vendor, deliveryDate, initialColor, onSent }: Props) {
  const [selections, setSelections] = useState<Selections>({});
  const [sent, setSent] = useState(false);
  const [search, setSearch] = useState("");

  const colorFamily = getInitialColors(initialColor);
  const isRainbow = colorFamily.length === 0;

  const [selectedColor, setSelectedColor] = useState(
    isRainbow ? "All" : (colorFamily[0] ?? "All")
  );
  const [selectedVariety, setSelectedVariety] = useState("All");
  const [selectedLength, setSelectedLength] = useState("All");

  // All non-assorted Ecoroses products, de-duped by slug
  const vendorProducts = useMemo(() => {
    const seen = new Map<string, ProductType>();
    for (const p of products) {
      if (p.vendor !== vendor) continue;
      if ((p.price ?? 0) <= 0) continue;
      const isAssorted =
        p.variety?.toLowerCase().includes("assorted") ||
        p.color?.toLowerCase().includes("assorted") ||
        p.name?.toLowerCase().startsWith("assorted");
      if (isAssorted) continue;
      const existing = seen.get(p.slug);
      if (!existing || (p.price ?? 0) < (existing.price ?? 0)) seen.set(p.slug, p);
    }
    return Array.from(seen.values());
  }, [vendor]);

  // Available filter options
  const availableColors = useMemo(() => {
    const s = new Set<string>();
    for (const p of vendorProducts) if (p.color) s.add(p.color);
    // If pre-filtered, only show colors in the family
    if (!isRainbow) {
      return colorFamily.filter((c) => s.has(c));
    }
    return Array.from(s).sort();
  }, [vendorProducts, isRainbow, colorFamily]);

  const availableVarieties = useMemo(() => {
    const s = new Set<string>();
    let list = vendorProducts;
    if (selectedColor !== "All") list = list.filter((p) => p.color === selectedColor);
    for (const p of list) if (p.variety) s.add(p.variety);
    return Array.from(s).sort();
  }, [vendorProducts, selectedColor]);

  const availableLengths = useMemo(() => {
    const s = new Set<string>();
    let list = vendorProducts;
    if (selectedColor !== "All") list = list.filter((p) => p.color === selectedColor);
    if (selectedVariety !== "All") list = list.filter((p) => p.variety === selectedVariety);
    for (const p of list) if (p.length) s.add(p.length);
    return Array.from(s).sort((a, b) => parseCm(a) - parseCm(b));
  }, [vendorProducts, selectedColor, selectedVariety]);

  // Filtered products grouped by variety+color
  const varietyGroups = useMemo(() => {
    let list = vendorProducts;
    // Apply color family pre-filter for non-rainbow
    if (!isRainbow) list = list.filter((p) => colorFamily.includes(p.color ?? ""));
    // Apply user filters
    if (selectedColor !== "All") list = list.filter((p) => p.color === selectedColor);
    if (selectedVariety !== "All") list = list.filter((p) => p.variety === selectedVariety);
    if (selectedLength !== "All") list = list.filter((p) => p.length === selectedLength);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.variety?.toLowerCase().includes(q) ||
        p.color?.toLowerCase().includes(q)
      );
    }

    const map = new Map<string, ProductType[]>();
    for (const p of list) {
      const key = `${p.variety ?? p.name}__${p.color ?? ""}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, prods]) => {
        const sorted = prods.sort((a, b) => parseCm(a.length) - parseCm(b.length));
        const first = sorted[0];
        return {
          key,
          variety: first.variety ?? first.name,
          color: first.color ?? "",
          image: resolveImage(first),
          prods: sorted,
        };
      });
  }, [vendorProducts, isRainbow, colorFamily, selectedColor, selectedVariety, selectedLength, search]);

  // Per-group length selection
  const [selectedSlug, setSelectedSlug] = useState<Record<string, string>>({});

  function getActiveProduct(key: string, prods: ProductType[]): ProductType {
    const slug = selectedSlug[key];
    return (slug ? prods.find((p) => p.slug === slug) : undefined) ??
      [...prods].sort((a, b) => (a.deal_price ?? a.price ?? 0) - (b.deal_price ?? b.price ?? 0))[0];
  }

  // Totals
  const selectedItems = useMemo(() =>
    Object.entries(selections)
      .filter(([, stems]) => stems > 0)
      .map(([slug, stems]) => {
        const p = vendorProducts.find((x) => x.slug === slug);
        if (!p) return null;
        return { ...p, stems, lineTotal: stems * (p.deal_price ?? p.price ?? 0) };
      })
      .filter(Boolean) as Array<ProductType & { stems: number; lineTotal: number }>,
  [selections, vendorProducts]);

  const totalStems = selectedItems.reduce((s, i) => s + i.stems, 0);
  const totalPrice = selectedItems.reduce((s, i) => s + i.lineTotal, 0);
  const blendedPrice = totalStems > 0 ? totalPrice / totalStems : 0;

  const selectedLengths = selectedItems.map((i) => i.length ?? "");
  const qbCap = qbCapacity(selectedLengths);
  const boxStatus: "ok" | "hb_warning" | "hb_full" =
    totalStems === 0 ? "ok"
    : totalStems > HB_CAPACITY ? "hb_full"
    : totalStems > qbCap ? "hb_warning"
    : "ok";

  function adjust(slug: string, p: ProductType, delta: number) {
    const step = bunchSize(p) * delta;
    setSelections((prev) => {
      const next = Math.max(0, (prev[slug] ?? 0) + step);
      const updated = { ...prev };
      if (next === 0) delete updated[slug]; else updated[slug] = next;
      return updated;
    });
  }

  function clearFilters() {
    setSelectedColor(isRainbow ? "All" : (colorFamily[0] ?? "All"));
    setSelectedVariety("All");
    setSelectedLength("All");
    setSearch("");
  }

  function sendToQuote() {
    for (const item of selectedItems) {
      addItem({
        slug: item.slug,
        name: item.name,
        category: item.category,
        vendor: item.vendor ?? "",
        price: item.price ?? 0,
        deal_price: item.deal_price ?? null,
        quantity: item.stems,
        units_per_box: 1,
        box_type: boxStatus === "ok" ? "QB" : "HB",
        unit: item.unit ?? "Stem",
        delivery_date: deliveryDate,
        stem_length: item.length ?? undefined,
        customization_note: `Custom ${vendor} ${isRainbow ? "rainbow" : (initialColor ?? "").toLowerCase()} assorted mix`,
      });
    }
    pushEvent("assorted_pdp_mix_send", {
      vendor,
      color_filter: initialColor ?? "rainbow",
      total_stems: totalStems,
      item_count: selectedItems.length,
      blended_price: Math.round(blendedPrice * 100) / 100,
      box_type: boxStatus === "ok" ? "QB" : "HB",
    });
    setSent(true);
    onSent?.();
  }

  if (vendorProducts.length === 0) return null;

  const hasActiveFilters =
    (isRainbow ? selectedColor !== "All" : selectedColor !== colorFamily[0]) ||
    selectedVariety !== "All" ||
    selectedLength !== "All" ||
    search.trim().length > 0;

  return (
    <div className="mt-8 border-t border-slate-100 pt-8">
      {/* Header */}
      <div className="mb-5">
        <h3 className="text-lg font-bold text-slate-900">Build Your Custom Mix</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Pick specific varieties and lengths — blended price updates live.
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search variety..."
            className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3 text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>

        {/* Color filter */}
        {(isRainbow || availableColors.length > 1) && (
          <div className="relative">
            <select
              value={selectedColor}
              onChange={(e) => { setSelectedColor(e.target.value); setSelectedVariety("All"); setSelectedLength("All"); }}
              className="appearance-none text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 pr-7 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
            >
              <option value="All">All colors</option>
              {availableColors.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
          </div>
        )}

        {/* Variety filter */}
        <div className="relative">
          <select
            value={selectedVariety}
            onChange={(e) => { setSelectedVariety(e.target.value); setSelectedLength("All"); }}
            className="appearance-none text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 pr-7 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
          >
            <option value="All">All varieties</option>
            {availableVarieties.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
        </div>

        {/* Length filter */}
        <div className="relative">
          <select
            value={selectedLength}
            onChange={(e) => setSelectedLength(e.target.value)}
            className="appearance-none text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 pr-7 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
          >
            <option value="All">All lengths</option>
            {availableLengths.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
        </div>

        {/* Clear */}
        {hasActiveFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* QB/HB indicator */}
      {totalStems > 0 && (
        <div className={`mb-4 rounded-xl px-4 py-3 flex items-center gap-2 text-sm ${
          boxStatus === "ok"         ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
          : boxStatus === "hb_warning" ? "bg-amber-50 border border-amber-200 text-amber-700"
          : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {boxStatus === "ok" && <>
            <span className="font-semibold">{totalStems} stems</span>
            <span>· Fits in a QB ({qbCap} stem capacity)</span>
            <span className="ml-auto text-xs opacity-70">{qbCap - totalStems} stems left</span>
          </>}
          {boxStatus === "hb_warning" && <>
            <span className="font-semibold">{totalStems} stems</span>
            <span>· Over QB — ships as <strong>HB box</strong> (up to {HB_CAPACITY} stems)</span>
            <span className="ml-auto text-xs opacity-70">{HB_CAPACITY - totalStems} to full HB</span>
          </>}
          {boxStatus === "hb_full" && <>
            <span className="font-semibold">{totalStems} stems</span>
            <span>· Over HB capacity ({HB_CAPACITY} stems) — reduce selection</span>
          </>}
        </div>
      )}

      {/* Live price bar */}
      {totalStems > 0 && boxStatus !== "hb_full" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xl font-bold text-emerald-700">
              ${blendedPrice.toFixed(2)}<span className="text-sm font-normal text-emerald-500 ml-1">/stem blended</span>
            </p>
            <p className="text-xs text-emerald-600">
              {totalStems} stems · {selectedItems.length} variet{selectedItems.length > 1 ? "ies" : "y"} · ${totalPrice.toFixed(2)} total
              <span className="ml-1 opacity-70">({boxStatus === "ok" ? "QB" : "HB"} box)</span>
            </p>
          </div>
          <button
            onClick={sendToQuote}
            disabled={sent}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap"
          >
            {sent ? "Added ✓" : "Add Mix to Quote →"}
          </button>
        </div>
      )}

      {/* Empty state */}
      {varietyGroups.length === 0 && (
        <p className="text-sm text-slate-400 py-6 text-center">No varieties match your filters.</p>
      )}

      {/* Variety cards */}
      <div className="space-y-2">
        {varietyGroups.map(({ key, variety, color, image, prods }) => {
          const activeProduct = getActiveProduct(key, prods);
          const activeSlug = activeProduct?.slug ?? "";
          const stems = selections[activeSlug] ?? 0;
          const bunch = activeProduct ? bunchSize(activeProduct) : 25;
          const effectivePrice = activeProduct ? (activeProduct.deal_price ?? activeProduct.price ?? 0) : 0;
          const lineTotal = stems * effectivePrice;
          const selected = stems > 0;

          return (
            <div
              key={key}
              className={`bg-white rounded-xl border transition-all flex items-center gap-3 pr-4 overflow-hidden ${
                selected ? "border-emerald-400 ring-1 ring-emerald-100 shadow-sm" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              {/* Photo */}
              <div className="w-16 h-16 flex-shrink-0 relative bg-slate-50">
                <Image
                  src={image}
                  alt={variety}
                  fill
                  className="object-cover"
                  sizes="64px"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/Floropolis-logo-only.png"; }}
                />
              </div>

              {/* Info + length picker */}
              <div className="flex-1 min-w-0 py-3">
                <p className="font-semibold text-slate-900 text-sm leading-tight">{variety}</p>
                <p className="text-xs text-slate-400 mt-0.5">{color}</p>

                {prods.length === 1 ? (
                  <div className="flex items-center gap-2 mt-1.5">
                    {activeProduct?.length && (
                      <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{activeProduct.length}</span>
                    )}
                    <span className="text-sm font-bold text-emerald-600">
                      ${effectivePrice.toFixed(2)}<span className="text-xs font-normal text-slate-400">/stem</span>
                    </span>
                  </div>
                ) : (
                  <div className="relative mt-1.5 inline-block">
                    <select
                      value={activeSlug}
                      onChange={(e) => {
                        const newSlug = e.target.value;
                        const existingStems = selections[activeSlug] ?? 0;
                        setSelectedSlug((prev) => ({ ...prev, [key]: newSlug }));
                        if (existingStems > 0) {
                          setSelections((prev) => {
                            const updated = { ...prev };
                            delete updated[activeSlug];
                            updated[newSlug] = existingStems;
                            return updated;
                          });
                        }
                      }}
                      className="appearance-none text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 pr-6 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                    >
                      {prods.map((p) => (
                        <option key={p.slug} value={p.slug}>
                          {p.length ?? "Standard"} — ${(p.deal_price ?? p.price ?? 0).toFixed(2)}/stem
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                  </div>
                )}
              </div>

              {/* +/− controls */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => adjust(activeSlug, activeProduct, -1)}
                  disabled={stems === 0}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>

                <div className="text-center w-14">
                  {stems > 0 ? (
                    <>
                      <p className="text-sm font-bold text-slate-900">{stems}<span className="text-[10px] font-normal text-slate-400 ml-0.5">st</span></p>
                      <p className="text-[10px] text-emerald-600 font-semibold">${lineTotal.toFixed(2)}</p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">—</p>
                  )}
                </div>

                <button
                  onClick={() => adjust(activeSlug, activeProduct, 1)}
                  disabled={boxStatus === "hb_full"}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                {stems > 0 ? (
                  <button
                    onClick={() => setSelections((prev) => { const u = { ...prev }; delete u[activeSlug]; return u; })}
                    className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <div className="w-7" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom CTA */}
      {totalStems > 0 && boxStatus !== "hb_full" && (
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              {selectedItems.length} variet{selectedItems.length > 1 ? "ies" : "y"} · {totalStems} stems
              <span className="ml-1.5 text-xs font-normal text-slate-400">({boxStatus === "ok" ? "QB" : "HB"})</span>
            </p>
            <p className="text-xs text-slate-400">${blendedPrice.toFixed(2)}/stem · ${totalPrice.toFixed(2)} total</p>
          </div>
          <button
            onClick={sendToQuote}
            disabled={sent}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
          >
            {sent ? "Added ✓" : "Add Mix to Quote →"}
          </button>
        </div>
      )}
    </div>
  );
}
