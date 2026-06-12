// ImageReviewPanel — /admin/supply queue where Facu approves/rejects sourced candidate images
// WITH a reason (the learning signal). Approve propagates the image to the catalog (SKU unblocks).
// Candidates come from a zero-cost sourcing subagent (PROD-propagate > vendor > free > AI last).
// v1 | 2026-06-12 | Job_PM (CPO)
'use client';

import { useState } from 'react';
import type { ImageReviewSku, ImageCandidate } from '@/lib/admin/image-review';

const SOURCE_BADGE: Record<string, string> = {
  prod_propagate: 'bg-emerald-100 text-emerald-700',
  vendor: 'bg-sky-100 text-sky-700',
  free_stock: 'bg-indigo-100 text-indigo-700',
  ai_pollinations: 'bg-amber-100 text-amber-800',
};
const SOURCE_LABEL: Record<string, string> = {
  prod_propagate: 'PROD (ya pagada)',
  vendor: 'vendor',
  free_stock: 'free stock',
  ai_pollinations: 'AI',
};

function SkuCard({ sku }: { sku: ImageReviewSku }) {
  const [done, setDone] = useState<string | null>(null); // null | 'approved' | 'rejected'
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function decide(candidateId: number, decision: 'approve' | 'reject') {
    setBusy(candidateId);
    setErr(null);
    try {
      const res = await fetch('/api/admin/supply/image-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: candidateId, decision, feedback: reason || null }),
      });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; propagated?: boolean };
      if (res.ok && b.ok) setDone(decision === 'approve' ? 'approved' : 'rejected');
      else setErr(b.error ?? `http_${res.status}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(null);
    }
  }

  const title = [sku.variety, sku.sizeCm].filter(Boolean).join(' ') || sku.skuId || '(sku)';

  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-3 ${done ? 'opacity-60' : ''}`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[14px] font-semibold text-slate-800">{title}</div>
          <div className="text-[11px] text-slate-500">{sku.vendor ?? '—'} · {sku.candidates.length} candidata{sku.candidates.length === 1 ? '' : 's'}</div>
        </div>
        {done && <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{done}</span>}
      </div>

      {!done && (
        <>
          <div className="flex flex-wrap gap-3">
            {sku.candidates.map((c: ImageCandidate) => (
              <div key={c.id} className="w-[150px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.url} alt={title} className="h-[150px] w-[150px] rounded border border-slate-200 object-cover" />
                <div className="mt-1 flex items-center justify-between">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_BADGE[c.source] ?? 'bg-slate-100 text-slate-600'}`}>
                    {SOURCE_LABEL[c.source] ?? c.source}
                  </span>
                </div>
                <div className="mt-1 flex gap-1">
                  <button onClick={() => decide(c.id, 'approve')} disabled={busy === c.id}
                    className="flex-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    Aprobar esta
                  </button>
                  <button onClick={() => decide(c.id, 'reject')} disabled={busy === c.id}
                    className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="por qué (ej: 'foto real del vendor', 'mala calidad', 'variedad equivocada') — entrena el próximo batch"
            className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-[12px]"
          />
          {err && <div className="mt-1 text-[11px] text-rose-600">{err}</div>}
        </>
      )}
    </div>
  );
}

export default function ImageReviewPanel({ skus }: { skus: ImageReviewSku[] }) {
  if (skus.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-slate-800">Imágenes — candidatas para aprobar</h2>
        <span className="text-[12px] text-slate-500">{skus.length} SKUs · cero costo (PROD/vendor/free/AI)</span>
      </div>
      <p className="mb-3 text-[12px] text-slate-500">
        Un subagente sourceó imágenes sin costo (foto real del vendor primero, AI último). Aprobá la mejor por SKU
        (propaga al catálogo, desbloquea el SKU) o rechazá. El motivo entrena el próximo batch.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {skus.map((s) => (
          <SkuCard key={s.skuId ?? s.variety ?? Math.random()} sku={s} />
        ))}
      </div>
    </section>
  );
}
