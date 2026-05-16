// Floropolis v2 -- Homepage (multi-path entry)
// v0.1 | 2026-05-16 | Job_PM [V8 SHADOW]
//
// Multi-path entry replacing single-CTA homepage. Three primary paths:
//   1. Browse catalog (high-intent buyers who know what they want)
//   2. Box Builder (low-intent buyers exploring seasonal collections)
//   3. Get a quote (mid-intent, want a human conversation)
//
// Source-aware: shows "Sign in" vs "Welcome back [name]" + negotiated rates indicator.
// Trust signals above fold: vendor count, FedEx-verified delivery, sell-through.
// Brand voice clean, ASCII safe, Emerald-600 primary.

'use client';

import { useState } from 'react';
import Link from 'next/link';

const SEASONAL_COLLECTIONS = [
  { id: 'spring', name: 'Spring Wedding 2026', items: 24, hero_image: null, hero_color: 'from-rose-100 to-amber-50' },
  { id: 'jewel',  name: 'Jewel Tones',         items: 18, hero_image: null, hero_color: 'from-violet-200 to-indigo-100' },
  { id: 'garden', name: 'Garden Romantic',     items: 31, hero_image: null, hero_color: 'from-emerald-100 to-teal-50' },
  { id: 'tropical', name: 'Tropical Statement', items: 15, hero_image: null, hero_color: 'from-orange-100 to-pink-100' },
];

const TRUST_SIGNALS = [
  { label: 'Vendors live now',       value: '5',    sub: '3 Ecuador + 1 Colombia + 1 Holland' },
  { label: 'SKUs available this wk', value: '127',  sub: '63 K2K live + 42 T2 + 22 T3' },
  { label: 'On-time delivery L30d',  value: '98.4%', sub: 'FedEx label-confirmed' },
  { label: 'Active wholesale clients', value: '47', sub: 'Repeat rate 8 of 9 months' },
];

