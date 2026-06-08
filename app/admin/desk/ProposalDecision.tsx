// Inline decision capture for a Zone 2 proposal card on Facu's Desk.
// v1 | 2026-06-08 | Job_PM (CPO)
//
// Approve / Correct / "I see it differently" + rationale, posting to the EXISTING
// governed per-proposal routes (no new write path):
//   - Approve     -> POST /api/admin/proposals/[id]/approve   { reason, facu_rationale, urgency_tier:'routine' }
//   - Correct     -> POST /api/admin/proposals/[id]/reject    { reason, facu_rationale }
//   - Differently -> POST /api/admin/proposals/[id]/frame-correction { what_is_wrong, what_should_be_true }
//
// "Correct" maps to reject (the system's answer is wrong but the framing stands);
// "I see it differently" maps to frame-correction (the premise is wrong). This
// brings the approval-queue decision idiom inline on the Desk without redesigning
// the page. router.refresh() on success drops the decided card.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Mode = 'approve' | 'correct' | 'differently';

interface Props {
  proposalId: string;
}

const MIN_FRAME = 20;

export default function ProposalDecision({ proposalId }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [rationale, setRationale] = useState('');
  const [whatShouldBeTrue, setWhatShouldBeTrue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!mode) return;
    setError(null);

    if (mode === 'approve' || mode === 'correct') {
      if (rationale.trim().length < 5) {
        setError('Rationale required (min 5 chars).');
        return;
      }
    } else {
      if (rationale.trim().length < MIN_FRAME || whatShouldBeTrue.trim().length < MIN_FRAME) {
        setError(`Both fields required (min ${MIN_FRAME} chars each).`);
        return;
      }
    }

    setBusy(true);
    try {
      let url: string;
      let payload: Record<string, unknown>;
      if (mode === 'approve') {
        url = `/api/admin/proposals/${proposalId}/approve`;
        payload = { reason: rationale.trim(), facu_rationale: rationale.trim(), urgency_tier: 'routine' };
      } else if (mode === 'correct') {
        url = `/api/admin/proposals/${proposalId}/reject`;
        payload = { reason: rationale.trim(), facu_rationale: rationale.trim() };
      } else {
        url = `/api/admin/proposals/${proposalId}/frame-correction`;
        payload = { what_is_wrong: rationale.trim(), what_should_be_true: whatShouldBeTrue.trim() };
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.detail ? `${json.error}: ${json.detail}` : (json.error ?? `HTTP ${res.status}`));
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'decision failed');
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 space-y-2">
      {mode === null ? (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { setMode('approve'); setError(null); }}
            className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => { setMode('correct'); setError(null); }}
            className="text-xs font-semibold text-red-700 border border-red-200 hover:border-red-400 hover:bg-red-50 px-3 py-1.5 rounded-md"
          >
            Correct
          </button>
          <button
            type="button"
            onClick={() => { setMode('differently'); setError(null); }}
            className="text-xs font-semibold text-violet-700 border border-violet-200 hover:border-violet-400 hover:bg-violet-50 px-3 py-1.5 rounded-md"
          >
            I see it differently
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {mode === 'approve'
              ? 'Why approve (rationale, recorded)'
              : mode === 'correct'
                ? 'What the system got wrong (rationale, recorded)'
                : `What is wrong with the premise (min ${MIN_FRAME})`}
          </label>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            className="w-full text-sm rounded-md border border-slate-200 px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {mode === 'differently' && (
            <>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                What should be true instead (min {MIN_FRAME})
              </label>
              <textarea
                value={whatShouldBeTrue}
                onChange={(e) => setWhatShouldBeTrue(e.target.value)}
                rows={2}
                className="w-full text-sm rounded-md border border-slate-200 px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
            >
              {busy ? 'Submitting...' : `Submit ${mode}`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setMode(null); setError(null); }}
              className="text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-100 px-3 py-1.5 rounded-md disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-[11px] text-red-600 font-mono">{error}</p>}
    </div>
  );
}
