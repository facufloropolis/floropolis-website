'use client';
// PhoneNoteForm -- log a phone-call note (UC-R-224).
// Phase E | 2026-05-19 | Job_PM admin-clients [V8 SHADOW]
//
// Inserts directly into client_phone_notes (append-only). Surfaces on the
// Communications tab on /admin/clients/[id] and on /admin/orders/[id] when
// order_id is set.

import { useState, useTransition } from 'react';
import { logPhoneNote } from '../actions';

interface Props {
  clientId: string;
  orderOptions: Array<{ id: number; order_number: string }>;
}

export default function PhoneNoteForm({ clientId, orderOptions }: Props) {
  const [note, setNote] = useState('');
  const [orderId, setOrderId] = useState('');
  const [contactedAt, setContactedAt] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = note.trim().length >= 3 && !pending;

  function handleSubmit() {
    setErr(null);
    setOk(null);
    const fd = new FormData();
    fd.set('client_id', clientId);
    fd.set('note', note.trim());
    if (orderId) fd.set('order_id', orderId);
    if (contactedAt) fd.set('contacted_at', contactedAt);
    startTransition(async () => {
      const r = await logPhoneNote(fd);
      if (r.ok) {
        setOk('Phone note saved.');
        setNote('');
        setOrderId('');
        setContactedAt('');
      } else {
        setErr(r.error ?? 'unknown_error');
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 px-4 py-4 bg-white space-y-3">
      <div className="text-sm font-semibold text-slate-700">Log a phone call</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Short summary, e.g. 'JJ called -- asked about lead time on PER-RED-50, told him 12 days'"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs text-slate-600">
          Related order (optional)
          <select
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">-- none --</option>
            {orderOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_number}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          When (optional, defaults to now)
          <input
            type="datetime-local"
            value={contactedAt}
            onChange={(e) => setContactedAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      {err && (
        <div className="text-xs rounded-lg border border-red-200 bg-red-50 text-red-800 px-3 py-2">
          {err}
        </div>
      )}
      {ok && (
        <div className="text-xs rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2">
          {ok}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
        >
          {pending ? 'Saving...' : 'Save note'}
        </button>
      </div>
    </div>
  );
}
