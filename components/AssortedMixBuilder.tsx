"use client";

/**
 * AssortedMixBuilder — shown on PDP when product.variety === "Assorted"
 *
 * Lets buyers build a custom mix from the same vendor:
 * - Filters by color, variety, stem length (same structure as box-builder)
 * - initialColor pre-filters for color-specific assorteds (Red, Pink, Cream, White)
 * - Rainbow: no pre-filter, all colors shown
 * - QB/HB logic: QB = 100 stems (≥50cm) or 125 stems (≤40cm). >100 at ≥50cm = HB territory.
 * - Live blended $/stem updates as selections change
 *
 * v2 | 2026-03-31 | Job_PM
 */

import { useState, useMemo } from "react";
import { Minus, Plus, Trash2, ChevronDown, X } from "lucide-react";
import { products } from "@/lib/data/products";
import { addItem } from "@/lib/quote-cart";
import { pushEvent } from "@/lib/gtm";

type ProductType = (typeof products)[0];
type Selections = Record<string, number>;

interface Props {
  vendor: string;
  deliveryDate: string;
  initialColor?: string; // pre-filter for color-specific assorteds
  onSent?: () => void;
}

function bunchSize(p: ProductType): number {
  const spb = p.stems_per_bunch;
  return spb && spb >= 5 ? spb : 25;
}

function parseCm(len: string | null | undefined): number {
  return parseInt(len?.match(/(\d+)/)?.[1] ?? "999");
}

/** QB capacity: 125 stems if ALL selected items are ≤40cm, else 100. */
function qbCapacity(selectedLengths: string[]): number {
  if (selectedLengths.length === 0) return 100;
  const maxCm = Math.max(...selectedLengths.map(parseCm));
  return maxCm <= 40 ? 125 : 100;
}

const HB_CAPACITY = 200;

