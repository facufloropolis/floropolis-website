"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Minus, Plus, ShoppingCart, Trash2, Search, X } from "lucide-react";
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

const BOX_TARGETS = [
  { label: "Quarter Box", stems: 150, color: "text-amber-600" },
  { label: "Half Box",    stems: 300, color: "text-blue-600" },
  { label: "Full Box",    stems: 600, color: "text-emerald-600" },
];

function nearestTarget(total: number) {
  return BOX_TARGETS.find((t) => total < t.stems) ?? BOX_TARGETS[BOX_TARGETS.length - 1];
}

function bunchSize(p: (typeof products)[0]): number {
  const spb = p.stems_per_bunch;
  return spb && spb >= 5 ? spb : 25;
}

export default function BoxBuilderPage() {
  const router = useRouter();
  const [vendor, setVendor] = useState("Ecoroses");
  const [search, setSearch] = useState("");
  // slug → stems (step = 1 bunch)
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [added, setAdded] = useState(false);

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

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return vendorProducts;
    const q = search.toLowerCase();
    return vendorProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.color?.toLowerCase().includes(q) ||
        p.variety?.toLowerCase().includes(q)
    );
  }, [vendorProducts, search]);

  const selectedItems = useMemo(() =>
    Object.entries(selections)
      .filter(([, stems]) => stems > 0)
      .map(([slug, stems]) => {
        const p = vendorProducts.find((x) => x.slug === slug);
        if (!p) return null;
        return { ...p, stems, lineTotal: stems * (p.deal_price ?? p.price) };
      })
      .filter(Boolean) as Array<typeof vendorProducts[0] & { stems: number; lineTotal: number }>,
  [selections, vendorProducts]);

  const totalStems = selectedItems.reduce((s, i) => s + i.stems, 0);
  const totalPrice = selectedItems.reduce((s, i) => s + i.lineTotal, 0);
  const blendedPrice = totalStems > 0 ? totalPrice / totalStems : 0;
  const nextTarget = nearestTarget(totalStems);
  const progressPct = totalStems === 0 ? 0 : Math.min(100, (totalStems / nextTarget.stems) * 100);

  function adjust(p: typeof vendorProducts[0], delta: number) {
    const step = bunchSize(p) * delta;
    setSelections((prev) => {
      const next = Math.max(0, (prev[p.slug] ?? 0) + step);
      const updated = { ...prev };
      if (next === 0) delete updated[p.slug]; else updated[p.slug] = next;
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
        quantity: item.stems,
        units_per_box: 1,
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
            <p className="text-sm text-slate-500">Mix varieties from one vendor. +/− adjusts by 1 bunch at a time.</p>
          </div>
          <Link href="/shop" className="text-sm text-slate-400 hover:text-slate-600">← Back to shop</Link>
        </div>

        {/* Vendor tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {VENDORS.map((v) => (
            <button key={v.id} onClick={() => { setVendor(v.id); setSelections({}); setSearch(""); }}
              className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                vendor === v.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
              }`}>
              {v.label}
              <span className="ml-1.5 text-xs text-slate-400">{v.subtitle}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={`Search ${vendor} varieties…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-80 pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex gap-6">
          {/* Product grid */}
          <div className="flex-1 min-w-0">
            {filteredProducts.length === 0 && (
              <p className="text-sm text-slate-400 py-8 text-center">No varieties match &quot;{search}&quot;</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredProducts.map((p) => {
                const stems = selections[p.slug] ?? 0;
                const bunch = bunchSize(p);
                const bunches = stems / bunch;
                const selected = stems > 0;
                const linePrice = (p.deal_price ?? p.price) * stems;
                return (
                  <div key={p.slug} className={`bg-white rounded-xl border p-4 transition-all ${selected ? "border-emerald-400 shadow-sm ring-1 ring-emerald-200" : "border-slate-200"}`}>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm leading-tight line-clamp-2">{p.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{p.category} · {bunch} stems/bunch</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-emerald-600">
                          ${(p.deal_price ?? p.price).toFixed(2)}<span className="text-[10px] font-normal text-slate-400">/stem</span>
                        </p>
                        <p className="text-[10px] text-slate-400">${((p.deal_price ?? p.price) * bunch).toFixed(2)}/bunch</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => adjust(p, -1)} disabled={stems === 0}
                          className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                          <Minus className="w-3 h-3" />
                        </button>
                        <div className="text-center min-w-[64px]">
                          <p className="text-sm font-bold text-slate-900">
                            {stems}<span className="text-[10px] font-normal text-slate-400 ml-0.5">stems</span>
                          </p>
                          {stems > 0 && <p className="text-[10px] text-slate-400">{bunches} bunch{bunches !== 1 ? "es" : ""}</p>}
                        </div>
                        <button onClick={() => adjust(p, 1)}
                          className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      {/* Live line price */}
                      {stems > 0 && (
                        <span className="text-sm font-bold text-emerald-700">${linePrice.toFixed(2)}</span>
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

              {/* Live blended price — prominent */}
              {totalStems > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 text-center">
                  <p className="text-2xl font-bold text-emerald-700">${blendedPrice.toFixed(2)}<span className="text-sm font-normal text-emerald-500">/stem</span></p>
                  <p className="text-xs text-emerald-600 mt-0.5">blended avg · {totalStems} stems total</p>
                  <p className="text-sm font-semibold text-slate-700 mt-1">${totalPrice.toFixed(2)} total</p>
                </div>
              )}

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{totalStems} stems</span>
                  <span className={nextTarget.color}>{nextTarget.label} = {nextTarget.stems}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                {totalStems > 0 && totalStems < nextTarget.stems && (
                  <p className="text-[11px] text-slate-400 mt-1">{nextTarget.stems - totalStems} more stems to reach {nextTarget.label.toLowerCase()}</p>
                )}
              </div>

              {/* Selected items */}
              {selectedItems.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No varieties selected yet</p>
              ) : (
                <ul className="space-y-2 mb-4 max-h-56 overflow-y-auto">
                  {selectedItems.map((item) => {
                    const bunch = bunchSize(item);
                    return (
                      <li key={item.slug} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 truncate">{item.name}</p>
                          <p className="text-slate-400">{item.stems} stems · {item.stems / bunch} bunch{item.stems / bunch !== 1 ? "es" : ""}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="font-semibold text-slate-700">${item.lineTotal.toFixed(2)}</span>
                          <button onClick={() => setSelections((prev) => { const u = { ...prev }; delete u[item.slug]; return u; })}
                            className="text-slate-300 hover:text-red-400 transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <button onClick={sendToQuote} disabled={selectedItems.length === 0 || added}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm">
                {added ? "Added! Going to quote…" : "Send to Quote →"}
              </button>
              <p className="text-[10px] text-slate-400 text-center mt-2">Adds all varieties to your quote cart</p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
