'use client';
// ActionButtons -- top-right cluster on /admin/clients/[id].
// Phase E | 2026-05-19 | Job_PM admin-clients [V8 SHADOW]
//
// Renders the four primary actions:
//   1. Approve         (pending only)
//   2. Suspend         (approved only) / Unsuspend (suspended only)
//   3. Promote to admin (with hard guard + override flag)
//   4. Force logout    (POSTs to /api/admin/auth-sessions/[user_id]/force-logout)
//
// Each opens a small modal asking for a rationale before submitting. Approve /
// Suspend / Promote route through server actions (admin_proposals). Force-logout
// hits the API route directly (immediate effect, no proposal needed).

import { useState, useTransition } from 'react';
import {
  approveClientWithReason,
  suspendClient,
  unsuspendClient,
  promoteToAdmin,
} from '../actions';

interface Props {
  userId: string;
  currentStatus: 'pending' | 'approved' | 'admin' | 'suspended' | 'rejected';
  currentRole: 'florist' | 'sales' | 'admin';
  orderCount: number;
}

type ModalKind = 'approve' | 'suspend' | 'unsuspend' | 'promote' | 'force_logout' | null;

export default function ActionButtons({
  userId,
  currentStatus,
  currentRole,
  orderCount,
}: Props) {
  const [modal, setModal] = useState<ModalKind>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {currentStatus === 'pending' && (
        <button
          type="button"
          onClick={() => setModal('approve')}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors"
        >
          Approve
        </button>
      )}
      {currentStatus === 'approved' && (
        <button
          type="button"
          onClick={() => setModal('suspend')}
          className="text-xs font-semibold text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
        >
          Suspend
        </button>
      )}
      {currentStatus === 'suspended' && (
        <button
          type="button"
          onClick={() => setModal('unsuspend')}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors"
        >
          Unsuspend
        </button>
      )}
      {currentRole !== 'admin' && (
        <button
          type="button"
          onClick={() => setModal('promote')}
          className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 border border-indigo-300 hover:border-indigo-500 px-3 py-1.5 rounded-lg transition-colors"
        >
          Promote to admin
        </button>
      )}
      <button
        type="button"
        onClick={() => setModal('force_logout')}
        className="text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors"
      >
        Force logout
      </button>

      {modal === 'approve' && (
        <RationaleModal
          title="Approve client"
          description="Creates a client_profiles.status_change proposal (pending -> approved). Takes effect after CEO approves in the queue."
          submitLabel="Propose approve"
          onClose={() => setModal(null)}
          onSubmit={async (reason) => {
            const fd = new FormData();
            fd.set('user_id', userId);
            fd.set('reason', reason);
            const r = await approveClientWithReason(fd);
            return r.ok ? null : r.error ?? 'unknown_error';
          }}
        />
      )}
      {modal === 'suspend' && (
        <RationaleModal
          title="Suspend client"
          description="Creates a status_change proposal to set status=suspended. Open orders flagged; existing dispatches continue."
          submitLabel="Propose suspend"
          minLength={5}
          onClose={() => setModal(null)}
          onSubmit={async (reason) => {
            const fd = new FormData();
            fd.set('user_id', userId);
            fd.set('reason', reason);
            const r = await suspendClient(fd);
            return r.ok ? null : r.error ?? 'unknown_error';
          }}
        />
      )}
      {modal === 'unsuspend' && (
        <RationaleModal
          title="Unsuspend client"
          description="Creates a status_change proposal back to approved."
          submitLabel="Propose unsuspend"
          onClose={() => setModal(null)}
          onSubmit={async (reason) => {
            const fd = new FormData();
            fd.set('user_id', userId);
            fd.set('reason', reason);
            const r = await unsuspendClient(fd);
            return r.ok ? null : r.error ?? 'unknown_error';
          }}
        />
      )}
      {modal === 'promote' && (
        <PromoteModal
          userId={userId}
          orderCount={orderCount}
          currentStatus={currentStatus}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'force_logout' && (
        <ForceLogoutModal userId={userId} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function RationaleModal(props: {
  title: string;
  description: string;
  submitLabel: string;
  minLength?: number;
  onSubmit: (reason: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const minLen = props.minLength ?? 5;
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = reason.trim().length >= minLen && !pending;

  function handleSubmit() {
    setErr(null);
    startTransition(async () => {
      const result = await props.onSubmit(reason.trim());
      if (result) setErr(result);
      else props.onClose();
    });
  }

  return (
    <ModalShell title={props.title} onClose={props.onClose}>
      <p className="text-sm text-slate-600">{props.description}</p>
      <label className="block mt-3">
        <span className="text-xs font-semibold text-slate-700">
          Rationale (min {minLen} chars, required)
        </span>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
        />
      </label>
      {err && (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {err}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onClose}
          className="text-sm font-semibold text-slate-600 hover:text-slate-800 px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-4 py-1.5 rounded-lg"
        >
          {pending ? 'Submitting...' : props.submitLabel}
        </button>
      </div>
    </ModalShell>
  );
}

function PromoteModal(props: {
  userId: string;
  orderCount: number;
  currentStatus: 'pending' | 'approved' | 'admin' | 'suspended' | 'rejected';
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [allowOverride, setAllowOverride] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const requiresOverride =
    props.currentStatus === 'approved' && props.orderCount > 0;
  const canSubmit =
    reason.trim().length >= 10 &&
    (!requiresOverride || allowOverride) &&
    !pending;

  function handleSubmit() {
    setErr(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('user_id', props.userId);
      fd.set('reason', reason.trim());
      if (allowOverride) fd.set('allow_florist_promotion', 'true');
      const r = await promoteToAdmin(fd);
      if (!r.ok) setErr(r.error ?? 'unknown_error');
      else props.onClose();
    });
  }

  return (
    <ModalShell title="Promote to admin" onClose={props.onClose}>
      <p className="text-sm text-slate-600">
        Creates a client_profiles.status_change proposal with payload new_role=admin.
        Takes effect only after CEO approves in the queue.
      </p>
      {requiresOverride && (
        <div className="mt-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
          <div className="font-semibold">
            HARD GUARD: "No florist can be admin"
          </div>
          <div className="mt-1">
            This client has {props.orderCount} placed orders. Promotion requires
            an explicit override flag + CEO-level rationale. Set the override
            below only if CEO has authorized this in writing.
          </div>
        </div>
      )}
      <label className="block mt-3">
        <span className="text-xs font-semibold text-slate-700">
          Rationale (min 10 chars, required)
        </span>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Hired Camila as Co-Admin 2026-05-19, JJ confirmed via email"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
        />
      </label>
      {requiresOverride && (
        <label className="flex items-start gap-2 mt-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={allowOverride}
            onChange={(e) => setAllowOverride(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
          />
          <span>
            I confirm CEO has authorized promoting this florist (with placed
            orders) to admin. Setting allow_florist_promotion=true.
          </span>
        </label>
      )}
      {err && (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {err}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onClose}
          className="text-sm font-semibold text-slate-600 hover:text-slate-800 px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-4 py-1.5 rounded-lg"
        >
          {pending ? 'Submitting...' : 'Propose promotion'}
        </button>
      </div>
    </ModalShell>
  );
}

function ForceLogoutModal(props: { userId: string; onClose: () => void }) {
  const [rationale, setRationale] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = rationale.trim().length >= 5 && !pending;

  function handleSubmit() {
    setErr(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/auth-sessions/${props.userId}/force-logout`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ rationale: rationale.trim() }),
          },
        );
        const json = (await res.json()) as { ok?: boolean; error?: string; detail?: string };
        if (!res.ok || !json.ok) {
          setErr(json.error ? `${json.error}${json.detail ? ': ' + json.detail : ''}` : 'request_failed');
          return;
        }
        props.onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'fetch_failed');
      }
    });
  }

  return (
    <ModalShell title="Force logout" onClose={props.onClose}>
      <p className="text-sm text-slate-600">
        Revokes ALL sessions for this user. They will be required to log in
        again on next page load. No notification is sent to the user. An
        override_audit row is written with the rationale.
      </p>
      <label className="block mt-3">
        <span className="text-xs font-semibold text-slate-700">
          Rationale (min 5 chars, required)
        </span>
        <textarea
          rows={2}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="e.g. Suspected compromised credentials, JJ called 2:15pm"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
        />
      </label>
      {err && (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {err}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onClose}
          className="text-sm font-semibold text-slate-600 hover:text-slate-800 px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-4 py-1.5 rounded-lg"
        >
          {pending ? 'Revoking...' : 'Force logout'}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell(props: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900">{props.title}</h3>
          <button
            type="button"
            onClick={props.onClose}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none"
            aria-label="Close"
          >
            x
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}
