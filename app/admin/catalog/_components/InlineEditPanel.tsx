// InlineEditPanel — chip strip + modal edit panel for blocking gates.
// v1 | 2026-05-28 | Job_PM Catalog Ship 1 [V8 SHADOW]
//
// Renders inline on each /admin/catalog row that BlockingChips computed
// failing-gate chips for. Click a chip → modal opens for THAT gate with a
// gate-specific input + mandatory multi-line rationale textarea.
//
// Submit posts to /api/admin/catalog/inline-edit which:
//   1. Inserts admin_proposals (type='mirror.field_correction')
//   2. Immediately POSTs /api/admin/proposals/[id]/approve so the executor
//      writes through to floropolis_inventory_mirror in the same handshake.
//
// Rationale field is REQUIRED. Min 20 chars before Submit enables. Empty or
// auto-defaulted rationales are blocked at the input level + re-checked on
// the server. Per Facu directive 2026-05-28: rationales are context for
// future decisions, not compliance.

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ChipCategory, ChipDescriptor, GateId } from './BlockingChips';

// ---------------------------------------------------------------------------
// Per-category chip color (matches the existing /admin/catalog flag-pill style)
// ---------------------------------------------------------------------------

const CHIP_CLS: Record<ChipCategory, string> = {
  pricing: 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100',
  trust: 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100',
  fulfillment: 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100',
};

// ---------------------------------------------------------------------------
// Per-gate input config — drives the form field rendered inside the modal
// ---------------------------------------------------------------------------

type InputKind = 'text' | 'url' | 'select_unit' | 'date' | 'price' | 'textarea';

const INPUT_KIND: Record<GateId, InputKind> = {
  missing_cost_source: 'text',
  price_zero: 'price',
  missing_image: 'url',
  missing_unit: 'select_unit',
  missing_vendor_name: 'text',
  missing_contents_description: 'textarea',
  t2_outside_5d_window: 'date',
  t3_outside_14d_window: 'date',
  missing_arrival_date: 'date',
};

const INPUT_LABEL: Record<GateId, string> = {
  missing_cost_source: 'Cost source',
  price_zero: 'New price (USD)',
  missing_image: 'Image URL',
  missing_unit: 'Unit',
  missing_vendor_name: 'Vendor name',
  missing_contents_description: 'Contents description',
  t2_outside_5d_window: 'Arrival date',
  t3_outside_14d_window: 'Arrival date',
  missing_arrival_date: 'Arrival date',
};

