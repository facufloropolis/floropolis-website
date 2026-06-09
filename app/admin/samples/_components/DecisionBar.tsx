// Facu's decision bar for a single sample. Client child of the deep-dive.
// v1 | 2026-06-09 | Job_PM (CPO)
//
// SI (aligned) / NO (rejected -> reason textarea) / Pregunta (question -> textarea
// routed to JJ). POSTs to /api/admin/samples/decide then location.reload().
// If status==='answered', shows JJ's answer prominently so Facu can SI or re-Pregunta.
//
// Mirrors app/admin/cohort-review/DecisionBar.tsx: emerald buttons, disabled-while-
// pending, error text surfaced under the bar.

'use client';

import { useState } from 'react';
import type { SampleReviewRow } from './types';

type Action = 'yes' | 'no' | 'question';

interface Props {
  row: SampleReviewRow;
}

export default function DecisionBar({ row }: Props) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [showQuestion, setShowQuestion] = useState(false);
  const [rejectedReason, setRejectedReason] = useState('');
  const [questionText, setQuestionText] = useState(row.questionText ?? '');

  async function decide(decision: Action) {
    if (decision === 'no' && rejectedReason.trim().length < 3) {
      setError('Agregá un motivo del rechazo (min 3 caracteres).');
      return;
    }
    if (decision === 'question' && questionText.trim().length < 3) {
      setError('Escribí la pregunta para JJ (min 3 caracteres).');
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch('/api/admin/samples/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          leadMasterId: row.leadMasterId,
          businessName: row.businessName,
          decision,
          questionText: decision === 'question' ? questionText.trim() : undefined,
          rejectedReason: decision === 'no' ? rejectedReason.trim() : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.detail ? `${json.error}: ${json.detail}` : (json.error ?? `HTTP ${res.status}`),
        );
      }
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'decision failed');
      setBusy(null);
    }
  }

  const isAnswered = row.status === 'answered';

  return (
    <div className="border-t border-slate-200 bg-white/95 backdrop-blur px-5 py-3 space-y-2 sticky bottom-0">
      {/* Current status + JJ's answer (when answered) */}
      <div className="flex items-center gap-2 flex-wrap text-[12px]">
        <span className="text-slate-500">Estado:</span>
        <span className="font-semibold text-slate-700">{row.status}</span>
        {row.facuDecision ? (
          <span className="text-slate-400">&middot; decisión: {row.facuDecision}</span>
        ) : null}
      </div>

      {isAnswered && row.jjAnswer ? (
        <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-[13px] text-violet-900">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 mb-0.5">
            JJ respondió &mdash; ahora podés SÍ o re-Preguntar
          </div>
          <p className="leading-relaxed">{row.jjAnswer}</p>
        </div>
      ) : null}

      {/* Reject reason */}
      {showReject && (
        <div className="rounded-md border border-rose-200 bg-rose-50/60 p-2">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">
            Motivo del rechazo
          </label>
          <textarea
            value={rejectedReason}
            onChange={(e) => setRejectedReason(e.target.value)}
            placeholder="por qué no (queda registrado con la decisión)"
            rows={2}
            className="mt-1 w-full text-sm rounded-md border border-rose-200 px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}

      {/* Question to JJ */}
      {showQuestion && (
        <div className="rounded-md border border-sky-200 bg-sky-50/60 p-2">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
            Pregunta para JJ
          </label>
          <textarea
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="qué necesitás que JJ aclare antes de decidir"
            rows={2}
            className="mt-1 w-full text-sm rounded-md border border-sky-200 px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide('yes')}
          className="text-sm font-semibold px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === 'yes' ? 'Guardando...' : 'SÍ'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (showReject) {
              decide('no');
            } else {
              setShowReject(true);
              setShowQuestion(false);
            }
          }}
          className={
            'text-sm font-medium px-3 py-2 rounded-lg border disabled:opacity-50 ' +
            (showReject
              ? 'bg-rose-100 border-rose-300 text-rose-800'
              : 'bg-white border-slate-200 text-rose-700 hover:bg-slate-50')
          }
        >
          {busy === 'no' ? 'Guardando...' : showReject ? 'Confirmar NO' : 'NO'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (showQuestion) {
              decide('question');
            } else {
              setShowQuestion(true);
              setShowReject(false);
            }
          }}
          className={
            'text-sm font-medium px-3 py-2 rounded-lg border disabled:opacity-50 ' +
            (showQuestion
              ? 'bg-sky-100 border-sky-300 text-sky-800'
              : 'bg-white border-slate-200 text-emerald-700 hover:bg-slate-50')
          }
        >
          {busy === 'question' ? 'Enviando...' : showQuestion ? 'Enviar pregunta' : 'Pregunta'}
        </button>
      </div>

      {error && <p className="text-[11px] text-red-600 font-mono whitespace-normal">{error}</p>}
    </div>
  );
}
