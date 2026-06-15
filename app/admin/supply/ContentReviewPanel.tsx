// ContentReviewPanel — /admin/supply queue of AUTO-GENERATED content descriptions (from real
// stems+variety+length). Facu reads the prose, Applies / Edits / Rejects. Approve writes to
// product_chrome.description (gate closes). Never asks Facu to write from scratch. Same mold as
// images. v1 | 2026-06-12 | Job_PM (CPO)
'use client';

import { useState } from 'react';
import type { ContentCandidate } from '@/lib/admin/content-review';

function Row({ c }: { c: ContentCandidate }) {
  const [text, setText] = useState(c.text);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const edited = text.trim() !== c.text.trim();

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    setErr(null);
    setWarnings([]);
    try {
      const res = await fetch('/api/admin/supply/content-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: c.id, decision, text: decision === 'approve' ? text : null }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        ok?: boolean; error?: string; propagated?: boolean; loopClosed?: boolean; publishable?: boolean; warnings?: string[];
      };
      // No-swallow: surface any partial-failure warnings the route returned.
      if (Array.isArray(b.warnings) && b.warnings.length) setWarnings(b.warnings);
      if (res.ok && b.ok) {
        if (decision === 'reject') setDone('rechazada');
        else {
          // Honest: "desbloqueado" only when the gate cleared (loop closed).
          const base = edited ? 'editada' : 'aplicada';
          if (b.publishable) setDone(`${base} · publicable`);
          else if (b.loopClosed) setDone(`${base} · desbloqueado`);
          else setDone(base);
        }
      } else setErr(b.error ?? `http_${res.status}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-3 ${done ? 'opacity-60' : ''}`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] font-medium text-slate-700">{[c.variety, c.length && `${c.length}cm`].filter(Boolean).join(' ') || c.skuId}</span>
        {done && <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{done}</span>}
      </div>
      {!done && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full rounded border border-slate-200 px-2 py-1 text-[13px] text-slate-800"
          />
          <div className="mt-1 flex items-center gap-2">
            <button onClick={() => decide('approve')} disabled={busy}
              className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {edited ? 'Aplicar editada' : 'Aplicar'}
            </button>
            <button onClick={() => decide('reject')} disabled={busy}
              className="rounded border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              Rechazar
            </button>
            {err && <span className="text-[11px] text-rose-600">{err}</span>}
          </div>
          {warnings.length > 0 && (
            <div className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              {warnings.map((w, i) => (
                <div key={i}>aviso: {w}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ContentReviewPanel({ items }: { items: ContentCandidate[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-slate-800">Descripciones — auto-generadas, para aprobar</h2>
        <span className="text-[12px] text-slate-500">{items.length} SKUs · derivadas del stem real</span>
      </div>
      <p className="mb-3 text-[12px] text-slate-500">
        Generadas del dato real (stems · variedad · largo), no inventadas, no tipeás de cero. Leé, Aplicá (cierra el gate), Editá si querés afinar, o Rechazá.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {items.map((c) => (
          <Row key={c.id} c={c} />
        ))}
      </div>
    </section>
  );
}
