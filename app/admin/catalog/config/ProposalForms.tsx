// Client-side proposal forms for /admin/catalog/config.
// v1 | 2026-05-18 | Job_PM admin-port X3 [V8 SHADOW]
//
// All forms POST to /api/admin/proposals with the matching `type` and refresh
// the server component on success. Approve/reject buttons hit
// /api/admin/proposals/[id]/{approve,reject}.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BoxMasterRow,
  PricingConstantRow,
} from './page';

// ----- shared post helper --------------------------------------------------

interface ProposalBody {
  type: string;
  target_table: string;
  target_id?: string | number | null;
  payload: Record<string, unknown>;
  notes?: string | null;
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

// ----- Box master: propose update -----------------------------------------

export function BoxMasterProposeForm({
  row,
  cascadeSkus,
}: {
  row: BoxMasterRow;
  cascadeSkus: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState(String(row.weight_kg));
  const [description, setDescription] = useState(row.description ?? '');
  const [notes, setNotes] = useState(row.notes ?? '');
  const [active, setActive] = useState(row.active);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setWeight(String(row.weight_kg));
    setDescription(row.description ?? '');
    setNotes(row.notes ?? '');
    setActive(row.active);
    setReason('');
    setError(null);
  }

  async function submit() {
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) {
      setError('weight_kg must be > 0');
      return;
    }
    const payload: Record<string, unknown> = {
      weight_kg: w,
      description: description.trim() || null,
      notes: notes.trim() || null,
      active,
    };
    setBusy(true);
    setError(null);
    const r = await postProposal({
      type: 'box_master.update',
      target_table: 'box_master',
      target_id: row.box_type,
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
        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-md transition-colors"
      >
        Propose edit
      </button>
    );
  }

  return (
    <div className="text-left bg-white border border-emerald-300 rounded-lg p-3 shadow-sm w-80">
      <p className="text-xs font-semibold text-slate-900 mb-2">
        Propose edit to <span className="font-mono">{row.box_type}</span>
      </p>
      <p className="text-[11px] text-orange-700 mb-3">
        Cascade impact: {cascadeSkus} SKUs use this box_type.
      </p>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Weight (kg)</label>
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        disabled={busy}
        className="w-full text-sm font-mono border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
      />
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Description</label>
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={busy}
        className="w-full text-sm border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
      />
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Notes</label>
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={busy}
        className="w-full text-sm border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
      />
      <label className="flex items-center gap-2 text-xs text-slate-700 mb-2">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          disabled={busy}
        />
        Active
      </label>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Reason (for Facu)</label>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setValue(initial);
    setReason('');
    setError(null);
  }

  async function submit() {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      setError('value_numeric must be a number');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await postProposal({
      type: 'pricing_constants.update',
      target_table: 'pricing_constants',
      target_id: row.id,
      payload: { value_numeric: n },
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
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Reason (for Facu)</label>
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
