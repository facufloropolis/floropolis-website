'use client';
// v1 | 2026-05-21 | Job_PM [V8 SHADOW]

import { useState, useTransition } from 'react';

export default function VendorNotesEditor({
  vendorName,
  initialNotes,
  updatedAt,
  updatedBy,
}: {
  vendorName: string;
  initialNotes: string;
  updatedAt: string | null;
  updatedBy: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      setStatus('saving');
      try {
        const res = await fetch(`/api/admin/vendors/${encodeURIComponent(vendorName)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_notes: notes }),
        });
        setStatus(res.ok ? 'saved' : 'error');
        if (res.ok) setTimeout(() => setStatus('idle'), 2500);
      } catch {
        setStatus('error');
      }
    });
  }

  const dirty = notes !== initialNotes && status !== 'saved';

  return (
    <div className="mt-3 space-y-1.5">
      <textarea
        value={notes}
        onChange={(e) => { setNotes(e.target.value); setStatus('idle'); }}
        placeholder="Context, priorities, open questions, contacts…"
        rows={3}
        className="w-full text-[12px] text-slate-700 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400 resize-none placeholder:text-slate-300"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400">
          {status === 'saved' && <span className="text-emerald-600">✓ Saved</span>}
          {status === 'error' && <span className="text-red-500">Save failed — retry</span>}
          {status === 'idle' && updatedAt && (
            <>Last: {new Date(updatedAt).toLocaleDateString()} by {updatedBy ?? '—'}</>
          )}
        </span>
        <button
          onClick={handleSave}
          disabled={isPending || (!dirty && status !== 'error')}
          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 disabled:text-slate-300 transition-colors"
        >
          {isPending ? 'Saving…' : 'Save notes'}
        </button>
      </div>
    </div>
  );
}
