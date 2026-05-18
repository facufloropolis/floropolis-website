// Inline single-SKU deal editor.
// v1 | 2026-05-18 | Job_PM CAT-S10 [V8 SHADOW]
//
// Toggle opens a small dialog (rendered inline -- no portal) with fields:
//   - deal_price (USD)
//   - deal_label (string)
//   - deal_expiry (date)
//   - is_on_deal (default true on save)
//
// Validations (mirror the API):
//   - deal_expiry must be in the future
//   - deal_price > original price -> warn but allow ("future price hike" case)
//   - deal_price must be > 0
//
// POSTs /api/admin/catalog/discounts/upsert then router.refresh().

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  skuId: number;
  skuLabel: string;
  originalPrice: number;
  initialDealPrice: number | null;
  initialLabel: string;
  initialExpiry: string;
  initialIsOnDeal: boolean;
  ctaLabel?: string;
}

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function toDateInputValue(iso: string): string {
  if (!iso) return '';
  // Accept full ISO or YYYY-MM-DD already.
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

export default function EditDealForm({
  skuId,
  skuLabel,
  originalPrice,
  initialDealPrice,
  initialLabel,
  initialExpiry,
  initialIsOnDeal,
  ctaLabel,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const [dealPrice, setDealPrice] = useState<string>(
    initialDealPrice != null ? String(initialDealPrice) : '',
  );
  const [label, setLabel] = useState<string>(initialLabel);
  const [expiry, setExpiry] = useState<string>(
    toDateInputValue(initialExpiry) || todayPlusDays(14),
  );

  function close() {
    setOpen(false);
    setError(null);
    setWarn(null);
  }

  function checkWarn(nextPriceStr: string) {
    const p = Number(nextPriceStr);
    if (Number.isFinite(p) && Number.isFinite(originalPrice) && p > originalPrice) {
      setWarn(
        `Deal price ($${p.toFixed(2)}) is higher than original ($${originalPrice.toFixed(2)}). Allowed but unusual -- confirm this is the intent.`,
      );
    } else {
      setWarn(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const priceNum = Number(dealPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError('Deal price must be a positive number.');
      return;
    }
    if (!label.trim()) {
      setError('Label is required (e.g. "Spring sale").');
      return;
    }
    if (!expiry) {
      setError('Expiry date is required.');
      return;
    }
    // Client-side future-date check (API re-validates).
    const exp = new Date(expiry + 'T23:59:59');
    if (!Number.isFinite(exp.getTime()) || exp.getTime() <= Date.now()) {
      setError('Expiry must be in the future.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/admin/catalog/discounts/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_id: skuId,
          is_on_deal: true,
          deal_label: label.trim(),
          deal_price: priceNum,
          deal_expiry: expiry,
        }),
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
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-2.5 py-1 rounded transition-colors"
      >
        {ctaLabel ?? (initialIsOnDeal ? 'Edit' : 'Add to deal')}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md p-5"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {initialIsOnDeal ? 'Edit deal' : 'Add deal'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{skuLabel}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Original price: ${originalPrice.toFixed(2)}
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

        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase text-slate-500 tracking-wide block mb-1">
              Deal price (USD)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={dealPrice}
              onChange={(e) => {
                setDealPrice(e.target.value);
                checkWarn(e.target.value);
              }}
              className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm"
              required
            />
          </div>

          <div>
            <label className="text-[10px] uppercase text-slate-500 tracking-wide block mb-1">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Spring sale"
              maxLength={80}
              className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm"
              required
            />
          </div>

          <div>
            <label className="text-[10px] uppercase text-slate-500 tracking-wide block mb-1">
              Expiry
            </label>
            <input
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              min={todayPlusDays(1)}
              className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm"
              required
            />
          </div>

          {warn && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              {warn}
            </p>
          )}
          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded-md disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save deal'}
          </button>
        </div>
      </form>
    </div>
  );
}
