// Client-side row actions for a single dispatch row.
// v1 | 2026-05-18 | Job_PM admin-port DISP [V8 SHADOW]
//
// POST /api/admin/dispatch/[id]/status { status, tracking_number?, exception_note? }
// On success refresh the server component via router.refresh().

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type DispatchStatus =
  | 'awaiting_pack'
  | 'packed'
  | 'label_printed'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'exception';

interface Props {
  dispatchId: string;
  status: DispatchStatus;
  trackingNumber: string | null;
}

// Allowed forward transitions (mirrors API). Exception is reachable anywhere
// non-terminal; we surface it via a separate button below.
const NEXT_STATUS: Record<DispatchStatus, DispatchStatus | null> = {
  awaiting_pack: 'packed',
  packed: 'label_printed',
  label_printed: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'delivered',
  delivered: null,
  exception: null,
};

const NEXT_LABEL: Record<DispatchStatus, string> = {
  awaiting_pack: 'Mark packed',
  packed: 'Mark label printed',
  label_printed: 'Mark picked up',
  picked_up: 'Mark in transit',
  in_transit: 'Mark delivered',
  delivered: '',
  exception: '',
};

export default function DispatchRowActions({
  dispatchId,
  status,
  trackingNumber,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<string>(trackingNumber ?? '');
  const [editingTracking, setEditingTracking] = useState(false);

  async function patch(payload: {
    status: DispatchStatus;
    tracking_number?: string | null;
    exception_note?: string | null;
  }) {
    setBusy(payload.status);
    setError(null);
    try {
      const res = await fetch(`/api/admin/dispatch/${dispatchId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.detail ? `${body.error}: ${body.detail}` : (body.error ?? `HTTP ${res.status}`),
        );
      }
      router.refresh();
      setEditingTracking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'update failed');
    } finally {
      setBusy(null);
    }
  }

  const next = NEXT_STATUS[status];

  return (
    <div className="flex flex-col gap-1.5 items-start">
      {next && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => patch({ status: next })}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {busy === next ? 'Saving...' : NEXT_LABEL[status]}
        </button>
      )}

      {status !== 'delivered' && status !== 'exception' && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            const note = window.prompt('Exception note (required):');
            if (!note || !note.trim()) return;
            patch({ status: 'exception', exception_note: note.trim() });
          }}
          className="text-xs font-medium text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {busy === 'exception' ? 'Saving...' : 'Flag exception'}
        </button>
      )}

      {editingTracking ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="Tracking #"
            className="text-xs border border-slate-300 rounded px-2 py-0.5 w-32 font-mono"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => patch({ status, tracking_number: tracking.trim() || null })}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 px-2 py-0.5"
          >
            {busy === status ? '...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingTracking(false);
              setTracking(trackingNumber ?? '');
            }}
            className="text-xs text-slate-400 hover:text-slate-600 px-1"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditingTracking(true)}
          className="text-xs text-slate-500 hover:text-slate-800 underline whitespace-nowrap"
        >
          {trackingNumber ? 'Edit tracking' : 'Add tracking'}
        </button>
      )}

      {error && (
        <span className="text-xs text-red-600 font-mono max-w-[200px]">{error}</span>
      )}
    </div>
  );
}
