// Bulk apply discount across vendor/variety/tier filter.
// v1 | 2026-05-18 | Job_PM CAT-S10 [V8 SHADOW]
//
// Two-step UX:
//   1. Preview -- POST { filter, change, confirm: false } -> returns count +
//      first 20 SKUs.
//   2. Confirm -- POST same body with confirm: true -> commits.
//
// Required: at least one of (deal_price_fixed | deal_pct_off), label, expiry.
// All filters optional but at least one must be set so we don't accidentally
// nuke the whole catalog.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  vendors: string[];
  tiers: string[];
}

interface PreviewItem {
  id: number;
  name: string;
  variety: string | null;
  length: string | null;
  vendor: string | null;
  tier: string | null;
  price: number | null;
  proposed_deal_price: number | null;
}

interface PreviewResponse {
  count: number;
  sample: PreviewItem[];
  warning?: string;
}

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BulkApplyForm({ vendors, tiers }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  // Filter
  const [vendor, setVendor] = useState('');
  const [variety, setVariety] = useState('');
  const [tier, setTier] = useState('');

  // Change
  const [mode, setMode] = useState<'fixed' | 'pct'>('pct');
  const [fixed, setFixed] = useState('');
  const [pct, setPct] = useState('15');
  const [label, setLabel] = useState('');
  const [expiry, setExpiry] = useState(todayPlusDays(14));

  function close() {
    setOpen(false);
    setError(null);
    setPreview(null);
  }

  function buildBody(confirm: boolean) {
    return {
      filter: {
        vendor: vendor || undefined,
        variety: variety || undefined,
        tier: tier || undefined,
      },
      change: {
        deal_price_fixed:
          mode === 'fixed' && fixed !== '' ? Number(fixed) : undefined,
        deal_pct_off:
          mode === 'pct' && pct !== '' ? Number(pct) : undefined,
        deal_label: label.trim(),
        deal_expiry: expiry,
      },
      confirm,
    };
  }

  function validateClient(): string | null {
    if (!vendor && !variety && !tier) {
      return 'Set at least one filter (vendor, variety, or tier) before previewing.';
    }
    if (!label.trim()) return 'Label is required.';
    if (!expiry) return 'Expiry is required.';
    const exp = new Date(expiry + 'T23:59:59');
    if (!Number.isFinite(exp.getTime()) || exp.getTime() <= Date.now()) {
      return 'Expiry must be in the future.';
    }
    if (mode === 'fixed') {
      const f = Number(fixed);
      if (!Number.isFinite(f) || f <= 0) {
        return 'Fixed deal price must be a positive number.';
      }
    } else {
      const p = Number(pct);
      if (!Number.isFinite(p) || p <= 0 || p >= 100) {
        return 'Percent off must be between 0 and 100 (exclusive).';
      }
    }
    return null;
  }

  async function runPreview() {
    setError(null);
    const v = validateClient();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/catalog/discounts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(false)),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.detail ? `${body.error}: ${body.detail}` : (body.error ?? `HTTP ${res.status}`),
        );
      }
      setPreview(body as PreviewResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'preview failed');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    if (preview.count === 0) return;
    if (
      !confirm(
        `Apply this deal to ${preview.count} SKU${preview.count === 1 ? '' : 's'}? This writes immediately.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/catalog/discounts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(true)),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.detail ? `${body.error}: ${body.detail}` : (body.error ?? `HTTP ${res.status}`),
        );
      }
      close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'commit failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-md"
      >
        Bulk apply
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Bulk apply deal
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 max-w-md">
              Filter SKUs by vendor / variety / tier. Set a fixed deal price or
              a % off, plus label + expiry. Preview before committing.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="text-slate-400 hover:text-slate-700 text-lg leading-none"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-[10px] uppercase text-slate-500 tracking-wide block mb-1">
              Vendor
            </label>
            <select
              value={vendor}
              onChange={(e) => {
                setVendor(e.target.value);
                setPreview(null);
              }}
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase text-slate-500 tracking-wide block mb-1">
              Variety contains
            </label>
            <input
              type="text"
              value={variety}
              onChange={(e) => {
                setVariety(e.target.value);
                setPreview(null);
              }}
              placeholder="e.g. anthurium"
              className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase text-slate-500 tracking-wide block mb-1">
              Tier
            </label>
            <select
              value={tier}
              onChange={(e) => {
                setTier(e.target.value);
                setPreview(null);
              }}
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              {tiers.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[10px] uppercase text-slate-500 tracking-wide block mb-1">
            Discount type
          </label>
          <div className="flex items-center gap-4 mb-2">
            <label className="text-sm flex items-center gap-1.5">
              <input
                type="radio"
                name="mode"
                checked={mode === 'pct'}
                onChange={() => {
                  setMode('pct');
                  setPreview(null);
                }}
              />
              % off original price
            </label>
            <label className="text-sm flex items-center gap-1.5">
              <input
                type="radio"
                name="mode"
                checked={mode === 'fixed'}
                onChange={() => {
                  setMode('fixed');
                  setPreview(null);
                }}
              />
              Fixed deal price
            </label>
          </div>
          {mode === 'pct' ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="99"
                step="1"
                value={pct}
                onChange={(e) => {
                  setPct(e.target.value);
                  setPreview(null);
                }}
                className="w-24 border border-slate-300 rounded-md px-3 py-1.5 text-sm"
              />
              <span className="text-sm text-slate-600">% off</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={fixed}
                onChange={(e) => {
                  setFixed(e.target.value);
                  setPreview(null);
                }}
                className="w-32 border border-slate-300 rounded-md px-3 py-1.5 text-sm"
              />
              <span className="text-sm text-slate-600">flat</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[10px] uppercase text-slate-500 tracking-wide block mb-1">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setPreview(null);
              }}
              placeholder="May clearance"
              maxLength={80}
              className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase text-slate-500 tracking-wide block mb-1">
              Expiry
            </label>
            <input
              type="date"
              value={expiry}
              onChange={(e) => {
                setExpiry(e.target.value);
                setPreview(null);
              }}
              min={todayPlusDays(1)}
              className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-3">
            {error}
          </p>
        )}

        {preview && (
          <div className="mb-4 border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 text-xs text-slate-700 flex items-center justify-between">
              <span>
                <span className="font-semibold">{preview.count}</span> SKU
                {preview.count === 1 ? '' : 's'} affected
              </span>
              {preview.warning && (
                <span className="text-amber-700">{preview.warning}</span>
              )}
            </div>
            {preview.sample.length === 0 ? (
              <div className="text-sm text-slate-500 px-3 py-4 italic">
                No SKUs match these filters. Adjust the filter or commit will be
                a no-op.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-white border-t border-slate-200">
                  <tr className="text-left text-slate-500 uppercase tracking-wide">
                    <th className="px-3 py-1.5">SKU</th>
                    <th className="px-3 py-1.5">Vendor</th>
                    <th className="px-3 py-1.5">Tier</th>
                    <th className="px-3 py-1.5 text-right">Was</th>
                    <th className="px-3 py-1.5 text-right">Deal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.sample.map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-1.5 text-slate-800">
                        {[s.name, s.variety, s.length].filter(Boolean).join(' / ')}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        {s.vendor ?? '-'}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        {s.tier ?? '-'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-500 line-through">
                        {s.price != null ? `$${s.price.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold text-emerald-700">
                        {s.proposed_deal_price != null
                          ? `$${s.proposed_deal_price.toFixed(2)}`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {preview.count > preview.sample.length && (
              <div className="text-xs text-slate-500 px-3 py-1.5 italic border-t border-slate-100">
                Showing first {preview.sample.length} of {preview.count} SKUs.
                The rest will be updated on commit.
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5"
            disabled={busy}
          >
            Cancel
          </button>
          {!preview ? (
            <button
              type="button"
              onClick={runPreview}
              disabled={busy}
              className="text-sm font-semibold text-emerald-700 border border-emerald-300 hover:border-emerald-500 bg-white hover:bg-emerald-50 px-4 py-1.5 rounded-md disabled:opacity-50"
            >
              {busy ? 'Loading...' : 'Preview affected SKUs'}
            </button>
          ) : (
            <button
              type="button"
              onClick={commit}
              disabled={busy || preview.count === 0}
              className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded-md disabled:opacity-50"
            >
              {busy
                ? 'Applying...'
                : `Apply to ${preview.count} SKU${preview.count === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
