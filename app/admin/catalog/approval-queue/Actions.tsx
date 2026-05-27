// Approve / Reject / "I see this differently" action buttons for an individual admin_proposals row.
// v4 | 2026-05-26 | Job_PM [V8 SHADOW]
//
// Three decision paths:
//   - Approve: executes the proposal against the target table. Requires facu_rationale + urgency_tier.
//   - Reject: no execution. Requires facu_rationale (min 5 chars).
//   - I see this differently (frame-correction): no execution. Captures what the system got wrong
//     and what is actually true. Requires both fields at min 20 chars. POSTs to
//     /api/admin/proposals/[id]/frame-correction.
//
// router.refresh() on success so the server component re-fetches and the row
// flips to the next tab.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import RejectModal from './RejectModal';
import ApproveModal, { type UrgencyTier } from './ApproveModal';
import FramingModal from './FramingModal';

interface Props {
  id: string;
  proposalType?: string;
  cascadeLabel?: string;
}

export default function ProposalActions({ id, proposalType = '', cascadeLabel }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | 'framing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [framingOpen, setFramingOpen] = useState(false);

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

  async function doFrameCorrection(args: {
    what_is_wrong: string;
    what_should_be_true: string;
  }) {
    setBusy('framing');
    setError(null);
    try {
      const res = await fetch(`/api/admin/proposals/${id}/frame-correction`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.detail
            ? `${body.error}: ${body.detail}`
            : (body.error ?? `HTTP ${res.status}`),
        );
      }
      setFramingOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'frame correction failed');
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
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setError(null);
            setFramingOpen(true);
          }}
          className="text-xs font-semibold text-violet-700 border border-violet-200 hover:border-violet-400 hover:bg-violet-50 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy === 'framing' ? 'Submitting...' : 'I see this differently'}
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
      <FramingModal
        open={framingOpen}
        proposalShort={id.slice(0, 8)}
        proposalType={proposalType}
        busy={busy === 'framing'}
        onCancel={() => setFramingOpen(false)}
        onSubmit={doFrameCorrection}
      />
    </>
  );
}
