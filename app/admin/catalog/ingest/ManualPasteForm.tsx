// Manual paste form for /admin/catalog/ingest.
// v1 | 2026-05-18 | Job_PM admin-port X4 [V8 SHADOW]
//
// Textarea + optional vendor_id input. POSTs to /api/admin/ingest/manual.
// On success, shows the new batch id and reloads so the row appears in the
// table above.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function ManualPasteForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setOkMsg(null);

    const body = {
      text: text.trim(),
      vendor_id: vendorId.trim().length > 0 ? vendorId.trim() : undefined,
    };
    if (body.text.length === 0) {
      setError('Paste at least one line of CSV-ish text.');
      return;
    }

    try {
      const res = await fetch('/api/admin/ingest/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { id?: string; error?: string; detail?: string };
      if (!res.ok) {
        setError(json.detail ?? json.error ?? `Request failed (${res.status})`);
        return;
      }
      setOkMsg(`Created batch ${json.id}`);
      setText('');
      setVendorId('');
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-[11px] font-semibold text-amber-900 uppercase tracking-wide mb-1">
          Vendor id (optional)
        </label>
        <input
          type="text"
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          placeholder="e.g. flores-del-este"
          className="w-full max-w-xs px-3 py-1.5 text-sm border border-amber-200 rounded bg-white focus:outline-none focus:border-amber-400"
          disabled={isPending}
        />
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-amber-900 uppercase tracking-wide mb-1">
          Paste CSV (one offer per line: variety, stem_length, qty, cost)
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 text-xs font-mono border border-amber-200 rounded bg-white focus:outline-none focus:border-amber-400"
          placeholder={`Freedom Rose, 60, 300, 0.42\nMondial Rose, 70, 150, 0.55\nHydrangea Blue, 40, 80, 1.10`}
          disabled={isPending}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || text.trim().length === 0}
          className="text-sm px-4 py-1.5 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Submitting...' : 'Create batch'}
        </button>
        {okMsg && (
          <span className="text-xs text-emerald-700 font-medium">{okMsg}</span>
        )}
        {error && (
          <span className="text-xs text-red-700 font-medium">{error}</span>
        )}
      </div>
    </form>
  );
}
