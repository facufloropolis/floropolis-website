'use client';
// OpenPriceAlertPanel | v2 | 2026-05-23 | Job_PM [V8 SHADOW]
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

const CORRECTION_PREFILL_BELIEVE =
  "The Ecoroses price alert may not reflect negotiated prices. K2K's market price change does not necessarily mean our FOB pricelist changed. Our agreed prices may still be valid.";

export default function OpenPriceAlertPanel({ soleBlockers, totalAffected }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [rationale, setRationale] = useState('');

  // Third-path correction state
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionDone, setCorrectionDone] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [whatIBelieve, setWhatIBelieve] = useState(CORRECTION_PREFILL_BELIEVE);
  const [whatShouldHappen, setWhatShouldHappen] = useState('');
  const [correctionPriority, setCorrectionPriority] = useState<'P0' | 'P1' | 'P2'>('P1');

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

  async function sendPriceCorrection() {
    if (whatIBelieve.trim().length < 5) { setCorrectionError('Fill in what you believe (min 5 chars)'); return; }
    if (whatShouldHappen.trim().length < 5) { setCorrectionError('Fill in what should happen instead (min 5 chars)'); return; }
    setCorrectionBusy(true);
    setCorrectionError(null);
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'price_alert.facu_correction',
          target_table: 'floropolis_inventory_mirror',
          target_id: null,
          payload: {
            vendor: 'Ecoroses',
            tier: 'T3',
            sole_blocker_count: soleBlockers.length,
            total_affected: totalAffected,
            what_i_believe: whatIBelieve.trim(),
            what_should_happen: whatShouldHappen.trim(),
            priority: correctionPriority,
          },
          source_agent: 'Job_PM',
          source_rationale: whatShouldHappen.trim(),
          notes: whatIBelieve.trim(),
        }),
      });
      const body = await res.json() as { proposal?: unknown; error?: string };
      if (!res.ok) { setCorrectionError(body.error ?? `HTTP ${res.status}`); setCorrectionBusy(false); return; }
      setCorrectionDone(true);
      setShowCorrection(false);
      router.refresh();
    } catch (e) {
      setCorrectionError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setCorrectionBusy(false);
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
        <div className="flex gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => { setShowModal(true); setRationale(''); setError(null); }}
            className="px-3 py-1.5 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-xs font-semibold"
          >
            Clear {soleBlockers.length} sole-blocker alerts
          </button>
          {correctionDone ? (
            <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
              Correction sent
            </span>
          ) : (
            <button
              onClick={() => { setShowCorrection(s => !s); setCorrectionError(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                showCorrection
                  ? 'bg-orange-200 text-orange-900 border-orange-300'
                  : 'bg-orange-100 text-orange-800 border border-orange-200 hover:bg-orange-200'
              }`}
            >
              I see this differently
            </button>
          )}
        </div>
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

      {/* Inline correction form — third path */}
      {showCorrection && !correctionDone && (
        <div className="border-t border-orange-200 bg-white px-4 py-4">
          <h3 className="font-bold text-slate-900 text-sm mb-1">Correction record for Rose</h3>
          <p className="text-xs text-slate-500 mb-4">
            Pre-filled with the most common reason these alerts are misleading.
            Edit any field. The <strong>what should happen</strong> field is where you specify the correct action.
            This becomes a machine-readable correction record — not just a routing action.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                What I believe about these price alerts
              </label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-orange-400 bg-slate-50/40"
                rows={2}
                value={whatIBelieve}
                onChange={e => setWhatIBelieve(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-700 mb-1">
                What should happen instead
              </label>
              <textarea
                className="w-full border border-emerald-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-emerald-50/30"
                rows={2}
                placeholder="e.g. Check with Ecoroses — our April FOB pricelist is still the basis. The alert should be cleared without changing formula price, or the formula needs to reference the FOB pricelist not K2K."
                value={whatShouldHappen}
                onChange={e => setWhatShouldHappen(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                <div className="flex gap-2">
                  {(['P0', 'P1', 'P2'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setCorrectionPriority(p)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        correctionPriority === p
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
                {correctionError && <p className="text-xs text-red-600">{correctionError}</p>}
                <button
                  onClick={() => { setShowCorrection(false); setCorrectionError(null); }}
                  className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
                  disabled={correctionBusy}
                >
                  Cancel
                </button>
                <button
                  onClick={sendPriceCorrection}
                  disabled={correctionBusy}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                  {correctionBusy ? 'Sending...' : 'Send correction to Rose'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
