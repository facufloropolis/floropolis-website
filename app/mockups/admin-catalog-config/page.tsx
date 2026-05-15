// Admin Catalog -- Config (Inputs)
// v0.1 | 2026-05-15 | Job_PM [V8 SHADOW]
//
// Three tabs: Box types per vendor, Shipping config per country/port, GPM targets.
// Each item has Proposed / Awaiting Facu / Approved states with cascade impact preview.

'use client';

import { useState } from 'react';
import AdminCatalogNav from '../_components/AdminCatalogNav';
import {
  BOX_TYPES, SHIPPING_CONFIGS, VENDORS, GPM_DEFAULT, GPM_TARGET_FLOOR, getVendor,
} from '../_constants/catalogMock';
import { PROPOSALS } from '../_constants/catalogQueue';

type Tab = 'boxes' | 'shipping' | 'gpm';

export default function AdminCatalogConfig() {
  const [tab, setTab] = useState<Tab>('boxes');

  return (
    <div>
      <AdminCatalogNav active="config" />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-900">Catalog Config</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Inputs to the pricing engine. Any edit goes through propose -&gt; warnings -&gt; Facu approves -&gt; live.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-slate-200">
          {(['boxes', 'shipping', 'gpm'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                tab === t
                  ? 'px-4 py-2 text-sm font-semibold text-violet-700 border-b-2 border-violet-600 -mb-px'
                  : 'px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700'
              }
            >
              {t === 'boxes' ? 'Box types' : t === 'shipping' ? 'Shipping (per country/port)' : 'GPM targets'}
            </button>
          ))}
        </div>

        {tab === 'boxes' && <BoxTypesTab />}
        {tab === 'shipping' && <ShippingTab />}
        {tab === 'gpm' && <GpmTab />}
      </div>
    </div>
  );
}

// ============================================================================
// BOX TYPES
// ============================================================================