const INPUT_PLACEHOLDER: Record<GateId, string> = {
  missing_cost_source: 'e.g. Komet PDF / vendor email subject / FedEx invoice',
  price_zero: '0.00',
  missing_image: 'https://...',
  missing_unit: '',
  missing_vendor_name: 'Vendor name as it should appear on PDP',
  missing_contents_description: 'What\'s in the box (variety, length, count)',
  t2_outside_5d_window: '',
  t3_outside_14d_window: '',
  missing_arrival_date: '',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InlineEditPanelProps {
  sku_id: number;
  sku_name: string;
  sku_vendor: string;
  sku_status: 'blocked' | 'publishable' | 'perfect';
  chips: ChipDescriptor[];
}

interface SubmitState {
  loading: boolean;
  error: string | null;
  success: string | null;
}

const RATIONALE_MIN_CHARS = 20;

export default function InlineEditPanel({
  sku_id,
  sku_name,
  sku_vendor,
  sku_status,
  chips,
}: InlineEditPanelProps) {
  const router = useRouter();
  const [openGate, setOpenGate] = useState<ChipDescriptor | null>(null);
  const [afterValue, setAfterValue] = useState<string>('');
  const [rationale, setRationale] = useState<string>('');
  const [submitState, setSubmitState] = useState<SubmitState>({
    loading: false,
    error: null,
    success: null,
  });

  function openChip(chip: ChipDescriptor) {
    setOpenGate(chip);
    setAfterValue('');
    setRationale('');
    setSubmitState({ loading: false, error: null, success: null });
  }

  function closeModal() {
    setOpenGate(null);
    setAfterValue('');
    setRationale('');
    setSubmitState({ loading: false, error: null, success: null });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!openGate) return;
    const trimmedRationale = rationale.trim();
    if (trimmedRationale.length < RATIONALE_MIN_CHARS) {
      setSubmitState({
        loading: false,
        error: `Rationale must be at least ${RATIONALE_MIN_CHARS} characters.`,
        success: null,
      });
      return;
    }
    const trimmedAfter = afterValue.trim();
    if (trimmedAfter.length === 0) {
      setSubmitState({
        loading: false,
        error: `${INPUT_LABEL[openGate.gate_id]} is required.`,
        success: null,
      });
      return;
    }
    setSubmitState({ loading: true, error: null, success: null });
    try {
      const res = await fetch('/api/admin/catalog/inline-edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sku_id,
          gate: openGate.gate_id,
          target_field: openGate.target_field,
          before_value: openGate.before_value,
          after_value: trimmedAfter,
          rationale: trimmedRationale,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        proposal_id?: string;
      };
      if (!res.ok || !data.ok) {
        const detail = data.detail ?? data.error ?? `HTTP ${res.status}`;
        setSubmitState({ loading: false, error: detail, success: null });
        return;
      }
      setSubmitState({
        loading: false,
        error: null,
        success: 'Updated. Refreshing row…',
      });
      // Let the user see the success message, then close + revalidate.
      setTimeout(() => {
        closeModal();
        router.refresh();
      }, 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'network_error';
      setSubmitState({ loading: false, error: msg, success: null });
    }
  }

  const rationaleOk = rationale.trim().length >= RATIONALE_MIN_CHARS;
  const afterOk = afterValue.trim().length > 0;
  const submitDisabled = submitState.loading || !rationaleOk || !afterOk;

  return (
    <>
      {/* Chip strip — replaces the previous static failed-gate pills in the
          Flags column. Each chip is a button that opens the modal for that gate. */}
      <div className="flex flex-wrap gap-1">
        {chips.map((chip) => (
          <button
            key={chip.gate_id}
            type="button"
            onClick={() => openChip(chip)}
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${CHIP_CLS[chip.category]}`}
            title={`Click to fix: ${chip.short_label}`}
          >
            {chip.short_label}
          </button>
        ))}
      </div>

      {/* Modal — single instance for the open gate. */}
      {openGate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label={`Fix ${openGate.short_label} for ${sku_name}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                    Fix blocker
                  </p>
                  <h2 className="text-sm font-semibold text-slate-900 mt-0.5">
                    {openGate.short_label}
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    #{sku_id} · {sku_name} · {sku_vendor} ·{' '}
                    <span className={
                      sku_status === 'perfect' ? 'text-emerald-700'
                      : sku_status === 'publishable' ? 'text-amber-700'
                      : 'text-red-700'
                    }>
                      {sku_status}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-slate-400 hover:text-slate-700 text-sm"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
              {/* Current value */}
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                  Current value
                </p>
                <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 font-mono break-all">
                  {openGate.before_value == null || openGate.before_value === ''
                    ? <span className="text-slate-400 italic">empty</span>
                    : String(openGate.before_value)}
                </div>
              </div>

              {/* Input — per-gate kind */}
              <div>
                <label
                  htmlFor="inline-edit-after"
                  className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1"
                >
                  {INPUT_LABEL[openGate.gate_id]} <span className="text-red-600">*</span>
                </label>
                {renderInput(openGate.gate_id, afterValue, setAfterValue)}
              </div>

              {/* Rationale — required, NOT pre-populated */}
              <div>
                <label
                  htmlFor="inline-edit-rationale"
                  className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1"
                >
                  Why this change? <span className="text-red-600">*</span>
                  <span className="ml-1 text-[10px] font-normal normal-case text-slate-400">
                    (min {RATIONALE_MIN_CHARS} chars — what does it solve? what did you rule out?)
                  </span>
                </label>
                <textarea
                  id="inline-edit-rationale"
                  rows={3}
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Why this change? What does it solve? What did you rule out?"
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y"
                />
                <div className="flex items-center justify-between mt-1">
                  <p className={`text-[10px] ${rationaleOk ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {rationale.trim().length}/{RATIONALE_MIN_CHARS}+ characters
                  </p>
                </div>
              </div>

              {/* Error / Success */}
              {submitState.error && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                  {submitState.error}
                </div>
              )}
              {submitState.success && (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                  {submitState.success}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                  disabled={submitState.loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitDisabled}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium ${
                    submitDisabled
                      ? 'bg-emerald-300 text-white cursor-not-allowed'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {submitState.loading ? 'Submitting…' : 'Submit + auto-approve'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Per-gate input renderer
// ---------------------------------------------------------------------------

function renderInput(
  gate: GateId,
  value: string,
  setValue: (v: string) => void,
): React.ReactElement {
  const kind = INPUT_KIND[gate];
  const placeholder = INPUT_PLACEHOLDER[gate];
  const common =
    'w-full px-2 py-1.5 text-sm rounded-md border border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

  if (kind === 'select_unit') {
    return (
      <select
        id="inline-edit-after"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={common}
      >
        <option value="">Select unit…</option>
        <option value="Stem">Stem</option>
        <option value="Bunch">Bunch</option>
        <option value="Box">Box</option>
      </select>
    );
  }
  if (kind === 'date') {
    return (
      <input
        id="inline-edit-after"
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={common}
      />
    );
  }
  if (kind === 'price') {
    return (
      <input
        id="inline-edit-after"
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={common}
      />
    );
  }
  if (kind === 'textarea') {
    return (
      <textarea
        id="inline-edit-after"
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={`${common} resize-y`}
      />
    );
  }
  // text + url use the same control; the form value is validated server-side.
  return (
    <input
      id="inline-edit-after"
      type={kind === 'url' ? 'url' : 'text'}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className={common}
    />
  );
}
