'use client';
// Single-action button: initialize a dispatch row for this order so it shows
// up in /admin/dispatch. v1 | 2026-05-18 | Job_PM ADMIN-PORT wave 4

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function InitDispatchButton({
  orderId,
  hasDispatch,
}: {
  orderId: number;
  hasDispatch: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (hasDispatch) {
    return (
      <a
        href="/admin/dispatch"
        className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
      >
        Open in /admin/dispatch →
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const res = await fetch('/api/admin/dispatch/init', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ order_id: orderId }),
            });
            const json = (await res.json()) as { ok?: boolean; error?: string; id?: string };
            if (!res.ok) {
              setMsg(`Failed: ${json.error ?? res.status}`);
              setBusy(false);
              return;
            }
            setMsg('Dispatch initialized.');
            router.refresh();
          } catch (e) {
            setMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
      >
        {busy ? 'Initializing…' : 'Initialize dispatch'}
      </button>
      {msg && <span className="text-[11px] text-slate-500">{msg}</span>}
    </div>
  );
}
