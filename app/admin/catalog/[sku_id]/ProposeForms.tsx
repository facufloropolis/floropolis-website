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
import { GPM_TARGET } from '@/lib/admin/catalog-model';

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
  source_rationale?: string;
  source_artifact?: string;
  source_table?: string;
  source_id?: string | number | null;
  before_value?: unknown;
  after_value?: unknown;
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

export function HideSkuForm({ skuId }: { skuId: string }) {
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
      type: 'visibility_override.create',
      target_table: 'visibility_overrides',
      target_id: String(skuId),
      payload: { sku_id: skuId, decision: 'hide', reason: reason.trim() },
      source_table: 'catalog_published',
      source_id: String(skuId),
      source_rationale: reason.trim(),
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
  skuId: string;
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
        scope: 'sku',
        scope_value: String(skuId),
        discount_pct: pctNum,
        notes: reason.trim(),
      },
      source_table: 'discount_rules',
      source_id: String(skuId),
      source_rationale: reason.trim(),
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
// PriceCorrectionForm -- price_correction.propose
//
// Builds a proposed price for this SKU. Hard floor: 5% GPM (= max sales
// commission). Target: 33% GPM. Reason is mandatory (min 20 chars). This is
// TEMPORARY and ONLY for a proposal — price_override=true in the executor
// prevents the daily sync from overwriting Facu's approved price.
//
// GPM formula: (price - farm_cost - shipping_per_stem) / price
// ---------------------------------------------------------------------------

