// Admin Catalog -- Unified List
// v0.2 | 2026-05-20 | Job_PM [V8 SHADOW]
// Changes: margin $/stem column, per-week avail with T-targets, QF parent ID visible,
// actionable flags, top-seller badge, search bar separated, column toggle, sortable headers.

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import AdminCatalogNav from '../_components/AdminCatalogNav';
import {
  SKUS, VENDORS,
  getVendor, getQualityFamily, getBoxType, formatPrice, formatGpm,
} from '../_constants/catalogMock';
import type { SourceTier, GpmBand, Visibility } from '../_constants/catalogMock';
import { PROPOSALS } from '../_constants/catalogQueue';

const SOURCE_LABELS: Record<SourceTier, string> = {
  t2: 'T2',
  t3: 'T3',
  k2k_live: 'K2K',
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

type ColKey = 'vendor' | 'box' | 'cost' | 'delivery' | 'price' | 'gpm' | 'margin' | 'sources' | 'avail' | 'visibility' | 'flags';
type SortDir = 'asc' | 'desc';
type SortCol = 'price' | 'gpm' | 'margin' | 'cost' | 'avail' | null;

const ALL_COLS: { key: ColKey; label: string }[] = [
  { key: 'vendor',     label: 'Vendor' },
  { key: 'box',        label: 'Box' },
  { key: 'cost',       label: 'Cost' },
  { key: 'delivery',   label: 'Delivery' },
  { key: 'price',      label: 'Price' },
  { key: 'gpm',        label: 'GPM %' },
  { key: 'margin',     label: 'Margin $' },
  { key: 'sources',    label: 'Sources' },
  { key: 'avail',      label: 'Availability' },
  { key: 'visibility', label: 'Visibility' },
  { key: 'flags',      label: 'Flags' },
];

const DEFAULT_HIDDEN = new Set<ColKey>(['box', 'delivery', 'sources']);

export default function AdminCatalogList() {
  const [stateMode, setStateMode] = useState<'today' | 'target'>('today');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [gpmFilter, setGpmFilter] = useState('all');
  const [missingFilter, setMissingFilter] = useState('all');
  const [topSellerFilter, setTopSellerFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [hiddenCols, setHiddenCols] = useState<Set<ColKey>>(new Set(DEFAULT_HIDDEN));
  const [showColToggle, setShowColToggle] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function toggleCol(key: ColKey) {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const show = (col: ColKey) => !hiddenCols.has(col);

  const proposalsBySkuId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of PROPOSALS) {
      if (p.status !== 'awaiting_facu') continue;
      for (const ex of p.cascade_top_examples) {
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
    let list = SKUS.filter(sku => {
      const vendor = getVendor(sku.vendor_id);
      const qf = getQualityFamily(sku.quality_family_id);
      if (!vendor || !qf) return false;
      if (vendorFilter !== 'all' && sku.vendor_id !== vendorFilter) return false;
      if (categoryFilter !== 'all' && qf.category !== categoryFilter) return false;
      if (visibilityFilter !== 'all' && sku.visibility !== visibilityFilter) return false;
      if (topSellerFilter === 'yes' && !sku.is_top_seller) return false;
      if (sourceFilter !== 'all') {
        if (!sku.sources.some(s => s.tier === sourceFilter && s.valid)) return false;
      }
      if (gpmFilter === 'green' && sku.gpm_band !== 'green') return false;
      if (gpmFilter === 'yellow' && sku.gpm_band !== 'yellow') return false;
      if (gpmFilter === 'red' && sku.gpm_band !== 'red') return false;
      if (gpmFilter === 'no_gpm' && sku.gpm_band !== null) return false;
      if (missingFilter === 'no_cost' && sku.vendor_cost_usd !== null) return false;
      if (missingFilter === 'no_box_dims') {
        if (getBoxType(sku.box_type_id)?.verified !== false) return false;
      }
      if (missingFilter === 'awaiting_facu' && !proposalsBySkuId.has(sku.id)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const blob = `${sku.vendor_sku_name} ${qf.name} ${vendor.name} ${sku.id} ${sku.quality_family_id}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });

    if (sortCol) {
      list = [...list].sort((a, b) => {
        let va = 0, vb = 0;
        if (sortCol === 'price')  { va = a.calculated_price_per_stem ?? 0; vb = b.calculated_price_per_stem ?? 0; }
        if (sortCol === 'gpm')    { va = a.gpm ?? 0; vb = b.gpm ?? 0; }
        if (sortCol === 'margin') { va = a.margin_per_stem ?? 0; vb = b.margin_per_stem ?? 0; }
        if (sortCol === 'cost')   { va = a.vendor_cost_usd ?? 0; vb = b.vendor_cost_usd ?? 0; }
        if (sortCol === 'avail')  { va = a.availability.reduce((s, x) => s + x.stems, 0); vb = b.availability.reduce((s, x) => s + x.stems, 0); }
        return sortDir === 'asc' ? va - vb : vb - va;
      });
    }
    return list;
  }, [vendorFilter, sourceFilter, categoryFilter, visibilityFilter, gpmFilter, missingFilter, topSellerFilter, search, proposalsBySkuId, sortCol, sortDir]);

  const counts = useMemo(() => ({
    liveK2K: SKUS.filter(s => s.sources.some(x => x.tier === 'k2k_live' && x.valid)).length,
    t2:      SKUS.filter(s => s.sources.some(x => x.tier === 't2' && x.valid)).length,
    t3:      SKUS.filter(s => s.sources.some(x => x.tier === 't3' && x.valid)).length,
    live:    SKUS.filter(s => s.visibility === 'live').length,
    hidden:  SKUS.filter(s => s.visibility === 'hidden').length,
    draft:   SKUS.filter(s => s.visibility === 'draft').length,
  }), []);

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span className="ml-0.5 opacity-30 text-[10px]">&#8597;</span>;
    return <span className="ml-0.5 text-violet-600 text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function clearAll() {
    setVendorFilter('all'); setSourceFilter('all'); setCategoryFilter('all');
    setVisibilityFilter('all'); setGpmFilter('all'); setMissingFilter('all');
    setTopSellerFilter('all'); setSearch('');
  }

  const activeFilters = [vendorFilter, sourceFilter, categoryFilter, visibilityFilter, gpmFilter, missingFilter, topSellerFilter].filter(v => v !== 'all').length + (search.trim() ? 1 : 0);

  return (
    <div>
      <AdminCatalogNav active="list" />

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Unified Catalog</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {SKUS.length} SKUs &middot; {VENDORS.length} vendors &middot; 3 countries &nbsp;|&nbsp;
              <span className="text-emerald-700 font-medium">{counts.liveK2K} K2K</span>
              {' / '}
              <span className="text-blue-700 font-medium">{counts.t2} T2</span>
              {' / '}
              <span className="text-slate-600 font-medium">{counts.t3} T3</span>
              {' &nbsp;&middot;&nbsp; '}
              <span className="text-emerald-700">{counts.live} live</span>
              {' / '}
              <span className="text-slate-500">{counts.hidden} hidden</span>
              {' / '}
              <span className="text-amber-700">{counts.draft} draft</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button onClick={() => setStateMode('today')} className={stateMode === 'today' ? 'px-3 py-1 text-xs font-semibold rounded-md bg-violet-600 text-white' : 'px-3 py-1 text-xs rounded-md text-slate-600 hover:bg-slate-50'}>
                Today
              </button>
              <button onClick={() => setStateMode('target')} className={stateMode === 'target' ? 'px-3 py-1 text-xs font-semibold rounded-md bg-violet-600 text-white' : 'px-3 py-1 text-xs rounded-md text-slate-600 hover:bg-slate-50'}>
                Target state
              </button>
            </div>
            <p className="text-[11px] text-slate-400 max-w-xs text-right">
              {stateMode === 'today' ? "Reality per Rose's layer plan: gaps visible, ghost still alive" : 'Post-ghost: K2K live + DB T2/T3 only, multi-country active'}
            </p>
          </div>
        </div>

        {/* Search bar — visually distinct from categorical filters */}
        <div className="mb-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search variety, vendor, SKU ID, quality family ID..."
              className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border border-slate-300 bg-white shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 placeholder:text-slate-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm">&#x2715;</button>
            )}
          </div>
        </div>

        {/* Categorical filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Select label="Vendor" value={vendorFilter} onChange={setVendorFilter} options={[
              { value: 'all', label: 'All vendors' },
              ...VENDORS.map(v => ({ value: v.id, label: v.name })),
            ]} />
            <Select label="Source tier" value={sourceFilter} onChange={setSourceFilter} options={[
              { value: 'all',       label: 'All sources' },
              { value: 'k2k_live',  label: 'K2K live' },
              { value: 't2',        label: 'T2 — commitments' },
              { value: 't3',        label: 'T3 — sourceable 14d' },
            ]} />
            <Select label="Category" value={categoryFilter} onChange={setCategoryFilter} options={[
              { value: 'all',        label: 'All' },
              { value: 'rose',       label: 'Rose' },
              { value: 'hydrangea',  label: 'Hydrangea' },
              { value: 'peony',      label: 'Peony' },
              { value: 'ranunculus', label: 'Ranunculus' },
              { value: 'delphinium', label: 'Delphinium' },
              { value: 'anemone',    label: 'Anemone' },
              { value: 'gypsophila', label: 'Gypsophila' },
            ]} />
            <Select label="Visibility" value={visibilityFilter} onChange={setVisibilityFilter} options={[
              { value: 'all',    label: 'All' },
              { value: 'live',   label: 'Live' },
              { value: 'hidden', label: 'Hidden' },
              { value: 'draft',  label: 'Draft' },
            ]} />
            <Select label="GPM band" value={gpmFilter} onChange={setGpmFilter} options={[
              { value: 'all',    label: 'All' },
              { value: 'green',  label: 'Green >=33%' },
              { value: 'yellow', label: 'Yellow 28-33%' },
              { value: 'red',    label: 'Red <28%' },
              { value: 'no_gpm', label: 'No GPM' },
            ]} />
            <Select label="Flags" value={missingFilter} onChange={setMissingFilter} options={[
              { value: 'all',           label: 'All' },
              { value: 'no_cost',       label: 'Missing cost' },
              { value: 'no_box_dims',   label: 'Unverified box' },
              { value: 'awaiting_facu', label: 'Awaiting Facu' },
            ]} />
            <Select label="Top sellers" value={topSellerFilter} onChange={setTopSellerFilter} options={[
              { value: 'all', label: 'All' },
              { value: 'yes', label: 'Top sellers' },
            ]} />
          </div>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <p className="text-xs text-slate-500">
                Showing <span className="font-semibold text-slate-900">{filteredSkus.length}</span> of {SKUS.length} SKUs
              </p>
              {activeFilters > 0 && (
                <button onClick={clearAll} className="text-xs text-violet-600 hover:underline">
                  Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
                </button>
              )}
            </div>
            <div className="flex gap-2 relative">
              {/* Column visibility toggle */}
              <div className="relative">
                <button
                  onClick={() => setShowColToggle(v => !v)}
                  className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" /></svg>
                  Columns
                  <span className="text-[10px] text-slate-400">{ALL_COLS.length - hiddenCols.size}/{ALL_COLS.length}</span>
                </button>
                {showColToggle && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-3 z-20 min-w-[160px]">
                    {ALL_COLS.map(c => (
                      <label key={c.key} className="flex items-center gap-2 py-1 cursor-pointer text-xs text-slate-700 hover:text-violet-700 select-none">
                        <input type="checkbox" checked={!hiddenCols.has(c.key)} onChange={() => toggleCol(c.key)} className="accent-violet-600 w-3 h-3" />
                        {c.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <button className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700">Bulk: override price</button>
              <button className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700">Bulk: change vendor</button>
              <button className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700">Bulk: add to campaign</button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2.5 min-w-[200px]">SKU / Variety</th>
                  <th className="px-3 py-2.5 min-w-[180px]">Quality Family</th>
                  {show('vendor')     && <th className="px-3 py-2.5">Vendor</th>}
                  {show('box')        && <th className="px-3 py-2.5">Box</th>}
                  {show('cost')       && <th className="px-3 py-2.5 text-right cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('cost')}>Cost <SortIcon col="cost" /></th>}
                  {show('delivery')   && <th className="px-3 py-2.5 text-right whitespace-nowrap">Delivery</th>}
                  {show('price')      && <th className="px-3 py-2.5 text-right cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('price')}>Price <SortIcon col="price" /></th>}
                  {show('gpm')        && <th className="px-3 py-2.5 text-right cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('gpm')}>GPM % <SortIcon col="gpm" /></th>}
                  {show('margin')     && <th className="px-3 py-2.5 text-right cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('margin')}>Margin $ <SortIcon col="margin" /></th>}
                  {show('sources')    && <th className="px-3 py-2.5">Sources</th>}
                  {show('avail')      && <th className="px-3 py-2.5 cursor-pointer select-none whitespace-nowrap min-w-[160px]" onClick={() => handleSort('avail')}>Availability <SortIcon col="avail" /></th>}
                  {show('visibility') && <th className="px-3 py-2.5">Visibility</th>}
                  {show('flags')      && <th className="px-3 py-2.5 min-w-[160px]">Flags / Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredSkus.map(sku => {
                  const vendor = getVendor(sku.vendor_id);
                  const qf = getQualityFamily(sku.quality_family_id);
                  const box = getBoxType(sku.box_type_id);
                  const proposalCount = proposalsBySkuId.get(sku.id) ?? 0;
                  if (!vendor || !qf || !box) return null;

                  // Per-week availability: aggregate stems per week
                  const weekMap = new Map<string, { stems: number; source: string }>();
                  for (const a of sku.availability) {
                    const prev = weekMap.get(a.delivery_week);
                    weekMap.set(a.delivery_week, { stems: (prev?.stems ?? 0) + a.stems, source: a.source });
                  }
                  const weeks = Array.from(weekMap.entries()).sort(([a], [b]) => a.localeCompare(b));

                  const qfIdShort = sku.quality_family_id.replace(/^qf_/, '');

                  return (
                    <tr key={sku.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 transition-colors">

                      {/* SKU */}
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex items-center gap-1.5">
                          {sku.is_top_seller && (
                            <span title="Top seller (featured_score >= 72)" className="text-amber-400 text-sm leading-none flex-shrink-0">&#9733;</span>
                          )}
                          <Link href={`/mockups/admin-catalog/${sku.id}`} className="font-mono text-[11px] text-violet-700 hover:underline break-all">
                            {sku.id}
                          </Link>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 max-w-[220px] leading-snug" title={sku.vendor_sku_name}>
                          {sku.vendor_sku_name}
                        </div>
                      </td>

                      {/* Quality Family + Parent ID */}
                      <td className="px-3 py-2.5 align-top">
                        <div className="text-xs text-slate-900 font-medium leading-snug">{qf.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{qf.category} &middot; {qf.length_cm > 0 ? `${qf.length_cm}cm` : qf.unit}</div>
                        <div className="mt-1">
                          <span
                            className="inline-block text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100 rounded px-1 py-0.5 leading-none"
                            title="Quality Family ID — parent across all vendors selling this same variety"
                          >
                            {qfIdShort}
                          </span>
                        </div>
                      </td>

                      {/* Vendor */}
                      {show('vendor') && (
                        <td className="px-3 py-2.5 align-top">
                          <div className="text-xs text-slate-700">{vendor.name}</div>
                          <div className="text-[11px] text-slate-500">{vendor.country} &middot; {vendor.origin_port}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 capitalize">{vendor.status}</div>
                        </td>
                      )}

                      {/* Box */}
                      {show('box') && (
                        <td className="px-3 py-2.5 align-top">
                          <div className="text-xs text-slate-700">{box.code}</div>
                          <div className="text-[11px]">
                            {box.verified
                              ? <span className="text-emerald-700">verified</span>
                              : <span className="text-amber-700">unverified</span>}
                          </div>
                        </td>
                      )}

                      {/* Cost */}
                      {show('cost') && (
                        <td className="px-3 py-2.5 align-top text-right">
                          {sku.vendor_cost_usd === null
                            ? <span className="text-amber-700 text-xs">missing</span>
                            : (
                              <>
                                <div className="text-xs text-slate-900">{formatPrice(sku.vendor_cost_usd)}</div>
                                {sku.cost_status !== 'verified' && (
                                  <div className="text-[10px] text-amber-700 mt-0.5">{sku.cost_status.replace(/_/g, ' ')}</div>
                                )}
                              </>
                            )}
                        </td>
                      )}

                      {/* Delivery */}
                      {show('delivery') && (
                        <td className="px-3 py-2.5 align-top text-right text-xs text-slate-600">
                          {formatPrice(sku.delivery_per_stem)}
                        </td>
                      )}

                      {/* Price */}
                      {show('price') && (
                        <td className="px-3 py-2.5 align-top text-right">
                          <div className="text-xs font-semibold text-slate-900">{formatPrice(sku.calculated_price_per_stem)}</div>
                          <div className="text-[10px] text-slate-400">per stem</div>
                        </td>
                      )}

                      {/* GPM % */}
                      {show('gpm') && (
                        <td className="px-3 py-2.5 align-top text-right">
                          {sku.gpm_band ? (
                            <>
                              <span className={`text-xs font-semibold ${GPM_BAND_CLS[sku.gpm_band]}`}>{formatGpm(sku.gpm)}</span>
                              <div className="text-[10px] text-slate-400">target 33%</div>
                            </>
                          ) : <span className="text-slate-400 text-xs">--</span>}
                        </td>
                      )}

                      {/* Margin $ */}
                      {show('margin') && (
                        <td className="px-3 py-2.5 align-top text-right">
                          {sku.margin_per_stem !== null ? (
                            <>
                              <span className={`text-xs font-semibold ${sku.gpm_band ? GPM_BAND_CLS[sku.gpm_band] : 'text-slate-500'}`}>
                                {formatPrice(sku.margin_per_stem)}
                              </span>
                              <div className="text-[10px] text-slate-400">per stem</div>
                            </>
                          ) : <span className="text-slate-400 text-xs">--</span>}
                        </td>
                      )}

                      {/* Sources */}
                      {show('sources') && (
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex flex-wrap gap-1">
                            {sku.sources.filter(s => s.valid).map(s => (
                              <span key={s.tier} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${SOURCE_BADGE_CLS[s.tier]}`}>
                                {SOURCE_LABELS[s.tier]}
                              </span>
                            ))}
                          </div>
                        </td>
                      )}

                      {/* Availability by week + T targets */}
                      {show('avail') && (
                        <td className="px-3 py-2.5 align-top">
                          <div className="space-y-0.5">
                            {weeks.map(([week, { stems, source }]) => {
                              const label = week.replace('2026-', '');
                              const target = source === 't2' ? sku.tier_targets?.t2
                                : source === 't3' ? sku.tier_targets?.t3
                                : undefined;
                              const pct = target ? Math.round((stems / target) * 100) : null;
                              return (
                                <div key={week} className="flex items-center gap-1.5 text-[11px]">
                                  <span className="text-slate-400 font-mono w-7 flex-shrink-0">{label}</span>
                                  <span className={`font-medium tabular-nums ${stems === 0 ? 'text-red-600' : 'text-slate-800'}`}>
                                    {stems.toLocaleString()}
                                  </span>
                                  {target !== undefined && (
                                    <span className={`text-[10px] ${pct !== null && pct < 60 ? 'text-amber-600' : 'text-slate-400'}`}>
                                      / {target.toLocaleString()} ({pct}%)
                                    </span>
                                  )}
                                  <span className={`text-[10px] px-1 py-0.5 rounded border ${SOURCE_BADGE_CLS[source as SourceTier] ?? 'text-slate-400'}`}>
                                    {SOURCE_LABELS[source as SourceTier] ?? source}
                                  </span>
                                </div>
                              );
                            })}
                            {weeks.length === 0 && (
                              <span className="text-[11px] text-slate-400">no availability</span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Visibility */}
                      {show('visibility') && (
                        <td className="px-3 py-2.5 align-top">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${VISIBILITY_BADGE_CLS[sku.visibility]}`}>
                            {sku.visibility}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-1 max-w-[120px] leading-tight">
                            {sku.visibility_rule}
                          </div>
                        </td>
                      )}

                      {/* Flags + actionable quick links */}
                      {show('flags') && (
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex flex-col gap-1.5">
                            {proposalCount > 0 && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold whitespace-nowrap">
                                  {proposalCount} awaiting you
                                </span>
                                <Link href="/mockups/admin-catalog-approval-queue" className="text-[10px] text-violet-600 hover:underline whitespace-nowrap">
                                  Review &rarr;
                                </Link>
                              </div>
                            )}
                            {sku.cost_status !== 'verified' && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-amber-700 whitespace-nowrap">
                                  {sku.cost_status === 'missing' ? 'No cost data' : 'Cost unconfirmed'}
                                </span>
                                <button className="text-[10px] text-violet-600 hover:underline whitespace-nowrap">Request &rarr;</button>
                              </div>
                            )}
                            {!box.verified && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-amber-700 whitespace-nowrap">Box dims unverified</span>
                                <Link href="/mockups/admin-catalog-config" className="text-[10px] text-violet-600 hover:underline whitespace-nowrap">Fix &rarr;</Link>
                              </div>
                            )}
                            {sku.active_override_id && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-violet-700 whitespace-nowrap">Override active</span>
                                <Link href={`/mockups/admin-catalog/${sku.id}`} className="text-[10px] text-violet-600 hover:underline whitespace-nowrap">View &rarr;</Link>
                              </div>
                            )}
                            {sku.visibility === 'hidden' && !proposalCount && sku.cost_status === 'verified' && box.verified && !sku.active_override_id && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-500 whitespace-nowrap">Auto-hidden</span>
                                <Link href={`/mockups/admin-catalog/${sku.id}`} className="text-[10px] text-violet-600 hover:underline whitespace-nowrap">Why &rarr;</Link>
                              </div>
                            )}
                            {!proposalCount && sku.cost_status === 'verified' && box.verified && sku.visibility === 'live' && (
                              <span className="text-[10px] text-emerald-600 font-medium">OK</span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredSkus.length === 0 && (
              <div className="px-3 py-12 text-center text-sm text-slate-500">
                No SKUs match the current filters.{' '}
                <button onClick={clearAll} className="text-violet-600 hover:underline">Clear all filters</button>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 text-xs text-slate-500 flex flex-wrap gap-x-5 gap-y-1.5">
          <span className="font-medium text-slate-600">Sources:</span>
          <span className="inline-flex items-center gap-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-emerald-50 text-emerald-700 border-emerald-200">K2K</span>
            vendor uploaded via Komet
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-blue-50 text-blue-700 border-blue-200">T2</span>
            standing commitment (our DB)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-50 text-slate-600 border-slate-200">T3</span>
            sourceable, 14d min delivery
          </span>
          <span className="ml-2">
            GPM: <span className="text-emerald-700 font-semibold">green &ge;33%</span>
            {' &middot; '}
            <span className="text-amber-700 font-semibold">yellow 28-33%</span>
            {' &middot; '}
            <span className="text-red-700 font-semibold">red &lt;28%</span>
          </span>
          <span>
            <span className="text-amber-400">&#9733;</span> top seller (featured_score &ge;72, demand &times; comp_adv)
          </span>
          <span>
            QF ID = quality family parent (same ID = same logical variety across vendors)
          </span>
          <span>
            Avail target % in amber = below 60% of T-tier commitment
          </span>
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
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
