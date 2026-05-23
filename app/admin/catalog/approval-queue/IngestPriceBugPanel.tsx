'use client';
// IngestPriceBugPanel | v2 | 2026-05-23 | Job_PM [V8 SHADOW]
//
// v1 had a "Escalate to Rose" button — useless because Rose generated this data.
// Escalating back to Rose what Rose gave you captures zero signal.
//
// v2: structured correction form. Captures:
//   1. What is wrong (pre-filled from audit evidence)
//   2. What should be true instead
//   3. How to fix it (specific pipeline change)
//   4. Facu's additional context (domain knowledge that changes the picture)
//   5. Priority
// → becomes a machine-readable correction record Rose's verifier can act on.
//
// Recurrence tracking: if this same correction has been sent before without being
// resolved, the panel shows a "RECURRING" badge with days-open counter.

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
  sole_blocker: boolean;
}

interface Props {
  skus: IngestBugSku[];
  totalCount: number;
  priorCorrectionCount: number;   // how many times this correction has been sent before
  daysSinceFirstSurfaced: number; // 0 = first time; >0 = recurring
}

const PREFILL = {
  whatIsWrong:
    "Rose's ingest pipeline copies K2K market price into the price field instead of computing formula price. All 476 formula_deviation SKUs share mirror_source='floropolis-bi.floropolis_inventory'.",
  whatShouldBeTrue:
    'Each SKU price should be computed as: farm_cost / (1 − GPM) + delivery_per_stem. GPM = pricing_constants.gpm_target. delivery = ceil(box_weight_kg) × fedex_rate × fuel_surcharge / stems_per_box.',
  howToFix:
    "Fix the ingest script in floropolis-bi.floropolis_inventory pipeline: compute formula_price from farm_cost + GPM + delivery before writing to the price field. Do not copy K2K market price.",
};

