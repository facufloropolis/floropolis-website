'use client';
// BulkApproveForm -- checkbox list + single submit for bulk-approving N pending florists.
// Phase E | 2026-05-19 | Job_PM admin-clients [V8 SHADOW]
//
// Children are passed in (the list rows render their own checkbox + label). This
// component owns the form, the rationale input, and the "Approve N selected"
// submit button. It enables the submit only when at least one box is checked
// AND a >= 5-char rationale is present.
//
// The server action receives FormData with user_ids[] entries and a 'reason'
// text field, then creates N admin_proposals in awaiting_facu state.

import { useState, useTransition } from 'react';
import { bulkApprovePending } from './actions';

interface Props {
  pendingClients: Array<{ user_id: string; business_name: string | null; email: string | null }>;
}

export default function BulkApproveForm({ pendingClients }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(pendingClients.map((c) => c.user_id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function handleSubmit() {
    if (selected.size === 0 || reason.trim().length < 5) return;
    const fd = new FormData();
    for (const id of selected) fd.append('user_ids[]', id);
    fd.append('reason', reason.trim());
    startTransition(async () => {
      const r = await bulkApprovePending(fd);
      setResult({ created: r.created, errors: r.errors });
      if (r.ok && r.errors.length === 0) {
        setSelected(new Set());
        setReason('');
      }
    });
  }

  if (pendingClients.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-slate-400 text-sm">
        No pending florists waiting for approval.
      </div>
    );
  }

  const canSubmit = selected.size > 0 && reason.trim().length >= 5 && !pending;

  return (
    <div className="rounded-xl border border-slate-200">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">
          Bulk approve pending florists ({pendingClients.length} waiting)
        </div>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={selectAll}
            className="text-emerald-700 hover:text-emerald-900 font-semibold"
          >
            Select all
          </button>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-slate-500 hover:text-slate-700 font-semibold"
          >
            Clear
          </button>
        </div>
      </div>

      <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
        {pendingClients.map((c) => (
          <li key={c.user_id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={selected.has(c.user_id)}
              onChange={() => toggle(c.user_id)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="font-semibold text-slate-900 flex-1">
              {c.business_name ?? <span className="italic text-slate-400">No business name</span>}
            </span>
            <span className="text-xs text-slate-500">{c.email ?? '--'}</span>
          </li>
        ))}
      </ul>

      <div className="px-5 py-4 border-t border-slate-200 bg-white space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">
            Rationale (min 5 chars, required)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Reviewed each in K2K, all valid B2B florists"
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
          />
        </label>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {selected.size} selected. Each creates one proposal awaiting CEO approval.
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
          >
            {pending ? 'Submitting...' : `Propose approve ${selected.size}`}
          </button>
        </div>

        {result && (
          <div
            className={`text-xs rounded-lg px-3 py-2 ${
              result.errors.length === 0
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}
          >
            <div className="font-semibold">
              Created {result.created} proposal{result.created === 1 ? '' : 's'}.
            </div>
            {result.errors.length > 0 && (
              <ul className="mt-1 list-disc list-inside">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
