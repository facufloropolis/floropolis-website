"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Minus, Plus, ShoppingCart, Trash2, Search, X, ChevronDown } from "lucide-react";
import { products, type Product } from "@/lib/data/products";
import { addItem } from "@/lib/quote-cart";
import { getEarliestDeliveryDate, getDeliveryDates, formatDeliveryDate, toISODate } from "@/lib/delivery-dates";
import { pushEvent } from "@/lib/gtm";

const VENDORS = [
  { id: "Ecoroses",      label: "Ecoroses",       subtitle: "Roses — 60+ varieties" },
  { id: "Magic Flowers", label: "Magic Flowers",   subtitle: "Tropicals & Specialty" },
  { id: "Megaflor",      label: "Megaflor",        subtitle: "Ranunculus, Anemone, Delphinium" },
  { id: "Flodecol",      label: "Flodecol",        subtitle: "Seasonal & Gypsophila" },
];

function nearestTarget(total: number, targets: { label: string; stems: number; color: string }[]) {
  return targets.find((t) => total < t.stems) ?? targets[targets.length - 1];
}

function bunchSize(p: Product): number {
  const spb = p.stems_per_bunch;
  return spb && spb >= 5 ? spb : 25;
}

function parseCm(len: string | null): number {
  return parseInt(len?.match(/(\d+)/)?.[1] ?? "999");
}