export default function IngestPriceBugPanel({ skus, totalCount, priorCorrectionCount, daysSinceFirstSurfaced }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Structured correction fields
  const [whatIsWrong, setWhatIsWrong] = useState(PREFILL.whatIsWrong);
  const [whatShouldBeTrue, setWhatShouldBeTrue] = useState(PREFILL.whatShouldBeTrue);
  const [howToFix, setHowToFix] = useState(PREFILL.howToFix);
  const [facuContext, setFacuContext] = useState('');
  const [priority, setPriority] = useState<'P0' | 'P1' | 'P2'>('P0');

  if (done) return null;

  const isRecurring = priorCorrectionCount > 0;

  const soleBlockers = skus.filter(s => s.sole_blocker);
  const bestSellers = skus.filter(s => s.is_best_seller);

  async function sendCorrection() {
    if (whatIsWrong.trim().length < 10) { setError('Fill in what is wrong'); return; }
    if (howToFix.trim().length < 10) { setError('Fill in how to fix'); return; }
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
            correction_type: 'ingest_formula_price',
            what_is_wrong: whatIsWrong.trim(),
            what_should_be_true: whatShouldBeTrue.trim(),
            how_to_fix: howToFix.trim(),
            facu_additional_context: facuContext.trim() || null,
            priority,
            total_affected: totalCount,
            sole_blockers: soleBlockers.length,
            best_seller_sole_blockers: soleBlockers
              .filter(s => s.is_best_seller)
              .map(s => `${s.variety} ${s.length} (${s.tier})`),
            mirror_source: 'floropolis-bi.floropolis_inventory',
            prior_correction_count: priorCorrectionCount,
          },
          source_agent: 'Job_PM',
          source_rationale: howToFix.trim(),
          notes: facuContext.trim() || howToFix.trim(),
        }),
      });
      const body = await res.json() as { proposal?: unknown; error?: string };
      if (!res.ok) { setError(body.error ?? `HTTP ${res.status}`); setBusy(false); return; }
      setDone(true);
      setShowForm(false);
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
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {isRecurring ? (
              <span className="text-[10px] font-bold bg-red-900 text-white rounded-full px-2 py-0.5 uppercase tracking-wide">
                Recurring × {priorCorrectionCount + 1} — {daysSinceFirstSurfaced}d open
              </span>
            ) : (
              <span className="text-[10px] font-bold bg-red-700 text-white rounded-full px-2 py-0.5 uppercase tracking-wide">
                Root Cause — Ingest Bug
              </span>
            )}
            <span className="font-semibold text-red-900 text-sm">
              Rose&apos;s pipeline writes K2K price — {totalCount} SKUs, {soleBlockers.length} sole blockers
            </span>
          </div>
          <p className="text-xs text-red-800 max-w-2xl">
            All {totalCount} formula_deviation SKUs come from{' '}
            <code className="bg-red-200 px-1 rounded">floropolis-bi.floropolis_inventory</code>.
            Rose&apos;s ingest copies K2K market price into the{' '}
            <code className="bg-red-200 px-1 rounded">price</code> field
            instead of computing <code className="bg-red-200 px-1 rounded">farm_cost&nbsp;/&nbsp;(1−GPM)&nbsp;+&nbsp;delivery</code>.
          </p>
          <div className="flex gap-4 mt-2 text-xs">
            <span className="text-red-800">
              <strong className="text-red-900">{soleBlockers.length}</strong> unblock immediately once fixed
            </span>
            <span className="text-red-800">
              <strong className="text-red-900">{bestSellers.length}</strong> best sellers affected
            </span>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(s => !s); setError(null); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 ${
            showForm
              ? 'bg-red-200 text-red-800 border border-red-300'
              : 'bg-red-700 hover:bg-red-800 text-white'
          }`}
        >
          {showForm ? 'Collapse' : 'Send correction to Rose'}
        </button>
      </div>

      {/* SKU table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-red-200 bg-red-50">
              <th className="text-left px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">Variety</th>
              <th className="text-left px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">Length</th>
              <th className="text-left px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">Tier</th>
              <th className="text-right px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">K2K (wrong)</th>
              <th className="text-right px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">Farm cost</th>
              <th className="text-right px-3 py-2 font-semibold text-emerald-700 uppercase tracking-wide text-[10px]">Formula price</th>
              <th className="text-left px-3 py-2 font-semibold text-red-700 uppercase tracking-wide text-[10px]">Tags</th>
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
            ...and {totalCount - skus.length} more SKUs with the same ingest bug
          </div>
        )}
      </div>

      {/* Structured correction form */}
      {showForm && (
        <div className="border-t border-red-200 bg-white px-4 py-4">
          <h3 className="font-bold text-slate-900 text-sm mb-1">Correction record for Rose</h3>
          <p className="text-xs text-slate-500 mb-4">
            Pre-filled from audit evidence. Edit any field if your understanding differs.
            The <strong>additional context</strong> field is where you add anything the system doesn&apos;t know.
            This creates a machine-readable correction record — not just a routing action.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                What is wrong <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-red-400 bg-red-50/30"
                rows={2}
                value={whatIsWrong}
                onChange={e => setWhatIsWrong(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                What should be true instead
              </label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-red-400 bg-red-50/30"
                rows={2}
                value={whatShouldBeTrue}
                onChange={e => setWhatShouldBeTrue(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                How to fix it (specific change needed) <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-red-400 bg-red-50/30"
                rows={2}
                value={howToFix}
                onChange={e => setHowToFix(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-700 mb-1">
                Your additional context — what do you know that changes this picture?
              </label>
              <textarea
                className="w-full border border-emerald-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-emerald-50/30"
                rows={2}
                placeholder="e.g. The Ecoroses prices in K2K are negotiated prices, not list prices. The formula should use our agreed FOB price, not K2K market. Or: the root cause might be different for T2 vs T3..."
                value={facuContext}
                onChange={e => setFacuContext(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                <div className="flex gap-2">
                  {(['P0', 'P1', 'P2'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        priority === p
                          ? p === 'P0' ? 'bg-red-700 text-white border-red-700'
                            : p === 'P1' ? 'bg-orange-600 text-white border-orange-600'
                            : 'bg-slate-600 text-white border-slate-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex justify-end gap-2 items-end">
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  onClick={sendCorrection}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-50"
                >
                  {busy ? 'Sending...' : 'Send correction to Rose'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
