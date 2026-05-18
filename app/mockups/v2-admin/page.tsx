// Floropolis v2 -- Admin Home (unified shell)
// v0.1 | 2026-05-16 | Job_PM [V8 SHADOW]
//
// THE single command center for Facu + JJ. Replaces 13 fragmented mockup URLs with ONE shell.
//
// v2 improvements vs current 13-screen admin:
//   - Left-nav across all admin domains (Catalog, Orders, Dispatch, Approvals, Proposals, Settings, Health)
//   - Health bar at top showing 6 J.x dimensions live (admin throughput, payment success, etc.)
//   - Cmd+K command palette (jump to SKU, screen, approval, order)
//   - Today panel: what needs your attention RIGHT NOW (orders, approvals, alerts)
//   - Tablet + mobile friendly (Facu on the go)
//   - Existing 13 sub-screens accessible via this shell (no rebuild, just nav)

'use client';

import { useState } from 'react';
import Link from 'next/link';

type DimensionStatus = 'green' | 'yellow' | 'red';

type Dimension = {
  id: string;
  label: string;
  value: string;
  status: DimensionStatus;
  trend: 'up' | 'down' | 'flat';
  target: string;
};

const DIMENSIONS: Dimension[] = [
  { id: 'J.1', label: 'Admin throughput',         value: '6 proposals / wk', status: 'green',  trend: 'up',   target: 'median <48h' },
  { id: 'J.2', label: 'Web Tx reliability',       value: '--',                status: 'yellow', trend: 'flat', target: '>=95%' },
  { id: 'J.3', label: 'Box Builder conv',         value: '--',                status: 'yellow', trend: 'flat', target: '>2x /shop' },
  { id: 'J.4', label: 'Code quality (CI)',        value: '12/12 PRs',          status: 'green',  trend: 'flat', target: 'zero violations' },
  { id: 'J.5', label: 'Brand voice (lint)',       value: '0 violations',       status: 'green',  trend: 'flat', target: 'zero' },
  { id: 'J.6', label: 'Customer self-service',   value: '--',                status: 'yellow', trend: 'flat', target: '>60%' },
];

const TODAY_ITEMS = [
  { type: 'order',     priority: 'P0', label: 'Order #FLO-2841 (Buonasera) -- card declined, retry?',     time: '8 min ago' },
  { type: 'approval',  priority: 'P0', label: 'Shipping config CO -> US-WEST awaiting your approval (5 SKUs)', time: '2h ago' },
  { type: 'dispatch',  priority: 'P1', label: 'Dispatch tomorrow: 3 orders (12 boxes total)',              time: 'today' },
  { type: 'approval',  priority: 'P1', label: 'Discount: Buonasera Events 15% off all roses (margin warn)', time: '1d ago' },
  { type: 'alert',     priority: 'P2', label: 'FedEx fuel surcharge 1.25 -> 1.30 (213 SKUs affected)',   time: '2d ago' },
  { type: 'alert',     priority: 'P2', label: 'Ghost portal auth expired on Ecoroses',                    time: '2d ago' },
];

const RECENT_ACTIVITY = [
  { actor: 'Rose',  action: 'Stamped cost on 4 SKUs (Ecoroses)',           time: '5 min ago' },
  { actor: 'You',   action: 'Approved discount: hydrangea 5% off (expires Jun 30)', time: '1h ago' },
  { actor: 'Job',   action: 'Ingestion adapter parsed 6 WhatsApp offers (AndesColor) -- 2 in mapping queue', time: '3h ago' },
  { actor: 'JJ',    action: 'Confirmed dispatch #FLO-2840 (Sunrise Blooms ATL, 4 boxes)', time: '5h ago' },
  { actor: 'You',   action: 'Approved Buonasera Events as new wholesale account',  time: '1d ago' },
];

const NAV = [
  { id: 'home',      label: 'Today',       icon: '*', url: '/mockups/v2-admin', sub: 'Your inbox' },
  { id: 'catalog',   label: 'Catalog',     icon: 'C', url: '/mockups/admin-catalog', sub: 'SKUs / inventory / pricing' },
  { id: 'orders',    label: 'Orders',      icon: 'O', url: '/mockups/admin-orders', sub: 'Queue / fulfillment' },
  { id: 'dispatch',  label: 'Dispatch',    icon: 'D', url: '/mockups/admin-dispatch', sub: 'FedEx / labels / vendor' },
  { id: 'approvals', label: 'Approvals',   icon: 'A', url: '/mockups/admin-catalog-approval-queue', sub: '8 awaiting you' },
  { id: 'proposals', label: 'Proposals',   icon: 'P', url: '/mockups/admin-catalog-proposals', sub: '15 specs to spawn' },
  { id: 'settings',  label: 'Config',      icon: 'S', url: '/mockups/admin-catalog-config', sub: 'Box / shipping / GPM' },
  { id: 'health',    label: 'Health',      icon: 'H', url: '/mockups/v2-admin#health', sub: 'Dimension health' },
];

const STATUS_CLS: Record<DimensionStatus, string> = {
  green:  'bg-emerald-100 text-emerald-800 border-emerald-300',
  yellow: 'bg-amber-100 text-amber-800 border-amber-300',
  red:    'bg-red-100 text-red-800 border-red-300',
};

const PRIORITY_CLS: Record<string, string> = {
  P0: 'bg-red-100 text-red-800',
  P1: 'bg-amber-100 text-amber-800',
  P2: 'bg-slate-100 text-slate-600',
};

