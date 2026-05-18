// Approve / Reject buttons for an individual admin_proposals row.
// v2 | 2026-05-18 | Job_PM admin-port X7 [V8 SHADOW]
//
// Replaces the previous CAT-S5 catalog_classifications action set. This island
// targets admin_proposals via the foundation API:
//   POST /api/admin/proposals/[id]/approve  { reason? }
//   POST /api/admin/proposals/[id]/reject   { reason }
//
// Reject collects a 1-sentence reason via window.prompt (kept simple per spec
// rather than building a separate modal). Approve takes no reason but accepts
// one in the body for future expansion.
//
// On success: router.refresh() so the server component re-fetches.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
}

export default function ProposalActions({ id }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    if (
      !confirm(
        'Approve this proposal? The executor will write the change to the source table immediately.',
      )
    ) {
      return;
    }
    setBusy('approve');
    setError(null);
    try {
      const res = await fetch(`/api/admin/proposals/${id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.detail
            ? `${body.error}: ${body.detail}`
            : (body.error ?? `HTTP ${res.status}`),
        );
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'approve failed');
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    const raw = window.prompt(
      'Reject this proposal. Reason (1 sentence, required):',
      '',
    );
    if (raw == null) return; // cancelled
    const reason = raw.trim();
    if (reason.length === 0) {
      setError('reason is required');
      return;
    }
    setBusy('reject');
    setError(null);
    try {
      const res = await fetch(`/api/admin/proposals/${id}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.detail
            ? `${body.error}: ${body.detail}`
            : (body.error ?? `HTTP ${res.status}`),
        );
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reject failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 shrink-0">
      <button
        type="button"
        disabled={busy !== null}
        onClick={approve}
        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        {busy === 'approve' ? 'Approving...' : 'Approve'}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={reject}
        className="text-xs font-semibold text-red-700 border border-red-200 hover:border-red-400 hover:bg-red-50 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        {busy === 'reject' ? 'Rejecting...' : 'Reject'}
      </button>
      {error && (
        <span className="text-[11px] text-red-600 font-mono max-w-[160px]">
          {error}
        </span>
      )}
    </div>
  );
}
