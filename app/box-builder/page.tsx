"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { products } from "@/lib/data/products";
import { addItem } from "@/lib/quote-cart";
import { getEarliestDeliveryDate, toISODate } from "@/lib/delivery-dates";
import { pushEvent } from "@/lib/gtm";

const VENDORS = [
  { id: "Ecoroses",      label: "Ecoroses",       subtitle: "Roses — 60+ varieties" },
  { id: "Magic Flowers", label: "Magic Flowers",   subtitle: "Tropicals & Specialty" },
  { id: "Megaflor",      label: "Megaflor",        subtitle: "Ranunculus, Anemone, Delphinium" },
  { id: "Flodecol",      label: "Flodecol",        subtitle: "Seasonal & Gypsophila" },
];

// Box size thresholds (stems)
const BOX_TARGETS = [
  { label: "Quarter Box", stems: 150, color: "text-amber-600" },
  { label: "Half Box",    stems: 300, color: "text-blue-600" },
  { label: "Full Box",    stems: 600, color: "text-emerald-600" },
];

function nearestTarget(total: number) {
  const next = BOX_TARGETS.find((t) => total < t.stems);
  return next ?? BOX_TARGETS[BOX_TARGETS.length - 1];
}

export default function BoxBuilderPage() {
  const router = useRouter();
  const [vendor, setVendor] = useState("Ecoroses");
  // slug → quantity (in boxes)
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [added, setAdded] = useState(false);

  // Unique products for selected vendor (one per slug, lowest price)
  const vendorProducts = useMemo(() => {
    const seen = new Map<string, typeof products[0]>();
    for (const p of products) {
      if (p.vendor !== vendor) continue;
      if (p.price <= 0) continue;
      const existing = seen.get(p.slug);
      if (!existing || p.price < existing.price) seen.set(p.slug, p);
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [vendor]);

  const selectedItems = useMemo(() =>
    Object.entries(selections)
      .filter(([, qty]) => qty > 0)
      .map(([slug, qty]) => {
        const p = vendorProducts.find((x) => x.slug === slug);
        if (!p) return null;
        const upb = p.units_per_box || 1;
        return { ...p, qty, totalStems: qty * upb, lineTotal: qty * upb * (p.deal_price ?? p.price) };
      })
      .filter(Boolean) as Array<typeof vendorProducts[0] & { qty: number; totalStems: number; lineTotal: number }>,
  [selections, vendorProducts]);

  const totalStems = selectedItems.reduce((s, i) => s + i.totalStems, 0);
  const totalPrice = selectedItems.reduce((s, i) => s + i.lineTotal, 0);
  const nextTarget = nearestTarget(totalStems);
  const progressPct = totalStems === 0 ? 0 : Math.min(100, (totalStems / nextTarget.stems) * 100);

  function adjust(slug: string, delta: number) {
    setSelections((prev) => {
      const next = Math.max(0, (prev[slug] ?? 0) + delta);
      const updated = { ...prev };
      if (next === 0) delete updated[slug]; else updated[slug] = next;
      return updated;
    });
  }

  function sendToQuote() {
    const deliveryDate = toISODate(getEarliestDeliveryDate("T1"));
    for (const item of selectedItems) {
      addItem({
        slug: item.slug,
        name: item.name,
        category: item.category,
        vendor: item.vendor || "",
        price: item.price,
        deal_price: item.deal_price ?? null,
        quantity: item.qty,
        units_per_box: item.units_per_box || 1,
        box_type: item.box_type || "QB",
        unit: item.unit || "Stem",
        delivery_date: deliveryDate,
        customization_note: `Assorted ${vendor} box — custom mix`,
      });
    }
    pushEvent("box_builder_send_to_quote", {
      vendor,
      total_stems: totalStems,
      item_count: selectedItems.length,
      total_price: Math.round(totalPrice * 100) / 100,
    });
    setAdded(true);
    setTimeout(() => router.push("/quote"), 800);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-900">Custom Box Builder</h1>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full">Internal</span>
            </div>
            <p className="text-sm text-slate-500">Build a custom assorted box by mixing varieties from one vendor.</p>
          </div>
          <Link href="/shop" className="text-sm text-slate-400 hover:text-slate-600">← Back to shop</Link>
        </div>

        {/* Vendor tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {VENDORS.map((v) => (
            <button
              key={v.id}
              onClick={() => { setVendor(v.id); setSelections({}); }}
              className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                vendor === v.id
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
              }`}
            >
              {v.label}
              <span className={`ml-1.5 text-xs ${vendor === v.id ? "text-slate-400" : "text-slate-400"}`}>
                {v.subtitle}
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-6">
          {/* Product grid */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {vendorProducts.map((p) => {
                const qty = selections[p.slug] ?? 0;
                const stems = qty * (p.units_per_box || 1);
                const selected = qty > 0;
                return (
                  <div
                    key={p.slug}
                    className={`bg-white rounded-xl border p-4 transition-all ${
                      selected ? "border-emerald-400 shadow-sm ring-1 ring-emerald-200" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm leading-tight line-clamp-2">{p.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{p.category}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-emerald-600">${(p.deal_price ?? p.price).toFixed(2)}<span className="text-[10px] font-normal text-slate-400">/stem</span></p>
                        {p.units_per_box ? <p className="text-[10px] text-slate-400">{p.units_per_box} stems/box</p> : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => adjust(p.slug, -1)}
                          disabled={qty === 0}
                          className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold text-slate-900">{qty}</span>
                        <button
                          onClick={() => adjust(p.slug, 1)}
                          className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <span className="text-xs text-slate-400 ml-1">{qty > 0 ? `${stems} stems` : "box"}</span>
                      </div>
                      {qty > 0 && (
                        <span className="text-xs font-semibold text-emerald-700">
                          ${((p.deal_price ?? p.price) * stems).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary sidebar */}
          <div className="w-72 flex-shrink-0">
            <div className="sticky top-24 bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-600" />
                Box Summary
              </h2>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{totalStems} stems</span>
                  <span className={nextTarget.color}>Target: {nextTarget.label} ({nextTarget.stems})</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {totalStems > 0 && totalStems < nextTarget.stems && (
                  <p className="text-[11px] text-slate-400 mt-1">{nextTarget.stems - totalStems} more stems to fill a {nextTarget.label.toLowerCase()}</p>
                )}
              </div>

              {/* Selected items */}
              {selectedItems.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No varieties selected yet</p>
              ) : (
                <ul className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                  {selectedItems.map((item) => (
                    <li key={item.slug} className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{item.name}</p>
                        <p className="text-slate-400">{item.qty} box{item.qty > 1 ? "es" : ""} · {item.totalStems} stems</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="font-semibold text-slate-700">${item.lineTotal.toFixed(2)}</span>
                        <button
                          onClick={() => adjust(item.slug, -(selections[item.slug] ?? 0))}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Total */}
              {selectedItems.length > 0 && (
                <div className="border-t border-slate-100 pt-3 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{selectedItems.length} variet{selectedItems.length > 1 ? "ies" : "y"} · {totalStems} stems</span>
                    <span className="font-bold text-slate-900">${totalPrice.toFixed(2)}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ${(totalPrice / totalStems).toFixed(2)}/stem blended avg
                  </p>
                </div>
              )}

              <button
                onClick={sendToQuote}
                disabled={selectedItems.length === 0 || added}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                {added ? "Added! Going to quote…" : "Send to Quote →"}
              </button>

              <p className="text-[10px] text-slate-400 text-center mt-2">
                Adds all varieties to your quote cart
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
