// Admin Catalog -- Unified List
// v0.1 | 2026-05-15 | Job_PM [V8 SHADOW]
//
// Unified table joining T2 + T3 + K2K live across all vendors. Filters, source badges,
// GPM bands, inline "awaiting Facu" indicators. Row click goes to detail.

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import AdminCatalogNav from '../_components/AdminCatalogNav';
import {
  SKUS, VENDORS,
  getVendor, getQualityFamily, getBoxType, sumAvailability, formatPrice, formatGpm,
} from '../_constants/catalogMock';
import type { SourceTier, GpmBand, Visibility } from '../_constants/catalogMock';
import { PROPOSALS } from '../_constants/catalogQueue';

const SOURCE_LABELS: Record<SourceTier, string> = {
  t2: 'T2',
  t3: 'T3',
  k2k_live: 'K2K live',
};

const SOURCE_BADGE_CLS: Record<SourceTier, string> = {
  t2:       'bg-blue-50 text-blue-700 border-blue-200',
  t3:       'bg-slate-50 text-slate-600 border-slate-200',
  k2k_live: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const GPM_BAND_CLS: Record<GpmBand, string> = {
  green:  'text-emerald-700',
  yellow: 'text-amber-700',
  red:    'text-red-700',
};

const VISIBILITY_BADGE_CLS: Record<Visibility, string> = {
  live:   'bg-emerald-100 text-emerald-800 border border-emerald-200',
  hidden: 'bg-slate-100 text-slate-600 border border-slate-200',
  draft:  'bg-amber-100 text-amber-800 border border-amber-200',
};

export default function AdminCatalogList() {
  const [stateMode, setStateMode] = useState<'today' | 'target'>('today');
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<string>('all');
  const [gpmFilter, setGpmFilter] = useState<string>('all');
  const [missingFilter, setMissingFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  // proposals affecting each SKU (very loose match for badge purposes)
  const proposalsBySkuId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of PROPOSALS) {
      if (p.status !== 'awaiting_facu') continue;
      for (const ex of p.cascade_top_examples) {
        // crude: match by substring of vendor_sku_name
        for (const sku of SKUS) {
          if (ex.sku.includes(sku.vendor_sku_name) || sku.vendor_sku_name.includes(ex.sku.split(' (')[0])) {
            map.set(sku.id, (map.get(sku.id) ?? 0) + 1);
          }
        }
      }
    }
    return map;
  }, []);

  const filteredSkus = useMemo(() => {
    return SKUS.filter(sku => {
      const vendor = getVendor(sku.vendor_id);
      const qf = getQualityFamily(sku.quality_family_id);
      if (!vendor || !qf) return false;

      if (vendorFilter !== 'all' && sku.vendor_id !== vendorFilter) return false;
      if (categoryFilter !== 'all' && qf.category !== categoryFilter) return false;
      if (visibilityFilter !== 'all' && sku.visibility !== visibilityFilter) return false;

      if (sourceFilter !== 'all') {
        const has = sku.sources.some(s => s.tier === sourceFilter && s.valid);
        if (!has) return false;
      }

      if (gpmFilter === 'green' && sku.gpm_band !== 'green') return false;
      if (gpmFilter === 'yellow' && sku.gpm_band !== 'yellow') return false;
      if (gpmFilter === 'red' && sku.gpm_band !== 'red') return false;
      if (gpmFilter === 'no_gpm' && sku.gpm_band !== null) return false;

      if (missingFilter === 'no_cost' && sku.vendor_cost_usd !== null) return false;
      if (missingFilter === 'no_box_dims') {
        const bx = getBoxType(sku.box_type_id);
        if (bx?.verified !== false) return false;
      }
      if (missingFilter === 'awaiting_facu' && !proposalsBySkuId.has(sku.id)) return false;

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const blob = `${sku.vendor_sku_name} ${qf.name} ${vendor.name} ${sku.id}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [vendorFilter, sourceFilter, categoryFilter, visibilityFilter, gpmFilter, missingFilter, search, proposalsBySkuId]);

  const counts = useMemo(() => {
    const liveK2K = SKUS.filter(s => s.sources.some(x => x.tier === 'k2k_live' && x.valid)).length;
    const t2 = SKUS.filter(s => s.sources.some(x => x.tier === 't2' && x.valid)).length;
    const t3 = SKUS.filter(s => s.sources.some(x => x.tier === 't3' && x.valid)).length;
    const live = SKUS.filter(s => s.visibility === 'live').length;
    const hidden = SKUS.filter(s => s.visibility === 'hidden').length;
    const draft = SKUS.filter(s => s.visibility === 'draft').length;
    return { liveK2K, t2, t3, live, hidden, draft };
  }, []);

  return (
    <div>
      <AdminCatalogNav active="list" />

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header + state toggle */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Unified Catalog</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {SKUS.length} SKUs across {VENDORS.length} vendors / 3 countries.
              {' '}
              <span className="text-emerald-700 font-medium">{counts.liveK2K} K2K live</span>{' / '}
              <span className="text-blue-700 font-medium">{counts.t2} T2</span>{' / '}
              <span className="text-slate-600 font-medium">{counts.t3} T3</span>{' . '}
              <span className="text-emerald-700">{counts.live} live</span>{' / '}
              <span className="text-slate-500">{counts.hidden} hidden</span>{' / '}
              <span className="text-amber-700">{counts.draft} draft</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                onClick={() => setStateMode('today')}
                className={
                  stateMode === 'today'
                    ? 'px-3 py-1 text-xs font-semibold rounded-md bg-violet-600 text-white'
                    : 'px-3 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-50'
                }
              >
                Today
              </button>
              <button
                onClick={() => setStateMode('target')}
                className={
                  stateMode === 'target'
                    ? 'px-3 py-1 text-xs font-semibold rounded-md bg-violet-600 text-white'
                    : 'px-3 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-50'
                }
              >
                Target state
              </button>
            </div>
            <p className="text-[11px] text-slate-400 max-w-xs text-right">
              {stateMode === 'today'
                ? "Reality per Rose's layer plan: gaps visible, ghost still alive"
                : 'Post-ghost target: only K2K live + DB T2/T3, multi-country active'}
            </p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Search</label>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="SKU, name, variety..."
                className="w-full px-2 py-1.5 text-sm rounded-md border border-slate-200 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <Select label="Vendor" value={vendorFilter} onChange={setVendorFilter} options={[
              { value: 'all', label: 'All vendors' },
              ...VENDORS.map(v => ({ value: v.id, label: v.name })),
            ]} />
            <Select label="Source" value={sourceFilter} onChange={setSourceFilter} options={[
              { value: 'all',     label: 'All sources' },
              { value: 'k2k_live', label: 'K2K live' },
              { value: 't2',      label: 'T2 (commitments)' },
              { value: 't3',      label: 'T3 (sourceable)' },
            ]} />
            <Select label="Category" value={categoryFilter} onChange={setCategoryFilter} options={[
              { value: 'all',         label: 'All' },
              { value: 'rose',        label: 'Rose' },
              { value: 'hydrangea',   label: 'Hydrangea' },
              { value: 'peony',       label: 'Peony' },
              { value: 'ranunculus',  label: 'Ranunculus' },
              { value: 'delphinium',  label: 'Delphinium' },
              { value: 'anemone',     label: 'Anemone' },
              { value: 'gypsophila',  label: 'Gypsophila' },
            ]} />
            <Select label="Visibility" value={visibilityFilter} onChange={setVisibilityFilter} options={[
              { value: 'all',    label: 'All' },
              { value: 'live',   label: 'Live' },
              { value: 'hidden', label: 'Hidden' },
              { value: 'draft',  label: 'Draft' },
            ]} />
            <Select label="GPM band" value={gpmFilter} onChange={setGpmFilter} options={[
              { value: 'all',    label: 'All' },
              { value: 'green',  label: 'Green (>= 33%)' },
              { value: 'yellow', label: 'Yellow (28-33%)' },
              { value: 'red',    label: 'Red (< 28%)' },
              { value: 'no_gpm', label: 'No GPM (missing cost)' },
            ]} />
            <Select label="Flags" value={missingFilter} onChange={setMissingFilter} options={[
              { value: 'all',           label: 'All' },
              { value: 'no_cost',       label: 'Missing cost' },
              { value: 'no_box_dims',   label: 'Unverified box dims' },
              { value: 'awaiting_facu', label: 'Awaiting Facu' },
            ]} />
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-900">{filteredSkus.length}</span> of {SKUS.length} SKUs
            </p>
            <div className="flex gap-2">
              <button className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700">
                Bulk: override price
              </button>
              <button className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700">
                Bulk: change vendor
              </button>
              <button className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700">
                Bulk: add to campaign
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2.5">SKU</th>
                  <th className="px-3 py-2.5">Quality Family</th>
                  <th className="px-3 py-2.5">Vendor</th>
                  <th className="px-3 py-2.5">Box</th>
                  <th className="px-3 py-2.5 text-right">Cost</th>
                  <th className="px-3 py-2.5 text-right">Delivery</th>
                  <th className="px-3 py-2.5 text-right">Price</th>
                  <th className="px-3 py-2.5 text-right">GPM</th>
                  <th className="px-3 py-2.5">Sources</th>
                  <th className="px-3 py-2.5 text-right">Avail</th>
                  <th className="px-3 py-2.5">Visibility</th>
                  <th className="px-3 py-2.5">Flags</th>
                </tr>
              </thead>
              <tbody>
                {filteredSkus.map(sku => {
                  const vendor = getVendor(sku.vendor_id);
                  const qf = getQualityFamily(sku.quality_family_id);
                  const box = getBoxType(sku.box_type_id);
                  const proposalCount = proposalsBySkuId.get(sku.id) ?? 0;
                  if (!vendor || !qf || !box) return null;
                  const avail = sumAvailability(sku);

                  return (
                    <tr key={sku.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 align-top">
                        <Link href={`/mockups/admin-catalog/${sku.id}`} className="font-mono text-[11px] text-violet-700 hover:underline">
                          {sku.id}
                        </Link>
                        <div className="text-[11px] text-slate-500 mt-0.5 max-w-[200px] truncate" title={sku.vendor_sku_name}>
                          {sku.vendor_sku_name}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="text-slate-900 font-medium">{qf.name}</div>
                        <div className="text-[11px] text-slate-500">{qf.category} . {qf.variety} . {qf.length_cm}cm . {qf.unit}</div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="text-slate-700">{vendor.name}</div>
                        <div className="text-[11px] text-slate-500">{vendor.country} . {vendor.origin_port}</div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="text-slate-700">{box.code}</div>
                        <div className="text-[11px] text-slate-500">
                          {box.verified ? 'verified' : <span className="text-amber-700">unverified</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top text-right">
                        {sku.vendor_cost_usd === null ? (
                          <span className="text-amber-700 text-xs">missing</span>
                        ) : (
                          <>
                            <div className="text-slate-900">{formatPrice(sku.vendor_cost_usd)}</div>
                            {sku.cost_status !== 'verified' && (
                              <div className="text-[10px] text-amber-700 mt-0.5">{sku.cost_status.replace(/_/g, ' ')}</div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top text-right text-slate-700">{formatPrice(sku.delivery_per_stem)}</td>
                      <td className="px-3 py-2.5 align-top text-right">
                        <div className="text-slate-900 font-semibold">{formatPrice(sku.calculated_price_per_stem)}</div>
                      </td>
                      <td className="px-3 py-2.5 align-top text-right">
                        {sku.gpm_band ? (
                          <span className={`font-semibold ${GPM_BAND_CLS[sku.gpm_band]}`}>{formatGpm(sku.gpm)}</span>
                        ) : <span className="text-slate-400 text-xs">--</span>}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex flex-wrap gap-1">
                          {sku.sources.filter(s => s.valid).map(s => (
                            <span key={s.tier} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${SOURCE_BADGE_CLS[s.tier]}`}>
                              {SOURCE_LABELS[s.tier]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top text-right text-slate-700">
                        {avail.toLocaleString()}
                        <div className="text-[10px] text-slate-400">stems</div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${VISIBILITY_BADGE_CLS[sku.visibility]}`}>
                          {sku.visibility}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex flex-col gap-1">
                          {proposalCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold w-fit">
                              {proposalCount} awaiting Facu
                            </span>
                          )}
                          {sku.cost_status !== 'verified' && (
                            <span className="text-[10px] text-amber-700">cost {sku.cost_status.replace(/_/g, ' ')}</span>
                          )}
                          {!box.verified && (
                            <span className="text-[10px] text-amber-700">box dims unverified</span>
                          )}
                          {sku.active_override_id && (
                            <span className="text-[10px] text-violet-700">override active</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredSkus.length === 0 && (
              <div className="px-3 py-12 text-center text-sm text-slate-500">
                No SKUs match the current filters. Clear filters to see all {SKUS.length} rows.
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
          <span>Sources:</span>
          <span className="inline-flex items-center gap-1"><span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-emerald-50 text-emerald-700 border-emerald-200">K2K live</span> vendor uploaded</span>
          <span className="inline-flex items-center gap-1"><span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-blue-50 text-blue-700 border-blue-200">T2</span> commitment</span>
          <span className="inline-flex items-center gap-1"><span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-50 text-slate-600 border-slate-200">T3</span> sourceable, 14d</span>
          <span className="ml-2">GPM: <span className="text-emerald-700 font-semibold">green &gt;= 33%</span> . <span className="text-amber-700 font-semibold">yellow 28-33%</span> . <span className="text-red-700 font-semibold">red &lt; 28%</span></span>
        </div>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm rounded-md border border-slate-200 bg-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
