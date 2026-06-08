// Decision bar for a single cohort lead. Client child of the server page.
// v1 | 2026-06-08 | Job_PM (CPO)
//
// Approve / Challenge / "I see it differently" + rationale. POSTs to
// /api/admin/cohort-review/decide. Optimistic UI: stamps "logged" on success,
// refreshes the server data so the row reflects the persisted decision.
//
// Mirrors the /mockups/cohort-review sticky decision bar idiom and the
// approval-queue Actions.tsx fetch idiom (busy state, error surface).

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Decision = 'approve' | 'challenge' | 'differently';

interface Props {
  orderId: number;
  cohortId: string;
  systemSuggestion: string; // the engine's send/nurture rec, recorded with the decision
  canApprove: boolean; // only 'qualified' orders advance on approve
  initialDecision?: { decision: string; rationale: string | null } | null;
}

export default function DecisionBar({
  orderId,
  cohortId,
  systemSuggestion,
  canApprove,
  initialDecision = null,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDifferent, setShowDifferent] = useState(false);
  const [rationale, setRationale] = useState('');
  const [logged, setLogged] = useState<{ decision: string; rationale: string | null } | null>(
    initialDecision,
  );

  async function decide(decision: Decision) {
    if (decision === 'differently' && rationale.trim().length < 5) {
      setError("Add a note for 'I see it differently' (min 5 chars).");
      return;
    }
    setBusy(decision);
    setError(null);
    // Optimistic stamp.
    const optimistic = { decision, rationale: rationale.trim() || null };
    setLogged(optimistic);
    try {
      const res = await fetch('/api/admin/cohort-review/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          cohort_id: cohortId,
          system_suggestion: systemSuggestion,
          decision,
          rationale: rationale.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.detail ? `${json.error}: ${json.detail}` : (json.error ?? `HTTP ${res.status}`));
      }
      setShowDifferent(false);
      router.refresh();
    } catch (e) {
      setLogged(initialDecision); // roll back the optimistic stamp
      setError(e instanceof Error ? e.message : 'decision failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-slate-200 bg-white/95 backdrop-blur px-5 py-3 space-y-2 sticky bottom-0">
      {logged && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-medium text-emerald-800 flex items-center gap-1.5">
          <span aria-hidden>&#10003;</span> logged: {logged.decision}
          {logged.rationale ? (
            <span className="font-normal italic text-emerald-700"> &mdash; &ldquo;{logged.rationale}&rdquo;</span>
          ) : null}
        </div>
      )}
      {showDifferent && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            I see it differently &mdash; what is actually correct + why
          </label>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="why (recorded with your decision)"
            rows={2}
            className="mt-1 w-full text-sm rounded-md border border-amber-200 px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide('approve')}
          className="text-sm font-semibold px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === 'approve' ? 'Approving...' : canApprove ? 'Approve & advance' : 'Approve'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide('challenge')}
          className="text-sm font-medium px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {busy === 'challenge' ? 'Saving...' : 'Challenge'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (showDifferent) {
              decide('differently');
            } else {
              setShowDifferent(true);
            }
          }}
          className={
            'text-sm font-medium px-3 py-2 rounded-lg border disabled:opacity-50 ' +
            (showDifferent
              ? 'bg-amber-100 border-amber-300 text-amber-800'
              : 'bg-white border-slate-200 text-emerald-700 hover:bg-slate-50')
          }
        >
          {busy === 'differently' ? 'Saving...' : showDifferent ? 'Submit difference' : 'I see it differently'}
        </button>
      </div>
      {!showDifferent && (
        <input
          type="text"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="why (recorded with your decision)"
          className="w-full text-sm rounded-md border border-slate-200 px-2.5 py-1.5 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      )}
      {error && (
        <p className="text-[11px] text-red-600 font-mono whitespace-normal">{error}</p>
      )}
      {canApprove ? (
        <p className="text-[10px] text-slate-400">
          Approve advances this order qualified &rarr; approved. (v1: the state-log
          actor records as &lsquo;system&rsquo; &mdash; the decision actor is on the
          cohort_decisions row.)
        </p>
      ) : (
        <p className="text-[10px] text-slate-400">
          Not yet &lsquo;qualified&rsquo; &mdash; the decision is logged but the order
          state is not advanced.
        </p>
      )}
    </div>
  );
}