export default function BoxBuilderPage() {
  const router = useRouter();
  const [vendor, setVendor] = useState("Ecoroses");
  const [search, setSearch] = useState("");
  const [selectedColor, setSelectedColor] = useState("All");
  const [selectedVariety, setSelectedVariety] = useState("All");
  const [selectedLength, setSelectedLength] = useState("All");
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [added, setAdded] = useState(false);

  // Delivery date
  const deliveryDates = useMemo(() => {
    const earliest = getEarliestDeliveryDate("T1");
    return getDeliveryDates(earliest, 8);
  }, []);
  const [deliveryDate, setDeliveryDate] = useState<string>(() =>
    deliveryDates[0] ? toISODate(deliveryDates[0]) : ""
  );
  const [dateExpanded, setDateExpanded] = useState(false);

  const vendorProducts = useMemo(() => {
    const seen = new Map<string, Product>();
    for (const p of products) {
      if (p.vendor !== vendor) continue;
      if (p.price <= 0) continue;
      const existing = seen.get(p.slug);
      if (!existing || p.price < existing.price) seen.set(p.slug, p);
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [vendor]);

  const vendorColors = useMemo(() => {
    const s = new Set<string>();
    for (const p of vendorProducts) if (p.color) s.add(p.color);
    return Array.from(s).sort();
  }, [vendorProducts]);

  const vendorVarieties = useMemo(() => {
    const s = new Set<string>();
    for (const p of vendorProducts) if (p.variety) s.add(p.variety);
    return Array.from(s).sort();
  }, [vendorProducts]);

  // Dynamic box targets from vendor's most common QB size
  const boxTargets = useMemo(() => {
    const qbCounts = new Map<number, number>();
    for (const p of vendorProducts) {
      if (p.box_type?.includes("QB") && p.units_per_box > 0) {
        qbCounts.set(p.units_per_box, (qbCounts.get(p.units_per_box) ?? 0) + 1);
      }
    }
    let qbSize = 100; // fallback
    let maxCount = 0;
    for (const [size, count] of qbCounts) {
      if (count > maxCount) { maxCount = count; qbSize = size; }
    }
    return [
      { label: `QB (${qbSize} stems)`,     stems: qbSize,     color: "text-amber-600" },
      { label: `HB (${qbSize * 2} stems)`, stems: qbSize * 2, color: "text-blue-600" },
      { label: `FB (${qbSize * 4} stems)`, stems: qbSize * 4, color: "text-emerald-600" },
    ];
  }, [vendorProducts]);

  const vendorLengths = useMemo(() => {
    const s = new Set<string>();
    for (const p of vendorProducts) if (p.length) s.add(p.length);
    return Array.from(s).sort((a, b) => parseCm(a) - parseCm(b));
  }, [vendorProducts]);

  const filteredProducts = useMemo(() => {
    let list = vendorProducts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.color?.toLowerCase().includes(q) ||
          p.variety?.toLowerCase().includes(q)
      );
    }
    if (selectedColor !== "All") list = list.filter((p) => p.color === selectedColor);
    if (selectedVariety !== "All") list = list.filter((p) => p.variety === selectedVariety);
    if (selectedLength !== "All") list = list.filter((p) => p.length === selectedLength);
    return list;
  }, [vendorProducts, search, selectedColor, selectedVariety, selectedLength]);

  const selectedItems = useMemo(() =>
    Object.entries(selections)
      .filter(([, stems]) => stems > 0)
      .map(([slug, stems]) => {
        const p = vendorProducts.find((x) => x.slug === slug);
        if (!p) return null;
        return { ...p, stems, lineTotal: stems * (p.deal_price ?? p.price) };
      })
      .filter(Boolean) as Array<Product & { stems: number; lineTotal: number }>,
  [selections, vendorProducts]);

  const totalStems = selectedItems.reduce((s, i) => s + i.stems, 0);
  const totalPrice = selectedItems.reduce((s, i) => s + i.lineTotal, 0);
  const blendedPrice = totalStems > 0 ? totalPrice / totalStems : 0;
  const nextTarget = nearestTarget(totalStems, boxTargets);
  const progressPct = totalStems === 0 ? 0 : Math.min(100, (totalStems / nextTarget.stems) * 100);

  const activeFilters = [
    selectedColor !== "All" && { label: selectedColor, clear: () => setSelectedColor("All") },
    selectedVariety !== "All" && { label: selectedVariety, clear: () => setSelectedVariety("All") },
    selectedLength !== "All" && { label: selectedLength, clear: () => setSelectedLength("All") },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  function switchVendor(v: string) {
    setVendor(v);
    setSelections({});
    setSearch("");
    setSelectedColor("All");
    setSelectedVariety("All");
    setSelectedLength("All");
  }

  function adjust(p: Product, delta: number) {
    const step = bunchSize(p) * delta;
    setSelections((prev) => {
      const next = Math.max(0, (prev[p.slug] ?? 0) + step);
      const updated = { ...prev };
      if (next === 0) delete updated[p.slug]; else updated[p.slug] = next;
      return updated;
    });
  }

  function sendToQuote() {
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
      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-900">Custom Box Builder</h1>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full">Internal</span>
            </div>
            <p className="text-sm text-slate-500">Mix varieties from one vendor. +/− adjusts by 1 bunch at a time.</p>
          </div>
          <Link href="/shop" className="text-sm text-slate-400 hover:text-slate-600">← Back to shop</Link>
        </div>

        {/* EXP-135: MDY callout on box-builder — florists building custom boxes for MDY events */}
        {new Date() < new Date("2026-04-25T23:59:59-04:00") && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-700">💝 Building a Mother&apos;s Day order?</p>
              <p className="text-xs text-rose-500 mt-0.5">Pre-order cutoff: April 25 · Guaranteed May 10 delivery · Roses, ranunculus &amp; anemone are MDY favorites.</p>
            </div>
            <a href="/mothers-day-2026" className="flex-shrink-0 text-xs font-bold text-rose-600 border border-rose-300 bg-white rounded-lg px-3 py-1.5 hover:bg-rose-50 transition-colors">
              View MDY Collection →
            </a>
          </div>
        )}

        {/* Vendor tabs */}
        <div className="flex flex-wrap gap-2 mb-5">
          {VENDORS.map((v) => (
            <button key={v.id} onClick={() => switchVendor(v.id)}
              className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                vendor === v.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
              }`}>
              {v.label}
              <span className="ml-1.5 text-xs text-slate-400">{v.subtitle}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-5">
          {/* Center: filters + grid */}
          <div className="flex-1 min-w-0">

            {/* Filter row — always visible */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
              <div className="flex flex-wrap gap-3 items-end">
                {/* Search */}
                <div className="flex-1 min-w-[160px]">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Search</p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Name, color, variety…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-8 pr-7 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent focus:bg-white"
                    />
                    {search && (
                      <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Color */}
                {vendorColors.length > 0 && (
                  <div className="min-w-[130px]">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Color</p>
                    <div className="relative">
                      <select
                        value={selectedColor}
                        onChange={(e) => setSelectedColor(e.target.value)}
                        className="w-full appearance-none text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 pr-7 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white cursor-pointer"
                      >
                        <option value="All">All colors</option>
                        {vendorColors.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Variety */}
                {vendorVarieties.length > 1 && (
                  <div className="min-w-[160px]">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Variety</p>
                    <div className="relative">
                      <select
                        value={selectedVariety}
                        onChange={(e) => setSelectedVariety(e.target.value)}
                        className="w-full appearance-none text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 pr-7 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white cursor-pointer"
                      >
                        <option value="All">All varieties</option>
                        {vendorVarieties.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Length */}
                {vendorLengths.length > 0 && (
                  <div className="min-w-[120px]">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Length</p>
                    <div className="relative">
                      <select
                        value={selectedLength}
                        onChange={(e) => setSelectedLength(e.target.value)}
                        className="w-full appearance-none text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 pr-7 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white cursor-pointer"
                      >
                        <option value="All">All lengths</option>
                        {vendorLengths.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Clear all */}
                {activeFilters.length > 0 && (
                  <button
                    onClick={() => { setSelectedColor("All"); setSelectedVariety("All"); setSelectedLength("All"); setSearch(""); }}
                    className="text-xs text-slate-400 hover:text-red-500 font-medium whitespace-nowrap pb-2"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Active filter pills + count */}
              {(activeFilters.length > 0 || search) && (
                <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-slate-100">
                  {activeFilters.map(({ label, clear }) => (
                    <span key={label} className="flex items-center gap-1 text-xs bg-slate-900 text-white px-2 py-0.5 rounded-full">
                      {label}
                      <button onClick={clear} className="ml-0.5 opacity-60 hover:opacity-100"><X className="w-2.5 h-2.5" /></button>
                    </span>
                  ))}
                  <span className="text-xs text-slate-400 ml-1">{filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>

            {filteredProducts.length === 0 && (
              <p className="text-sm text-slate-400 py-8 text-center">No products match the current filter</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
                        <p className="text-xs text-slate-400 mt-0.5">
                          {p.color}{p.length ? ` · ${p.length}` : ""} · {bunch} stems/bunch
                        </p>
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
                      {stems > 0 && (
                        <span className="text-sm font-bold text-emerald-700">${linePrice.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Summary sidebar */}
          <div className="w-72 flex-shrink-0">
            <div className="sticky top-24 bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-600" />
                Box Summary
              </h2>

              {totalStems > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 text-center">
                  <p className="text-2xl font-bold text-emerald-700">${blendedPrice.toFixed(2)}<span className="text-sm font-normal text-emerald-500">/stem</span></p>
                  <p className="text-xs text-emerald-600 mt-0.5">blended avg · {totalStems} stems total</p>
                  <p className="text-sm font-semibold text-slate-700 mt-1">${totalPrice.toFixed(2)} total</p>
                </div>
              )}

              {/* Box size guide — informational only, not a blocker */}
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">{totalStems} stems selected</span>
                  <span className={`font-medium ${nextTarget.color}`}>Next: {nextTarget.label}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="flex gap-2 mt-2">
                  {boxTargets.map((t) => (
                    <div key={t.label} className={`flex-1 text-center text-[10px] font-medium rounded-lg py-1 ${
                      totalStems >= t.stems ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"
                    }`}>
                      {t.label}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 text-center">You can send at any quantity ↓</p>
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

              {/* Delivery date */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-600 mb-2">Delivery Date</p>
                {!dateExpanded ? (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div>
                      <p className="text-[10px] text-slate-400">In stock · ships ~5 days</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {deliveryDate
                          ? new Date(deliveryDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                          : "Select date"}
                      </p>
                    </div>
                    <button onClick={() => setDateExpanded(true)} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {deliveryDates.slice(0, 16).map((d) => {
                        const iso = toISODate(d);
                        const isSelected = deliveryDate === iso;
                        return (
                          <button key={iso} onClick={() => { setDeliveryDate(iso); setDateExpanded(false); }}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                              isSelected ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:border-emerald-400 bg-white"
                            }`}>
                            {formatDeliveryDate(d)}
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={() => setDateExpanded(false)} className="text-xs text-slate-400 hover:text-slate-600">Collapse ↑</button>
                  </div>
                )}
              </div>

              <button onClick={sendToQuote} disabled={selectedItems.length === 0 || added}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm">
                {added ? "Added! Going to quote…" : "Send to Quote →"}
              </button>
              <p className="text-[10px] text-slate-400 text-center mt-2">Adds all varieties to your quote cart</p>
              {/* EXP-122: WA escape on box-builder */}
              <p className="text-center mt-3 text-xs text-slate-500">
                Prefer to chat?{" "}
                <a
                  href="https://wa.me/17869308463?text=Hi!%20I%27d%20like%20help%20building%20a%20custom%20flower%20box%20order."
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => pushEvent("whatsapp_click", { cta_location: "box_builder_quote" })}
                  className="text-emerald-600 font-semibold hover:underline"
                >
                  Message us on WhatsApp →
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
