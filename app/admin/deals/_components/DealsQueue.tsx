// DealsQueue -- pending deals awaiting pre-approval (JJ o Facu). Shown above the
// builder. Approve closes the pre-approval gate.
// v1 | 2026-06-09 | Job_PM (CPO)
'use client';

import { useState } from 'react';

export interface PendingDeal {
  id: number;
  businessName: string | null;
  dealType: string | null;
  cadence: string | null;
  totalPrice: number | null;
  blendedGpm: number | null;
  createdBy: string | null;
  belowFloor?: boolean;
}

export default function DealsQueue({ initial }: { initial: PendingDeal[] }) {
  const [deals, setDeals] = useState<PendingDeal[]>(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function approve(id: number) {
    setBusy(id);
    setErr(null);
    try {
      const res = await fetch('/api/admin/deals/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dealId: id }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        setDeals((prev) => prev.filter((d) => d.id !== id));
      } else {
        setErr(body.error ?? `http_${res.status}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(null);
    }
  }

  if (deals.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          Pendientes de aprobacion
        </span>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-800">
          {deals.length}
        </span>
        <span className="text-[12px] text-amber-700">JJ o Facu pueden aprobar</span>
      </div>
      {err && <div className="mb-2 text-[12px] text-rose-600">{err}</div>}
      <div className="overflow-hidden rounded-xl border border-amber-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-amber-50 text-[11px] uppercase text-amber-700">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Cliente</th>
              <th className="px-3 py-2 text-left font-medium">Tipo</th>
              <th className="px-3 py-2 text-right font-medium">Precio</th>
              <th className="px-3 py-2 text-right font-medium">GPM</th>
              <th className="px-3 py-2 text-left font-medium">Armado por</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100">
            {deals.map((d) => (
              <tr key={d.id}>
                <td className="px-3 py-2 font-medium text-slate-800">
                  {d.businessName ?? `Deal #${d.id}`}
                  {d.belowFloor && (
                    <span className="ml-2 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                      bajo floor
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {d.dealType === 'standing_order' ? `standing (${d.cadence ?? '--'})` : 'one-off'}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {d.totalPrice != null ? `$${d.totalPrice.toFixed(2)}` : '--'}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {d.blendedGpm != null ? `${(d.blendedGpm * 100).toFixed(1)}%` : '--'}
                </td>
                <td className="px-3 py-2 text-[12px] text-slate-500">{d.createdBy ?? '--'}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => approve(d.id)}
                    disabled={busy === d.id}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy === d.id ? 'Aprobando...' : 'Aprobar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
