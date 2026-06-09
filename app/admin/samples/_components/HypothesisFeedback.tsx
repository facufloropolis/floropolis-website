// The learning loop: Facu corrects Job's win-hypothesis.
// v1 | 2026-06-09 | Job_PM (CPO)
//
// Correct / Wrong / Partial + a correction textarea. POSTs to
// /api/admin/samples/feedback then location.reload(). The correction trains the
// next proposal -> the textarea is deliberately inviting.
//
// Mirrors the cohort-review DecisionBar fetch idiom (busy/error, disabled-while-pending).

'use client';

import { useState } from 'react';
import type { SampleReviewRow } from './types';

type Verdict = 'correct' | 'wrong' | 'partial';

interface Props {
  row: SampleReviewRow;
}

export default function HypothesisFeedback({ row }: Props) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [correction, setCorrection] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(v: Verdict) {
    // "correct" can submit with no correction; wrong/partial want a note.
    if ((v === 'wrong' || v === 'partial') && correction.trim().length < 3) {
      setVerdict(v);
      setError('Decí qué está mal (min 3 caracteres) — esto entrena la próxima propuesta.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/samples/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          leadMasterId: row.leadMasterId,
          businessName: row.businessName,
          hypothesisType: 'win_hypothesis',
          hypothesisText: row.winHypothesis,
          verdict: v,
          correction: correction.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.detail ? `${json.error}: ${json.detail}` : (json.error ?? `HTTP ${res.status}`),
        );
      }
      setDone(true);
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'feedback failed');
      setBusy(false);
    }
  }

  function pick(v: Verdict) {
    setVerdict(v);
    setError(null);
    if (v === 'correct') {
      submit('correct');
    }
  }

  const btn = (v: Verdict, label: string, active: string, idle: string) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => pick(v)}
      className={
        'text-[12px] font-medium px-3 py-1.5 rounded-lg border disabled:opacity-50 ' +
        (verdict === v ? active : idle)
      }
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        ¿La win-hypothesis estuvo bien? &mdash; entrena la próxima propuesta
      </div>

      {done ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-medium text-emerald-800 flex items-center gap-1.5">
          <span aria-hidden>&#10003;</span> feedback registrado
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {btn(
              'correct',
              busy && verdict === 'correct' ? 'Guardando...' : 'Correcta',
              'bg-emerald-600 text-white border-emerald-600',
              'bg-white border-slate-200 text-emerald-700 hover:bg-slate-50',
            )}
            {btn(
              'wrong',
              'Equivocada',
              'bg-rose-100 border-rose-300 text-rose-800',
              'bg-white border-slate-200 text-rose-700 hover:bg-slate-50',
            )}
            {btn(
              'partial',
              'Parcial',
              'bg-amber-100 border-amber-300 text-amber-800',
              'bg-white border-slate-200 text-amber-700 hover:bg-slate-50',
            )}
          </div>

          {(verdict === 'wrong' || verdict === 'partial') && (
            <div className="space-y-2">
              <textarea
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                placeholder="qué está mal y por qué — esto entrena la próxima propuesta"
                rows={3}
                className="w-full text-sm rounded-md border border-slate-200 px-2.5 py-2 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => submit(verdict)}
                className="text-sm font-semibold px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? 'Guardando...' : 'Guardar corrección'}
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="text-[11px] text-red-600 font-mono whitespace-normal">{error}</p>}
    </div>
  );
}
