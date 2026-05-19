'use client';
// Post-delivery feedback form for one dispatch (admin-proxy entry).
// v1 | 2026-05-19 | Job_PM Phase F [V8 SHADOW]
//
// Shows when dispatches.status='delivered'. UC-O-199 (UC-O-198 customer flow
// is Phase G, behind a feedback token route).
//
// Note: AI-Infra (Rose) consumes these tables nightly to populate
// supply_quality_scores (UC-O-200). Job writes the observation; Rose updates
// the score. Do not modify supply_quality_scores from this component.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SkuRow {
  sku_id: string;
  sku_name: string;
}

interface Props {
  dispatchId: string;
  existingFeedbackCount: number;
  skus: SkuRow[];
}

interface SkuScoreState {
  [skuId: string]: { score: number | null; notes: string };
}

function ScoreRadio({
  value,
  onChange,
  name,
}: {
  value: number | null;
  onChange: (n: number) => void;
  name: string;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            className="sr-only"
          />
          <span
            className={`inline-block w-7 h-7 rounded-full border text-xs font-semibold flex items-center justify-center ${
              value === n
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-500 border-slate-300 hover:border-slate-500'
            }`}
            style={{ display: 'inline-flex' }}
          >
            {n}
          </span>
        </label>
      ))}
    </div>
  );
}

export default function DispatchFeedbackForm({
  dispatchId,
  existingFeedbackCount,
  skus,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [conditionScore, setConditionScore] = useState<number | null>(null);
  const [vendorScore, setVendorScore] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [skuScores, setSkuScores] = useState<SkuScoreState>({});

  function setSkuScore(skuId: string, score: number) {
    setSkuScores((p) => ({
      ...p,
      [skuId]: { score, notes: p[skuId]?.notes ?? '' },
    }));
  }
  function setSkuNotes(skuId: string, n: string) {
    setSkuScores((p) => ({
      ...p,
      [skuId]: { score: p[skuId]?.score ?? null, notes: n },
    }));
  }

  async function submit() {
    if (conditionScore === null) {
      setErr('Condition score is required.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const skuPayload = Object.entries(skuScores)
        .filter(([, v]) => v.score !== null || v.notes.trim())
        .map(([sku_id, v]) => ({
          sku_id,
          sku_score: v.score,
          sku_notes: v.notes.trim() || null,
        }));
      const res = await fetch(`/api/admin/dispatch/${dispatchId}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          condition_score: conditionScore,
          vendor_score: vendorScore,
          notes: notes.trim() || null,
          sku_scores: skuPayload,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.detail ? `${j.error}: ${j.detail}` : (j.error ?? `HTTP ${res.status}`));
      }
      setOpen(false);
      setConditionScore(null);
      setVendorScore(null);
      setNotes('');
      setSkuScores({});
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'submit failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-semibold text-violet-700 hover:text-violet-900 border border-violet-300 hover:border-violet-500 px-2 py-0.5 rounded"
        >
          {existingFeedbackCount > 0
            ? `Add feedback (${existingFeedbackCount} on record)`
            : 'Capture customer feedback'}
        </button>
      ) : (
        <div className="border border-violet-200 bg-violet-50 rounded p-3 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-1">
              Overall condition score (1 = damaged, 5 = perfect)
            </p>
            <ScoreRadio
              value={conditionScore}
              onChange={setConditionScore}
              name={`condition-${dispatchId}`}
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-1">
              Vendor score (optional)
            </p>
            <ScoreRadio
              value={vendorScore}
              onChange={setVendorScore}
              name={`vendor-${dispatchId}`}
            />
          </div>
          <label className="block text-xs font-semibold text-slate-700">
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-0.5 w-full text-xs border border-slate-300 rounded px-2 py-1"
              placeholder="What did the customer say?"
            />
          </label>
          {skus.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1">Per-SKU score</p>
              <div className="space-y-2">
                {skus.map((s) => (
                  <div key={s.sku_id} className="border border-slate-200 rounded p-2">
                    <p className="text-xs text-slate-700 mb-1 truncate" title={s.sku_name}>
                      {s.sku_name}
                    </p>
                    <ScoreRadio
                      value={skuScores[s.sku_id]?.score ?? null}
                      onChange={(n) => setSkuScore(s.sku_id, n)}
                      name={`sku-${dispatchId}-${s.sku_id}`}
                    />
                    <input
                      type="text"
                      value={skuScores[s.sku_id]?.notes ?? ''}
                      onChange={(e) => setSkuNotes(s.sku_id, e.target.value)}
                      placeholder="SKU notes"
                      className="mt-1 w-full text-xs border border-slate-300 rounded px-2 py-0.5"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setErr(null);
              }}
              disabled={busy}
              className="text-xs px-3 py-1 rounded border border-slate-200 text-slate-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="text-xs px-3 py-1 rounded bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save feedback'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
