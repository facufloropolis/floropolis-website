// Side-by-side refund proposal form for the admin order detail page.
// v1 | 2026-05-18 | Job_PM admin-port ORD [V8 SHADOW]
//
// POSTs to /api/admin/proposals with:
//   type:         'refund.create'
//   target_table: 'orders'
//   target_id:    <order_id>
//   payload:      { order_id, amount, reason }
//
// The route validates 'refund.create' against KNOWN_PROPOSAL_TYPES (we added
// it) so the insert succeeds and the proposal lands in
// /admin/catalog/approval-queue awaiting Facu's signoff.
//
// TODO[refund.create executor]: when Facu approves the proposal the executor
// is currently a stub that returns ok=false. Wire it to the existing refund
// pipeline (POST /api/refunds/[id]/execute, or insert a refund_approvals row
// to go through the quorum flow).

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  orderId: number;
  orderNumber: string;
  grandTotal: number;
  currency: string;
}

export default function RefundProposalForm({
  orderId,
  orderNumber,
  grandTotal,
  currency,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>(grandTotal.toFixed(2));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const amt = Number.parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Amount must be a positive number.');
      return;
    }
    if (amt > grandTotal + 0.005) {
      setError(`Amount cannot exceed order total (${currency} ${grandTotal.toFixed(2)}).`);
      return;
    }
    if (reason.trim().length < 5) {
      setError('Reason is required (at least 5 characters).');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'refund.create',
          target_table: 'orders',
          target_id: orderId,
          payload: {
            order_id: orderId,
            order_number: orderNumber,
            amount: amt,
            currency,
            reason: reason.trim(),
          },
          notes: `Refund proposed from /admin/orders/${orderId}`,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        proposal?: { id?: string };
      };
      if (!res.ok) {
        throw new Error(
          body.detail
            ? `${body.error ?? `HTTP ${res.status}`}: ${body.detail}`
            : (body.error ?? `HTTP ${res.status}`),
        );
      }
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'proposal failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setSuccess(false);
          setError(null);
        }}
        className="text-sm font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-4 py-2 rounded-xl transition-colors"
      >
        Trigger refund
      </button>
    );
  }

  return (
    <div className="bg-white border border-emerald-300 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">
            Propose refund for {orderNumber}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Routes through Facu&apos;s approval queue. Stripe is not called yet --
            the executor for <span className="font-mono">refund.create</span> is
            still a stub.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Close
        </button>
      </div>

      {success ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800">
          Proposal submitted. It is now in{' '}
          <a
            href="/admin/catalog/approval-queue"
            className="underline font-semibold"
          >
            /admin/catalog/approval-queue
          </a>{' '}
          awaiting Facu&apos;s signoff.
          <div className="mt-2">
            <button
              type="button"
              onClick={() => {
                setSuccess(false);
                setReason('');
                setAmount(grandTotal.toFixed(2));
              }}
              className="text-xs font-semibold underline"
            >
              Propose another
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
              Amount ({currency})
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={grandTotal}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Up to order total {currency} {grandTotal.toFixed(2)}
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
              Tier
            </label>
            <div className="text-xs text-slate-600 leading-relaxed pt-2">
              {Number.parseFloat(amount) <= 200
                ? 'Tier 1: JJ or Facu can approve.'
                : Number.parseFloat(amount) <= 500
                ? 'Tier 2: Facu only.'
                : 'Tier 3: both JJ and Facu required.'}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
              Reason
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              placeholder="What happened? (quality, shipping delay, customer dispute...)"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
            />
          </div>

          {error && (
            <div className="sm:col-span-2 text-xs text-red-600 font-mono">{error}</div>
          )}

          <div className="sm:col-span-2 flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:border-slate-400 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="text-sm font-semibold px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {busy ? 'Submitting...' : 'Submit proposal'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
