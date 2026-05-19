// Reject modal for /admin/catalog/approval-queue.
// v1 | 2026-05-19 | Job_PM Phase C [V8 SHADOW]
//
// Replaces the previous window.prompt-based reject flow. Renders a custom
// backdrop modal with a textarea for the rejection rationale. The rationale is
// captured into admin_approvals.facu_rationale (NOT NULL per Rose contract
// v1.0 P4). Minimum 5 characters; submit is disabled below that.
//
// Controlled component: parent (Actions.tsx) owns the open/close state and
// receives onSubmit(rationale). Submit calls onSubmit; the parent handles the
// actual POST and the loading state.

'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  proposalShort: string; // short proposal id for display (8 chars)
  busy: boolean;
  onCancel: () => void;
  onSubmit: (rationale: string) => void;
}

const MIN_LEN = 5;
const MAX_LEN = 2000;

export default function RejectModal({
  open,
  proposalShort,
  busy,
  onCancel,
  onSubmit,
}: Props) {
  const [rationale, setRationale] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset + focus when opened.
  useEffect(() => {
    if (open) {
      setRationale('');
      // Focus on next tick so the element is in the DOM.
      const t = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Escape to cancel.
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
  const tooShort = trimmed.length < MIN_LEN;
  const tooLong = trimmed.length > MAX_LEN;
  const canSubmit = !busy && !tooShort && !tooLong;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(trimmed);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2
            id="reject-modal-title"
            className="text-sm font-semibold text-slate-900"
          >
            Reject proposal{' '}
            <span className="font-mono text-slate-500">#{proposalShort}</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-1">
            Your rationale lands in admin_approvals.facu_rationale. The
            proposing agent reads this. Be specific so they can re-propose
            sharper next time.
          </p>
        </div>
        <div className="px-5 py-4">
          <label
            htmlFor="reject-modal-textarea"
            className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold"
          >
            Rationale (required, min {MIN_LEN} chars)
          </label>
          <textarea
            id="reject-modal-textarea"
            ref={textareaRef}
            className="mt-1 w-full h-32 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
            placeholder="e.g. wrong scope -- this should be category=Roses, not all SKUs"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            maxLength={MAX_LEN + 100}
            disabled={busy}
          />
          <div className="flex justify-between mt-1.5 text-[10px] text-slate-500">
            <span>
              {tooShort ? (
                <span className="text-red-600">
                  {MIN_LEN - trimmed.length} more char
                  {MIN_LEN - trimmed.length === 1 ? '' : 's'}
                </span>
              ) : tooLong ? (
                <span className="text-red-600">
                  too long by {trimmed.length - MAX_LEN}
                </span>
              ) : (
                <span className="text-emerald-700">ok</span>
              )}
            </span>
            <span>
              {trimmed.length} / {MAX_LEN}
            </span>
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
            className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            {busy ? 'Rejecting...' : 'Reject proposal'}
          </button>
        </div>
      </div>
    </div>
  );
}
