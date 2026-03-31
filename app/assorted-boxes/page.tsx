"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { products } from "@/lib/data/products";
import { addItem } from "@/lib/quote-cart";
import { getEarliestDeliveryDate, getDeliveryDates, formatDeliveryDate, toISODate } from "@/lib/delivery-dates";
import { pushEvent } from "@/lib/gtm";

const VENDOR_SECTIONS = [
  {
    id: "Ecoroses",
    label: "Ecoroses",
    tagline: "Assorted Rose Boxes",
    description: "Pre-sorted rose boxes from Ecuador. Same premium quality as single-variety orders — mixed colors, same farm.",
    color: "from-rose-50 to-pink-50",
    accent: "text-rose-600",
    border: "border-rose-200",
    badge: "bg-rose-100 text-rose-700",
  },
  {
    id: "Magic Flowers",
    label: "Magic Flowers",
    tagline: "Assorted Bouquet Boxes",
    description: "Tropical & specialty pre-made bouquets, assorted by style. Ready-to-display, 21 stems per bouquet.",
    color: "from-violet-50 to-purple-50",
    accent: "text-violet-600",
    border: "border-violet-200",
    badge: "bg-violet-100 text-violet-700",
  },
];

type ProductType = (typeof products)[0];

function bunchSize(p: ProductType): number {
  const spb = p.stems_per_bunch;
  return spb && spb >= 5 ? spb : 25;
}

