// Client-side action buttons for an individual refund_approval row.
// v1 | 2026-05-17 | Job_PM W4-S13 [V8 SHADOW]
//
// Vote: PATCH /api/refunds/[id]/vote { approver, approved }
// Execute: POST /api/refunds/[id]/execute
//
// On success refresh the server component via router.refresh().

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: number;
  quorumMet: boolean;
  expired: boolean;
  jjApproved: boolean | null;
  facuApproved: boolean | null;
}

export default function RefundActions({
  id,
  quorumMet,
  expired,
  jjApproved,
  facuApproved,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function vote(approver: 'jj' | 'facu', approved: boolean) {
    setBusy(`${approver}:${approved ? 'y' : 'n'}`);
    setError(null);
    try {
      const res = await fetch(`/api/refunds/${id}/vote`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver, approved }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `vote failed (HTTP ${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'vote failed');
    } finally {
      setBusy(null);
    }
  }

  async function execute() {
    if (!confirm('Execute this refund? This calls Stripe and cannot be undone.')) {
      return;
    }
    setBusy('execute');
    setError(null);
    try {
      const res = await fetch(`/api/refunds/${id}/execute`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.detail ? `${body.error}: ${body.detail}` : (body.error ?? `HTTP ${res.status}`),
        );
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'execute failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {!quorumMet && !expired && (
        <>
          {jjApproved == null && (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => vote('jj', true)}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {busy === 'jj:y' ? 'Saving...' : 'JJ approve'}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => vote('jj', false)}
                className="text-xs font-semibold text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {busy === 'jj:n' ? 'Saving...' : 'JJ reject'}
              </button>
            </>
          )}
          {facuApproved == null && (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => vote('facu', true)}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {busy === 'facu:y' ? 'Saving...' : 'Facu approve'}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => vote('facu', false)}
                className="text-xs font-semibold text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {busy === 'facu:n' ? 'Saving...' : 'Facu reject'}
              </button>
            </>
          )}
        </>
      )}

      {quorumMet && !expired && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={execute}
          className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {busy === 'execute' ? 'Executing...' : 'Execute refund'}
        </button>
      )}

      {expired && (
        <span className="text-xs text-slate-500 italic">
          Approval expired - create a new request to proceed.
        </span>
      )}

      {error && (
        <span className="text-xs text-red-600 font-mono">{error}</span>
      )}
    </div>
  );
}
