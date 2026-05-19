'use client';
// ProfileEditForm -- editable fields for /admin/clients/[id] Profile tab.
// Phase E | 2026-05-19 | Job_PM admin-clients [V8 SHADOW]
//
// Changes do NOT mutate client_profiles directly. They land in admin_proposals
// with type=client_profiles.update and await CEO approval. The executor for
// client_profiles.update is not yet added to lib/admin/proposal-executors.ts
// (Phase E scope explicitly excludes editing that file); approval will surface
// "unknown_proposal_type" until that executor lands in a follow-up.
//
// Fields: business_name, phone, ein, notes. EIN edits flip B2B/B2C derivation.

import { useState, useTransition } from 'react';
import { proposeProfileUpdate } from '../actions';
import { deriveB2BStatus } from '@/lib/admin/client-derived';

interface Props {
  userId: string;
  initial: {
    business_name: string | null;
    phone: string | null;
    ein: string | null;
    notes: string | null;
  };
}

export default function ProfileEditForm({ userId, initial }: Props) {
  const [businessName, setBusinessName] = useState(initial.business_name ?? '');
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [ein, setEin] = useState(initial.ein ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    (businessName.trim() || null) !== (initial.business_name ?? null) ||
    (phone.trim() || null) !== (initial.phone ?? null) ||
    (ein.trim() || null) !== (initial.ein ?? null) ||
    (notes.trim() || null) !== (initial.notes ?? null);

  const canSubmit = dirty && reason.trim().length >= 5 && !pending;

  const beforeB2B = deriveB2BStatus(initial.ein);
  const afterB2B = deriveB2BStatus(ein || null);
  const b2bChanging = beforeB2B !== afterB2B;

  function handleSubmit() {
    setErr(null);
    setOk(null);
    const fd = new FormData();
    fd.set('user_id', userId);
    fd.set('business_name', businessName.trim());
    fd.set('phone', phone.trim());
    fd.set('ein', ein.trim());
    fd.set('notes', notes.trim());
    fd.set('reason', reason.trim());
    startTransition(async () => {
      const r = await proposeProfileUpdate(fd);
      if (r.ok) {
        setOk(`Proposal created (id ${r.proposalId?.slice(0, 8)}...). Awaiting CEO approval.`);
        setReason('');
      } else {
        setErr(r.error ?? 'unknown_error');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Business name">
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
          />
        </Field>
        <Field
          label="EIN"
          hint={`B2B if length >= 9, else B2C. Currently: ${beforeB2B}${
            b2bChanging ? ` -> ${afterB2B}` : ''
          }.`}
        >
          <input
            type="text"
            value={ein}
            onChange={(e) => setEin(e.target.value)}
            placeholder="9 digits, no dashes"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500 font-mono"
          />
        </Field>
        <Field label="Internal notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
          />
        </Field>
      </div>

      {b2bChanging && (
        <div className="text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
          <span className="font-semibold">B2B / B2C flip:</span> changing this EIN will move this client from {beforeB2B} to {afterB2B}. Past orders are NOT recomputed; future orders will follow the new status.
        </div>
      )}

      <Field label="Reason for change (min 5 chars, required)">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="e.g. EIN added per phone call 2026-05-19"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
        />
      </Field>

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
          {pending ? 'Submitting...' : 'Propose update'}
        </button>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{props.label}</span>
      <div className="mt-1">{props.children}</div>
      {props.hint && <div className="text-xs text-slate-500 mt-1">{props.hint}</div>}
    </label>
  );
}
