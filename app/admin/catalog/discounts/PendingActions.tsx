// Client island -- Approve / Reject inline buttons for a pending discount
// proposal. POSTs to /api/admin/proposals/[id]/approve|reject and refreshes
// the page on success so the rule moves from "Pending" into "Active" (or
// vanishes on reject).
// v1 | 2026-05-18 | Job_PM admin-port X6 [V8 SHADOW]

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface PendingActionsProps {
  proposalId: string;
}

export default function PendingActions({ proposalId }: PendingActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: 'approve' | 'reject') {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/proposals/${encodeURIComponent(proposalId)}/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (j as { detail?: string; error?: string }).detail
            ? `${(j as { error?: string }).error}: ${(j as { detail?: string }).detail}`
            : ((j as { error?: string }).error ?? `HTTP ${res.status}`),
        );
        setBusy(null);
        return;
      }
      setBusy(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error');
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-1 shrink-0">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run('approve')}
        className="text-xs font-semibold px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
      >
        {busy === 'approve' ? 'Saving...' : 'Approve'}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run('reject')}
        className="text-xs font-semibold px-3 py-1.5 rounded text-slate-600 border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
      >
        {busy === 'reject' ? 'Saving...' : 'Reject'}
      </button>
      {error && (
        <span className="text-[10px] text-red-600 font-mono max-w-[180px]">
          {error}
        </span>
      )}
    </div>
  );
}
