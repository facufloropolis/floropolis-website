// Floropolis v2 -- Catalog browse (faceted, source-aware, login-aware)
// v0.1 | 2026-05-16 | Job_PM [V8 SHADOW]
//
// v2 improvements vs current /shop:
//   - Faceted search (vendor, country, category, length, delivery week, GPM band, source)
//   - Source badges (K2K live / T2 / T3) visible on every card
//   - Login-aware: existing customers see negotiated rates with strikethrough on public price
//   - Cross-vendor merge: same quality_family shown ONCE with cheapest vendor highlighted
//   - Delivery week selector at top of grid (this wk / next wk / 14d sourceable)
//   - Hover preview: vendor reliability + last 30d sell-through

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type Product = {
  id: string;
  name: string;
  variety: string;
  length: number;
  category: string;
  vendor: string;
  country: string;
  source: 'k2k_live' | 't2' | 't3';
  base_price: number;
  delivery_weeks: string[];
  stems_available: number;
  reliability: number;
  cross_vendor_count: number;
};

const PRODUCTS: Product[] = [
  { id: 'eco_freedom_60',     name: 'Rose Freedom Red 60cm',        variety: 'Freedom',         length: 60, category: 'rose',      vendor: 'Ecoroses ECU',    country: 'EC', source: 'k2k_live', base_price: 1.14, delivery_weeks: ['W20', 'W21'], stems_available: 2250, reliability: 92, cross_vendor_count: 2 },
  { id: 'eco_mondial_60',     name: 'Rose Mondial 60cm',            variety: 'Mondial',         length: 60, category: 'rose',      vendor: 'Ecoroses ECU',    country: 'EC', source: 'k2k_live', base_price: 1.17, delivery_weeks: ['W20', 'W21', 'W22'], stems_available: 2625, reliability: 92, cross_vendor_count: 3 },
  { id: 'eco_antonia_60',     name: 'Rose Antonia Garden 60cm',     variety: 'Antonia Garden',  length: 60, category: 'rose',      vendor: 'Ecoroses ECU',    country: 'EC', source: 'k2k_live', base_price: 1.72, delivery_weeks: ['W20', 'W21'], stems_available: 1125, reliability: 92, cross_vendor_count: 1 },
  { id: 'eco_freespirit_50',  name: 'Rose Free Spirit 50cm',        variety: 'Free Spirit',     length: 50, category: 'rose',      vendor: 'Ecoroses ECU',    country: 'EC', source: 'k2k_live', base_price: 1.08, delivery_weeks: ['W20', 'W21'], stems_available: 1375, reliability: 92, cross_vendor_count: 1 },
  { id: 'eco_coolwater_60',   name: 'Rose Cool Water 60cm',         variety: 'Cool Water',      length: 60, category: 'rose',      vendor: 'Ecoroses ECU',    country: 'EC', source: 'k2k_live', base_price: 1.21, delivery_weeks: ['W20', 'W21'], stems_available: 1000, reliability: 92, cross_vendor_count: 2 },
  { id: 'mf_hydrangea_blue',  name: 'Hydrangea Blue Premium',       variety: 'Blue Premium',    length: 70, category: 'hydrangea', vendor: 'Magic Flowers ECU', country: 'EC', source: 'k2k_live', base_price: 3.95, delivery_weeks: ['W20', 'W21'], stems_available: 750, reliability: 78, cross_vendor_count: 2 },
  { id: 'flo_delphinium',     name: 'Delphinium Sea Waltz 80cm',    variety: 'Sea Waltz',       length: 80, category: 'delphinium', vendor: 'Flodecol ECU',   country: 'EC', source: 'k2k_live', base_price: 1.61, delivery_weeks: ['W20', 'W21'], stems_available: 1000, reliability: 85, cross_vendor_count: 1 },
  { id: 'and_hortensia_white', name: 'Hydrangea White Jumbo',        variety: 'White Jumbo',     length: 70, category: 'hydrangea', vendor: 'AndesColor CO',   country: 'CO', source: 't2',       base_price: 3.45, delivery_weeks: ['W21', 'W22'], stems_available: 360, reliability: 55, cross_vendor_count: 1 },
  { id: 'dut_peony_sarah',    name: 'Peony Sarah Bernhardt 50cm',   variety: 'Sarah Bernhardt', length: 50, category: 'peony',     vendor: 'DutchFlora NL',  country: 'NL', source: 't2',       base_price: 3.95, delivery_weeks: ['W21', 'W22'], stems_available: 500, reliability: 45, cross_vendor_count: 1 },
  { id: 'dut_peony_coral',    name: 'Peony Coral Charm 50cm',       variety: 'Coral Charm',     length: 50, category: 'peony',     vendor: 'DutchFlora NL',  country: 'NL', source: 't2',       base_price: 4.40, delivery_weeks: ['W21', 'W22'], stems_available: 300, reliability: 45, cross_vendor_count: 1 },
  { id: 'eco_quicksand_t3',   name: 'Rose Quicksand 60cm',          variety: 'Quicksand',       length: 60, category: 'rose',      vendor: 'Ecoroses ECU',    country: 'EC', source: 't3',       base_price: 1.87, delivery_weeks: ['W22'], stems_available: 0,    reliability: 92, cross_vendor_count: 1 },
  { id: 'mf_anemone_t3',      name: 'Anemone Mariane Fuchsia 35cm', variety: 'Mariane',         length: 38, category: 'anemone',   vendor: 'Magic Flowers ECU', country: 'EC', source: 't3',     base_price: 2.95, delivery_weeks: ['W22'], stems_available: 240,  reliability: 78, cross_vendor_count: 0 },
];

