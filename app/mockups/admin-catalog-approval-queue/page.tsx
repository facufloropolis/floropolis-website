// Admin Catalog -- Approval Queue (Facu's destination)
// v0.1 | 2026-05-15 | Job_PM [V8 SHADOW]
//
// Aggregates ALL proposals from screens 2/3/6: box dim, shipping, GPM target, discount,
// visibility, price override, mapping, new vendor. Each shows cascade impact + warnings.

'use client';

import { useMemo, useState } from 'react';
import AdminCatalogNav from '../_components/AdminCatalogNav';
import { PROPOSALS } from '../_constants/catalogQueue';

type Filter = 'all' | 'shipping_config' | 'gpm_target' | 'discount' | 'visibility' | 'box_dim' | 'price_override';
type Risk = 'all' | 'critical' | 'warn' | 'safe';

export default function AdminCatalogApprovalQueue() {
  const [filter, setFilter] = useState<Filter>('all');
  const [risk, setRisk] = useState<Risk>('all');

  const filtered = useMemo(() => {
    return PROPOSALS.filter(p => {
      if (p.status !== 'awaiting_facu') return false;
      if (filter !== 'all' && p.type !== filter) return false;
      if (risk !== 'all') {
        const has = (sev: string) => p.warnings.some(w => w.severity === sev);
        if (risk === 'critical' && !has('critical')) return false;
        if (risk === 'warn' && !has('warn') && !has('critical')) return false;
        if (risk === 'safe' && (has('warn') || has('critical'))) return false;
      }
      return true;
    });
  }, [filter, risk]);

  const counts = useMemo(() => {
    const awaiting = PROPOSALS.filter(p => p.status === 'awaiting_facu');
    return {
      total: awaiting.length,
      critical: awaiting.filter(p => p.warnings.some(w => w.severity === 'critical')).length,
      cascadeImpactSkus: awaiting.reduce((s, p) => s + p.cascade_impact_skus, 0),
    };
  }, []);

  return (
    <div>
      <AdminCatalogNav active="queue" />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-900">Approval Queue</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Every proposal from across the catalog control plane. Approve or reject each. Cascade impact + warnings shown inline.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <Tile label="Awaiting approval" value={String(counts.total)} hint="From all proposers" tone="orange" />
          <Tile label="Critical warnings" value={String(counts.critical)} hint="REL missing / payment / PCI" tone="red" />
          <Tile label="SKUs affected (cascade)" value={counts.cascadeImpactSkus.toLocaleString()} hint="Total across all proposals" tone="amber" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(['all', 'shipping_config', 'gpm_target', 'discount', 'visibility', 'box_dim'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  filter === f
                    ? 'px-3 py-1 text-xs font-semibold rounded-md bg-violet-100 text-violet-800'
                    : 'px-3 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-50'
                }
              >
                {f === 'all' ? 'All types' : f.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(['all', 'critical', 'warn', 'safe'] as Risk[]).map(r => (
              <button
                key={r}
                onClick={() => setRisk(r)}
                className={
                  risk === r
                    ? 'px-3 py-1 text-xs font-semibold rounded-md bg-violet-100 text-violet-800'
                    : 'px-3 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-50'
                }
              >
                Risk: {r}
              </button>
            ))}
          </div>
        </div>

        {/* Proposal cards */}
        <div className="space-y-3">
          {filtered.map(p => {
            const hasCritical = p.warnings.some(w => w.severity === 'critical');
            const hasWarn = p.warnings.some(w => w.severity === 'warn');
            const cardBorder = hasCritical ? 'border-red-300' : hasWarn ? 'border-amber-300' : 'border-slate-200';

            return (
              <div id={p.id} key={p.id} className={`bg-white rounded-xl border ${cardBorder} p-4`}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-slate-400">{p.id}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold uppercase">
                        {p.type.replace(/_/g, ' ')}
                      </span>
                      <span className="font-semibold text-slate-900 text-sm">{p.scope}</span>
                      {hasCritical && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-semibold">CRITICAL</span>}
                      {hasWarn && !hasCritical && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">WARN</span>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Proposed by {p.proposed_by} on {p.proposed_at}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-medium">
                      Approve
                    </button>
                    <button className="text-xs px-3 py-1.5 rounded text-slate-600 hover:bg-slate-100">
                      Reject
                    </button>
                  </div>
                </div>

                {/* Before / After */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Current</div>
                    <div className="text-xs text-slate-700">{p.current_value}</div>
                  </div>
                  <div className="rounded-lg bg-violet-50 border border-violet-200 p-2.5">
                    <div className="text-[10px] text-violet-700 uppercase tracking-wide mb-0.5">Proposed</div>
                    <div className="text-xs text-violet-900 font-medium">{p.proposed_value}</div>
                  </div>
                </div>

                {/* Cascade impact */}
                <div className="border-t border-slate-100 pt-3 mb-3">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-semibold text-slate-700">
                      Cascade impact: {p.cascade_impact_skus.toLocaleString()} SKU{p.cascade_impact_skus === 1 ? '' : 's'}
                    </span>
                  </div>
                  {p.cascade_top_examples.length > 0 && (
                    <div className="space-y-1">
                      {p.cascade_top_examples.map((ex, i) => (
                        <div key={i} className="text-[11px] flex items-center gap-2 text-slate-600">
                          <span className="text-slate-400 shrink-0">.</span>
                          <span className="flex-1 truncate">{ex.sku}</span>
                          <span className="text-slate-500 font-mono">{ex.before}</span>
                          <span className="text-slate-400">-&gt;</span>
                          <span className="text-slate-900 font-mono font-medium">{ex.after}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Warnings */}
                {p.warnings.length > 0 && (
                  <div className="border-t border-slate-100 pt-3 space-y-1">
                    {p.warnings.map((w, i) => (
                      <div key={i} className={
                        'text-xs flex items-start gap-2 ' +
                        (w.severity === 'critical' ? 'text-red-700' : w.severity === 'warn' ? 'text-amber-700' : 'text-slate-600')
                      }>
                        <span className="font-bold shrink-0">{w.severity === 'critical' ? '!!' : w.severity === 'warn' ? '!' : '.'}</span>
                        <span>{w.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-sm text-slate-500 bg-white rounded-xl border border-slate-200">
              No proposals match the current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: 'orange' | 'red' | 'amber' }) {
  const cls =
    tone === 'orange' ? 'bg-orange-50 border-orange-200 text-orange-900'
  : tone === 'red'    ? 'bg-red-50 border-red-200 text-red-900'
                       : 'bg-amber-50 border-amber-200 text-amber-900';
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
      <div className="text-[11px] mt-0.5 opacity-70">{hint}</div>
    </div>
  );
}
