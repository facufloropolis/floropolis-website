'use client';
// BatchPriceResetPanel | v1 | 2026-05-23 | Job_PM [V8 SHADOW]
//
// Surfaces the formula_deviation_audit_2026-05-23 batch as a single
// reviewable panel in the approval queue. Shows top rows by deviation %,
// root cause explanation, and a batch approve/reject button.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface BatchResetRow {
  id: string;
  variety: string;
  length: string;
  tier: string;
  farm_cost: number;
  actual_price: number;
  formula_price: number;
  pct_above_formula: number;
}

interface Props {
  rows: BatchResetRow[];
  totalCount: number;
  sourceArtifact: string;
}

export default function BatchPriceResetPanel({ rows, totalCount, sourceArtifact }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [rationale, setRationale] = useState('');
  const [showModal, setShowModal] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const preview = rows.slice(0, 15);
  const remaining = totalCount - preview.length;

  async function handleApprove() {
    if (rationale.trim().length < 5) { setError('Rationale required (min 5 chars)'); return; }
    setBusy('approve');
    setError(null);
    try {
      const res = await fetch('/api/admin/proposals/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_artifact: sourceArtifact, facu_rationale: rationale, urgency_tier: 'routine' }),
      });
      const body = await res.json() as { ok?: boolean; error?: string; approved?: number };
      if (!res.ok || !body.ok) { setError(body.error ?? `HTTP ${res.status}`); setBusy(null); return; }
      setDone(true);
      setShowModal(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleRejectAll() {
    if (rationale.trim().length < 5) { setError('Rationale required (min 5 chars)'); return; }
    setBusy('reject');
    setError(null);
    try {
      const res = await fetch('/api/admin/proposals/batch-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_artifact: sourceArtifact, facu_rationale: rationale }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) { setError(body.error ?? `HTTP ${res.status}`); setBusy(null); return; }
      setDone(true);
      setShowModal(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setBusy(null);
    }
  }

  if (done) return null;

  return (
    <div className="mb-6 rounded-xl border-2 border-orange-300 bg-orange-50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-orange-100 border-b border-orange-200 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold bg-orange-600 text-white rounded-full px-2 py-0.5 uppercase tracking-wide">
              Priority Batch
            </span>
            <span className="font-semibold text-orange-900 text-sm">
              price.formula_reset — {totalCount.toLocaleString()} Ecoroses SKUs
            </span>
          </div>
          <p className="text-xs text-orange-800 max-w-2xl">
            K2K market prices were scraped into the <code className="bg-orange-200 px-1 rounded">price</code> field
            instead of formula-derived prices. farm_cost is verified. Formula: farm_cost/0.67 + delivery.
            Approve to queue the price reset — Atlas runs the executor after Rose confirms ingest root cause fixed.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => { setShowModal('approve'); setError(null); setRationale(''); }}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            Approve all {totalCount}
          </button>
          <button
            onClick={() => { setShowModal('reject'); setError(null); setRationale(''); }}
            className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold border border-red-200"
          >
            Reject all
          </button>
        </div>
      </div>

      {/* Comparison table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-orange-200 bg-orange-50">
              <th className="text-left px-3 py-2 font-semibold text-orange-700 uppercase tracking-wide text-[10px]">Variety</th>
              <th className="text-left px-3 py-2 font-semibold text-orange-700 uppercase tracking-wide text-[10px]">Length</th>
              <th className="text-left px-3 py-2 font-semibold text-orange-700 uppercase tracking-wide text-[10px]">Tier</th>
              <th className="text-right px-3 py-2 font-semibold text-orange-700 uppercase tracking-wide text-[10px]">Farm cost</th>
              <th className="text-right px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">K2K price (wrong)</th>
              <th className="text-right px-3 py-2 font-semibold text-emerald-700 uppercase tracking-wide text-[10px]">Formula price</th>
              <th className="text-right px-3 py-2 font-semibold text-orange-700 uppercase tracking-wide text-[10px]">% above</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((r) => (
              <tr key={r.id} className="border-b border-orange-100 hover:bg-orange-50/60">
                <td className="px-3 py-1.5 font-medium text-slate-800">{r.variety}</td>
                <td className="px-3 py-1.5 text-slate-600">{r.length}</td>
                <td className="px-3 py-1.5">
                  <span className="bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 text-[10px] font-semibold">{r.tier}</span>
                </td>
                <td className="px-3 py-1.5 text-right text-slate-600 font-mono">${r.farm_cost.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right text-red-700 font-mono font-semibold">${r.actual_price.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right text-emerald-700 font-mono font-semibold">${r.formula_price.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right">
                  <span className={`font-mono font-bold ${r.pct_above_formula > 100 ? 'text-red-700' : 'text-orange-700'}`}>
                    +{r.pct_above_formula.toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {remaining > 0 && (
          <div className="px-3 py-2 text-xs text-orange-700 border-t border-orange-100 bg-orange-50">
            ...and {remaining} more SKUs with same pattern (all Ecoroses, farm_cost verified)
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="font-bold text-slate-900 text-base mb-1">
              {showModal === 'approve' ? `Approve ${totalCount} price resets` : `Reject ${totalCount} price resets`}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {showModal === 'approve'
                ? 'Marks all proposals approved. Atlas will run the executor after Rose confirms root cause fixed.'
                : 'Marks all proposals rejected. Prices will remain as-is.'}
            </p>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Rationale <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
              rows={3}
              placeholder={showModal === 'approve' ? 'e.g. Confirmed K2K prices are wrong, formula prices correct' : 'e.g. Need Rose to re-verify farm costs first'}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowModal(null)}
                className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
                disabled={!!busy}
              >
                Cancel
              </button>
              <button
                onClick={showModal === 'approve' ? handleApprove : handleRejectAll}
                disabled={!!busy}
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${
                  showModal === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                } disabled:opacity-50`}
              >
                {busy ? 'Processing...' : showModal === 'approve' ? 'Confirm approve all' : 'Confirm reject all'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