export function PriceCorrectionForm({
  skuId,
  currentPrice,
  farmCost,
  shippingPerStem,
}: {
  skuId: string;
  currentPrice: number | null;
  farmCost: number | null;
  shippingPerStem: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [priceStr, setPriceStr] = useState(
    currentPrice != null ? currentPrice.toFixed(2) : '',
  );
  const [reason, setReason] = useState('');
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'critical'>('routine');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const newPrice = Number(priceStr);
  const shipping = shippingPerStem ?? 0;
  const totalCosts = (farmCost ?? 0) + shipping;
  const hasCosts = farmCost != null;

  // GPM = (price - farm_cost - shipping) / price
  const gpm =
    hasCosts && Number.isFinite(newPrice) && newPrice > 0
      ? (newPrice - totalCosts) / newPrice
      : null;

  // 5% floor = sales commission minimum
  const minPrice = hasCosts && totalCosts > 0 ? totalCosts / 0.95 : null;

  const gpmBelowFloor = gpm != null && gpm < 0.05;
  const gpmBelowTarget = gpm != null && gpm >= 0.05 && gpm < GPM_TARGET;
  const gpmOk = gpm != null && gpm >= GPM_TARGET;
  const reasonOk = reason.trim().length >= 20;
  const canSubmit =
    !gpmBelowFloor && hasCosts && reasonOk && Number.isFinite(newPrice) && newPrice > 0;

  function gpmBadge() {
    if (gpm == null) return null;
    const pct = (gpm * 100).toFixed(1);
    if (gpmBelowFloor)
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
          GPM {pct}% — below 5% floor
        </span>
      );
    if (gpmBelowTarget)
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          GPM {pct}% — below 33% target
        </span>
      );
    if (gpmOk)
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          GPM {pct}% ✓
        </span>
      );
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (gpmBelowFloor) {
      setError(`Price is below the 5% GPM floor. Min: $${minPrice?.toFixed(2) ?? '?'}`);
      return;
    }
    if (!reasonOk) {
      setError('Reason must be at least 20 characters');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await submitProposal({
      type: 'price_correction.propose',
      target_table: 'v_catalog_admin',
      target_id: String(skuId),
      payload: {
        new_price: newPrice,
        reason: reason.trim(),
        farm_cost: farmCost ?? 0,
        shipping_per_stem: shippingPerStem ?? 0,
        computed_gpm: gpm ?? 0,
        current_price: currentPrice,
        is_temporary: true,
      },
      notes: `Price correction SKU ${skuId}: $${currentPrice?.toFixed(2) ?? '?'} → $${newPrice.toFixed(2)} (GPM ${gpm != null ? (gpm * 100).toFixed(1) + '%' : '?'}). Reason: ${reason.trim()}`,
      source_table: 'v_catalog_admin',
      source_id: String(skuId),
      source_rationale: reason.trim(),
      before_value: currentPrice,
      after_value: newPrice,
    });
    setBusy(false);
    if (r.ok && r.id) {
      setSubmitted(r.id);
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
        className="text-xs font-semibold text-blue-700 border border-blue-200 hover:border-blue-400 hover:bg-blue-50 px-3 py-1.5 rounded-md"
      >
        Propose: price correction
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 border border-blue-200 bg-blue-50/40 rounded-lg p-3 min-w-[280px]"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-blue-900">
          Propose: price correction — SKU {skuId}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>

      {/* Cost reference */}
      <div className="rounded-md bg-white border border-blue-100 px-3 py-2 text-[11px] text-slate-700 space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-500">farm_cost</span>
          <span className="font-mono font-semibold">
            {farmCost != null ? `$${farmCost.toFixed(2)}` : <span className="text-red-600">unknown — GPM unavailable</span>}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">shipping/stem</span>
          <span className="font-mono">
            {shippingPerStem != null ? `$${shippingPerStem.toFixed(2)}` : <span className="text-amber-700">unknown (formula incomplete)</span>}
          </span>
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-1">
          <span className="text-slate-500">total costs</span>
          <span className="font-mono font-semibold">{hasCosts ? `$${totalCosts.toFixed(2)}` : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">current price</span>
          <span className="font-mono">{currentPrice != null ? `$${currentPrice.toFixed(2)}` : '—'}</span>
        </div>
        {minPrice != null && (
          <div className="flex justify-between text-amber-800 bg-amber-50 rounded px-1 py-0.5 mt-1">
            <span>5% GPM floor (min price)</span>
            <span className="font-mono font-semibold">${minPrice.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* New price + live GPM */}
      <label className="text-[11px] text-slate-700 font-semibold">
        New price (per stem / unit)
        <div className="flex items-center gap-2 mt-1">
          <span className="text-slate-500 font-normal">$</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            className="w-28 text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-blue-500 focus:outline-none font-mono"
            placeholder="0.00"
          />
          {gpmBadge()}
        </div>
      </label>

      {gpmBelowFloor && minPrice != null && (
        <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
          Below 5% GPM floor. Raise to at least <span className="font-mono font-semibold">${minPrice.toFixed(2)}</span> to submit.
        </div>
      )}
      {gpmBelowTarget && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          GPM is below 33% target. Facu can still approve — but this should be a special case.
        </div>
      )}

      {/* Reason */}
      <label className="text-[11px] text-slate-700 font-semibold">
        Reason for price change{' '}
        <span className={`font-normal ${reason.trim().length >= 20 ? 'text-emerald-600' : 'text-slate-400'}`}>
          ({reason.trim().length}/20 min)
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Why this price? e.g. matching competitor quote, event deal, margin exception for key client..."
          className="w-full mt-1 text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-blue-500 focus:outline-none font-normal"
        />
      </label>

      {/* Urgency */}
      <label className="text-[11px] text-slate-700 font-semibold">
        Urgency
        <select
          value={urgency}
          onChange={(e) => setUrgency(e.target.value as typeof urgency)}
          className="mt-1 w-full text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-blue-500 focus:outline-none font-normal"
        >
          <option value="routine">routine — review within 72h</option>
          <option value="urgent">urgent — review within 12h</option>
          <option value="critical">critical — review within 4h</option>
        </select>
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || !canSubmit}
          className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Submitting...' : 'Submit to approval queue'}
        </button>
        {error && <ErrorBanner error={error} />}
      </div>

      <p className="text-[10px] text-slate-500 italic">
        This proposal is TEMPORARY and requires Facu&apos;s approval. Price_override=true prevents the daily sync from overwriting. Who proposed + reason are permanently logged.
      </p>
    </form>
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

// ---------------------------------------------------------------------------
// ProposeMirrorFieldForm -- legacy-named component for proposing canonical
// catalog field changes (description, image_url, category).
//
// Note: direct writes are intentionally not wired here. Until Phase B migrates
// the executor family, this row lands in the escalation queue with full
// source_rationale + source_artifact.
//
// CEO sees the proposal text but no direct write executes from this form.
// ---------------------------------------------------------------------------

export function ProposeMirrorFieldForm({
  skuId,
  field,
  label,
  current,
  helpText,
  requireArtifact,
}: {
  skuId: string;
  field: 'description' | 'image_url' | 'category';
  label: string;
  current: string | null;
  helpText?: string;
  requireArtifact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [artifact, setArtifact] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (val.trim().length === 0) {
      setError('new value cannot be empty');
      return;
    }
    if (reason.trim().length < 5) {
      setError('source_rationale must be at least 5 characters');
      return;
    }
    if (requireArtifact && artifact.trim().length < 3) {
      setError(
        'source_artifact required (URL or file path to evidence) for this field',
      );
      return;
    }
    setBusy(true);
    setError(null);
    // Phase B executor migration owns the eventual canonical write. Until that
    // lands, send the intent to rose_queue with full rationale + artifact.
    try {
      const res = await fetch('/api/admin/rose-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_id: String(skuId),
          reason_code: field === 'image_url' ? 'no_image' : 'other',
          reason_text:
            `Propose canonical catalog ${field} update for SKU ${skuId}. ` +
            `Before: ${JSON.stringify(current)}. After: ${val.trim()}. ` +
            `source_rationale: ${reason.trim()}. ` +
            (artifact.trim().length > 0
              ? `source_artifact: ${artifact.trim()}.`
              : 'no source_artifact provided.'),
          flagged_by: 'admin_ui',
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; item?: { id?: string } };
      setBusy(false);
      if (!res.ok) {
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setSubmitted(j.item?.id ?? 'queued');
      setVal('');
      setReason('');
      setArtifact('');
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : 'network error');
    }
  }

  if (submitted) return <ConfirmationBanner id={submitted} />;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-emerald-700 border border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 px-3 py-1.5 rounded-md"
      >
        Propose: update {label}
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2 border border-emerald-200 bg-emerald-50/40 rounded-lg p-3 min-w-[280px]"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-emerald-800">
          Propose: update {label}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
      {helpText && (
        <p className="text-[11px] text-slate-500 italic">{helpText}</p>
      )}
      <label className="text-[11px] text-slate-600">
        New value
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          maxLength={field === 'description' ? 4000 : 500}
          placeholder={current ?? '(empty)'}
          className="w-full mt-0.5 text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
        />
      </label>
      <label className="text-[11px] text-slate-600">
        source_rationale (why this change)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="e.g. brand voice rewrite per Cande review, image broken on PDP, ..."
          className="w-full mt-0.5 text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
        />
      </label>
      <label className="text-[11px] text-slate-600">
        source_artifact{' '}
        {requireArtifact ? (
          <span className="text-red-700 font-semibold">(required)</span>
        ) : (
          <span className="text-slate-400">(optional, URL or file path)</span>
        )}
        <input
          value={artifact}
          onChange={(e) => setArtifact(e.target.value)}
          maxLength={500}
          placeholder="e.g. https://drive.google.com/... or shared/state/evidence/..."
          className="w-full mt-0.5 text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
        />
      </label>
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
        Note: the canonical executor is not yet wired. The request is routed
        to rose_queue with the full rationale and source_artifact. Once Phase B
        ships the executor, this form will switch to admin_proposals end-to-end.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// FlagBoxDimToCeoButton -- box_master is READ-ONLY for Job per Rose contract
// v1.0 PB-1. If admin observes a discrepancy, do NOT submit a proposal --
// escalate to CEO directly via rose_queue.
// ---------------------------------------------------------------------------

export function FlagBoxDimToCeoButton({
  skuId,
  boxType,
}: {
  skuId: string;
  boxType: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setError('reason must be at least 5 characters');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/rose-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_id: String(skuId),
          reason_code: 'other',
          reason_text: `Box dim discrepancy on box_type=${boxType ?? '(none)'} -- ${reason.trim()}. Cannot propose box_master.update per Rose contract v1.0.`,
          flagged_by: 'admin_ui',
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setBusy(false);
      if (!res.ok) {
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setSubmitted(true);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : 'network error');
    }
  }

  if (submitted) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Flagged to CEO via rose_queue. Rose / CEO will review.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-300 hover:bg-amber-200 px-3 py-1.5 rounded-md w-fit"
        title="box_master is JOB_LOCKED per Rose contract v1.0. Discrepancies escalate via rose_queue, not admin_proposals."
      >
        Flag to CEO (cannot propose box_master changes)
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2 border border-amber-200 bg-amber-50/40 rounded-lg p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-900">
          Flag box dim discrepancy to CEO -- SKU {skuId} . box {boxType ?? '(none)'}
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
        rows={3}
        maxLength={2000}
        placeholder="What discrepancy did you observe? Include actual weight / FedEx label / vendor packaging spec if you have it."
        className="w-full text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy ? 'Flagging...' : 'Flag to CEO via rose_queue'}
        </button>
        {error && <ErrorBanner error={error} />}
      </div>
    </form>
  );
}