export default function V2Home() {
  const [loggedIn, setLoggedIn] = useState(false);

  return (
    <div>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-[33px] z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/mockups/v2-home" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">F</div>
            <span className="font-bold text-slate-900 text-base">Floropolis</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-semibold">v2 mockup</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/mockups/v2-shop" className="text-sm text-slate-600 hover:text-emerald-700 px-3 py-1.5">Shop</Link>
            <Link href="/mockups/inspiration-builder" className="text-sm text-slate-600 hover:text-emerald-700 px-3 py-1.5">Box Builder</Link>
            <Link href="/mockups/v2-quote" className="text-sm text-slate-600 hover:text-emerald-700 px-3 py-1.5">Get a quote</Link>
            <div className="w-px h-5 bg-slate-200 mx-2"></div>
            <button
              onClick={() => setLoggedIn(!loggedIn)}
              className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
              title="Mockup toggle: simulate logged in state"
            >
              {loggedIn ? 'Welcome back, Selena' : 'Sign in'}
            </button>
          </nav>
        </div>
        {loggedIn && (
          <div className="bg-emerald-50 border-t border-emerald-200">
            <div className="max-w-6xl mx-auto px-4 py-1.5 text-[11px] text-emerald-900 flex items-center justify-between">
              <span><strong>Selena Ross Flowers</strong> -- 8% wholesale rate active on all roses. Your last order: 5 days ago.</span>
              <Link href="/mockups/account-orders" className="text-emerald-700 underline">My orders</Link>
            </div>
          </div>
        )}
      </header>

      {/* HERO -- multi-path entry */}
      <section className="relative bg-gradient-to-br from-emerald-50 via-white to-amber-50 py-16">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-emerald-200 text-emerald-800 text-[11px] font-semibold mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Wholesale flowers from Ecuador, Colombia, and Holland farms
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight tracking-tight mb-4">
            Build your order. <span className="text-emerald-700">Confirm in 2 clicks.</span>
          </h1>
          <p className="text-base md:text-lg text-slate-600 max-w-2xl mx-auto mb-8">
            Three ways to start. Pick the one that fits how you buy today.
          </p>

          {/* Three paths */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            <Link href="/mockups/v2-shop" className="group bg-white rounded-2xl border-2 border-emerald-600 hover:border-emerald-700 hover:shadow-lg transition-all p-6 text-left">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-base">1</div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">Most popular</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Browse the catalog</h3>
              <p className="text-xs text-slate-600 mb-4">127 SKUs available this week. Filter by length, vendor, delivery week. See live K2K prices.</p>
              <span className="text-sm font-semibold text-emerald-700 group-hover:underline">Shop now -&gt;</span>
            </Link>

            <Link href="/mockups/inspiration-builder" className="group bg-white rounded-2xl border border-slate-200 hover:border-violet-400 hover:shadow-lg transition-all p-6 text-left">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center font-bold text-base">2</div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 font-semibold">New florists</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Box Builder</h3>
              <p className="text-xs text-slate-600 mb-4">Pick a palette, drag stems, build a board. We auto-suggest from live availability.</p>
              <span className="text-sm font-semibold text-violet-700 group-hover:underline">Open Builder -&gt;</span>
            </Link>

            <Link href="/mockups/v2-quote" className="group bg-white rounded-2xl border border-slate-200 hover:border-amber-400 hover:shadow-lg transition-all p-6 text-left">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-base">3</div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">Talk to a human</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Get a quote</h3>
              <p className="text-xs text-slate-600 mb-4">Specific event, custom palette, large volume? Tell us. We reply within 1 business day.</p>
              <span className="text-sm font-semibold text-amber-700 group-hover:underline">Request quote -&gt;</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Trust signals strip */}
      <section className="bg-white border-y border-slate-200 py-6">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {TRUST_SIGNALS.map(t => (
              <div key={t.label} className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-slate-900">{t.value}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-0.5">{t.label}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{t.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Seasonal collections */}
      <section className="bg-slate-50 py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Seasonal collections</h2>
              <p className="text-sm text-slate-500 mt-1">Curated by Talin from this week&apos;s live availability. Updated Monday.</p>
            </div>
            <Link href="/mockups/v2-shop?collection=all" className="text-sm font-medium text-emerald-700 hover:underline">See all -&gt;</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SEASONAL_COLLECTIONS.map(c => (
              <Link key={c.id} href={`/mockups/v2-shop?collection=${c.id}`} className="group bg-white rounded-2xl overflow-hidden border border-slate-200 hover:shadow-md transition-all">
                <div className={`h-32 bg-gradient-to-br ${c.hero_color} flex items-center justify-center text-slate-400 text-[10px]`}>
                  [collection hero photo]
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 group-hover:text-emerald-700">{c.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{c.items} curated SKUs</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Login-aware section */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4">
          {loggedIn ? (
            <div className="bg-emerald-600 text-white rounded-2xl p-8 text-center">
              <h2 className="text-2xl font-bold mb-2">Welcome back, Selena</h2>
              <p className="text-emerald-100 mb-5">Reorder your usual mix, or browse what&apos;s new from your favorite vendors.</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Link href="/mockups/account-orders" className="bg-white text-emerald-700 px-5 py-2 rounded-lg font-semibold text-sm hover:bg-emerald-50">Reorder last order</Link>
                <Link href="/mockups/v2-shop?vendor=ecoroses" className="bg-emerald-700 text-white px-5 py-2 rounded-lg font-semibold text-sm hover:bg-emerald-800 border border-emerald-500">Ecoroses new arrivals</Link>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <h2 className="text-xl font-bold text-slate-900 mb-2">Already a wholesale client?</h2>
              <p className="text-sm text-slate-600 mb-4">Sign in to see your negotiated rates and reorder in 2 clicks.</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Link href="/mockups/login" className="bg-emerald-600 text-white px-5 py-2 rounded-lg font-semibold text-sm hover:bg-emerald-700">Sign in</Link>
                <Link href="/mockups/signup" className="bg-white text-emerald-700 border border-emerald-300 px-5 py-2 rounded-lg font-semibold text-sm hover:bg-emerald-50">Create account</Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* v2 vision note */}
      <section className="bg-slate-900 text-slate-300 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">v2 vision -- what changed vs current homepage</p>
          <ul className="text-xs space-y-1 list-disc list-inside text-left max-w-2xl mx-auto">
            <li>Multi-path entry above fold (Browse / Box Builder / Quote) -- segments by intent</li>
            <li>Trust signals strip with NUMBERS (vendor count, delivery rate, active clients) -- specific not generic</li>
            <li>Login-aware: existing clients see negotiated rates banner + reorder CTA in hero</li>
            <li>Seasonal collections from Talin curated weekly, not static</li>
            <li>Brand voice clean: no &quot;farm-direct&quot;, no &quot;stunning&quot;, ASCII-safe throughout</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
