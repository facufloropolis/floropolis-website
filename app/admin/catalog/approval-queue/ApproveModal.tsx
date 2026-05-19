// Approve modal for /admin/catalog/approval-queue.
// v1 | 2026-05-19 | Job_PM Phase C [V8 SHADOW]
//
// Phase C upgrade: a single confirm dialog is not enough now that approve
// carries (a) a mandatory facu_rationale and (b) an urgency_tier that drives
// verifier SLA. Modal collects both before POSTing to
// /api/admin/proposals/[id]/approve.
//
// Urgency tiers (per Rose contract + BRD UC-O-204):
//   - routine   72h SLA (default)
//   - urgent    12h SLA (e.g. live customer-facing alert, blocking traffic)
//   - critical   4h SLA (e.g. price mismatch costing money right now)
//
// Bumping above routine requires a 20+ char rationale (the API enforces this
// too; this modal warns inline so the operator catches it before submit).

'use client';

import { useEffect, useRef, useState } from 'react';

export type UrgencyTier = 'routine' | 'urgent' | 'critical';

interface Props {
  open: boolean;
  proposalShort: string;
  cascadeLabel: string; // e.g. "42 SKUs", "all SKUs (global)", "TBD"
  busy: boolean;
  onCancel: () => void;
  onSubmit: (args: { facu_rationale: string; urgency_tier: UrgencyTier }) => void;
}

const TIERS: Array<{
  id: UrgencyTier;
  label: string;
  sla: string;
  tone: string;
}> = [
  {
    id: 'routine',
    label: 'Routine',
    sla: '72h verifier SLA',
    tone: 'border-slate-300 bg-white text-slate-900 hover:border-slate-400',
  },
  {
    id: 'urgent',
    label: 'Urgent',
    sla: '12h verifier SLA',
    tone: 'border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500',
  },
  {
    id: 'critical',
    label: 'Critical',
    sla: '4h verifier SLA',
    tone: 'border-red-300 bg-red-50 text-red-900 hover:border-red-500',
  },
];

const MIN_RATIONALE = 5;
const MIN_RATIONALE_BUMPED = 20;
const MAX_RATIONALE = 4000;

export default function ApproveModal({
  open,
  proposalShort,
  cascadeLabel,
  busy,
  onCancel,
  onSubmit,
}: Props) {
  const [tier, setTier] = useState<UrgencyTier>('routine');
  const [rationale, setRationale] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setTier('routine');
      setRationale('');
      const t = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const trimmed = rationale.trim();
  const minForTier = tier === 'routine' ? MIN_RATIONALE : MIN_RATIONALE_BUMPED;
  const tooShort = trimmed.length < minForTier;
  const tooLong = trimmed.length > MAX_RATIONALE;
  const canSubmit = !busy && !tooShort && !tooLong;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ facu_rationale: trimmed, urgency_tier: tier });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approve-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2
            id="approve-modal-title"
            className="text-sm font-semibold text-slate-900"
          >
            Approve proposal{' '}
            <span className="font-mono text-slate-500">#{proposalShort}</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-1">
            Executor will write the change to the source table immediately. Then
            Rose runs the verifier on the new override_audit row. Cascade
            impact: <span className="font-semibold">{cascadeLabel}</span>.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Urgency tier */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
              Urgency tier
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TIERS.map((t) => {
                const active = t.id === tier;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTier(t.id)}
                    disabled={busy}
                    className={`text-left rounded-md border px-3 py-2 transition-colors ${
                      active
                        ? 'ring-2 ring-emerald-500 border-emerald-400 bg-emerald-50 text-emerald-900'
                        : t.tone
                    } disabled:opacity-60`}
                  >
                    <div className="text-xs font-semibold">{t.label}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">
                      {t.sla}
                    </div>
                  </button>
                );
              })}
            </div>
            {tier !== 'routine' && (
              <p className="text-[10px] text-amber-700 mt-1.5">
                Bumping above routine requires a rationale of at least{' '}
                {MIN_RATIONALE_BUMPED} chars.
              </p>
            )}
          </div>

          {/* Rationale */}
          <div>
            <label
              htmlFor="approve-modal-textarea"
              className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold"
            >
              Your rationale (required, min {minForTier} chars)
            </label>
            <textarea
              id="approve-modal-textarea"
              ref={textareaRef}
              className="mt-1 w-full h-28 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
              placeholder="e.g. price mismatch confirmed against vendor invoice on file -- fix now"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              maxLength={MAX_RATIONALE + 100}
              disabled={busy}
            />
            <div className="flex justify-between mt-1.5 text-[10px] text-slate-500">
              <span>
                {tooShort ? (
                  <span className="text-red-600">
                    {minForTier - trimmed.length} more char
                    {minForTier - trimmed.length === 1 ? '' : 's'}
                  </span>
                ) : tooLong ? (
                  <span className="text-red-600">
                    too long by {trimmed.length - MAX_RATIONALE}
                  </span>
                ) : (
                  <span className="text-emerald-700">ok</span>
                )}
              </span>
              <span>
                {trimmed.length} / {MAX_RATIONALE}
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 rounded-b-xl flex justify-end gap-2 border-t border-slate-200">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-white px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            {busy
              ? 'Approving...'
              : tier === 'critical'
                ? 'Approve (critical)'
                : tier === 'urgent'
                  ? 'Approve (urgent)'
                  : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}
