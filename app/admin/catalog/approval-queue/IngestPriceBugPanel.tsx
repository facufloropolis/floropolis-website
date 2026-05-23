'use client';
// IngestPriceBugPanel | v1 | 2026-05-23 | Job_PM [V8 SHADOW]
//
// Surfaces the formula_deviation root cause: Rose's ingest pipeline copies
// K2K market prices into the `price` field instead of computing formula prices.
// All 476 affected SKUs come from mirror_source='floropolis-bi.floropolis_inventory'.
//
// Shows best sellers first (they're the most painful to have blocked).
// "Send to Rose" creates an inbox message + admin_proposals entry for traceability.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface IngestBugSku {
  id: string;
  variety: string;
  length: string;
  tier: string;
  vendor: string;
  is_best_seller: boolean;
  k2k_price: number;
  farm_cost: number;
  formula_price: number | null;
  pct_deviation: number;
  sole_blocker: boolean; // true = formula_deviation is the ONLY gate failing
}

interface Props {
  skus: IngestBugSku[];
  totalCount: number;
}

export default function IngestPriceBugPanel({ skus, totalCount }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [rationale, setRationale] = useState('');

  if (done) return null;

  const soleBlockers = skus.filter(s => s.sole_blocker);
  const bestSellers = skus.filter(s => s.is_best_seller);

  async function sendToRose() {
    if (rationale.trim().length < 5) { setError('Rationale required (min 5 chars)'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ingest.price_field_bug',
          target_table: 'floropolis_inventory_mirror',
          target_id: null,
          payload: {
            root_cause: 'Rose ingest copies K2K market price into price field instead of computing formula price',
            total_affected: totalCount,
            sole_blockers: soleBlockers.length,
            best_seller_sole_blockers: soleBlockers.filter(s => s.is_best_seller).map(s => `${s.variety} ${s.length} (${s.tier})`),
            priority_fix: 'Freedom T2 50cm is a best seller with formula_deviation as sole blocker — immediate revenue impact when fixed',
            mirror_source: 'floropolis-bi.floropolis_inventory',
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

  return (
    <div className="mb-6 rounded-xl border-2 border-red-300 bg-red-50 overflow-hidden">
      <div className="px-4 py-3 bg-red-100 border-b border-red-200 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-red-700 text-white rounded-full px-2 py-0.5 uppercase tracking-wide">
              Root Cause — Ingest Bug
            </span>
            <span className="font-semibold text-red-900 text-sm">
              Rose&apos;s pipeline writes K2K market price — {totalCount} SKUs
            </span>
          </div>
          <p className="text-xs text-red-800 max-w-2xl">
            All {totalCount} formula_deviation SKUs come from <code className="bg-red-200 px-1 rounded">floropolis-bi.floropolis_inventory</code>.
            The ingest writes K2K&apos;s listed market price into the <code className="bg-red-200 px-1 rounded">price</code> field
            instead of computing <code className="bg-red-200 px-1 rounded">farm_cost / (1−GPM) + delivery</code>.
            This is Rose&apos;s pipeline to fix — not a ghost farm upload, not a vendor pricing issue.
          </p>
          <div className="flex gap-4 mt-2 text-xs">
            <span className="text-red-800">
              <strong className="text-red-900">{soleBlockers.length}</strong> SKUs unblock immediately once fixed
            </span>
            <span className="text-red-800">
              <strong className="text-red-900">{bestSellers.length}</strong> are best sellers
            </span>
          </div>
        </div>
        <button
          onClick={() => { setShowModal(true); setRationale(''); setError(null); }}
          className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold shrink-0"
        >
          Escalate to Rose
        </button>
      </div>

      {/* Best sellers + sole blockers first */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-red-200 bg-red-50">
              <th className="text-left px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">Variety</th>
              <th className="text-left px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">Length</th>
              <th className="text-left px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">Tier</th>
              <th className="text-right px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">K2K price (wrong)</th>
              <th className="text-right px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">Farm cost</th>
              <th className="text-right px-3 py-2 font-semibold text-emerald-700 uppercase tracking-wide text-[10px]">Formula price</th>
              <th className="text-left px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">Why it matters</th>
            </tr>
          </thead>
          <tbody>
            {skus.map(s => (
              <tr key={s.id} className={`border-b border-red-100 ${s.is_best_seller ? 'bg-amber-50/60' : 'hover:bg-red-50/60'}`}>
                <td className="px-3 py-1.5 font-medium text-slate-800">{s.variety}</td>
                <td className="px-3 py-1.5 text-slate-600">{s.length}</td>
                <td className="px-3 py-1.5">
                  <span className="bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 text-[10px] font-semibold">{s.tier}</span>
                </td>
                <td className="px-3 py-1.5 text-right text-red-700 font-mono font-semibold">${s.k2k_price.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right text-slate-600 font-mono">${s.farm_cost.toFixed(3)}</td>
                <td className="px-3 py-1.5 text-right text-emerald-700 font-mono font-semibold">
                  {s.formula_price != null ? `$${s.formula_price.toFixed(2)}` : '—'}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex gap-1 flex-wrap">
                    {s.is_best_seller && (
                      <span className="bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 text-[10px] font-semibold">best seller</span>
                    )}
                    {s.sole_blocker && (
                      <span className="bg-emerald-100 text-emerald-800 rounded px-1.5 py-0.5 text-[10px] font-semibold">sole blocker</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalCount > skus.length && (
          <div className="px-3 py-2 text-xs text-red-700 border-t border-red-100 bg-red-50">
            ...and {totalCount - skus.length} more SKUs with the same ingest bug (all Ecoroses + 3 Magic Flowers)
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="font-bold text-slate-900 text-base mb-1">Escalate ingest bug to Rose</h3>
            <p className="text-xs text-slate-500 mb-3">
              Creates a proposal + inbox message to Rose with the full root cause, affected SKU list, and priority (Freedom 50cm first).
              Rose must fix the ingest pipeline to compute formula price, not copy K2K market price.
            </p>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Your instruction to Rose <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={3}
              placeholder="e.g. Fix ingest to compute formula price. Freedom 50cm is a best seller and sole blocker — priority #1."
              value={rationale}
              onChange={e => setRationale(e.target.value)}
            />
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100" disabled={busy}>
                Cancel
              </button>
              <button
                onClick={sendToRose}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-50"
              >
                {busy ? 'Submitting...' : 'Send to Rose'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
