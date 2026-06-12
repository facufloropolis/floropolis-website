// PriceReviewPanel — /admin/supply suggested-price queue. Calculable rows show the derived price
// (farm_cost/(1-gpm)+delivery) -> Facu Approves / Corrects / Rejects. Missing-cost rows show
// "can't price yet — missing cost in the system" (info only; Job routes the cost internally,
// never tells Facu to chase Rose). v1 | 2026-06-12 | Job_PM (CPO)
'use client';

import { useState } from 'react';
import type { PriceCandidate, PriceReviewData } from '@/lib/admin/price-review';

function CalcRow({ c }: { c: PriceCandidate }) {
  const [price, setPrice] = useState(c.suggestedPrice != null ? String(c.suggestedPrice) : '');
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const edited = c.suggestedPrice != null && Number(price) !== c.suggestedPrice;

  async function decide(decision: 'approve' | 'correct' | 'reject') {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/supply/price-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: c.id, decision, price: decision === 'correct' ? Number(price) : undefined }),
      });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && b.ok) setDone(decision === 'reject' ? 'rechazado' : decision === 'correct' ? 'corregido' : 'aprobado');
      else setErr(b.error ?? `http_${res.status}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 ${done ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-slate-800">{c.variety}</div>
        <div className="text-[11px] text-slate-500">{c.category ?? '—'} · costo {c.farmCost != null ? `$${c.farmCost}` : '—'}</div>
      </div>
      {done ? (
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{done}</span>
      ) : (
        <>
          <div className="flex items-center gap-1 text-[13px]">
            <span className="text-slate-400">$</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal"
              className="w-[68px] rounded border border-slate-200 px-1.5 py-1 text-right" />
          </div>
          <button onClick={() => decide(edited ? 'correct' : 'approve')} disabled={busy || !price}
            className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {edited ? 'Corregir' : 'Aprobar'}
          </button>
          <button onClick={() => decide('reject')} disabled={busy}
            className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">✕</button>
          {err && <span className="text-[11px] text-rose-600">{err}</span>}
        </>
      )}
    </div>
  );
}

export default function PriceReviewPanel({ data }: { data: PriceReviewData }) {
  if (data.calculable.length === 0 && data.missingCost.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-slate-800">Precios — sugeridos para aprobar</h2>
        <span className="text-[12px] text-slate-500">{data.calculable.length} listos · fórmula fija (cost/(1-GPM)+delivery)</span>
      </div>
      <p className="mb-3 text-[12px] text-slate-500">Precio derivado del costo real, no inventado. Aprobás, Corregís el número, o Rechazás.</p>

      <div className="space-y-1.5">
        {data.calculable.map((c) => <CalcRow key={c.id} c={c} />)}
      </div>

      {data.missingCost.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
          <span className="font-semibold">{data.missingCost.length} sin pricear todavía</span> — falta el costo de compra en el sistema
          ({data.missingCost.map((c) => c.variety).filter(Boolean).slice(0, 6).join(', ')}). Lo estoy resolviendo; no necesitás hacer nada.
        </div>
      )}
    </section>
  );
}
