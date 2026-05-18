// Client-side inline editors for pricing_constants + box_master rows.
// v1 | 2026-05-18 | Job_PM CAT-S7 [V8 SHADOW]
//
// Both editors POST to /api/admin/catalog/config/update with body:
//   { table: 'pricing_constants' | 'box_master', key: string, value: number, active?: boolean }
// On success they call router.refresh() to re-pull the server component.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PricingConstantRow, BoxMasterRow } from './page';

interface UpdateBody {
  table: 'pricing_constants' | 'box_master';
  key: string;
  value?: number;
  active?: boolean;
}

async function postUpdate(body: UpdateBody): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/catalog/config/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { ok: false, error: j.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch failed' };
  }
}

// Pricing constants row editor --------------------------------------------

interface PricingConstantsEditorProps {
  row: PricingConstantRow;
  fmtDate: (iso: string | null) => string;
}

export function PricingConstantsEditor({ row, fmtDate }: PricingConstantsEditorProps) {
  const router = useRouter();
  const initial = row.value_numeric == null ? '' : String(row.value_numeric);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      setError('value must be a number');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await postUpdate({ table: 'pricing_constants', key: row.id, value: n });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'save failed');
      return;
    }
    setEditing(false);
    router.refresh();
  }

  function cancel() {
    setValue(initial);
    setError(null);
    setEditing(false);
  }

  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      <td className="px-4 py-2.5 font-mono text-xs text-slate-900">{row.id}</td>
      <td className="px-4 py-2.5 text-xs text-slate-600">{row.description}</td>
      <td className="px-4 py-2.5 text-right">
        {editing ? (
          <input
            type="number"
            step="0.0001"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            className="w-28 text-right text-sm font-mono border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          />
        ) : (
          <span className="text-sm font-mono text-slate-900">{initial}</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{row.unit ?? '-'}</td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(row.updated_at)}</td>
      <td className="px-4 py-2.5 text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-md transition-colors"
          >
            Edit
          </button>
        )}
        {error && (
          <div className="text-[11px] text-red-600 font-mono mt-1">{error}</div>
        )}
      </td>
    </tr>
  );
}

// Box master row editor ---------------------------------------------------

interface BoxMasterEditorProps {
  row: BoxMasterRow;
  fmtDate: (iso: string | null) => string;
}

export function BoxMasterEditor({ row, fmtDate }: BoxMasterEditorProps) {
  const router = useRouter();
  const initial = String(row.weight_kg);
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState(initial);
  const [busy, setBusy] = useState<'save' | 'toggle' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(weight);
    if (!Number.isFinite(n) || n <= 0) {
      setError('weight must be > 0');
      return;
    }
    setBusy('save');
    setError(null);
    const r = await postUpdate({ table: 'box_master', key: row.box_type, value: n });
    setBusy(null);
    if (!r.ok) {
      setError(r.error ?? 'save failed');
      return;
    }
    setEditing(false);
    router.refresh();
  }

  function cancel() {
    setWeight(initial);
    setError(null);
    setEditing(false);
  }

  async function toggleActive() {
    setBusy('toggle');
    setError(null);
    const r = await postUpdate({
      table: 'box_master',
      key: row.box_type,
      active: !row.active,
    });
    setBusy(null);
    if (!r.ok) {
      setError(r.error ?? 'toggle failed');
      return;
    }
    router.refresh();
  }

  return (
    <tr className={'border-b border-slate-100 last:border-b-0 ' + (row.active ? '' : 'opacity-60')}>
      <td className="px-4 py-2.5 font-mono text-xs text-slate-900">{row.box_type}</td>
      <td className="px-4 py-2.5 text-xs text-slate-600 max-w-md">
        <div>{row.description ?? '-'}</div>
        {row.notes && <div className="text-[11px] text-slate-400 mt-0.5">{row.notes}</div>}
      </td>
      <td className="px-4 py-2.5 text-right">
        {editing ? (
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            disabled={busy !== null}
            className="w-24 text-right text-sm font-mono border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          />
        ) : (
          <span className="text-sm font-mono text-slate-900">{initial}</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500">
        <div>{row.validated_by ?? '-'}</div>
        {row.validated_at && (
          <div className="text-[10px] text-slate-400">{fmtDate(row.validated_at)}</div>
        )}
      </td>
      <td className="px-4 py-2.5">
        {row.active ? (
          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-100 text-emerald-800 border-emerald-200">
            Active
          </span>
        ) : (
          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-slate-100 text-slate-600 border-slate-200">
            Inactive
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy !== null}
              className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              {busy === 'save' ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy !== null}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-md transition-colors"
            >
              Edit weight
            </button>
            <button
              type="button"
              onClick={toggleActive}
              disabled={busy !== null}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 hover:border-slate-500 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              {busy === 'toggle' ? '...' : row.active ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        )}
        {error && (
          <div className="text-[11px] text-red-600 font-mono mt-1">{error}</div>
        )}
      </td>
    </tr>
  );
}
