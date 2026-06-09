// JJ's queue: open questions Facu routed, each with an answer box.
// v1 | 2026-06-09 | Job_PM (CPO)
//
// Receives only rows with status==='question_open'. POSTs each answer to
// /api/admin/samples/answer then location.reload(). Empty state when none.
//
// Mirrors the cohort-review DecisionBar fetch idiom (busy/error, disabled-while-pending).

'use client';

import { useState } from 'react';
import type { SampleReviewRow } from './types';

interface Props {
  rows: SampleReviewRow[];
}

function OpenQuestion({ row }: { row: SampleReviewRow }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (answer.trim().length < 3) {
      setError('Escribi una respuesta (min 3 caracteres).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/samples/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ loopId: row.loopId, answer: answer.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.detail ? `${json.error}: ${json.detail}` : (json.error ?? `HTTP ${res.status}`),
        );
      }
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'answer failed');
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-base font-bold text-slate-900">{row.businessName}</h3>
        <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-sky-50 text-sky-700 border border-sky-200">
          pregunta abierta
        </span>
      </div>

      <div className="rounded-md border border-sky-200 bg-sky-50/60 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-600 mb-0.5">
          Pregunta de Facu
        </div>
        <p className="text-[13px] text-slate-800 leading-relaxed">
          {row.questionText || '--'}
        </p>
      </div>

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="tu respuesta para Facu"
        rows={3}
        className="w-full text-sm rounded-md border border-slate-200 px-2.5 py-2 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="text-sm font-semibold px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? 'Enviando...' : 'Responder'}
        </button>
      </div>

      {error && <p className="text-[11px] text-red-600 font-mono whitespace-normal">{error}</p>}
    </article>
  );
}

export default function JJAnswerPanel({ rows }: Props) {
  const open = rows.filter((r) => r.status === 'question_open');

  if (open.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
        <div className="text-slate-300 text-3xl mb-2" aria-hidden>
          &#9711;
        </div>
        <h2 className="text-base font-semibold text-slate-700">No hay preguntas abiertas</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
          Cuando Facu te haga una pregunta sobre un sample, aparece aca para que la
          respondas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-slate-500">
        {open.length} {open.length === 1 ? 'pregunta' : 'preguntas'} para responder
      </p>
      {open.map((r) => (
        <OpenQuestion key={r.loopId ?? `${r.leadMasterId}-${r.businessName}`} row={r} />
      ))}
    </div>
  );
}
