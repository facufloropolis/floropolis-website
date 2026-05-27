// Client-side proposal forms for /admin/catalog/config.
// v2 | 2026-05-19 | Job_PM Phase D [V8 SHADOW]
//
// All forms POST to /api/admin/proposals with the matching `type` and refresh
// the server component on success. Approve/reject buttons hit
// /api/admin/proposals/[id]/{approve,reject}.
//
// Phase D changes:
//   - Box panel: BoxMasterProposeForm removed in favor of BoxFlagCEOForm.
//     Per Rose contract v1.0 (Section 1 / PB-1 family), box_master is
//     JOB_READ_ONLY -- discrepancies escalate to CEO via public.rose_queue,
//     NOT via admin_proposals. New form POSTs to
//     /api/admin/catalog/config/flag-rose.
//   - Pricing form: added source_artifact (URL/path to evidence) +
//     urgency_tier selector (routine / urgent / critical).
//   - New tier-visibility forms: TierVisibilityWindowEditForm +
//     TierVisibilityAcceptCountryForm. Both submit admin_proposals rows;
//     accept-country shows the 5 pipeline-check booleans.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BoxMasterRow,
  PricingConstantRow,
  TierVisibilityWindowRow,
  QualityWeightRow,
  QualityThresholdRow,
} from './page';

// ----- shared post helper --------------------------------------------------

interface ProposalBody {
  type: string;
  target_table: string;
  target_id?: string | number | null;
  payload: Record<string, unknown>;
  notes?: string | null;
  // Phase D / Rose contract v1.0 P3 fields (all optional at the wire level --
  // the server falls back to notes when source_rationale is missing).
  source_rationale?: string | null;
  source_artifact?: string | null;
  source_table?: string | null;
  source_id?: string | number | null;
  source_agent?: string | null;
  before_value?: unknown;
  after_value?: unknown;
}

async function postProposal(body: ProposalBody): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      const msg = j.detail ? `${j.error ?? 'error'}: ${j.detail}` : (j.error ?? `HTTP ${res.status}`);
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch failed' };
  }
}

// ----- Box master: Flag to CEO --------------------------------------------
// 2026-05-19 (Phase D): Rose contract v1.0 says box_master is JOB_READ_OK with
// NO proposals. Job has no independent source for dim corrections, so the only
// safe action is to escalate to CEO via rose_queue. This button replaces the
// old BoxMasterProposeForm.

export function BoxFlagCEOForm({
  row,
  cascadeSkus,
}: {
  row: BoxMasterRow;
  cascadeSkus: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit() {
    if (reasonText.trim().length < 5) {
      setError('Describe the discrepancy (>=5 chars).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/catalog/config/flag-rose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_id: row.box_type,
          reason_code: 'box_dim_discrepancy',
          reason_text: reasonText.trim(),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        setError(j.detail ? `${j.error ?? 'error'}: ${j.detail}` : (j.error ?? `HTTP ${res.status}`));
        return;
      }
      setSuccess(true);
      setReasonText('');
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        router.refresh();
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-300 hover:border-amber-500 px-3 py-1.5 rounded-md transition-colors"
        title="Flag to CEO via rose_queue (box_master is read-only per Rose contract)"
      >
        Flag to CEO
      </button>
    );
  }

  return (
    <div className="text-left bg-white border border-amber-300 rounded-lg p-3 shadow-sm w-80">
      <p className="text-xs font-semibold text-slate-900 mb-1">
        Flag <span className="font-mono">{row.box_type}</span> to CEO
      </p>
      <p className="text-[11px] text-slate-600 mb-2">
        box_master is read-only (Rose contract). Lands in rose_queue, CEO triages.
      </p>
      <p className="text-[11px] text-orange-700 mb-3">
        {cascadeSkus} SKUs use this box_type -- fix cascades after CEO resolves.
      </p>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        What's wrong with this box row?
      </label>
      <textarea
        rows={3}
        value={reasonText}
        onChange={(e) => setReasonText(e.target.value)}
        disabled={busy || success}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
        placeholder="e.g. Vendor invoice shows actual weight 8.2kg, mirror says 7.5kg. Need dim correction."
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReasonText('');
            setError(null);
          }}
          disabled={busy || success}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || success}
          className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {success ? 'Flagged' : busy ? 'Sending...' : 'Send to CEO'}
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600 font-mono mt-2">{error}</div>}
      {success && (
        <div className="text-[11px] text-emerald-700 font-medium mt-2">
          Row added to rose_queue. CEO will see it on next triage.
        </div>
      )}
    </div>
  );
}

