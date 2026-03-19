"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { ArrowLeft, ArrowRight, ArrowUpDown, ArrowUp, ArrowDown, Truck } from "lucide-react";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";

import {
  COMBO_BOXES,
  COMBO_BOUQUETS,
  getComboCheckoutUrl,
  getBouquetCheckoutUrl,
  type ComboBox,
  type ComboSortKey,
} from "@/lib/shop-combo-boxes";

type SortDir = "asc" | "desc";

export default function ShopComboBoxesPage() {
  const [sortBy, setSortBy] = useState<ComboSortKey>("pricePerStem");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sortedBoxes = useMemo(() => {
    const list = [...COMBO_BOXES];
    list.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const mult = sortDir === "asc" ? 1 : -1;
      return aVal < bVal ? -1 * mult : aVal > bVal ? 1 * mult : 0;
    });
    return list;
  }, [sortBy, sortDir]);

  const toggleSort = (key: ComboSortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir(key === "stemCount" || key === "totalPrice" ? "desc" : "asc");
    }
  };

  const SortHeader = ({
    label,
    keyName,
    active,
  }: {
    label: string;
    keyName: ComboSortKey;
    active: boolean;
  }) => (
    <button
      type="button"
      onClick={() => toggleSort(keyName)}
      className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-emerald-600 text-left"
    >
      {label}
      {active ? (
        sortDir === "asc" ? (
          <ArrowUp className="w-4 h-4" />
        ) : (
          <ArrowDown className="w-4 h-4" />
        )
      ) : (
        <ArrowUpDown className="w-4 h-4 opacity-50" />
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <nav className="mb-6 text-sm text-slate-500">
          <Link
            href="/shop"
            className="inline-flex items-center gap-1 hover:text-emerald-600"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Browse Catalog
          </Link>
        </nav>

        {/* Hero */}
        <section className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Combo Boxes — Compare & Order
          </h1>
          <p className="text-xl text-slate-700 max-w-2xl mx-auto">
            Mixed flowers, tropicals & greens in one box. All combo boxes ship free. Sort by price, stem count, or value.
          </p>
        </section>

        {/* Comparison table */}
        <section className="mb-16 overflow-x-auto">
          <table className="w-full min-w-[640px] border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="text-left py-4 px-4 font-semibold text-slate-700">
                  Box
                </th>
                <th className="text-left py-4 px-4 font-semibold text-slate-700 hidden md:table-cell">
                  Contents
                </th>
                <th className="py-4 px-4 font-semibold text-slate-700">
                  <SortHeader
                    label="Stems"
                    keyName="stemCount"
                    active={sortBy === "stemCount"}
                  />
                </th>
                <th className="py-4 px-4 font-semibold text-slate-700">
                  <SortHeader
                    label="$/stem"
                    keyName="pricePerStem"
                    active={sortBy === "pricePerStem"}
                  />
                </th>
                <th className="py-4 px-4 font-semibold text-slate-700">
                  <SortHeader
                    label="Total"
                    keyName="totalPrice"
                    active={sortBy === "totalPrice"}
                  />
                </th>
                <th className="py-4 px-4 font-semibold text-slate-700 text-center">
                  Shipping
                </th>
                <th className="py-4 px-4 w-32" aria-label="Order" />
              </tr>
            </thead>
            <tbody>
              {sortedBoxes.map((box) => (
                <ComboTableRow
                  key={box.id}
                  box={box}
                />
              ))}
            </tbody>
          </table>
        </section>

        {/* Pre-made bouquets subsection */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Pre-made tropical bouquets
          </h2>
          <p className="text-slate-600 mb-6 max-w-2xl">
            Ready-to-sell bouquets — tropical and mixed. Order by the bouquet; all ship free.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {COMBO_BOUQUETS.map((bouquet) => (
              <BouquetCard
                key={bouquet.id}
                bouquet={bouquet}
              />
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center border-t border-slate-200 pt-10">
          <Link
            href="/shop?category=Mixed+Boxes"
            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-lg font-bold hover:bg-emerald-700 transition-all shadow-lg"
          >
            Browse all combo boxes in catalog
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        {/* FAQ — content matches FAQPage JSON-LD schema in layout.tsx for Google rich results */}
        <section className="mt-16 mb-10 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Frequently Asked Questions</h2>
          <div className="space-y-5 text-sm">
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">What&apos;s in a combo box?</h3>
              <p className="text-slate-600">Combo boxes are curated mixes of tropical flowers and greens from Magic Flowers in Ecuador. Each box has a set composition — for example, the Fiesta Box includes a mix of heliconias, gingers, anthuriums, and tropical foliage. Exact variety details are listed on each product page.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Can I customize what&apos;s in my combo box?</h3>
              <p className="text-slate-600">Yes — you can add a note when requesting your quote specifying variety preferences. For large orders, we can work with Magic Flowers to customize the composition. Add your preferences in the quote notes field.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">How many stems are in a combo box?</h3>
              <p className="text-slate-600">Stem counts vary by box. Quarter boxes (QB) typically contain 41–113 stems depending on the mix. Each product page shows the total stem count so you can compare value before ordering.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">How long does combo box delivery take?</h3>
              <p className="text-slate-600">Farm-direct from Ecuador to your door in 4 days via FedEx Priority. Combo boxes ship direct from Magic Flowers with no warehouse stops.</p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function ComboTableRow({ box }: { box: ComboBox }) {
  const url = getComboCheckoutUrl(box);
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50">
      <td className="py-4 px-4">
        <div className="font-semibold text-slate-900">{box.name}</div>
        {box.bestValue && (
          <span className="inline-block mt-1 text-xs font-bold uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
            Best value
          </span>
        )}
      </td>
      <td className="py-4 px-4 text-sm text-slate-600 hidden md:table-cell">
        {box.contents}
      </td>
      <td className="py-4 px-4 font-medium text-slate-800">
        {box.stemCount}
      </td>
      <td className="py-4 px-4 font-medium text-emerald-700">
        ${box.pricePerStem.toFixed(2)}/stem
      </td>
      <td className="py-4 px-4 font-bold text-slate-900">
        ${box.totalPrice}
      </td>
      <td className="py-4 px-4 text-center">
        {box.freeShipping && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
            <Truck className="w-4 h-4" />
            Free shipping
          </span>
        )}
      </td>
      <td className="py-4 px-4">
        <Link
          href={url}
          onClick={() => pushEvent(CTA_EVENTS.product_click, { product_name: box.name, product_category: "Mixed Boxes", cta_location: "combo_boxes_page" })}
          className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
        >
          View <ArrowRight className="w-4 h-4" />
        </Link>
      </td>
    </tr>
  );
}

function BouquetCard({ bouquet }: { bouquet: (typeof COMBO_BOUQUETS)[number] }) {
  const url = getBouquetCheckoutUrl(bouquet);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all flex flex-col">
      <div className="aspect-square relative bg-slate-100 max-h-48">
        <Image
          src={bouquet.image}
          alt={bouquet.name}
          fill
          className="object-contain"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-slate-900 mb-1">{bouquet.name}</h3>
        <p className="text-sm text-slate-600 mb-2 flex-1">{bouquet.description}</p>
        <p className="text-sm text-slate-500 mb-1">
          {bouquet.stemCount} stems · ${bouquet.pricePerStem.toFixed(2)}/stem
        </p>
        <p className="font-bold text-emerald-600 mb-3">${bouquet.totalPrice.toFixed(2)}</p>
        <Link
          href={url}
          onClick={() => pushEvent(CTA_EVENTS.product_click, { product_name: bouquet.name, product_category: "Bouquets", cta_location: "combo_boxes_page" })}
          className="block w-full text-center bg-emerald-600 text-white py-2.5 rounded-lg font-semibold hover:bg-emerald-700 transition-colors text-sm"
        >
          Shop bouquets →
        </Link>
      </div>
    </div>
  );
}