export default function V2Admin() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 sticky top-[33px] z-40">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/mockups" className="flex items-center gap-2">
              <div className="w-7 h-7 bg-violet-600 rounded-md flex items-center justify-center text-white font-bold text-xs">F</div>
              <span className="font-bold text-slate-900 text-sm">Floropolis Admin</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-semibold">v2 unified</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center gap-2 text-slate-600"
            >
              <span>Search</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">Cmd+K</span>
            </button>
            <span className="text-xs text-slate-500">Facu . admin</span>
          </div>
        </div>

        {/* Health bar */}
        <div id="health" className="px-4 py-2 border-t border-slate-100 overflow-x-auto">
          <div className="flex items-center gap-3 min-w-max">
            <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Dimensions</span>
            {DIMENSIONS.map(d => (
              <div key={d.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${STATUS_CLS[d.status]}`}>
                <span className="font-mono text-[10px]">{d.id}</span>
                <span className="font-semibold">{d.label}</span>
                <span className="opacity-80">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Left nav */}
        <nav className="bg-white border-r border-slate-200 w-56 shrink-0 py-3 hidden md:block">
          {NAV.map(n => {
            const isActive = n.id === 'home';
            return (
              <Link
                key={n.id}
                href={n.url}
                className={
                  'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ' +
                  (isActive
                    ? 'bg-violet-50 text-violet-800 border-l-2 border-violet-600 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50 border-l-2 border-transparent')
                }
              >
                <span className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">{n.icon}</span>
                <div className="flex-1 min-w-0">
                  <div>{n.label}</div>
                  <div className="text-[10px] text-slate-400 font-normal">{n.sub}</div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Main content */}
        <main className="flex-1 p-5">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Today</h1>
            <p className="text-sm text-slate-500 mb-5">What needs you, ranked by priority.</p>

            <div className="grid grid-cols-12 gap-4">
              {/* Today list */}
              <section className="col-span-12 lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-900">Needs your attention</h2>
                  <span className="text-xs text-slate-500">{TODAY_ITEMS.length} items</span>
                </div>
                <div className="space-y-1.5">
                  {TODAY_ITEMS.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 border border-slate-100 rounded-lg hover:bg-slate-50">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${PRIORITY_CLS[item.priority]}`}>{item.priority}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-900">{item.label}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{item.time} . type: {item.type}</div>
                      </div>
                      <button className="text-xs px-2.5 py-1 rounded bg-violet-50 text-violet-700 hover:bg-violet-100 font-medium shrink-0">Open</button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Right column: activity + KPIs */}
              <aside className="col-span-12 lg:col-span-4 space-y-4">
                {/* KPIs */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h2 className="text-sm font-bold text-slate-900 mb-3">Today&apos;s numbers</h2>
                  <div className="space-y-2">
                    <KpiRow label="Sessions L24h"        value="38"   change="+27%" up={true} />
                    <KpiRow label="Quotes received"      value="3"    change="2 new" up={true} />
                    <KpiRow label="Orders confirmed"     value="2"    change="$3,840" up={true} />
                    <KpiRow label="Payment success L7d"  value="--"   change="awaiting Stripe" up={false} />
                    <KpiRow label="GPM avg L7d"          value="31.2%" change="-1.8pt vs target" up={false} />
                  </div>
                </div>

                {/* Activity */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h2 className="text-sm font-bold text-slate-900 mb-3">Recent activity</h2>
                  <div className="space-y-2">
                    {RECENT_ACTIVITY.map((a, i) => (
                      <div key={i} className="text-xs">
                        <div className="text-slate-700"><span className="font-semibold">{a.actor}</span> {a.action}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{a.time}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </main>
      </div>

      {/* Command palette modal */}
      {paletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-slate-900/50" onClick={() => setPaletteOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
            <div className="p-3 border-b border-slate-200">
              <input autoFocus placeholder="Jump to SKU, screen, approval, order..." className="w-full px-2 py-1.5 text-sm focus:outline-none" />
            </div>
            <div className="p-2 text-xs text-slate-500">
              <div className="px-3 py-1.5 uppercase tracking-wide text-[10px] font-semibold">Quick actions</div>
              {NAV.map(n => (
                <Link key={n.id} href={n.url} onClick={() => setPaletteOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-md text-sm text-slate-700">
                  <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold">{n.icon}</span>
                  <span>{n.label}</span>
                  <span className="text-[10px] text-slate-400 ml-auto">{n.sub}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <section className="bg-slate-900 text-slate-300 py-6">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">v2 admin improvements vs fragmented 13-screen current</p>
          <ul className="text-xs space-y-1 list-disc list-inside text-left max-w-2xl mx-auto">
            <li>ONE shell at /admin with persistent left-nav across all 8 admin domains</li>
            <li>Health bar at top: 6 J.x dimensions visible always (Pita-measured, click to drill)</li>
            <li>Today panel: P0/P1/P2 items ranked -- what needs you RIGHT NOW</li>
            <li>Cmd+K command palette: jump anywhere in 2 keystrokes (orders, SKUs, approvals)</li>
            <li>Recent activity timeline: who did what, across all agents -- audit trail visible</li>
            <li>Today&apos;s numbers card: sessions, quotes, orders, payments at a glance</li>
            <li>Existing 13 sub-screens accessible via left-nav (no rebuild, just unified shell)</li>
            <li>Tablet + mobile friendly (Facu on the go)</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function KpiRow({ label, value, change, up }: { label: string; value: string; change: string; up: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <div className="text-right">
        <span className="font-semibold text-slate-900">{value}</span>
        <span className={'ml-2 ' + (up ? 'text-emerald-700' : 'text-slate-500')}>{change}</span>
      </div>
    </div>
  );
}