export default function AssortedMixBuilder({ vendor, deliveryDate, initialColor, onSent }: Props) {
  const [selections, setSelections] = useState<Selections>({});
  const [sent, setSent] = useState(false);

  // Filters
  const isRainbow = !initialColor || initialColor.toLowerCase() === "rainbow";
  const [selectedColor, setSelectedColor] = useState(isRainbow ? "All" : (initialColor ?? "All"));
  const [selectedVariety, setSelectedVariety] = useState("All");
  const [selectedLength, setSelectedLength] = useState("All");

  // All non-assorted products from this vendor
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
      // De-dupe by slug, keep lowest price
      const existing = seen.get(p.slug);
      if (!existing || (p.price ?? 0) < (existing.price ?? 0)) seen.set(p.slug, p);
    }
    return Array.from(seen.values()).sort((a, b) => (a.variety ?? a.name).localeCompare(b.variety ?? b.name));
  }, [vendor]);

  // Available filter options (reactive to other filters)
  const availableColors = useMemo(() => {
    const s = new Set<string>();
    for (const p of vendorProducts) if (p.color) s.add(p.color);
    return Array.from(s).sort();
  }, [vendorProducts]);

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

  // Filtered + grouped by variety
  const varietyGroups = useMemo(() => {
    let list = vendorProducts;
    if (selectedColor !== "All") list = list.filter((p) => p.color === selectedColor);
    if (selectedVariety !== "All") list = list.filter((p) => p.variety === selectedVariety);
    if (selectedLength !== "All") list = list.filter((p) => p.length === selectedLength);

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
        return { key, label: `${prods[0].variety ?? prods[0].name}${prods[0].color ? ` · ${prods[0].color}` : ""}`, prods: sorted };
      });
  }, [vendorProducts, selectedColor, selectedVariety, selectedLength]);

  // Per-group selected slug (length picker)
  const [selectedSlug, setSelectedSlug] = useState<Record<string, string>>({});

  function getActiveSlug(key: string, prods: ProductType[]): string {
    return selectedSlug[key] ?? prods.sort((a, b) => (a.deal_price ?? a.price ?? 0) - (b.deal_price ?? b.price ?? 0))[0]?.slug ?? "";
  }

  // Selected items + totals
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

  // QB/HB capacity warning
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
        customization_note: `Custom ${vendor} ${isRainbow ? "rainbow" : selectedColor.toLowerCase()} assorted mix`,
      });
    }
    pushEvent("assorted_pdp_mix_send", {
      vendor,
      color_filter: selectedColor,
      total_stems: totalStems,
      item_count: selectedItems.length,
      blended_price: Math.round(blendedPrice * 100) / 100,
      box_type: boxStatus === "ok" ? "QB" : "HB",
    });
    setSent(true);
    onSent?.();
  }

  if (varietyGroups.length === 0 && vendorProducts.length === 0) return null;

  const activeFilterCount = [selectedColor !== "All", selectedVariety !== "All", selectedLength !== "All"].filter(Boolean).length;

  return (
    <div className="mt-8 border-t border-slate-100 pt-8">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Build Your Custom Mix</h3>
        <p className="text-sm text-slate-500">
          Pick specific varieties and stem lengths. Blended price updates live.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Color */}
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

        {/* Variety */}
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

        {/* Length */}
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

        {/* Clear active filters */}
        {activeFilterCount > 0 && !isRainbow === false && (
          <button
            onClick={() => { setSelectedColor(isRainbow ? "All" : (initialColor ?? "All")); setSelectedVariety("All"); setSelectedLength("All"); }}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-2"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* QB/HB capacity indicator */}
      {totalStems > 0 && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${
          boxStatus === "ok" ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
          : boxStatus === "hb_warning" ? "bg-amber-50 border border-amber-200 text-amber-700"
          : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {boxStatus === "ok" && (
            <>
              <span className="font-bold">{totalStems} stems</span>
              <span>— fits in a QB ({qbCap} stem capacity)</span>
              <span className="ml-auto text-xs opacity-70">{qbCap - totalStems} stems remaining</span>
            </>
          )}
          {boxStatus === "hb_warning" && (
            <>
              <span className="font-bold">{totalStems} stems</span>
              <span>— exceeds QB capacity. This ships as an <strong>HB box</strong> (up to {HB_CAPACITY} stems).</span>
              <span className="ml-auto text-xs opacity-70">{HB_CAPACITY - totalStems} to full HB</span>
            </>
          )}
          {boxStatus === "hb_full" && (
            <>
              <span className="font-bold">{totalStems} stems</span>
              <span>— over HB capacity ({HB_CAPACITY} stems). Please reduce your selection.</span>
            </>
          )}
        </div>
      )}

      {/* Live price bar */}
      {totalStems > 0 && boxStatus !== "hb_full" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-emerald-700">
              ${blendedPrice.toFixed(2)}
              <span className="text-sm font-normal text-emerald-500 ml-1">/stem blended avg</span>
            </p>
            <p className="text-xs text-emerald-600">
              {totalStems} stems · {selectedItems.length} variet{selectedItems.length > 1 ? "ies" : "y"} · ${totalPrice.toFixed(2)} total
            </p>
          </div>
          <button
            onClick={sendToQuote}
            disabled={sent}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors flex-shrink-0 ml-4"
          >
            {sent ? "Added ✓" : "Add Mix to Quote →"}
          </button>
        </div>
      )}

      {/* Empty state */}
      {varietyGroups.length === 0 && (
        <p className="text-sm text-slate-400 py-4 text-center">No varieties match your filters.</p>
      )}

      {/* Variety rows */}
      <div className="space-y-3">
        {varietyGroups.map(({ key, label, prods }) => {
          const activeSlug = getActiveSlug(key, prods);
          const activeProduct = prods.find((p) => p.slug === activeSlug) ?? prods[0];
          const stems = selections[activeSlug] ?? 0;
          const bunch = activeProduct ? bunchSize(activeProduct) : 25;
          const effectivePrice = activeProduct ? (activeProduct.deal_price ?? activeProduct.price ?? 0) : 0;
          const lineTotal = stems * effectivePrice;
          const selected = stems > 0;

          return (
            <div
              key={key}
              className={`bg-white rounded-xl border p-4 transition-all ${selected ? "border-emerald-400 ring-1 ring-emerald-100" : "border-slate-200"}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm mb-2">{label}</p>

                  {prods.length === 1 ? (
                    <div className="flex items-center gap-2">
                      {activeProduct?.length && (
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-medium">
                          {activeProduct.length}
                        </span>
                      )}
                      <span className="text-sm font-bold text-emerald-600">
                        ${effectivePrice.toFixed(2)}<span className="text-xs font-normal text-slate-400">/stem</span>
                      </span>
                      <span className="text-xs text-slate-400">${(effectivePrice * bunch).toFixed(2)}/bunch</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative">
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
                          className="appearance-none text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 pr-7 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                        >
                          {prods.map((p) => (
                            <option key={p.slug} value={p.slug}>
                              {p.length ?? p.box_type ?? "Standard"} — ${(p.deal_price ?? p.price ?? 0).toFixed(2)}/stem
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                      </div>
                      <span className="text-xs text-slate-400">${(effectivePrice * bunch).toFixed(2)}/bunch</span>
                    </div>
                  )}
                </div>

                {/* +/− controls */}
                <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                  <button
                    onClick={() => adjust(activeSlug, activeProduct, -1)}
                    disabled={stems === 0}
                    className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <div className="text-center min-w-[56px]">
                    <p className="text-sm font-bold text-slate-900">
                      {stems}<span className="text-[10px] font-normal text-slate-400 ml-0.5">stems</span>
                    </p>
                    {stems > 0 && bunch > 1 && (
                      <p className="text-[10px] text-slate-400">{stems / bunch} bunch{stems / bunch !== 1 ? "es" : ""}</p>
                    )}
                  </div>
                  <button
                    onClick={() => adjust(activeSlug, activeProduct, 1)}
                    disabled={boxStatus === "hb_full"}
                    className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  {stems > 0 && (
                    <div className="min-w-[52px] text-right">
                      <p className="text-sm font-bold text-emerald-700">${lineTotal.toFixed(2)}</p>
                      <button
                        onClick={() => setSelections((prev) => { const u = { ...prev }; delete u[activeSlug]; return u; })}
                        className="text-slate-300 hover:text-red-400 transition-colors mt-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom CTA */}
      {totalStems > 0 && boxStatus !== "hb_full" && (
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              {selectedItems.length} variet{selectedItems.length > 1 ? "ies" : "y"} · {totalStems} stems
              <span className="ml-2 text-xs font-normal text-slate-400">({boxStatus === "ok" ? "QB" : "HB"} box)</span>
            </p>
            <p className="text-xs text-slate-400">${blendedPrice.toFixed(2)}/stem blended · ${totalPrice.toFixed(2)} total</p>
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
