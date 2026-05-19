'use client';
// "Insert Sample Box" CTA — opens modal listing eligible prospects.
// v1 | 2026-05-19 | Job_PM Phase F [V8 SHADOW]
//
// Phase F: writes prospect.status='sent' and (optionally) a phone_note comm
// against the first dispatch on the current day. The full UC-O-189 backend
// (synthetic order + order_lines + dispatch row) is Phase G work because it
// crosses into order intake (D1 schema).

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface ProspectOption {
  id: string;
  business_name: string;
  contact_name: string | null;
  city: string | null;
  state: string | null;
  status: string;
}

interface Props {
  prospects: ProspectOption[];
  defaultDispatchId?: string | null;
}

export default function DispatchSampleBoxButton({ prospects, defaultDispatchId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const eligible = prospects.filter((p) => p.status === 'eligible' || p.status === 'sent');

  async function submit() {
    if (!selectedId) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/dispatch/sample-box', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prospect_id: selectedId,
          dispatch_id: defaultDispatchId ?? null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.detail ? `${j.error}: ${j.detail}` : (j.error ?? `HTTP ${res.status}`));
      }
      setOpen(false);
      setSelectedId(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-700 transition-colors"
      >
        + Sample Box
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="font-bold text-slate-900 text-lg mb-1">Insert Sample Box</h3>
            <p className="text-slate-500 text-sm mb-4">
              Add a sample box to today&apos;s dispatch. Pick a prospect to send it to.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-3">
              Phase F: this flips the prospect to &apos;sent&apos; and logs a comm. The synthetic
              order + dispatch row are Phase G work.
            </p>
            <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
              {eligible.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No eligible prospects.</p>
              ) : (
                eligible.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left border rounded-xl px-3 py-2 transition-all ${
                      selectedId === p.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">{p.business_name}</p>
                    <p className="text-xs text-slate-500">
                      {p.contact_name ?? '-'}
                      {p.city && ` · ${p.city}${p.state ? `, ${p.state}` : ''}`}
                      {p.status === 'sent' && ' · already received a sample'}
                    </p>
                  </button>
                ))
              )}
            </div>
            {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSelectedId(null);
                  setErr(null);
                }}
                disabled={busy}
                className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!selectedId || busy}
                className="text-sm px-5 py-2 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40 hover:bg-emerald-700"
              >
                {busy ? 'Saving...' : 'Add to dispatch ->'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
