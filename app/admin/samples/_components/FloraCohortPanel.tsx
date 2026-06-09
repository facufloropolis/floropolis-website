// FLORA-qualified cohort — the FRONT of the samples loop.
// v1 | 2026-06-09 | Job_PM (CPO)
//
// The accounts JJ qualified with a REAL FLORA score (PROD zoho_accounts), ranked by
// score desc, ready to REVIEW + approve for a sample box. Approving here = "create the
// box" (downstream — these accounts are NOT in sample_box_status yet). Renders above the
// existing dispatch-state list (review the qualified first, then the boxed/dispatched).
//
// Decide contract: POSTs to /api/admin/samples/decide with
//   { leadMasterId: <numeric decideKey>, businessName: <accountName>, decision: 'yes'|'no' }
// The decide route HARD-REQUIRES a finite numeric leadMasterId and keys sample_review_loop
// by it. FLORA accounts have no real lead_master_id (not boxed yet), so the reader hands a
// stable synthetic key per account (decideKey) and the account name rides along as
// business_name. Same account → same key (idempotent). On success → reload.
//
// emerald-600 / slate house style. ASCII-clean Spanish copy. NULL-safe ("--" when null).

'use client';

import { useState } from 'react';
import type { FloraCohortRow } from '@/lib/admin/sample-review';

interface Props {
  rows: FloraCohortRow[];
}

type Action = 'yes' | 'no';

function scoreTone(score: number | null): string {
  if (score == null) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 70) return 'text-emerald-700';
  return 'text-amber-600';
}

function Intel({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="text-[13px] text-slate-700 break-words">{value && value.trim() ? value : '--'}</div>
    </div>
  );
}

function FloraCard({ row }: { row: FloraCohortRow }) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Action | null>(null);

  async function decide(decision: Action) {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch('/api/admin/samples/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          leadMasterId: row.decideKey,
          businessName: row.accountName,
          decision,
          rejectedReason:
            decision === 'no' ? 'Rechazado en revision FLORA (no enviar caja).' : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.detail ? `${json.error}: ${json.detail}` : (json.error ?? `HTTP ${res.status}`),
        );
      }
      setDone(decision);
      // Let the success state flash, then reload to re-pull cohort + loop state.
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'decision failed');
      setBusy(null);
    }
  }

  const decisionChip = row.decision
    ? row.decision.toUpperCase().includes('NURTUR')
      ? { label: row.decision, cls: 'bg-amber-50 text-amber-700 border-amber-200' }
      : { label: row.decision, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-start gap-4">
        {/* Big FLORA score */}
        <div className="shrink-0 text-center w-16">
          <div className={'text-3xl font-bold leading-none ' + scoreTone(row.floraScore)}>
            {row.floraScore != null ? row.floraScore : '--'}
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">
            FLORA
          </div>
        </div>

        {/* Name + badges */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-semibold text-slate-800 truncate">
              {row.accountName}
            </h3>
            {row.byJJ ? (
              <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-0.5">
                Calificado por JJ
              </span>
            ) : null}
            {decisionChip ? (
              <span
                className={
                  'text-[10px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 ' +
                  decisionChip.cls
                }
              >
                {decisionChip.label}
              </span>
            ) : null}
          </div>
          <div className="text-[12px] text-slate-400 mt-0.5">
            {[row.businessType, [row.city, row.state].filter(Boolean).join(', ')]
              .filter((x) => x && x.trim())
              .join(' · ') || '--'}
          </div>
        </div>
      </div>

      {/* Reasoning (JJ free-text qualification notes) */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Por que (notas de JJ)
        </div>
        <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-line break-words">
          {row.reasoning && row.reasoning.trim() ? row.reasoning : '--'}
        </p>
      </div>

      {/* Intel grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 rounded-lg bg-slate-50 px-3 py-2.5">
        <Intel label="Proveedor actual" value={row.currentSupplier} />
        <Intel label="Precios que paga" value={row.pricesTheyPay} />
        <Intel label="Caja preferida" value={row.boxPreference} />
        <Intel label="Productos de interes" value={row.productsInterest} />
        <Intel label="Sub-score" value={row.subScore} />
        <Intel label="Telefono" value={row.phone} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide('yes')}
          className="text-sm font-semibold px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === 'yes' ? 'Aprobando...' : done === 'yes' ? 'Aprobado' : 'Aprobar'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide('no')}
          className="text-sm font-medium px-3 py-2 rounded-lg border bg-white border-slate-200 text-rose-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === 'no' ? 'Rechazando...' : done === 'no' ? 'Rechazado' : 'Rechazar'}
        </button>
        <span className="text-[11px] text-slate-400">
          Aprobar = crear la caja (downstream).
        </span>
      </div>

      {error ? (
        <p className="text-[11px] text-red-600 font-mono whitespace-normal">{error}</p>
      ) : null}
    </div>
  );
}

export default function FloraCohortPanel({ rows }: Props) {
  if (!rows || rows.length === 0) {
    return (
      <section className="mb-6">
        <h2 className="text-base font-semibold text-slate-800">Calificados por JJ (FLORA)</h2>
        <p className="text-sm text-slate-500 mt-1">
          No hay cuentas calificadas con score FLORA por JJ para revisar todavia.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-800">
          Calificados por JJ (FLORA) &mdash; para revisar
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Cuentas que JJ califico con score FLORA real, listas para revisar y aprobar para una
          caja de muestra. Ordenadas por score. Aprobar = crear la caja (downstream); estas
          cuentas todavia no estan en dispatch. ({rows.length} cuenta{rows.length === 1 ? '' : 's'})
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {rows.map((row) => (
          <FloraCard key={row.zohoId ?? row.decideKey} row={row} />
        ))}
      </div>
    </section>
  );
}