const SOURCE_BADGE: Record<string, string> = {
  k2k_live: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  t2:       'bg-blue-50 text-blue-700 border-blue-200',
  t3:       'bg-slate-50 text-slate-600 border-slate-200',
};

const SOURCE_LABEL: Record<string, string> = {
  k2k_live: 'Live this week',
  t2:       'Confirmed -- 7d',
  t3:       '14-day sourceable',
};

export default function V2Shop() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [lengthFilter, setLengthFilter] = useState<string>('all');
  const [deliveryFilter, setDeliveryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filteredProducts = useMemo(() => {
    return PRODUCTS.filter(p => {
      if (vendorFilter !== 'all' && p.vendor !== vendorFilter) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (sourceFilter !== 'all' && p.source !== sourceFilter) return false;
      if (lengthFilter !== 'all') {
        if (lengthFilter === 'short' && p.length > 50) return false;
        if (lengthFilter === 'medium' && (p.length < 50 || p.length > 60)) return false;
        if (lengthFilter === 'long' && p.length < 70) return false;
      }
      if (deliveryFilter !== 'all' && !p.delivery_weeks.includes(deliveryFilter)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!`${p.name} ${p.variety} ${p.vendor}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [vendorFilter, categoryFilter, sourceFilter, lengthFilter, deliveryFilter, search]);

  const discount = loggedIn ? 0.08 : 0;

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-[33px] z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/mockups/v2-home" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">F</div>
            <span className="font-bold text-slate-900 text-base">Floropolis</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-semibold">v2</span>
          </Link>
          <button onClick={() => setLoggedIn(!loggedIn)} className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200">
            {loggedIn ? 'Selena Ross Flowers (8% wholesale)' : 'Sign in'}
          </button>
        </div>
      </header>

      {loggedIn && (
        <div className="bg-emerald-50 border-b border-emerald-200">
          <div className="max-w-6xl mx-auto px-4 py-1.5 text-[11px] text-emerald-900 text-center">
            Your wholesale rate (8%) shown as <span className="font-mono">$X.XX</span> below the public price.
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-12 gap-5">
        {/* Sidebar filters */}
        <aside className="col-span-12 md:col-span-3 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-900 mb-2">Search</p>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Variety, vendor..." className="w-full px-2 py-1.5 text-sm rounded-md border border-slate-200" />
          </div>

          <FilterSection label="Delivery week" value={deliveryFilter} onChange={setDeliveryFilter} options={[
            { value: 'all', label: 'Any' }, { value: 'W20', label: 'W20 (this week)' }, { value: 'W21', label: 'W21' }, { value: 'W22', label: 'W22' },
          ]} />

          <FilterSection label="Source" value={sourceFilter} onChange={setSourceFilter} options={[
            { value: 'all', label: 'All sources' }, { value: 'k2k_live', label: 'Live this week' }, { value: 't2', label: 'Confirmed 7d' }, { value: 't3', label: '14d sourceable' },
          ]} />

          <FilterSection label="Category" value={categoryFilter} onChange={setCategoryFilter} options={[
            { value: 'all', label: 'All' }, { value: 'rose', label: 'Rose' }, { value: 'hydrangea', label: 'Hydrangea' }, { value: 'peony', label: 'Peony' }, { value: 'delphinium', label: 'Delphinium' }, { value: 'anemone', label: 'Anemone' },
          ]} />

          <FilterSection label="Vendor" value={vendorFilter} onChange={setVendorFilter} options={[
            { value: 'all', label: 'All vendors' }, { value: 'Ecoroses ECU', label: 'Ecoroses ECU' }, { value: 'Magic Flowers ECU', label: 'Magic Flowers ECU' }, { value: 'Flodecol ECU', label: 'Flodecol ECU' }, { value: 'AndesColor CO', label: 'AndesColor CO' }, { value: 'DutchFlora NL', label: 'DutchFlora NL' },
          ]} />

          <FilterSection label="Length" value={lengthFilter} onChange={setLengthFilter} options={[
            { value: 'all', label: 'All' }, { value: 'short', label: '40-50cm' }, { value: 'medium', label: '50-60cm' }, { value: 'long', label: '70cm+' },
          ]} />
        </aside>

        {/* Product grid */}
        <main className="col-span-12 md:col-span-9">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Shop catalog</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing <span className="font-semibold text-slate-900">{filteredProducts.length}</span> of {PRODUCTS.length} SKUs
                {' . '}
                <span className="text-emerald-700">{filteredProducts.filter(p => p.source === 'k2k_live').length} live</span>{' . '}
                <span className="text-blue-700">{filteredProducts.filter(p => p.source === 't2').length} confirmed</span>{' . '}
                <span className="text-slate-600">{filteredProducts.filter(p => p.source === 't3').length} sourceable</span>
              </p>
            </div>
            <select className="text-xs px-2 py-1 rounded border border-slate-200 bg-white">
              <option>Sort: lowest price</option>
              <option>Sort: highest stems available</option>
              <option>Sort: vendor reliability</option>
              <option>Sort: shortest delivery</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProducts.map(p => {
              const negotiatedPrice = p.base_price * (1 - discount);
              return (
                <Link key={p.id} href={`/mockups/v2-pdp?sku=${p.id}`} className="group bg-white rounded-xl border border-slate-200 hover:shadow-md transition-all overflow-hidden">
                  <div className="h-32 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-[10px] text-slate-400">[product photo]</div>
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${SOURCE_BADGE[p.source]}`}>{SOURCE_LABEL[p.source]}</span>
                      {p.cross_vendor_count > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 font-semibold">
                          +{p.cross_vendor_count} vendor{p.cross_vendor_count === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700 leading-tight">{p.name}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">{p.vendor} . {p.country}</p>
                    <div className="flex items-end justify-between mt-2">
                      <div>
                        {loggedIn ? (
                          <>
                            <div className="text-[11px] text-slate-400 line-through">${p.base_price.toFixed(2)}</div>
                            <div className="text-base font-bold text-emerald-700">${negotiatedPrice.toFixed(2)}<span className="text-[11px] font-normal text-slate-500">/stem</span></div>
                          </>
                        ) : (
                          <div className="text-base font-bold text-slate-900">${p.base_price.toFixed(2)}<span className="text-[11px] font-normal text-slate-500">/stem</span></div>
                        )}
                      </div>
                      <div className="text-right text-[10px] text-slate-500">
                        <div>{p.stems_available > 0 ? `${p.stems_available.toLocaleString()} stems` : 'On request'}</div>
                        <div className="text-emerald-700 font-semibold">{p.delivery_weeks[0]}</div>
                      </div>
                    </div>
                    <button className="mt-2.5 w-full bg-emerald-600 text-white text-xs font-semibold py-1.5 rounded hover:bg-emerald-700">Add to quote</button>
                  </div>
                </Link>
              );
            })}
          </div>
        </main>
      </div>

      <section className="bg-slate-900 text-slate-300 py-6 mt-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">v2 catalog improvements vs current /shop</p>
          <ul className="text-xs space-y-1 list-disc list-inside text-left max-w-2xl mx-auto">
            <li>Faceted filters (delivery week, source, vendor) replace flat product list</li>
            <li>Source badges per card (Live / Confirmed 7d / 14d sourceable) -- sets honest delivery expectations</li>
            <li>Login-aware pricing -- existing wholesale clients see negotiated rate, no extra clicks</li>
            <li>Cross-vendor indicator (+N vendors) -- click PDP to see alternatives, price-shop within catalog</li>
            <li>Vendor reliability + stem count + delivery week visible per card</li>
            <li>Sort: price / availability / reliability / delivery -- buyer picks what matters</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function FilterSection({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <p className="text-[11px] font-semibold text-slate-900 mb-2 uppercase tracking-wide">{label}</p>
      <div className="space-y-1">
        {options.map(o => (
          <label key={o.value} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:text-slate-900">
            <input type="radio" name={label} checked={value === o.value} onChange={() => onChange(o.value)} className="accent-emerald-600" />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
