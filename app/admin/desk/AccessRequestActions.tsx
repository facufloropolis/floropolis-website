// AccessRequestActions -- approve/reject a seller's access request from the Desk.
// Approve grants admin (best-effort) + marks the request; reject marks it.
// v1 | 2026-06-09 | Job_PM (CPO)
'use client';

import { useState } from 'react';

export default function AccessRequestActions({ id }: { id: string }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(decision);
    setErr(null);
    try {
      const res = await fetch('/api/admin/access-requests/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        setDone(decision === 'approve' ? 'aprobado' : 'rechazado');
      } else {
        setErr(body.error ?? `http_${res.status}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return <span className="text-[12px] font-medium text-emerald-700">{done}</span>;
  }

  return (
    <span className="flex items-center gap-1.5">
      {err && <span className="text-[11px] text-rose-600">{err}</span>}
      <button
        onClick={() => decide('approve')}
        disabled={busy !== null}
        className="rounded-md bg-emerald-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy === 'approve' ? '...' : 'Aprobar'}
      </button>
      <button
        onClick={() => decide('reject')}
        disabled={busy !== null}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-[12px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy === 'reject' ? '...' : 'Rechazar'}
      </button>
    </span>
  );
}
