'use client';
// OpenPriceAlertPanel | v1 | 2026-05-23 | Job_PM [V8 SHADOW]
//
// 299 Ecoroses T3 SKUs have has_open_price_alert = true (K2K flagged price change).
// 26 of those have this as the ONLY failing gate → they publish immediately once cleared.
// Clearing = Facu has reviewed and accepted the new Ecoroses prices.
//
// Note: open_price_alert is a publishable_gap gate but classifications show 'blocked'.
// This is a Rose/Python validator sync issue. Clearing the flag + nightly reclassification
// moves them to publishable. OR trigger re-classify manually per SKU via SKU detail page.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface OpenPriceAlertSku {
  id: number;
  variety: string;
  length: string;
  tier: string;
}

interface Props {
  soleBlockers: OpenPriceAlertSku[];
  totalAffected: number;
}

export default function OpenPriceAlertPanel({ soleBlockers, totalAffected }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [rationale, setRationale] = useState('');

  if (done) return null;

  async function clearAll() {
    if (rationale.trim().length < 5) { setError('Rationale required (min 5 chars)'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'price_alert.batch_clear',
          target_table: 'floropolis_inventory_mirror',
          target_id: null,
          payload: {
            sku_ids: soleBlockers.map(s => s.id),
            sku_count: soleBlockers.length,
            total_affected: totalAffected,
            varieties: [...new Set(soleBlockers.map(s => s.variety))].sort(),
            vendor: 'Ecoroses',
            tier: 'T3',
          },
          source_agent: 'Job_PM',
          source_rationale: rationale,
          notes: rationale,
        }),
      });
      const body = await res.json() as { proposal?: unknown; error?: string };
      if (!res.ok) { setError(body.error ?? `HTTP ${res.status}`); setBusy(false); return; }
      setDone(true);
      setShowModal(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setBusy(false);
    }
  }

  // Group by variety for the table
  const varietyGroups = soleBlockers.reduce<Record<string, OpenPriceAlertSku[]>>((acc, s) => {
    if (!acc[s.variety]) acc[s.variety] = [];
    acc[s.variety].push(s);
    return acc;
  }, {});

  return (
    <div className="mb-6 rounded-xl border-2 border-orange-300 bg-orange-50 overflow-hidden">
      <div className="px-4 py-3 bg-orange-100 border-b border-orange-200 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-orange-700 text-white rounded-full px-2 py-0.5 uppercase tracking-wide">
              Open Price Alert
            </span>
            <span className="font-semibold text-orange-900 text-sm">
              Ecoroses changed their prices — {totalAffected} SKUs flagged, {soleBlockers.length} are sole blockers
            </span>
          </div>
          <p className="text-xs text-orange-800 max-w-2xl">
            K2K set <code className="bg-orange-200 px-1 rounded">has_open_price_alert</code> on {totalAffected} Ecoroses T3 SKUs when
            Ecoroses updated their market pricing. The {soleBlockers.length} varieties below have this as their <strong>only</strong> failing
            gate — they publish immediately once you clear the flag. The remaining {totalAffected - soleBlockers.length} SKUs have
            additional gates failing alongside.
          </p>
          <p className="text-xs text-orange-700 mt-1 font-semibold">
            Clearing = you have reviewed the new Ecoroses prices and accept them. Do not clear blindly.
          </p>
        </div>
        <button
          onClick={() => { setShowModal(true); setRationale(''); setError(null); }}
          className="px-3 py-1.5 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-xs font-semibold shrink-0"
        >
          Clear {soleBlockers.length} sole-blocker alerts
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-orange-200 bg-orange-50">
              <th className="text-left px-3 py-2 font-semibold text-orange-700 uppercase tracking-wide text-[10px]">Variety</th>
              <th className="text-left px-3 py-2 font-semibold text-orange-700 uppercase tracking-wide text-[10px]">Lengths</th>
              <th className="text-left px-3 py-2 font-semibold text-orange-700 uppercase tracking-wide text-[10px]">SKUs</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(varietyGroups).sort(([a], [b]) => a.localeCompare(b)).map(([variety, skus]) => (
              <tr key={variety} className="border-b border-orange-100 hover:bg-orange-50/60">
                <td className="px-3 py-1.5 font-medium text-slate-800">{variety}</td>
                <td className="px-3 py-1.5 text-slate-600 font-mono text-[11px]">
                  {skus.map(s => s.length).sort().join(' · ')}
                </td>
                <td className="px-3 py-1.5 text-slate-700 font-semibold">{skus.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalAffected > soleBlockers.length && (
          <div className="px-3 py-2 text-xs text-orange-700 border-t border-orange-100 bg-orange-50">
            ...and {totalAffected - soleBlockers.length} more Ecoroses T3 SKUs have this alert alongside other blocking gates (formula_deviation, missing_arrival_date, etc.)
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="font-bold text-slate-900 text-base mb-1">
              Clear {soleBlockers.length} Ecoroses price alerts
            </h3>
            <p className="text-xs text-slate-500 mb-2">
              Sets <code>has_open_price_alert = false</code> on {soleBlockers.length} SKUs across{' '}
              {Object.keys(varietyGroups).length} varieties. After executor runs, nightly reclassification
              moves them to publishable. Or trigger per-SKU via the SKU detail page for immediate effect.
            </p>
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3 text-xs text-orange-800">
              Only proceed if you have reviewed the current Ecoroses pricelist and the new prices are acceptable.
            </div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Confirmation <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
              rows={3}
              placeholder="e.g. Reviewed Ecoroses May 2026 pricelist — prices acceptable, clear all sole-blocker alerts."
              value={rationale}
              onChange={e => setRationale(e.target.value)}
            />
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100" disabled={busy}>
                Cancel
              </button>
              <button
                onClick={clearAll}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-orange-700 hover:bg-orange-800 disabled:opacity-50"
              >
                {busy ? 'Submitting...' : 'Clear alerts'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
