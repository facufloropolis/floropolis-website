// Solution-first CONTENT card body: WORK the note, don't flag the gap.
// v1 | 2026-06-10 | Job_PM (CPO)
//
// HARD BAR (Facu): the loop closes ONLY when the metric MOVES. This component
// authors ONE contents description for a category x box_type group and POSTs it
// to /api/admin/supply/apply-content, which writes product_chrome.description for
// every content-gap SKU in the group and CLEARS the missing_contents_description
// gate -> the SKUs become publishable (real metric move, reported only when the
// server confirms the gate cleared).
//
// The note is AUTHORED text (never invented): we prefill the inferred-stems
// sentence as a starting point when available, but Facu edits/confirms it. If no
// note is written, nothing is applied.
//
// Style: emerald-600 primary, slate scale, ASCII-clean Spanish. NULL-safe.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  category: string;
  boxType: string;
  varieties: number;
  // Optional prefill (the inferred-stems sentence) — editable, never auto-sent.
  suggestedNote?: string | null;
}

interface ApplyResult {
  applied: boolean;
  loopClosed?: boolean;
  reason?: string;
  gapSkuCount?: number;
  gatesCleared?: number;
  closed?: number;
  nowPublishable?: number;
}

export default function ContentSolution({ category, boxType, varieties, suggestedNote }: Props) {
  const router = useRouter();
  const [note, setNote] = useState(suggestedNote?.trim() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  async function apply() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/supply/apply-content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ category, boxType, note: note.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as ApplyResult & { error?: string; detail?: string };
      if (!res.ok) {
        throw new Error(json.detail ? `${json.error}: ${json.detail}` : json.error ?? `HTTP ${res.status}`);
      }
      setResult(json);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo aplicar');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const closed = result.closed ?? 0;
    if (result.applied && result.loopClosed && closed > 0) {
      return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
            <span aria-hidden>+</span> Loop cerrado
          </div>
          <div className="text-sm font-semibold text-emerald-800 mt-1 leading-snug">
            contents_note aplicada -&gt; gate missing_contents_description cerrado en {closed} SKU
            {closed === 1 ? '' : 's'} -&gt; +{result.nowPublishable ?? 0} publicable
            {(result.nowPublishable ?? 0) === 1 ? '' : 's'}
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          Sin cierre de gate
        </div>
        <div className="text-sm text-amber-900 mt-1 leading-snug">
          {result.reason === 'no_content_gap_sku'
            ? 'Estas variedades ya no tienen el gate de contenido. Nada que mover.'
            : result.reason === 'no_sku_for_group'
              ? 'Sin SKU para este grupo.'
              : `Nota escrita en ${result.gatesCleared ?? 0} SKU, pero el gate no se cerro (queda otro bloqueo).`}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3.5 py-3 space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Escribir contents_note (1 nota -&gt; {varieties} variedad{varieties === 1 ? '' : 'es'})
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder={`Descripcion de contenido para ${category} en ${boxType.toUpperCase()} (ej: ramo de N stems, ...)`}
        className="w-full text-sm rounded-lg border border-slate-200 px-2.5 py-2 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || note.trim().length < 3}
          onClick={() => void apply()}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 rounded-xl shadow-sm transition-colors disabled:opacity-50"
        >
          {busy ? 'Aplicando...' : 'Aplicar a escala'}
        </button>
        <span className="text-[10px] text-slate-400">
          Escribe product_chrome.description + cierra el gate (min 3 caracteres).
        </span>
      </div>
      {error && <p className="text-[11px] text-red-600 font-mono break-words">{error}</p>}
    </div>
  );
}