// ----- Pricing constants: propose update ----------------------------------

export function PricingConstantsProposeForm({
  row,
  totalSkus,
}: {
  row: PricingConstantRow;
  totalSkus: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initial = row.value_numeric == null ? '' : String(row.value_numeric);
  const [value, setValue] = useState(initial);
  const [reason, setReason] = useState('');
  // Phase D: Rose contract P3/P4 fields.
  const [sourceArtifact, setSourceArtifact] = useState('');
  const [urgencyTier, setUrgencyTier] = useState<'routine' | 'urgent' | 'critical'>('routine');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setValue(initial);
    setReason('');
    setSourceArtifact('');
    setUrgencyTier('routine');
    setError(null);
  }

  async function submit() {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      setError('value_numeric must be a number');
      return;
    }
    if (reason.trim().length < 5) {
      setError('Reason / rationale is mandatory (>=5 chars).');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await postProposal({
      type: 'pricing_constants.update',
      target_table: 'pricing_constants',
      target_id: row.id,
      payload: { value_numeric: n, urgency_tier: urgencyTier },
      notes: reason.trim(),
      source_rationale: reason.trim(),
      source_artifact: sourceArtifact.trim() ? sourceArtifact.trim() : null,
      source_table: 'pricing_constants',
      source_id: row.id,
      source_agent: 'job',
      before_value: { value_numeric: row.value_numeric ?? null },
      after_value: { value_numeric: n },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'proposal failed');
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-md transition-colors"
      >
        Propose edit
      </button>
    );
  }

  return (
    <div className="text-left bg-white border border-emerald-300 rounded-lg p-3 shadow-sm w-72">
      <p className="text-xs font-semibold text-slate-900 mb-2">
        Propose edit to <span className="font-mono">{row.id}</span>
      </p>
      <p className="text-[11px] text-orange-700 mb-3">
        Cascade impact: applies to all {totalSkus} SKUs.
      </p>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        New value {row.unit ? `(${row.unit})` : ''}
      </label>
      <input
        type="number"
        step="0.0001"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        className="w-full text-sm font-mono border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
      />
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        Reason / rationale (mandatory)
      </label>
      <textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
        placeholder="Why this change? (Rose contract P4)"
      />
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        Source artifact (URL or path, optional)
      </label>
      <input
        type="text"
        value={sourceArtifact}
        onChange={(e) => setSourceArtifact(e.target.value)}
        disabled={busy}
        placeholder="e.g. https://drive.google.com/... or s3://invoices/..."
        className="w-full text-xs font-mono border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
      />
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        Urgency tier
      </label>
      <select
        value={urgencyTier}
        onChange={(e) => setUrgencyTier(e.target.value as 'routine' | 'urgent' | 'critical')}
        disabled={busy}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
      >
        <option value="routine">Routine (72h SLA)</option>
        <option value="urgent">Urgent (12h SLA)</option>
        <option value="critical">Critical (4h SLA)</option>
      </select>
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          disabled={busy}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy ? 'Submitting...' : 'Submit proposal'}
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600 font-mono mt-2">{error}</div>}
    </div>
  );
}

// ----- Shipping config: propose create ------------------------------------

const ORIGIN_OPTIONS = [
  { value: 'EC', label: 'Ecuador (EC)' },
  { value: 'CO', label: 'Colombia (CO)' },
  { value: 'NL', label: 'Holland (NL)' },
];

