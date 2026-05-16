// Floropolis v2 -- PDP (Product Detail Page)
// v0.1 | 2026-05-16 | Job_PM [V8 SHADOW]
//
// v2 improvements vs current PDP:
//   - Vendor transparency block (farm name, country, reliability score, last 30d sell-through)
//   - Delivery week selector at top (this wk / next / 14d)
//   - Cross-vendor offers (same quality_family from N other vendors with price + reliability)
//   - Related products from same quality_family or palette
//   - Source-aware availability per week (live K2K vs T2 commitment vs T3 sourceable)
//   - Login-aware pricing
//   - Trust block (real GA4 sell-through numbers, not fake reviews)

'use client';

import { useState } from 'react';
import Link from 'next/link';

const PRODUCT = {
  id: 'eco_freedom_60',
  name: 'Rose Freedom Red 60cm',
  variety: 'Freedom',
  length: 60,
  category: 'rose',
  primary_vendor: { name: 'Ecoroses ECU', country: 'EC', port: 'UIO', reliability: 92, sell_through_30d: 8240 },
  source: 'k2k_live',
  base_price: 1.14,
  cost_breakdown: { vendor_cost: 0.46, delivery: 0.46, margin: 0.22, gpm: 19.3 },
  stems_per_box: 125,
  box_type: 'QB (80x30x17 cm, 6.8 kg dim)',
  delivery_weeks: [
    { week: 'W20', label: 'This week (May 18-24)', stems: 1250, source: 'k2k_live' },
    { week: 'W21', label: 'Next week (May 25-31)', stems: 1000, source: 'k2k_live' },
    { week: 'W22', label: 'May 2-8',               stems: 0,    source: 't3', note: '14d sourceable on request' },
  ],
  cross_vendor: [
    { vendor: 'Flodecol ECU',     country: 'EC', price: 1.10, reliability: 85, stems: 1400, note: '4% cheaper, 7pt lower reliability' },
    { vendor: 'AndesColor CO',    country: 'CO', price: 1.30, reliability: 55, stems: 240,  note: 'Onboarding -- limited supply' },
  ],
  related: [
    { id: 'eco_mondial_60',     name: 'Rose Mondial 60cm',     price: 1.17, source: 'k2k_live' },
    { id: 'eco_antonia_60',     name: 'Rose Antonia Garden 60cm', price: 1.72, source: 'k2k_live' },
    { id: 'eco_freespirit_50',  name: 'Rose Free Spirit 50cm',  price: 1.08, source: 'k2k_live' },
    { id: 'eco_coolwater_60',   name: 'Rose Cool Water 60cm',   price: 1.21, source: 'k2k_live' },
  ],
};

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  k2k_live: { label: 'Live this week', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  t2:       { label: 'Confirmed 7d',   cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  t3:       { label: '14d sourceable', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
};

export default function V2PDP() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState('W20');
  const [boxes, setBoxes] = useState(1);

  const discount = loggedIn ? 0.08 : 0;
  const priceShown = PRODUCT.base_price * (1 - discount);
  const totalStems = boxes * PRODUCT.stems_per_box;
  const totalPrice = totalStems * priceShown;

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

      {/* Breadcrumb */}
      <div className="max-w-6xl mx-auto px-4 py-2 text-xs text-slate-500">
        <Link href="/mockups/v2-home" className="hover:underline">Home</Link>{' / '}
        <Link href="/mockups/v2-shop" className="hover:underline">Shop</Link>{' / '}
        <span>Roses</span>{' / '}
        <span className="text-slate-700">{PRODUCT.name}</span>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-4 grid grid-cols-12 gap-6">
        {/* Image gallery */}
        <div className="col-span-12 md:col-span-7">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="h-80 bg-gradient-to-br from-rose-100 to-rose-50 flex items-center justify-center text-slate-400 text-sm">[hero photo -- Freedom Red 60cm]</div>
            <div className="p-3 flex gap-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="w-16 h-16 bg-slate-100 rounded border border-slate-200 flex items-center justify-center text-[9px] text-slate-400">photo {i}</div>
              ))}
            </div>
          </div>

          {/* Vendor transparency block */}
          <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">From the farm</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Vendor" value={PRODUCT.primary_vendor.name} sub={`${PRODUCT.primary_vendor.country} . ${PRODUCT.primary_vendor.port}`} />
              <Stat label="Reliability" value={`${PRODUCT.primary_vendor.reliability}/100`} sub="On-time + spec match" />
              <Stat label="Sold last 30d" value={PRODUCT.primary_vendor.sell_through_30d.toLocaleString()} sub="Stems via Floropolis" />
              <Stat label="Box" value={PRODUCT.box_type.split(' ')[0]} sub={PRODUCT.box_type.split('(')[1]?.replace(')', '')} />
            </div>
            <p className="text-xs text-slate-500 mt-3 italic">Ecoroses ECU has supplied Floropolis since 2025. FedEx label dimensions verified March-May 2026. Phase 1 vendor in our reliability tier.</p>
          </div>

          {/* Cross-vendor offers */}
          {PRODUCT.cross_vendor.length > 0 && (
            <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-3">Same flower, other vendors</h2>
              <p className="text-xs text-slate-500 mb-3">We surface alternatives so you can match price and reliability to your need.</p>
              <div className="space-y-2">
                {PRODUCT.cross_vendor.map(cv => (
                  <div key={cv.vendor} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{cv.vendor} <span className="text-xs text-slate-500">. {cv.country}</span></div>
                      <div className="text-[11px] text-slate-500">{cv.note}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold text-slate-900">${cv.price.toFixed(2)}<span className="text-xs font-normal text-slate-500">/stem</span></div>
                      <div className="text-[11px] text-slate-500">Reliability {cv.reliability}/100 . {cv.stems} stems</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related products */}
          <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Often paired with this</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {PRODUCT.related.map(r => (
                <Link key={r.id} href={`/mockups/v2-pdp?sku=${r.id}`} className="group">
                  <div className="h-24 bg-gradient-to-br from-rose-50 to-amber-50 rounded-lg border border-slate-200 mb-1.5"></div>
                  <div className="text-xs font-medium text-slate-900 group-hover:text-emerald-700 leading-tight">{r.name}</div>
                  <div className="text-[11px] text-slate-500">${r.price.toFixed(2)}/stem</div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right: pricing + add to quote */}
        <aside className="col-span-12 md:col-span-5">
          <div className="sticky top-32 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${SOURCE_BADGE[PRODUCT.source].cls}`}>{SOURCE_BADGE[PRODUCT.source].label}</span>
                <span className="text-[10px] text-slate-500">{PRODUCT.primary_vendor.country} . {PRODUCT.primary_vendor.name}</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">{PRODUCT.name}</h1>
              <p className="text-sm text-slate-600 mb-3">{PRODUCT.length}cm . {PRODUCT.stems_per_box} stems per box</p>

              <div className="border-t border-slate-100 pt-3">
                {loggedIn ? (
                  <>
                    <div className="text-sm text-slate-400 line-through">${PRODUCT.base_price.toFixed(2)}/stem (public)</div>
                    <div className="text-3xl font-bold text-emerald-700">${priceShown.toFixed(2)}<span className="text-sm font-normal text-slate-500">/stem</span></div>
                    <div className="text-[11px] text-emerald-700 mt-0.5">Your wholesale rate (8% off public)</div>
                  </>
                ) : (
                  <>
                    <div className="text-3xl font-bold text-slate-900">${PRODUCT.base_price.toFixed(2)}<span className="text-sm font-normal text-slate-500">/stem</span></div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Public price. <Link href="/mockups/login" className="text-emerald-700 underline">Sign in</Link> for your wholesale rate.</div>
                  </>
                )}
              </div>

              {/* Delivery week selector */}
              <div className="border-t border-slate-100 mt-4 pt-4">
                <p className="text-xs font-semibold text-slate-900 mb-2">Pick delivery week</p>
                <div className="space-y-1.5">
                  {PRODUCT.delivery_weeks.map(w => {
                    const stockOK = w.stems > 0;
                    const isSelected = selectedWeek === w.week;
                    return (
                      <button
                        key={w.week}
                        onClick={() => stockOK && setSelectedWeek(w.week)}
                        disabled={!stockOK}
                        className={
                          'w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-colors ' +
                          (isSelected ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300') +
                          (stockOK ? ' cursor-pointer' : ' opacity-60 cursor-not-allowed')
                        }
                      >
                        <div>
                          <div className="text-xs font-semibold text-slate-900">{w.label}</div>
                          <div className="text-[10px] text-slate-500">
                            {stockOK ? `${w.stems.toLocaleString()} stems available` : (w.note ?? 'Out of stock')}
                          </div>
                        </div>
                        {stockOK && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${SOURCE_BADGE[w.source].cls}`}>
                            {SOURCE_BADGE[w.source].label}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quantity (box count) */}
              <div className="border-t border-slate-100 mt-4 pt-4">
                <p className="text-xs font-semibold text-slate-900 mb-2">Quantity (boxes of {PRODUCT.stems_per_box})</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setBoxes(Math.max(1, boxes - 1))} className="w-8 h-8 rounded-md border border-slate-200 bg-white hover:bg-slate-50 font-bold">-</button>
                  <input type="number" value={boxes} onChange={e => setBoxes(Math.max(1, parseInt(e.target.value) || 1))} className="w-16 text-center px-2 py-1.5 rounded-md border border-slate-200 text-sm font-semibold" />
                  <button onClick={() => setBoxes(boxes + 1)} className="w-8 h-8 rounded-md border border-slate-200 bg-white hover:bg-slate-50 font-bold">+</button>
                  <span className="text-xs text-slate-500 ml-2">= {totalStems.toLocaleString()} stems</span>
                </div>
              </div>

              {/* Total */}
              <div className="border-t border-slate-100 mt-4 pt-3 flex items-baseline justify-between">
                <span className="text-xs text-slate-500">Subtotal</span>
                <span className="text-xl font-bold text-slate-900">${totalPrice.toFixed(2)}</span>
              </div>

              <button className="mt-4 w-full bg-emerald-600 text-white text-sm font-bold py-3 rounded-lg hover:bg-emerald-700">
                Add to quote -- {selectedWeek}
              </button>
              <button className="mt-2 w-full bg-white text-slate-700 text-xs py-2 rounded-lg border border-slate-200 hover:bg-slate-50">
                Save for later
              </button>
            </div>

            {/* Trust block */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <p className="text-xs font-semibold text-emerald-900 mb-2">Why this card is trustable</p>
              <ul className="text-xs text-emerald-800 space-y-1">
                <li>. Vendor cost stamped 2026-05-14 via K2K live API</li>
                <li>. FedEx box dimensions verified from 15+ shipping labels</li>
                <li>. {PRODUCT.primary_vendor.sell_through_30d.toLocaleString()} stems sold via Floropolis in last 30 days</li>
                <li>. Cross-vendor alternatives shown above for price comparison</li>
              </ul>
            </div>
          </div>
        </aside>
      </main>

      <section className="bg-slate-900 text-slate-300 py-6 mt-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">v2 PDP improvements vs current</p>
          <ul className="text-xs space-y-1 list-disc list-inside text-left max-w-2xl mx-auto">
            <li>Vendor transparency block: farm name, reliability score, last 30d sell-through (real numbers, not fake reviews)</li>
            <li>Delivery week selector with per-week stock + source -- buyer knows exactly what they get</li>
            <li>Cross-vendor offers section -- same flower from N other vendors with price + reliability tradeoff</li>
            <li>Trust block with verifiable facts (cost stamped date, FedEx label count, sell-through)</li>
            <li>Login-aware pricing with strikethrough on public price</li>
            <li>Cost breakdown transparency available on hover (admin-only in v1)</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
