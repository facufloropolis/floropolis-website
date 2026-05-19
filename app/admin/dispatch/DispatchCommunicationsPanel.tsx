'use client';
// Communications panel for /admin/dispatch — per-dispatch comm log + manual triggers.
// v1 | 2026-05-19 | Job_PM Phase F [V8 SHADOW]
//
// Phase F: email sends are STUBS. The "Send email" button writes a
// dispatch_communications row but does NOT actually send (Phase G wires Brevo).
// "Log phone note" and "Log WhatsApp reference" are first-class — they create
// real audit log rows.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface CommRow {
  id: string;
  channel: 'email' | 'whatsapp' | 'phone_note';
  direction: 'outbound' | 'inbound';
  subject: string | null;
  recipient: string | null;
  sent_at: string;
  notes: string | null;
}

interface Props {
  dispatchId: string;
  orderNumber: string;
  businessName: string;
  recipientEmail?: string | null;
  comms: CommRow[];
}

type ModalKind = 'email' | 'phone_note' | 'whatsapp' | null;

const CHANNEL_LABEL: Record<CommRow['channel'], string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  phone_note: 'Phone',
};

export default function DispatchCommunicationsPanel({
  dispatchId,
  orderNumber,
  businessName,
  recipientEmail,
  comms,
}: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [subject, setSubject] = useState<string>(`Update on order ${orderNumber}`);
  const [bodyText, setBodyText] = useState<string>('');
  const [recipient, setRecipient] = useState<string>(recipientEmail ?? '');
  const [notes, setNotes] = useState<string>('');
  const [externalRef, setExternalRef] = useState<string>('');

  function closeModal() {
    setModal(null);
    setErr(null);
    setSubject(`Update on order ${orderNumber}`);
    setBodyText('');
    setRecipient(recipientEmail ?? '');
    setNotes('');
    setExternalRef('');
  }

  async function submit() {
    if (!modal) return;
    setBusy(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {
        channel: modal,
        direction: 'outbound',
      };
      if (modal === 'email') {
        payload.subject = subject.trim();
        payload.body = bodyText.trim() || null;
        payload.recipient = recipient.trim() || null;
      } else if (modal === 'phone_note') {
        payload.notes = notes.trim();
        payload.body = bodyText.trim() || null;
      } else if (modal === 'whatsapp') {
        payload.external_message_id = externalRef.trim() || null;
        payload.notes = notes.trim() || null;
        payload.recipient = recipient.trim() || null;
      }
      const res = await fetch(`/api/admin/dispatch/${dispatchId}/communication`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.detail ? `${j.error}: ${j.detail}` : (j.error ?? `HTTP ${res.status}`));
      }
      closeModal();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'log failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500">
        <span className="font-semibold text-slate-700">{businessName}</span>
        {recipientEmail && (
          <>
            {' · '}
            <span className="font-mono">{recipientEmail}</span>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setModal('email')}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-2 py-0.5 rounded transition-colors"
          title="Phase F STUB: writes the log row, does NOT send. Phase G wires Brevo."
        >
          Email customer (stub)
        </button>
        <button
          type="button"
          onClick={() => setModal('phone_note')}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-400 px-2 py-0.5 rounded"
        >
          Log phone note
        </button>
        <button
          type="button"
          onClick={() => setModal('whatsapp')}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-400 px-2 py-0.5 rounded"
        >
          Log WhatsApp ref
        </button>
      </div>

      {comms.length > 0 ? (
        <ul className="border border-slate-100 rounded text-xs divide-y divide-slate-100">
          {comms.map((c) => (
            <li key={c.id} className="px-2 py-1 flex items-start gap-2">
              <span className="text-slate-400 font-mono whitespace-nowrap">
                {new Date(c.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
              <span className="text-slate-700 font-semibold whitespace-nowrap">{CHANNEL_LABEL[c.channel]}</span>
              <span className="text-slate-500 truncate">
                {c.subject ?? c.notes ?? c.recipient ?? '(no subject)'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400 italic">No communications logged yet.</p>
      )}

      {modal !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5">
            <h3 className="font-bold text-slate-900 text-base mb-1">
              {modal === 'email' ? `Email ${businessName} (STUB)` : modal === 'phone_note' ? 'Log phone note' : 'Log WhatsApp reference'}
            </h3>
            {modal === 'email' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-3">
                Phase F: this writes the comm log row but does NOT actually send. Phase G wires Brevo.
              </p>
            )}
            <div className="space-y-2 mb-4">
              {modal === 'email' && (
                <>
                  <label className="block text-xs font-semibold text-slate-700">
                    Recipient
                    <input
                      type="email"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      className="mt-0.5 w-full text-sm border border-slate-300 rounded px-2 py-1 font-mono"
                      placeholder="customer@example.com"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Subject
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="mt-0.5 w-full text-sm border border-slate-300 rounded px-2 py-1"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Body
                    <textarea
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                      rows={4}
                      className="mt-0.5 w-full text-sm border border-slate-300 rounded px-2 py-1"
                    />
                  </label>
                </>
              )}
              {modal === 'phone_note' && (
                <>
                  <label className="block text-xs font-semibold text-slate-700">
                    Notes (what was discussed)
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      className="mt-0.5 w-full text-sm border border-slate-300 rounded px-2 py-1"
                      placeholder="Called customer at 3pm, confirmed arrival window..."
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Quote / body (optional)
                    <textarea
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                      rows={2}
                      className="mt-0.5 w-full text-sm border border-slate-300 rounded px-2 py-1"
                    />
                  </label>
                </>
              )}
              {modal === 'whatsapp' && (
                <>
                  <label className="block text-xs font-semibold text-slate-700">
                    WhatsApp recipient (phone)
                    <input
                      type="text"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      className="mt-0.5 w-full text-sm border border-slate-300 rounded px-2 py-1 font-mono"
                      placeholder="+1 555 ..."
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Twilio / external message id (optional)
                    <input
                      type="text"
                      value={externalRef}
                      onChange={(e) => setExternalRef(e.target.value)}
                      className="mt-0.5 w-full text-sm border border-slate-300 rounded px-2 py-1 font-mono"
                      placeholder="SM..."
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Notes
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="mt-0.5 w-full text-sm border border-slate-300 rounded px-2 py-1"
                      placeholder="Sent arrival reminder via WhatsApp; customer acknowledged."
                    />
                  </label>
                </>
              )}
            </div>
            {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="text-sm px-3 py-1 rounded border border-slate-200 text-slate-600 hover:border-slate-400"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="text-sm px-4 py-1 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? 'Saving...' : modal === 'email' ? 'Log (no send)' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
