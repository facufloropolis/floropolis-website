// Boolean flag toggle (client island) for the deal/featured/best_seller flags.
// v1 | 2026-05-18 | Job_PM CAT-S4 [V8 SHADOW]
//
// Split out of Editor.tsx so the page file can import it inline next to the
// FlagRow server helper without dragging in the whole editor module.

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface FlagToggleProps {
  skuId: string;
  field: 'is_on_deal' | 'is_best_seller' | 'is_featured';
  value: boolean;
}

export function FlagToggleClient({ skuId, field, value }: FlagToggleProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<boolean>(value);

  async function toggle() {
    const target = !local;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/catalog/sku/${skuId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value: target }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };
        setError(b.detail ?? b.error ?? `HTTP ${res.status}`);
      } else {
        setLocal(target);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        className={`text-xs font-semibold px-3 py-1 rounded-md disabled:opacity-50 ${
          local
            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
        }`}
      >
        {busy ? 'Saving...' : local ? 'ON' : 'OFF'}
      </button>
      {error && (
        <span className="text-[11px] text-red-600 font-mono">{error}</span>
      )}
    </div>
  );
}
