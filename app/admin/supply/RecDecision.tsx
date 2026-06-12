// Inline decision capture for a Supply Engine variety row.
// v1 | 2026-06-08 | Job_PM (CPO)
//
// Approve / Reject / "Correct (reason)" + an optional reason. Posts to the
// governed write route POST /api/admin/supply/decide with { variety, rec_type,
// decision, reason }. The route inserts into supply_recommendation_feedback,
// which feeds learned_delta back into v_supply_recommendations (the loop).
//
// UX: optimistic "logged" stamp on success + router.refresh() so the next load
// reflects the re-ranking. Reason is optional for approve/reject; for "correct"
// it is the whole point (records WHY the rec is wrong), so we require it there.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Decision = 'approve' | 'reject' | 'correct';

interface Props {
  variety: string;
  recType: string;
}

export default function RecDecision({ variety, recType }: Props) {
  const router = useRouter();
  const [openReasonFor, setOpenReasonFor] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState<Decision | null>(null);
  const [pendingPriority, setPendingPriority] = useState<number | null>(null);

  // PRIORITIZATION feedback: steer the rank itself, not just the rec content. Opens the reason
  // box (the WHY is required); submitting sends a 'correct' decision + the numeric priority nudge.
  function onPriority(delta: number) {
    setError(null);
    setPendingPriority(delta);
    setOpenReasonFor('correct');
  }

  async function send(decision: Decision, reasonText: string, priorityDelta?: number) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/supply/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          variety,
          rec_type: recType,
          decision,
          reason: reasonText.trim() || undefined,
          priority_delta: typeof priorityDelta === 'number' ? priorityDelta : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.detail ? `${json.error}: ${json.detail}` : json.error ?? `HTTP ${res.status}`,
        );
      }
      setLogged(decision); // optimistic stamp
      setOpenReasonFor(null);
      setReason('');
      setPendingPriority(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'decision failed');
    } finally {
      setBusy(false);
    }
  }

  function onClick(decision: Decision) {
    setError(null);
    if (decision === 'correct') {
      // Correct needs a reason — that IS the signal. Open the box.
      setOpenReasonFor('correct');
      return;
    }
    // Approve / reject: send immediately with any reason already typed.
    void send(decision, reason);
  }

  if (logged) {
    return (
      <div className="px-5 py-3 bg-emerald-50 border-t border-emerald-100 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <span aria-hidden className="text-emerald-600">✓</span>
        {logged === 'approve'
          ? 'Approved'
          : logged === 'reject'
            ? 'Rejected'
            : 'Correction recorded'}{' '}
        — logged. Re-ranks the next load.
      </div>
    );
  }

  return (
    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy}
          onClick={() => onClick('approve')}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 rounded-xl shadow-sm transition-colors disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onClick('reject')}
          className="text-xs font-semibold text-red-700 bg-white border border-red-200 hover:border-red-400 hover:bg-red-50 px-3.5 py-2 rounded-xl transition-colors disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onClick('correct')}
          className="text-xs font-semibold text-violet-700 bg-white border border-violet-200 hover:border-violet-400 hover:bg-violet-50 px-3.5 py-2 rounded-xl transition-colors disabled:opacity-50"
        >
          Correct (reason)
        </button>
        {openReasonFor === null && (
          <span className="text-[11px] text-slate-400">
            Reason optional for approve / reject
          </span>
        )}
      </div>

      {/* PRIORITIZATION feedback — steer the order, not just the content (Facu's ask). */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-medium text-slate-500">Prioridad:</span>
        <button type="button" disabled={busy} onClick={() => onPriority(8)}
          className="text-[11px] font-semibold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
          ↑ subir
        </button>
        <button type="button" disabled={busy} onClick={() => onPriority(-6)}
          className="text-[11px] font-semibold text-amber-700 bg-white border border-amber-200 hover:bg-amber-50 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
          ↓ bajar
        </button>
        <button type="button" disabled={busy} onClick={() => onPriority(-14)}
          className="text-[11px] font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
          ✕ no es prioridad
        </button>
        <span className="text-[11px] text-slate-400">— el por qué entrena el orden</span>
      </div>

      {openReasonFor === 'correct' && (
        <div className="space-y-2 rounded-xl border border-violet-200 bg-white p-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-violet-700">
            What is wrong with this recommendation (recorded as the signal)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Por que la recomendacion esta mal..."
            className="w-full text-sm rounded-lg border border-slate-200 px-2.5 py-2 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || reason.trim().length < 3}
              onClick={() => void send('correct', reason, pendingPriority ?? undefined)}
              className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-3.5 py-2 rounded-xl shadow-sm transition-colors disabled:opacity-50"
            >
              {busy ? 'Submitting...' : pendingPriority != null ? 'Guardar prioridad' : 'Submit correction'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpenReasonFor(null);
                setReason('');
                setPendingPriority(null);
                setError(null);
              }}
              className="text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 px-3.5 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-red-600 font-mono break-words">{error}</p>
      )}
    </div>
  );
}
