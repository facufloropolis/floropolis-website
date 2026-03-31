"use client";

/**
 * AssortedMixBuilder — shown on PDP when product.variety === "Assorted"
 *
 * Lets buyers build a custom mix from the same vendor:
 * - Pick variety + stem length (each has its own price)
 * - +/− adjusts by 1 bunch (stems_per_bunch)
 * - Live blended $/stem updates as selections change
 * - "Add Custom Mix to Quote" sends each line item separately
 */

import { useState, useMemo } from "react";
import { Minus, Plus, Trash2, ChevronDown } from "lucide-react";
import { products } from "@/lib/data/products";
import { addItem } from "@/lib/quote-cart";
import { pushEvent } from "@/lib/gtm";

type ProductType = (typeof products)[0];

interface Props {
  vendor: string;
  deliveryDate: string; // ISO YYYY-MM-DD
  onSent?: () => void;
}

function bunchSize(p: ProductType): number {
  const spb = p.stems_per_bunch;
  return spb && spb >= 5 ? spb : 25;
}

// slug → stems
type Selections = Record<string, number>;

export default function AssortedMixBuilder({ vendor, deliveryDate, onSent }: Props) {
  const [selections, setSelections] = useState<Selections>({});
  const [sent, setSent] = useState(false);

  // Group non-assorted vendor products by variety name.
  // For each variety: list of products sorted by length (cm asc).
  const varietyGroups = useMemo(() => {
    const map = new Map<string, ProductType[]>();
    for (const p of products) {
      if (p.vendor !== vendor) continue;
      if (p.price <= 0) continue;
      const isAssorted =
        p.variety?.toLowerCase().includes("assorted") ||
        p.color?.toLowerCase().includes("assorted") ||
        p.name?.toLowerCase().startsWith("assorted");
      if (isAssorted) continue;
      const key = p.variety || p.name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }

    // De-dupe within each variety by (length, box_type) — keep lowest price
    const deduped = new Map<string, ProductType[]>();
    for (const [variety, prods] of map.entries()) {
      const seen = new Map<string, ProductType>();
      for (const p of prods) {
        const key = `${p.length ?? ""}|${p.box_type ?? ""}`;
        const existing = seen.get(key);
        if (!existing || p.price < existing.price) seen.set(key, p);
      }
      const sorted = Array.from(seen.values()).sort((a, b) => {
        const aLen = parseInt(a.length?.match(/(\d+)/)?.[1] ?? "999");
        const bLen = parseInt(b.length?.match(/(\d+)/)?.[1] ?? "999");
        return aLen - bLen;
      });
      if (sorted.length > 0) deduped.set(variety, sorted);
    }

    return Array.from(deduped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([variety, prods]) => ({ variety, prods }));
  }, [vendor]);

  // Track selected length per variety (slug of selected product)
  const [selectedSlug, setSelectedSlug] = useState<Record<string, string>>(() => {
    // Pre-select cheapest option per variety
    const defaults: Record<string, string> = {};
    for (const { variety, prods } of varietyGroups) {
      const cheapest = [...prods].sort((a, b) => (a.deal_price ?? a.price) - (b.deal_price ?? b.price))[0];
      if (cheapest) defaults[variety] = cheapest.slug;
    }
    return defaults;
  });

  // All selected products with their stem counts
  const selectedItems = useMemo(() =>
    Object.entries(selections)
      .filter(([, stems]) => stems > 0)
      .map(([slug, stems]) => {
        const p = products.find((x) => x.slug === slug);
        if (!p) return null;
        return { ...p, stems, lineTotal: stems * (p.deal_price ?? p.price) };
      })
      .filter(Boolean) as Array<ProductType & { stems: number; lineTotal: number }>,
  [selections]);

  const totalStems = selectedItems.reduce((s, i) => s + i.stems, 0);
  const totalPrice = selectedItems.reduce((s, i) => s + i.lineTotal, 0);
  const blendedPrice = totalStems > 0 ? totalPrice / totalStems : 0;

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
        price: item.price,
        deal_price: item.deal_price ?? null,
        quantity: item.stems,
        units_per_box: 1,
        box_type: item.box_type ?? "QB",
        unit: item.unit ?? "Stem",
        delivery_date: deliveryDate,
        stem_length: item.length ?? undefined,
        customization_note: `Custom ${vendor} assorted mix`,
      });
    }
    pushEvent("assorted_pdp_mix_send", {
      vendor,
      total_stems: totalStems,
      item_count: selectedItems.length,
      blended_price: Math.round(blendedPrice * 100) / 100,
    });
    setSent(true);
    onSent?.();
  }

  if (varietyGroups.length === 0) return null;

  return (
    <div className="mt-8 border-t border-slate-100 pt-8">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Build Your Custom Mix</h3>
        <p className="text-sm text-slate-500">
          Select specific varieties and stem lengths — each has its own price.
          The blended price updates as you add to your mix.
        </p>
      </div>

      {/* Live price bar */}
      {totalStems > 0 && (
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

      {/* Variety rows */}
      <div className="space-y-3">
        {varietyGroups.map(({ variety, prods }) => {
          const activeSlug = selectedSlug[variety] ?? prods[0]?.slug ?? "";
          const activeProduct = prods.find((p) => p.slug === activeSlug) ?? prods[0];
          const stems = selections[activeSlug] ?? 0;
          const bunch = activeProduct ? bunchSize(activeProduct) : 25;
          const effectivePrice = activeProduct ? (activeProduct.deal_price ?? activeProduct.price) : 0;
          const lineTotal = stems * effectivePrice;
          const selected = stems > 0;

          return (
            <div
              key={variety}
              className={`bg-white rounded-xl border p-4 transition-all ${selected ? "border-emerald-400 ring-1 ring-emerald-100" : "border-slate-200"}`}
            >
              <div className="flex items-start gap-3">
                {/* Variety name + length selector */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm mb-2">{variety}</p>

                  {prods.length === 1 ? (
                    /* Only one option — show static */
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
                    /* Multiple lengths — show as select */
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative">
                        <select
                          value={activeSlug}
                          onChange={(e) => {
                            const newSlug = e.target.value;
                            // Move any existing stems to new slug
                            const existingStems = selections[activeSlug] ?? 0;
                            setSelectedSlug((prev) => ({ ...prev, [variety]: newSlug }));
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
                              {p.length ?? p.box_type ?? "Standard"} — ${(p.deal_price ?? p.price).toFixed(2)}/stem
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                      </div>
                      <span className="text-xs text-slate-400">${(effectivePrice * bunch).toFixed(2)}/bunch</span>
                    </div>
                  )}
                </div>

                {/* +/- controls + line total */}
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
                    {stems > 0 && (
                      <p className="text-[10px] text-slate-400">{stems / bunch} bunch{stems / bunch !== 1 ? "es" : ""}</p>
                    )}
                  </div>
                  <button
                    onClick={() => adjust(activeSlug, activeProduct, 1)}
                    className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
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

      {/* Bottom CTA when items selected */}
      {totalStems > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              {selectedItems.length} variet{selectedItems.length > 1 ? "ies" : "y"} · {totalStems} stems
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