function AssortedCard({
  product,
  stems,
  onAdjust,
}: {
  product: ProductType;
  stems: number;
  onAdjust: (delta: number) => void;
}) {
  const effectivePrice = product.deal_price ?? product.price;
  const image = product.images?.[0];
  const bunch = bunchSize(product);
  const bunches = stems / bunch;
  const lineTotal = stems * effectivePrice;

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col ${stems > 0 ? "border-emerald-400 ring-1 ring-emerald-200" : "border-slate-200"}`}>
      {image && (
        <div className="relative w-full aspect-[4/3] bg-slate-50">
          <Image src={image} alt={product.name} fill className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
          {product.is_on_deal && product.deal_label && (
            <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white px-2 py-0.5 rounded-full">
              {product.deal_label}
            </span>
          )}
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <p className="font-semibold text-slate-900 text-sm leading-snug mb-0.5">{product.name}</p>
        <p className="text-xs text-slate-500 mb-3">{product.vendor} · {bunch} stems/bunch · T2 (5–10 days)</p>

        <div className="mt-auto">
          {/* Price */}
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-lg font-bold text-emerald-600">
                ${effectivePrice.toFixed(2)}<span className="text-xs font-normal text-slate-400">/stem</span>
              </p>
              <p className="text-[11px] text-slate-400">${(effectivePrice * bunch).toFixed(2)}/bunch</p>
            </div>
            {stems > 0 && (
              <div className="text-right">
                <p className="text-sm font-bold text-emerald-700">${lineTotal.toFixed(2)}</p>
                <p className="text-[11px] text-slate-400">{stems} stems · {bunches} bunch{bunches !== 1 ? "es" : ""}</p>
              </div>
            )}
          </div>

          {/* Quantity controls */}
          <div className="flex items-center gap-2">
            <button onClick={() => onAdjust(-1)} disabled={stems === 0}
              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1 text-center">
              <p className="text-sm font-bold text-slate-900">
                {stems}<span className="text-[10px] font-normal text-slate-400 ml-0.5">stems</span>
              </p>
            </div>
            <button onClick={() => onAdjust(1)}
              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors flex-shrink-0">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AssortedBoxesPage() {
  const router = useRouter();
  // slug → stems
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [sent, setSent] = useState(false);

  const deliveryDates = useMemo(() => {
    const earliest = getEarliestDeliveryDate("T2");
    return getDeliveryDates(earliest, 8);
  }, []);
  const [deliveryDate, setDeliveryDate] = useState<string>(() =>
    deliveryDates[0] ? toISODate(deliveryDates[0]) : ""
  );
  const [dateExpanded, setDateExpanded] = useState(false);

  const productsByVendor = useMemo(() => {
    const map: Record<string, ProductType[]> = {};
    for (const v of VENDOR_SECTIONS) map[v.id] = [];
    const seen = new Map<string, ProductType>();
    for (const p of products) {
      const isAssorted =
        p.color?.toLowerCase().includes("assorted") ||
        p.variety?.toLowerCase().includes("assorted") ||
        p.name?.toLowerCase().includes("assorted");
      const isKnownVendor = VENDOR_SECTIONS.some((v) => v.id === p.vendor);
      if (!isAssorted || !isKnownVendor || p.price <= 0) continue;
      const existing = seen.get(p.slug);
      if (!existing || p.price < existing.price) seen.set(p.slug, p);
    }
    for (const p of seen.values()) {
      if (p.vendor && map[p.vendor]) map[p.vendor].push(p);
    }
    for (const v of VENDOR_SECTIONS) map[v.id].sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, []);

  function adjust(p: ProductType, delta: number) {
    const step = bunchSize(p) * delta;
    setSelections((prev) => {
      const next = Math.max(0, (prev[p.slug] ?? 0) + step);
      const updated = { ...prev };
      if (next === 0) delete updated[p.slug]; else updated[p.slug] = next;
      return updated;
    });
  }

  const selectedItems = useMemo(() =>
    Object.entries(selections)
      .filter(([, stems]) => stems > 0)
      .map(([slug, stems]) => {
        for (const v of VENDOR_SECTIONS) {
          const p = productsByVendor[v.id]?.find((x) => x.slug === slug);
          if (p) return { ...p, stems, lineTotal: stems * (p.deal_price ?? p.price) };
        }
        return null;
      })
      .filter(Boolean) as Array<ProductType & { stems: number; lineTotal: number }>,
  [selections, productsByVendor]);

  const totalStems = selectedItems.reduce((s, i) => s + i.stems, 0);
  const totalPrice = selectedItems.reduce((s, i) => s + i.lineTotal, 0);
  const blendedPrice = totalStems > 0 ? totalPrice / totalStems : 0;

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
      });
    }
    pushEvent("assorted_send_to_quote", { item_count: selectedItems.length, total_stems: totalStems });
    setSent(true);
    setTimeout(() => router.push("/quote"), 800);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-2">
          <Link href="/shop" className="text-sm text-slate-400 hover:text-slate-600">Shop</Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm text-slate-600 font-medium">Assorted Boxes</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Assorted Boxes</h1>
        <p className="text-slate-500 max-w-2xl mb-8">
          Pre-sorted boxes from our farm partners. Use +/− to choose exactly how many stems of each variety. Price updates live as you build.
        </p>

        {/* Sticky summary bar */}
        {totalStems > 0 && (
          <div className="sticky top-4 z-20 mb-6">
            <div className="bg-slate-900 text-white rounded-2xl px-5 py-3 shadow-lg">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xl font-bold text-emerald-400">${blendedPrice.toFixed(2)}<span className="text-sm font-normal text-slate-400">/stem</span></p>
                    <p className="text-xs text-slate-400">blended avg</p>
                  </div>
                  <div className="border-l border-slate-700 pl-4">
                    <p className="text-sm font-bold">${totalPrice.toFixed(2)}</p>
                    <p className="text-xs text-slate-400">{totalStems} stems · {selectedItems.length} variet{selectedItems.length > 1 ? "ies" : "y"}</p>
                  </div>
                </div>
                <button onClick={sendToQuote} disabled={sent}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors flex items-center gap-2 flex-shrink-0">
                  <ShoppingCart className="w-4 h-4" />
                  {sent ? "Adding…" : "Request Quote →"}
                </button>
              </div>
              {/* Delivery date — inline in sticky bar */}
              <div className="mt-2 pt-2 border-t border-slate-700">
                {!dateExpanded ? (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">
                      Delivery: <span className="text-white font-medium">
                        {deliveryDate
                          ? new Date(deliveryDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                          : "Select date"}
                      </span>
                    </p>
                    <button onClick={() => setDateExpanded(true)} className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold">
                      Change
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {deliveryDates.slice(0, 12).map((d) => {
                        const iso = toISODate(d);
                        const isSelected = deliveryDate === iso;
                        return (
                          <button key={iso} onClick={() => { setDeliveryDate(iso); setDateExpanded(false); }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                              isSelected ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                            }`}>
                            {formatDeliveryDate(d)}
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={() => setDateExpanded(false)} className="text-xs text-slate-500 hover:text-slate-400">Collapse ↑</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Vendor sections */}
        {VENDOR_SECTIONS.map((section) => {
          const vendorProds = productsByVendor[section.id] ?? [];
          if (vendorProds.length === 0) return null;
          return (
            <div key={section.id} className="mb-12">
              <div className={`rounded-2xl bg-gradient-to-r ${section.color} border ${section.border} px-5 py-4 mb-5`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-xl font-bold text-slate-900">{section.label}</h2>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${section.badge}`}>{section.tagline}</span>
                    </div>
                    <p className="text-sm text-slate-600 max-w-xl">{section.description}</p>
                  </div>
                  <span className={`text-sm font-semibold ${section.accent} hidden sm:block`}>
                    {vendorProds.length} {vendorProds.length === 1 ? "variety" : "varieties"}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {vendorProds.map((p) => (
                  <AssortedCard key={p.slug} product={p} stems={selections[p.slug] ?? 0} onAdjust={(d) => adjust(p, d)} />
                ))}
              </div>
            </div>
          );
        })}

        {/* CTA to box builder */}
        <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Need a fully custom mix?</h3>
          <p className="text-sm text-slate-500 mb-4">Use our Box Builder to choose any variety from a vendor — not just assorted products.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link href="/box-builder"
              className="inline-flex items-center gap-2 bg-violet-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-violet-700 transition-colors">
              Open Box Builder →
            </Link>
            {/* EXP-121: WA escape on assorted-boxes page */}
            <a
              href="https://wa.me/17869308463?text=Hi!%20I%27d%20like%20help%20putting%20together%20an%20assorted%20flower%20order."
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => pushEvent("whatsapp_click", { cta_location: "assorted_boxes_cta" })}
              className="text-sm text-emerald-600 font-semibold hover:underline"
            >
              Chat with us on WhatsApp →
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
