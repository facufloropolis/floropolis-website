// "End deal now" button -- clears the deal_* columns on a single SKU.
// v1 | 2026-05-18 | Job_PM CAT-S10 [V8 SHADOW]
//
// POST /api/admin/catalog/discounts/end { sku_id }

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  skuId: number;
}

export default function EndDealButton({ skuId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function end() {
    if (!confirm('End this deal now? The SKU returns to full price immediately.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/catalog/discounts/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku_id: skuId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.detail ? `${body.error}: ${body.detail}` : (body.error ?? `HTTP ${res.status}`),
        );
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'end failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={end}
        disabled={busy}
        className="text-xs font-semibold text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
      >
        {busy ? 'Ending...' : 'End deal now'}
      </button>
      {error && (
        <span className="text-[11px] text-red-600 font-mono">{error}</span>
      )}
    </div>
  );
}
