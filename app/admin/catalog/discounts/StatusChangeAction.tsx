// Client island: pause / expire an active discount rule by creating a
// `discount_rule.status_change` admin_proposal. The executor for this proposal
// type is NOT yet wired (per Phase D scope -- AI-CPO wires it next). The page
// surfaces this honestly with a small badge.
// v1 | 2026-05-19 | Job_PM Phase D [V8 SHADOW]

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface StatusChangeActionProps {
  ruleId: string;
  scope: string;
  scopeValue: string;
}

export default function StatusChangeAction({
  ruleId,
  scope,
  scopeValue,
}: StatusChangeActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<'paused' | 'expired'>('paused');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit() {
    if (reason.trim().length < 5) {
      setError('Rationale must be >=5 chars (Rose contract P4).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'discount_rule.status_change',
          target_table: 'discount_rules',
          target_id: ruleId,
          payload: {
            rule_id: ruleId,
            new_status: newStatus,
            scope,
            scope_value: scopeValue,
          },
          notes: reason.trim(),
          source_rationale: reason.trim(),
          source_table: 'discount_rules',
          source_id: ruleId,
          source_agent: 'job',
          before_value: { status: 'active' },
          after_value: { status: newStatus },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setError(
          body.detail
            ? `${body.error ?? 'error'}: ${body.detail}`
            : (body.error ?? `HTTP ${res.status}`),
        );
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        router.refresh();
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 border border-amber-300 hover:border-amber-500 px-2 py-1 rounded transition-colors"
        title="Propose pause/expire (status_change executor not yet wired)"
      >
        Pause / expire
      </button>
    );
  }

  return (
    <div className="text-left bg-white border border-amber-300 rounded-lg p-3 shadow-sm w-72">
      <p className="text-xs font-semibold text-slate-900 mb-1">
        Change status for rule
      </p>
      <p className="text-[11px] text-slate-500 mb-2 font-mono break-all">
        {ruleId.slice(0, 12)}...
      </p>
      <p className="text-[11px] text-amber-700 mb-3">
        Proposal lands in queue; executor for discount_rule.status_change is
        not yet wired (Phase D stub). Approval surfaces unknown_proposal_type
        until AI-CPO follow-up commit lands.
      </p>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        New status
      </label>
      <select
        value={newStatus}
        onChange={(e) => setNewStatus(e.target.value as 'paused' | 'expired')}
        disabled={busy || success}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
      >
        <option value="paused">paused (temporary)</option>
        <option value="expired">expired (terminal)</option>
      </select>
      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
        Reason (mandatory)
      </label>
      <textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy || success}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
        placeholder="Why pause / expire this rule?"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason('');
            setError(null);
          }}
          disabled={busy || success}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || success}
          className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {success ? 'Submitted' : busy ? 'Sending...' : 'Submit proposal'}
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600 font-mono mt-2">{error}</div>}
      {success && (
        <div className="text-[11px] text-emerald-700 font-medium mt-2">
          Proposal queued. Visible on /admin/catalog/approval-queue.
        </div>
      )}
    </div>
  );
}
