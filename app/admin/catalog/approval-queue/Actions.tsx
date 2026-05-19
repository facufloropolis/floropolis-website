// Approve / Reject action buttons for an individual admin_proposals row.
// v3 | 2026-05-19 | Job_PM Phase C [V8 SHADOW]
//
// Phase C upgrade:
//   - Reject now opens a real modal (RejectModal), not window.prompt. The
//     modal collects facu_rationale (NOT NULL, min 5 chars) and POSTs it to
//     /api/admin/proposals/[id]/reject as { reason, facu_rationale }.
//   - Approve now opens ApproveModal which captures both facu_rationale and
//     urgency_tier (routine 72h / urgent 12h / critical 4h). POSTs to
//     /api/admin/proposals/[id]/approve as { reason, facu_rationale, urgency_tier }.
//
// router.refresh() on success so the server component re-fetches and the row
// flips to the next tab.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import RejectModal from './RejectModal';
import ApproveModal, { type UrgencyTier } from './ApproveModal';

interface Props {
  id: string;
  cascadeLabel?: string;
}

export default function ProposalActions({ id, cascadeLabel }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  async function doApprove(args: {
    facu_rationale: string;
    urgency_tier: UrgencyTier;
  }) {
    setBusy('approve');
    setError(null);
    try {
      const res = await fetch(`/api/admin/proposals/${id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason: args.facu_rationale,
          facu_rationale: args.facu_rationale,
          urgency_tier: args.urgency_tier,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.detail
            ? `${body.error}: ${body.detail}`
            : (body.error ?? `HTTP ${res.status}`),
        );
      }
      setApproveOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'approve failed');
    } finally {
      setBusy(null);
    }
  }

  async function doReject(rationale: string) {
    setBusy('reject');
    setError(null);
    try {
      const res = await fetch(`/api/admin/proposals/${id}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason: rationale,
          facu_rationale: rationale,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.detail
            ? `${body.error}: ${body.detail}`
            : (body.error ?? `HTTP ${res.status}`),
        );
      }
      setRejectOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reject failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setError(null);
            setApproveOpen(true);
          }}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy === 'approve' ? 'Approving...' : 'Approve'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setError(null);
            setRejectOpen(true);
          }}
          className="text-xs font-semibold text-red-700 border border-red-200 hover:border-red-400 hover:bg-red-50 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy === 'reject' ? 'Rejecting...' : 'Reject'}
        </button>
        {error && (
          <span className="text-[11px] text-red-600 font-mono max-w-[180px] whitespace-normal">
            {error}
          </span>
        )}
      </div>

      <ApproveModal
        open={approveOpen}
        proposalShort={id.slice(0, 8)}
        cascadeLabel={cascadeLabel ?? 'unknown'}
        busy={busy === 'approve'}
        onCancel={() => setApproveOpen(false)}
        onSubmit={doApprove}
      />
      <RejectModal
        open={rejectOpen}
        proposalShort={id.slice(0, 8)}
        busy={busy === 'reject'}
        onCancel={() => setRejectOpen(false)}
        onSubmit={doReject}
      />
    </>
  );
}