function BoxTypesTab() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {BOX_TYPES.length} box types across {VENDORS.length} vendors.
          {' '}
          <span className="text-emerald-700">{BOX_TYPES.filter(b => b.verified).length} verified</span>{' / '}
          <span className="text-amber-700">{BOX_TYPES.filter(b => !b.verified).length} unverified</span>
        </p>
        <button className="text-xs px-3 py-1.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 font-medium">
          + Propose new box type
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2 text-right">L (cm)</th>
              <th className="px-3 py-2 text-right">W (cm)</th>
              <th className="px-3 py-2 text-right">H (cm)</th>
              <th className="px-3 py-2 text-right">Dim kg</th>
              <th className="px-3 py-2 text-right">Max stems</th>
              <th className="px-3 py-2 text-right">Box cost</th>
              <th className="px-3 py-2">Verification</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {BOX_TYPES.map(b => {
              const vendor = getVendor(b.vendor_id);
              return (
                <tr key={b.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-3 py-2 font-mono text-xs text-slate-900">{b.code}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">{vendor?.name}</td>
                  <td className="px-3 py-2 text-xs text-right text-slate-700">{b.dims_cm.L}</td>
                  <td className="px-3 py-2 text-xs text-right text-slate-700">{b.dims_cm.W}</td>
                  <td className="px-3 py-2 text-xs text-right text-slate-700">{b.dims_cm.H}</td>
                  <td className="px-3 py-2 text-xs text-right text-slate-900 font-medium">{b.dim_weight_kg.toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs text-right text-slate-700">{b.max_stems}</td>
                  <td className="px-3 py-2 text-xs text-right text-slate-700">${b.cost_usd.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    {b.verified
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">Verified</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">Unverified</span>}
                    <div className="text-[10px] text-slate-500 mt-0.5 max-w-[200px] truncate" title={b.source}>{b.source}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button className="text-xs px-2 py-0.5 rounded text-violet-700 hover:bg-violet-50">Propose edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-900">
        <strong>Rule:</strong> Anyone can suggest box dim edits. Facu approves all changes -- they cascade across {BOX_TYPES.length} SKUs.
      </div>
    </div>
  );
}

// ============================================================================
// SHIPPING CONFIG
// ============================================================================

function ShippingTab() {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {SHIPPING_CONFIGS.length} shipping configs.
            {' '}<span className="text-emerald-700">{SHIPPING_CONFIGS.filter(s => s.status === 'approved').length} approved</span>{' / '}
            <span className="text-orange-700">{SHIPPING_CONFIGS.filter(s => s.status === 'awaiting_facu').length} awaiting Facu</span>
          </p>
          <button className="text-xs px-3 py-1.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 font-medium">
            + Propose new origin/port
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-3 py-2">Origin</th>
                <th className="px-3 py-2">Dest zone</th>
                <th className="px-3 py-2 text-right">$/kg</th>
                <th className="px-3 py-2 text-right">Fuel</th>
                <th className="px-3 py-2 text-right">Dim divisor</th>
                <th className="px-3 py-2 text-right">Customs / box</th>
                <th className="px-3 py-2">REL_NUMBER</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {SHIPPING_CONFIGS.map(s => (
                <tr key={s.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-3 py-2 text-xs">
                    <div className="font-medium text-slate-900">{s.origin_country} / {s.origin_port}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-700">{s.dest_zone}</td>
                  <td className="px-3 py-2 text-xs text-right text-slate-900 font-medium">${s.base_rate_per_kg.toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs text-right text-slate-700">x {s.fuel_surcharge_mult.toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs text-right text-slate-700">{s.dim_divisor}</td>
                  <td className="px-3 py-2 text-xs text-right text-slate-700">${s.customs_fee_per_box.toFixed(2)}</td>
                  <td className="px-3 py-2 text-[11px] font-mono text-slate-600">{s.rel_number}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={s.status} />
                    {s.proposed_by && (
                      <div className="text-[10px] text-slate-500 mt-0.5">by {s.proposed_by} . {s.proposed_at}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button className="text-xs px-2 py-0.5 rounded text-violet-700 hover:bg-violet-50">Propose edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-900">
          <strong>Multi-country lock:</strong> Each origin port -&gt; dest zone has its own formula inputs. FedEx fuel surcharge updates are global and cascade across all SKUs from that origin.
        </div>
      </div>

      {/* Pending shipping proposals -- live preview from queue */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-orange-900 mb-2">Pending shipping proposals affecting cascade</p>
        <div className="space-y-2">
          {PROPOSALS.filter(p => p.type === 'shipping_config' && p.status === 'awaiting_facu').map(p => (
            <div key={p.id} className="bg-white rounded-md p-3 border border-orange-200">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-semibold text-slate-900">{p.scope}</span>
                <span className="text-[10px] text-orange-700">{p.cascade_impact_skus} SKUs</span>
              </div>
              <div className="text-[11px] text-slate-600 mb-1.5">
                <span className="text-slate-500">Current:</span> {p.current_value}
              </div>
              <div className="text-[11px] text-slate-600 mb-2">
                <span className="text-slate-500">Proposed:</span> {p.proposed_value}
              </div>
              {p.warnings.map((w, i) => (
                <div key={i} className={
                  'text-[11px] mt-0.5 ' +
                  (w.severity === 'critical' ? 'text-red-700' : w.severity === 'warn' ? 'text-amber-700' : 'text-slate-500')
                }>
                  {w.severity === 'critical' ? '!! ' : w.severity === 'warn' ? '! ' : '. '}{w.text}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// GPM TARGETS
// ============================================================================

function GpmTab() {
  const overrides: { id: string; scope_type: 'category' | 'vendor'; scope_label: string; pct: number; status: string; warning?: string }[] = [
    { id: 'gpm_001', scope_type: 'category', scope_label: 'Rose (premium varieties)', pct: 0.35, status: 'awaiting_facu', warning: '7 SKUs would drop below 28% floor' },
    { id: 'gpm_002', scope_type: 'vendor',   scope_label: 'DutchFlora NL (onboarding intro)', pct: 0.30, status: 'awaiting_facu', warning: 'Vendor reliability 45/100' },
    { id: 'gpm_003', scope_type: 'category', scope_label: 'Gypsophila (weight-based)', pct: 0.33, status: 'approved' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-xs font-semibold text-slate-900">Default GPM target</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Applied to all SKUs unless an override is active for category or vendor</p>
          </div>
          <button className="text-xs px-3 py-1.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 font-medium">
            Propose change
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <div className="text-[11px] text-emerald-700 uppercase tracking-wide">Default GPM</div>
            <div className="text-2xl font-bold text-emerald-900 mt-1">{(GPM_DEFAULT * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-emerald-700 mt-0.5">Green band threshold</div>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <div className="text-[11px] text-amber-700 uppercase tracking-wide">Floor</div>
            <div className="text-2xl font-bold text-amber-900 mt-1">{(GPM_TARGET_FLOOR * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-amber-700 mt-0.5">Yellow band -- warn but allow</div>
          </div>
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <div className="text-[11px] text-red-700 uppercase tracking-wide">Below floor</div>
            <div className="text-2xl font-bold text-red-900 mt-1">&lt; {(GPM_TARGET_FLOOR * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-red-700 mt-0.5">Red band -- requires Facu sign-off</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <p className="text-xs font-semibold text-slate-900">GPM overrides per scope</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-3 py-2">Scope</th>
              <th className="px-3 py-2">Target GPM</th>
              <th className="px-3 py-2">Warning</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {overrides.map(o => (
              <tr key={o.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-3 py-2 text-xs">
                  <span className="text-[10px] uppercase font-semibold text-slate-500">{o.scope_type}</span>{' '}
                  <span className="text-slate-900">{o.scope_label}</span>
                </td>
                <td className="px-3 py-2 text-xs font-medium text-slate-900">{(o.pct * 100).toFixed(0)}%</td>
                <td className="px-3 py-2 text-xs text-amber-700">{o.warning ?? '--'}</td>
                <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
                <td className="px-3 py-2 text-right">
                  <button className="text-xs px-2 py-0.5 rounded text-violet-700 hover:bg-violet-50">Propose edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// SHARED
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'approved'      ? 'bg-emerald-100 text-emerald-800'
  : status === 'awaiting_facu' ? 'bg-orange-100 text-orange-800'
  : status === 'rejected'      ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-600';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${cls}`}>{status.replace(/_/g, ' ')}</span>;
}
