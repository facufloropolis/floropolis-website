// Client island: "Propose change from here" forms for the SKU detail page.
// v1 | 2026-05-18 | Job_PM admin-port X2 [V8 SHADOW]
//
// Each form is collapsed by default. Open -> fill -> POST /api/admin/proposals.
// On success the page shows "Proposal #X submitted -- Facu must approve" inline.
// The form does NOT mutate the source table directly; it inserts an
// admin_proposals row that Facu must approve via /admin/catalog/approval-queue
// for an executor in lib/admin/proposal-executors.ts to run.
//
// Currently wired proposal types (must be in KNOWN_PROPOSAL_TYPES):
//   - visibility_rule.create   (hide a SKU from /shop)
//   - discount_rule.create     (apply a discount to this SKU)
//
// Vendor cost edits and direct target_price overrides need new executors in
// proposal-executors.ts (owned by a different agent). Buttons for those are
// rendered but disabled with an inline note.

'use client';

import { useState, type ReactNode } from 'react';

interface ProposalResponse {
  proposal?: { id?: string };
  error?: string;
  detail?: string;
}

async function submitProposal(body: {
  type: string;
  target_table: string;
  target_id?: string | number | null;
  payload: Record<string, unknown>;
  notes?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch('/api/admin/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as ProposalResponse;
    if (!res.ok) {
      const detail = data.detail ? `: ${data.detail}` : '';
      return { ok: false, error: `${data.error ?? `HTTP ${res.status}`}${detail}` };
    }
    return { ok: true, id: data.proposal?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

function ConfirmationBanner({ id }: { id: string }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
      Proposal <span className="font-mono">#{id.slice(0, 8)}</span> submitted --
      Facu must approve in <a
        href="/admin/catalog/approval-queue"
        className="font-semibold underline hover:text-emerald-900"
      >
        /admin/catalog/approval-queue
      </a>
      .
    </div>
  );
}

function ErrorBanner({ error }: { error: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-mono text-red-700">
      {error}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HideSkuForm -- visibility_rule.create
// ---------------------------------------------------------------------------

export function HideSkuForm({ skuId }: { skuId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setError('reason must be at least 5 characters');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await submitProposal({
      type: 'visibility_rule.create',
      target_table: 'visibility_rules',
      target_id: String(skuId),
      payload: { sku_id: skuId, action: 'hide', reason: reason.trim() },
      notes: `Hide SKU ${skuId} from catalog. Reason: ${reason.trim()}`,
    });
    setBusy(false);
    if (r.ok && r.id) {
      setSubmitted(r.id);
      setReason('');
    } else {
      setError(r.error ?? 'failed');
    }
  }

  if (submitted) return <ConfirmationBanner id={submitted} />;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-red-700 border border-red-200 hover:border-red-400 hover:bg-red-50 px-3 py-1.5 rounded-md"
      >
        Propose: hide from catalog
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 border border-red-200 bg-red-50/40 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-red-800">
          Propose: hide SKU {skuId} from catalog
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Why should this SKU be hidden? (required, >=5 chars)"
        className="w-full text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy ? 'Submitting...' : 'Submit proposal'}
        </button>
        {error && <ErrorBanner error={error} />}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// DiscountSkuForm -- discount_rule.create
// ---------------------------------------------------------------------------

export function DiscountSkuForm({
  skuId,
  currentPrice,
}: {
  skuId: number;
  currentPrice: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [pctStr, setPctStr] = useState('10');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pctNum = Number(pctStr);
  const previewPrice =
    currentPrice != null && Number.isFinite(pctNum) && pctNum >= 0 && pctNum < 100
      ? currentPrice * (1 - pctNum / 100)
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(pctNum) || pctNum <= 0 || pctNum >= 100) {
      setError('discount_pct must be a number 0 < pct < 100');
      return;
    }
    if (reason.trim().length < 5) {
      setError('reason must be at least 5 characters');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await submitProposal({
      type: 'discount_rule.create',
      target_table: 'discount_rules',
      target_id: String(skuId),
      payload: {
        scope_type: 'sku',
        scope_value: String(skuId),
        discount_pct: pctNum,
        reason: reason.trim(),
      },
      notes: `Discount SKU ${skuId} by ${pctNum}%. Reason: ${reason.trim()}`,
    });
    setBusy(false);
    if (r.ok && r.id) {
      setSubmitted(r.id);
      setReason('');
    } else {
      setError(r.error ?? 'failed');
    }
  }

  if (submitted) return <ConfirmationBanner id={submitted} />;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-violet-700 border border-violet-200 hover:border-violet-400 hover:bg-violet-50 px-3 py-1.5 rounded-md"
      >
        Propose: discount this SKU
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 border border-violet-200 bg-violet-50/40 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-violet-800">
          Propose: discount SKU {skuId}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-600">discount_pct</label>
        <input
          type="number"
          min="0.01"
          max="99.99"
          step="0.5"
          value={pctStr}
          onChange={(e) => setPctStr(e.target.value)}
          className="w-20 text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
        />
        <span className="text-xs text-slate-500">%</span>
        {previewPrice != null && currentPrice != null && (
          <span className="text-[11px] text-slate-600 ml-2">
            preview: <span className="font-mono">${currentPrice.toFixed(2)}</span> -&gt;{' '}
            <span className="font-mono font-semibold text-violet-700">
              ${previewPrice.toFixed(2)}
            </span>
          </span>
        )}
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Why this discount? (required, >=5 chars)"
        className="w-full text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy ? 'Submitting...' : 'Submit proposal'}
        </button>
        {error && <ErrorBanner error={error} />}
      </div>
      <p className="text-[10px] text-slate-500 italic">
        Stub executor: discount_rules table not yet built. Proposal will be recorded in
        admin_proposals and override_audit; price will not move until Rose ships the
        table + reload step.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// UnsupportedProposeButton -- placeholder for proposal types whose executor
// does not exist yet in lib/admin/proposal-executors.ts.
// ---------------------------------------------------------------------------

export function UnsupportedProposeButton({
  label,
  reason,
}: {
  label: string;
  reason: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold text-slate-500 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-md cursor-help"
        title={reason}
      >
        Propose: {label} (n/a)
      </button>
      {open && (
        <p className="text-[10px] text-slate-500 italic ml-2 max-w-md">{reason}</p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared section wrapper for the propose-change cluster
// ---------------------------------------------------------------------------

export function ProposeChangeCluster({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {children}
    </div>
  );
}
