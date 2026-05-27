// "I see this differently" modal for /admin/catalog/approval-queue.
// v1 | 2026-05-26 | Job_PM [V8 SHADOW]
//
// Third decision path: when the proposal's premise is wrong, not just the
// answer. Captures two required fields:
//   - what_is_wrong: what the system incorrectly assumed
//   - what_should_be_true: what is actually correct + what should happen
//
// Both fields require min 20 chars to force specificity. The correction lands
// in admin_approvals.correction_data + override_audit.after_jsonb so the
// generating system can read it and re-propose with the right framing.
//
// No executor runs. No target table is mutated.

'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  proposalShort: string;
  proposalType: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (args: { what_is_wrong: string; what_should_be_true: string }) => void;
}

const MIN_LEN = 20;
const MAX_LEN = 4000;

export default function FramingModal({
  open,
  proposalShort,
  proposalType,
  busy,
  onCancel,
  onSubmit,
}: Props) {
  const [whatIsWrong, setWhatIsWrong] = useState('');
  const [whatShouldBeTrue, setWhatShouldBeTrue] = useState('');
  const firstRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setWhatIsWrong('');
      setWhatShouldBeTrue('');
      const t = setTimeout(() => firstRef.current?.focus(), 0);
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

  const wrongTrimmed = whatIsWrong.trim();
  const trueTrimmed = whatShouldBeTrue.trim();
  const wrongOk = wrongTrimmed.length >= MIN_LEN && wrongTrimmed.length <= MAX_LEN;
  const trueOk = trueTrimmed.length >= MIN_LEN && trueTrimmed.length <= MAX_LEN;
  const canSubmit = !busy && wrongOk && trueOk;

  function charHint(val: string): { label: string; cls: string } {
    const len = val.trim().length;
    if (len === 0) return { label: `min ${MIN_LEN} chars`, cls: 'text-slate-400' };
    if (len < MIN_LEN) return { label: `${MIN_LEN - len} more`, cls: 'text-red-600' };
    if (len > MAX_LEN) return { label: `too long by ${len - MAX_LEN}`, cls: 'text-red-600' };
    return { label: 'ok', cls: 'text-emerald-700' };
  }

  const wrongHint = charHint(whatIsWrong);
  const trueHint = charHint(whatShouldBeTrue);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="framing-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-violet-200">
        <div className="px-5 py-4 border-b border-violet-100 bg-violet-50 rounded-t-xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-violet-100 text-violet-800">
              I see this differently
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              #{proposalShort}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold uppercase tracking-wide">
              {proposalType}
            </span>
          </div>
          <h2
            id="framing-modal-title"
            className="text-sm font-semibold text-slate-900"
          >
            Correct the framing
          </h2>
          <p className="text-[11px] text-slate-500 mt-1">
            The system will mark this proposal as framing-rejected and log your
            correction. No change is applied to the target table. The
            generating agent reads this and re-proposes with the right framing.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label
              htmlFor="framing-wrong"
              className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold"
            >
              What the system got wrong (min {MIN_LEN} chars)
            </label>
            <textarea
              id="framing-wrong"
              ref={firstRef}
              className="mt-1 w-full h-24 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
              placeholder="e.g. the formula deviation flag is incorrect here — this vendor uses a fixed pricelist, not the formula"
              value={whatIsWrong}
              onChange={(e) => setWhatIsWrong(e.target.value)}
              disabled={busy}
            />
            <div className="flex justify-between mt-1 text-[10px]">
              <span className={wrongHint.cls}>{wrongHint.label}</span>
              <span className="text-slate-400">{wrongTrimmed.length} / {MAX_LEN}</span>
            </div>
          </div>

          <div>
            <label
              htmlFor="framing-true"
              className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold"
            >
              What is actually true / what should happen (min {MIN_LEN} chars)
            </label>
            <textarea
              id="framing-true"
              className="mt-1 w-full h-24 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
              placeholder="e.g. price is correct per the signed pricelist. Generator should exclude vendors with cost_source='fixed_pricelist' from formula deviation checks"
              value={whatShouldBeTrue}
              onChange={(e) => setWhatShouldBeTrue(e.target.value)}
              disabled={busy}
            />
            <div className="flex justify-between mt-1 text-[10px]">
              <span className={trueHint.cls}>{trueHint.label}</span>
              <span className="text-slate-400">{trueTrimmed.length} / {MAX_LEN}</span>
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
            onClick={() => {
              if (!canSubmit) return;
              onSubmit({ what_is_wrong: wrongTrimmed, what_should_be_true: trueTrimmed });
            }}
            className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            {busy ? 'Submitting...' : 'Submit correction'}
          </button>
        </div>
      </div>
    </div>
  );
}