export function ShippingConfigCreateForm({
  totalSkus,
  ctaLabel = '+ Propose new origin/port',
}: {
  totalSkus: number;
  ctaLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [originCountry, setOriginCountry] = useState('EC');
  const [destPort, setDestPort] = useState('');
  const [zone, setZone] = useState('us-east');
  const [fuelPct, setFuelPct] = useState('0');
  const [dimDivisor, setDimDivisor] = useState('6000');
  const [relNumber, setRelNumber] = useState('1');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOriginCountry('EC');
    setDestPort('');
    setZone('us-east');
    setFuelPct('0');
    setDimDivisor('6000');
    setRelNumber('1');
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
    setReason('');
    setError(null);
  }

  async function submit() {
    const port = destPort.trim().toUpperCase();
    if (!port) {
      setError('dest_port required (e.g. MIA, JFK)');
      return;
    }
    const fuelN = Number(fuelPct);
    const dimN = Number.parseInt(dimDivisor, 10);
    const relN = Number(relNumber);
    if (!Number.isFinite(fuelN) || fuelN < 0) return setError('fuel_pct must be >= 0');
    if (!Number.isFinite(dimN) || dimN <= 0) return setError('dim_divisor must be a positive integer');
    if (!Number.isFinite(relN) || relN <= 0) return setError('rel_number must be > 0');
    if (!effectiveFrom) return setError('effective_from required');

    const payload = {
      origin_country: originCountry,
      dest_port: port,
      zone: zone.trim(),
      fuel_pct: fuelN,
      dim_divisor: dimN,
      rel_number: relN,
      effective_from: effectiveFrom,
    };
    setBusy(true);
    setError(null);
    const r = await postProposal({
      type: 'shipping_config.create',
      target_table: 'shipping_config_v2',
      payload,
      notes: reason.trim() ? reason.trim() : null,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'proposal failed');
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md transition-colors"
      >
        {ctaLabel}
      </button>
    );
  }

  return (
    <div className="bg-white border border-emerald-300 rounded-xl p-4 shadow-sm w-full max-w-xl">
      <p className="text-sm font-semibold text-slate-900 mb-1">Propose new shipping_config_v2 row</p>
      <p className="text-[11px] text-orange-700 mb-3">
        Cascade impact: applies to SKUs sourced from the chosen origin (up to {totalSkus} SKUs).
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Origin country</label>
          <select
            value={originCountry}
            onChange={(e) => setOriginCountry(e.target.value)}
            disabled={busy}
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          >
            {ORIGIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Dest port</label>
          <input
            type="text"
            value={destPort}
            onChange={(e) => setDestPort(e.target.value)}
            placeholder="MIA"
            disabled={busy}
            className="w-full text-sm font-mono uppercase border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Zone</label>
          <input
            type="text"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            placeholder="us-east"
            disabled={busy}
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Fuel %</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={fuelPct}
            onChange={(e) => setFuelPct(e.target.value)}
            disabled={busy}
            className="w-full text-sm font-mono border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Dim divisor</label>
          <input
            type="number"
            step="1"
            min="1"
            value={dimDivisor}
            onChange={(e) => setDimDivisor(e.target.value)}
            disabled={busy}
            className="w-full text-sm font-mono border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">REL number</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={relNumber}
            onChange={(e) => setRelNumber(e.target.value)}
            disabled={busy}
            className="w-full text-sm font-mono border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Effective from</label>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            disabled={busy}
            className="w-full text-sm font-mono border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Reason (for Facu)</label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            placeholder="Why this config?"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          disabled={busy}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy ? 'Submitting...' : 'Submit proposal'}
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600 font-mono mt-2">{error}</div>}
    </div>
  );
}

// ----- Approve / reject buttons for a proposal ---------------------------

export function ProposalDecisionButtons({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: 'approve' | 'reject') {
    if (action === 'approve') {
      if (!confirm('Approve this proposal? The executor will write to the source table.')) {
        return;
      }
    } else {
      if (!confirm('Reject this proposal?')) return;
    }
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/proposals/${id}/${action}`, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!res.ok) {
        const msg = body.detail ? `${body.error ?? 'error'}: ${body.detail}` : (body.error ?? `HTTP ${res.status}`);
        throw new Error(msg);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => decide('approve')}
          disabled={busy !== null}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy === 'approve' ? 'Approving...' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => decide('reject')}
          disabled={busy !== null}
          className="text-xs font-semibold text-red-700 hover:text-red-900 border border-red-300 hover:border-red-500 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy === 'reject' ? 'Rejecting...' : 'Reject'}
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600 font-mono">{error}</div>}
    </div>
  );
}

// ----- Tier visibility: accept-country form -------------------------------
// 2026-05-19 (Phase D) BRD UC-V-5: CEO flips accepted=true for a non-Ecuador
// origin. Form shows the 5 pipeline-check booleans -- all-green required to
// enable submit. Submits as type='tier_visibility_window.accept_country'.

const PIPELINE_CHECKS: Array<{ key: string; label: string }> = [
  { key: 'dispatch_ready', label: 'Dispatch pipeline live (FedEx labels + tracking)' },
  { key: 'customs_ready', label: 'Customs config done (HTS codes + broker)' },
  { key: 'pricing_ready', label: 'Pricing engine has shipping_config + zone' },
  { key: 'tax_ready', label: 'Tax matrix (US sales / intl duty) ready' },
  { key: 'vendors_ready', label: 'At least 1 vendor onboarded with verified cost' },
];

export function TierVisibilityAcceptCountryForm({
  origin,
  rows,
}: {
  origin: string;
  rows: TierVisibilityWindowRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PIPELINE_CHECKS.map((c) => [c.key, false])),
  );
  const [reason, setReason] = useState('');
  const [sourceArtifact, setSourceArtifact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allGreen = PIPELINE_CHECKS.every((c) => checks[c.key]);

  async function submit() {
    if (!allGreen) {
      setError('All 5 pipeline checks must be green.');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Rationale must be at least 10 chars (Rose P4).');
      return;
    }
    const payload = {
      origin_country: origin,
      pipeline_checks: checks,
      tiers_to_accept: rows.map((r) => r.tier),
      row_ids: rows.map((r) => r.id),
    };
    setBusy(true);
    setError(null);
    const r = await postProposal({
      type: 'tier_visibility_window.accept_country',
      target_table: 'tier_visibility_windows',
      target_id: origin,
      payload,
      notes: reason.trim(),
      source_rationale: reason.trim(),
      source_artifact: sourceArtifact.trim() ? sourceArtifact.trim() : null,
      source_table: 'tier_visibility_windows',
      source_agent: 'job',
      before_value: { accepted: false, origin_country: origin },
      after_value: { accepted: true, origin_country: origin },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'proposal failed');
      return;
    }
    setOpen(false);
    setReason('');
    setSourceArtifact('');
    setChecks(Object.fromEntries(PIPELINE_CHECKS.map((c) => [c.key, false])));
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md transition-colors"
      >
        Propose: accept {origin}
      </button>
    );
  }

  return (
    <div className="bg-white border border-emerald-300 rounded-xl p-4 shadow-sm w-full max-w-xl">
      <p className="text-sm font-semibold text-slate-900 mb-1">
        Activate origin: <span className="font-mono">{origin}</span>
      </p>
      <p className="text-[11px] text-slate-600 mb-3">
        All-green required. Flips {rows.length} tier row(s): {rows.map((r) => r.tier).join(', ')}.
      </p>
      <div className="space-y-1.5 mb-3 border border-slate-200 rounded-md p-3 bg-slate-50">
        <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide mb-1">
          Pipeline pre-flight ({Object.values(checks).filter(Boolean).length}/5)
        </p>
        {PIPELINE_CHECKS.map((c) => (
          <label key={c.key} className="flex items-start gap-2 text-xs text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={checks[c.key] ?? false}
              onChange={(e) =>
                setChecks((prev) => ({ ...prev, [c.key]: e.target.checked }))
              }
              disabled={busy}
              className="mt-0.5"
            />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        Rationale (mandatory, &gt;=10 chars)
      </label>
      <textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
        placeholder="Why is this origin ready now?"
      />
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        Source artifact (verifier output URL, optional)
      </label>
      <input
        type="text"
        value={sourceArtifact}
        onChange={(e) => setSourceArtifact(e.target.value)}
        disabled={busy}
        placeholder="e.g. https://.../verifier_pipeline_checks_2026-05-19.json"
        className="w-full text-xs font-mono border border-slate-300 rounded-md px-2 py-1 mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason('');
            setSourceArtifact('');
            setError(null);
          }}
          disabled={busy}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !allGreen}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
          title={!allGreen ? 'All 5 pipeline checks must be green' : ''}
        >
          {busy ? 'Submitting...' : 'Submit proposal'}
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600 font-mono mt-2">{error}</div>}
    </div>
  );
}

// ----- Tier visibility: edit window form ----------------------------------
// 2026-05-19 (Phase D) BRD §7.B: edit earliest/latest delivery_days for a tier
// row. Submits as type='tier_visibility_window.update'. Note: executor is NOT
// wired in lib/admin/proposal-executors.ts in this commit -- only the proposal
// row is created; approval will surface "unknown_proposal_type" until the
// executor lands. AI-CPO wires the executor in a follow-up commit.

export function TierVisibilityWindowEditForm({
  row,
}: {
  row: TierVisibilityWindowRow;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [earliest, setEarliest] = useState(String(row.earliest_delivery_days));
  const [latest, setLatest] = useState(String(row.latest_delivery_days));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const e1 = Number.parseInt(earliest, 10);
    const e2 = Number.parseInt(latest, 10);
    if (!Number.isFinite(e1) || e1 < 0) return setError('earliest_delivery_days must be >= 0');
    if (!Number.isFinite(e2) || e2 < e1) return setError('latest_delivery_days must be >= earliest');
    if (reason.trim().length < 5) return setError('Rationale mandatory (>=5 chars).');

    setBusy(true);
    setError(null);
    const r = await postProposal({
      type: 'tier_visibility_window.update',
      target_table: 'tier_visibility_windows',
      target_id: row.id,
      payload: {
        earliest_delivery_days: e1,
        latest_delivery_days: e2,
      },
      notes: reason.trim(),
      source_rationale: reason.trim(),
      source_table: 'tier_visibility_windows',
      source_id: row.id,
      source_agent: 'job',
      before_value: {
        earliest_delivery_days: row.earliest_delivery_days,
        latest_delivery_days: row.latest_delivery_days,
      },
      after_value: {
        earliest_delivery_days: e1,
        latest_delivery_days: e2,
      },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'proposal failed');
      return;
    }
    setOpen(false);
    setReason('');
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-2 py-1 rounded transition-colors"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="text-left bg-white border border-emerald-300 rounded-lg p-3 shadow-sm w-72">
      <p className="text-xs font-semibold text-slate-900 mb-2">
        Edit window <span className="font-mono">{row.tier}</span> /{' '}
        <span className="font-mono">{row.origin_country}</span>
      </p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
            Earliest (days)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={earliest}
            onChange={(e) => setEarliest(e.target.value)}
            disabled={busy}
            className="w-full text-sm font-mono border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
            Latest (days)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={latest}
            onChange={(e) => setLatest(e.target.value)}
            disabled={busy}
            className="w-full text-sm font-mono border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          />
        </div>
      </div>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Reason</label>
      <textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
        placeholder="Why widen / tighten this window?"
      />
      <p className="text-[10px] text-amber-700 mb-2">
        Note: executor not wired yet -- this proposal will land in queue but
        approval will surface "unknown_proposal_type" until follow-up commit.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason('');
            setError(null);
          }}
          disabled={busy}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy ? 'Submitting...' : 'Submit proposal'}
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600 font-mono mt-2">{error}</div>}
    </div>
  );
}

// ----- Catalog quality weight: propose edit -------------------------------
// Edits catalog_quality_weights.weight. Executor enforces sum(weight)==100
// after the change; the form surfaces the implied delta so Facu knows what
// to rebalance elsewhere.

export function QualityWeightProposeForm({
  row,
  currentTotal,
}: {
  row: QualityWeightRow;
  currentTotal: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(row.weight));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(value);
  const delta = Number.isFinite(parsed) ? parsed - row.weight : 0;
  const projectedTotal = currentTotal + delta;
  const sumOk = projectedTotal === 100;

  function reset() {
    setValue(String(row.weight));
    setReason('');
    setError(null);
  }

  async function submit() {
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError('Weight must be 0..100.');
      return;
    }
    if (reason.trim().length < 5) {
      setError('Reason / rationale is mandatory (>=5 chars).');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await postProposal({
      type: 'catalog_quality_weight.update',
      target_table: 'catalog_quality_weights',
      target_id: row.gate_id,
      payload: { weight: Math.round(parsed) },
      notes: reason.trim(),
      source_rationale: reason.trim(),
      source_table: 'catalog_quality_weights',
      source_id: row.gate_id,
      source_agent: 'job',
      before_value: { weight: row.weight },
      after_value: { weight: Math.round(parsed) },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'proposal failed');
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-md transition-colors"
      >
        Propose edit
      </button>
    );
  }

  return (
    <div className="text-left bg-white border border-emerald-300 rounded-lg p-3 shadow-sm w-72">
      <p className="text-xs font-semibold text-slate-900 mb-2">
        Propose weight for <span className="font-mono">{row.gate_id}</span>
      </p>
      <p className="text-[11px] text-slate-500 mb-2">
        Current weight: <span className="font-mono">{row.weight}</span>. Total
        weights across all gates must equal 100; the executor rejects any
        proposal that drifts the sum.
      </p>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        New weight (0-100)
      </label>
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        className="w-full text-sm font-mono border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
      />
      <p
        className={
          sumOk
            ? 'text-[11px] text-emerald-700 mb-2'
            : 'text-[11px] text-red-700 mb-2'
        }
      >
        Projected sum: {projectedTotal} / 100{' '}
        {!sumOk && delta !== 0 && (
          <span>
            (rebalance {delta > 0 ? '-' : '+'}
            {Math.abs(delta)} elsewhere first)
          </span>
        )}
      </p>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        Reason / rationale (mandatory)
      </label>
      <textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
        placeholder="Why this change?"
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          disabled={busy}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy ? 'Submitting...' : 'Submit proposal'}
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600 font-mono mt-2">{error}</div>}
    </div>
  );
}

// ----- Config: Route to Rose (generic, non-box panels) -------------------
// 2026-05-22 (Phase D+): source provenance — creates a rose_queue entry for
// any config panel row so CEO can triage + coordinate with Rose.
// Works for pricing_constants, shipping_config_v2, catalog_quality_weights,
// catalog_quality_thresholds. POSTs to the same flag-rose endpoint as
// BoxFlagCEOForm, using "{sourceTable}:{itemId}" as the sku_id.

export interface ConfigFlagRoseFormProps {
  itemId: string;           // e.g. "gpm_floor", "EC-MIA-Z3", a gate_id
  itemLabel: string;        // human label to show in the modal
  currentValue: string;     // the current value as a string for context
  sourceTable: string;      // e.g. "pricing_constants", "shipping_config_v2"
  reasonCode: 'pricing_question' | 'shipping_question' | 'data_quality';
}

export function ConfigFlagRoseForm({
  itemId,
  itemLabel,
  currentValue,
  sourceTable,
  reasonCode,
}: ConfigFlagRoseFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userText, setUserText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit() {
    if (userText.trim().length < 5) {
      setError('Describe what needs to change (>=5 chars).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/catalog/config/flag-rose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_id: `${sourceTable}:${itemId}`,
          reason_code: reasonCode,
          reason_text: `${itemLabel} (current: ${currentValue}) — ${userText.trim()}`,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        setError(j.detail ? `${j.error ?? 'error'}: ${j.detail}` : (j.error ?? `HTTP ${res.status}`));
        return;
      }
      setSuccess(true);
      setUserText('');
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        router.refresh();
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-300 hover:border-amber-500 px-3 py-1.5 rounded-md transition-colors"
        title="Route to Rose via rose_queue — CEO triages"
      >
        Route to Rose
      </button>
    );
  }

  return (
    <div className="text-left bg-white border border-amber-300 rounded-lg p-3 shadow-sm w-80">
      <p className="text-xs font-semibold text-slate-900 mb-1">
        Route <span className="font-mono">{itemLabel}</span> to Rose
      </p>
      <p className="text-[11px] text-slate-600 mb-1">
        Creates a rose_queue entry. CEO triages + coordinates with Rose.
      </p>
      <p className="text-[11px] text-slate-500 mb-2">
        Current value: <span className="font-mono">{currentValue}</span>
      </p>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        What needs to change?
      </label>
      <textarea
        rows={3}
        value={userText}
        onChange={(e) => setUserText(e.target.value)}
        disabled={busy || success}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
        placeholder="Describe the discrepancy or needed change..."
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setUserText('');
            setError(null);
          }}
          disabled={busy || success}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || success}
          className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {success ? 'Sent' : busy ? 'Sending...' : 'Send'}
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600 font-mono mt-2">{error}</div>}
      {success && (
        <div className="text-[11px] text-emerald-700 font-medium mt-2">
          Row added to rose_queue. CEO will see it on next triage.
        </div>
      )}
    </div>
  );
}

// ----- Catalog quality threshold: propose edit -----------------------------

export function QualityThresholdProposeForm({
  row,
}: {
  row: QualityThresholdRow;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(row.value));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setValue(String(row.value));
    setReason('');
    setError(null);
  }

  async function submit() {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      setError('Value must be a number.');
      return;
    }
    if (row.threshold_id === 'perfect_min_score' && (n < 50 || n > 100)) {
      setError('perfect_min_score must be between 50 and 100.');
      return;
    }
    if (reason.trim().length < 5) {
      setError('Reason / rationale is mandatory (>=5 chars).');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await postProposal({
      type: 'catalog_quality_threshold.update',
      target_table: 'catalog_quality_thresholds',
      target_id: row.threshold_id,
      payload: { value: n },
      notes: reason.trim(),
      source_rationale: reason.trim(),
      source_table: 'catalog_quality_thresholds',
      source_id: row.threshold_id,
      source_agent: 'job',
      before_value: { value: row.value },
      after_value: { value: n },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'proposal failed');
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-md transition-colors"
      >
        Propose edit
      </button>
    );
  }

  return (
    <div className="text-left bg-white border border-emerald-300 rounded-lg p-3 shadow-sm w-72">
      <p className="text-xs font-semibold text-slate-900 mb-2">
        Propose value for <span className="font-mono">{row.threshold_id}</span>
      </p>
      <p className="text-[11px] text-slate-500 mb-2">{row.description ?? ''}</p>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        New value
      </label>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        className="w-full text-sm font-mono border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
      />
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        Reason / rationale (mandatory)
      </label>
      <textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
        placeholder="Why this change?"
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          disabled={busy}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy ? 'Submitting...' : 'Submit proposal'}
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600 font-mono mt-2">{error}</div>}
    </div>
  );
}

// ----- IMPORTANCE CONFIG forms (2026-05-26) -----------------------------------
//
// importance_config.weight_update  — propose changing one of the 3 formula weights.
//   Routing: needs_confirmation → Job_PM inbox for discussion before seed update.
//   No executor yet; the proposal IS the discussion record.
//
// importance_config.variety_update — propose changing one variety's importance_score.
//   Same routing.

export function ImportanceProposeWeightForm({
  dimension,
  currentPct,
  description,
}: {
  dimension: 'demand_weight' | 'competition_weight' | 'trend_weight';
  currentPct: number;
  description: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(currentPct));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setValue(String(currentPct));
    setReason('');
    setError(null);
  }

  async function submit() {
    const pct = Number(value);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError('Value must be 0-100 (percentage).');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Rationale required (>=10 chars) — this changes the conversion model.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await postProposal({
      type: 'importance_config.weight_update',
      target_table: 'importance_formula_weights',
      target_id: dimension,
      payload: { dimension, new_pct: pct, old_pct: currentPct },
      notes: reason.trim(),
      source_rationale: reason.trim(),
      source_table: 'featured-scores-seed.ts',
      source_id: dimension,
      source_agent: 'facu',
      before_value: { [dimension]: currentPct },
      after_value: { [dimension]: pct },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'proposal failed');
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-violet-700 hover:text-violet-900 border border-violet-300 hover:border-violet-500 px-3 py-1.5 rounded-md transition-colors"
      >
        Propose edit
      </button>
    );
  }

  return (
    <div className="text-left bg-white border border-violet-300 rounded-lg p-3 shadow-sm w-80">
      <p className="text-xs font-semibold text-slate-900 mb-1">
        Propose weight — <span className="font-mono text-violet-700">{dimension}</span>
      </p>
      <p className="text-[11px] text-slate-500 mb-2">{description}</p>
      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
        Changes the conversion model. Routes to Job_PM for discussion before seed is updated. The 3 weights must sum to 100%.
      </p>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        New weight % (current: {currentPct}%)
      </label>
      <input
        type="number"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        className="w-full text-sm font-mono border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
      />
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        Rationale (mandatory)
      </label>
      <textarea
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
        placeholder="Why change this weight? What new signal justifies it?"
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={() => { setOpen(false); reset(); }}
          disabled={busy}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy ? 'Submitting...' : 'Submit proposal'}
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600 font-mono mt-2">{error}</div>}
    </div>
  );
}

export function ImportanceProposeVarietyForm({
  matchKey,
  currentScore,
  notes,
}: {
  matchKey: string;
  currentScore: number;
  notes: string | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(currentScore));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setValue(String(currentScore));
    setReason('');
    setError(null);
  }

  async function submit() {
    const score = Number(value);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      setError('Score must be 0-100.');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Rationale required (>=10 chars) — explain the market signal.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await postProposal({
      type: 'importance_config.variety_update',
      target_table: 'featured-scores-seed.ts',
      target_id: matchKey,
      payload: { match_key: matchKey, new_score: score, old_score: currentScore },
      notes: reason.trim(),
      source_rationale: reason.trim(),
      source_table: 'featured-scores-seed.ts',
      source_id: matchKey,
      source_agent: 'facu',
      before_value: { importance_score: currentScore },
      after_value: { importance_score: score },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'proposal failed');
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-violet-700 hover:text-violet-900 border border-violet-300 hover:border-violet-500 px-2 py-1 rounded-md transition-colors"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="text-left bg-white border border-violet-300 rounded-lg p-3 shadow-sm w-72">
      <p className="text-xs font-semibold text-slate-900 mb-1">
        Propose score for <span className="font-mono text-violet-700">{matchKey}</span>
      </p>
      {notes && <p className="text-[11px] text-slate-500 mb-2">{notes}</p>}
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        New score (0-100, current: {currentScore})
      </label>
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        className="w-full text-sm font-mono border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
      />
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        Market signal / rationale
      </label>
      <textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
        placeholder="What changed? Source? (e.g. LVFM new price, The Knot 2027 trend)"
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={() => { setOpen(false); reset(); }}
          disabled={busy}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy ? 'Submitting...' : 'Submit proposal'}
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600 font-mono mt-2">{error}</div>}
    </div>
  );
}
