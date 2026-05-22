'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  orderId: number;
  currentStatus: string;
  hasDeliveredDispatch: boolean;
  hasPendingRefund: boolean;
}

export default function OrderStatusActions({ orderId, currentStatus, hasDeliveredDispatch, hasPendingRefund }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [note, setNote] = useState('');

  if (['cancelled', 'refunded', 'fulfilled'].includes(currentStatus)) return null;

  async function changeStatus(newStatus: string) {
    setBusy(newStatus);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ new_status: newStatus, note: note || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(null);
      setShowCancel(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Order status</p>
      {hasDeliveredDispatch && (
        <button
          type="button"
          onClick={() => changeStatus('fulfilled')}
          disabled={!!busy}
          className="w-full text-sm font-semibold bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {busy === 'fulfilled' ? 'Saving…' : 'Mark fulfilled'}
        </button>
      )}
      {!showCancel ? (
        <button
          type="button"
          onClick={() => setShowCancel(true)}
          disabled={!!busy || hasPendingRefund}
          className="w-full text-sm font-medium border border-red-200 text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
          title={hasPendingRefund ? 'Pending refund — resolve first' : undefined}
        >
          Cancel order
        </button>
      ) : (
        <div className="border border-red-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-red-700">Confirm cancellation</p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Reason (optional)"
            rows={2}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-red-400"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => changeStatus('cancelled')}
              disabled={!!busy}
              className="flex-1 text-xs font-semibold bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50"
            >
              {busy === 'cancelled' ? 'Saving…' : 'Confirm cancel'}
            </button>
            <button type="button" onClick={() => setShowCancel(false)} className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-600">Back</button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
