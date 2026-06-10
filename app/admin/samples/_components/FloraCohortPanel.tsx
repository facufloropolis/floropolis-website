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
  // True when the cohort is empty BECAUSE the PROD read client can't see
  // zoho_accounts (RLS / service-role), NOT because JJ qualified nobody.
  prodBlocked?: boolean;
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
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">
        {label}
      </div>
      <div className="text-[13px] text-slate-700 break-words">
        {value && value.trim() ? value : <span className="text-slate-300">--</span>}
      </div>
    </div>
  );
}

function FloraCard({ row }: { row: FloraCohortRow }) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Action | null>(null);
  // After Aprobar, the create-box step routes the PROD write to Atlas. We surface that
  // honestly: Job captures the intent + routes; it does NOT write PROD sample_box_status.
  // boxReason carries the discriminated outcome so we never presume "PROD no configurado"
  // when the real cause was a route failure (RLS/permission/transient).
  const [boxRouted, setBoxRouted] = useState<boolean | null>(null);
  const [boxReason, setBoxReason] = useState<string | null>(null);

  async function decide(decision: Action) {
    setBusy(decision);
    setError(null);
    setBoxRouted(null);
    setBoxReason(null);
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

      // Aprobar = crear la caja: after a successful approve, ALSO request the create-box.
      // Job records the intent in BACKUP + routes the PROD write to Atlas (never writes PROD).
      if (decision === 'yes') {
        try {
          const boxRes = await fetch('/api/admin/samples/create-box', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              accountName: row.accountName,
              floraScore: row.floraScore,
              zohoId: row.zohoId,
              // Pass the decideKey so create-box attaches to the EXACT row decide keyed,
              // not a same-named sibling.
              leadMasterId: row.decideKey,
            }),
          });
          const boxJson = await boxRes.json().catch(() => ({}));
          if (!boxRes.ok) {
            throw new Error(
              boxJson.detail
                ? `${boxJson.error}: ${boxJson.detail}`
                : (boxJson.error ?? `HTTP ${boxRes.status}`),
            );
          }
          setBoxRouted(boxJson.routed === true);
          setBoxReason(typeof boxJson.reason === 'string' ? boxJson.reason : null);
        } catch (boxErr) {
          // Approve succeeded; surface the create-box failure without losing the approve.
          setError(boxErr instanceof Error ? boxErr.message : 'create-box failed');
          setBusy(null);
          setDone(decision);
          return;
        }
      }

      setDone(decision);
      // Let the success state flash, then reload to re-pull cohort + loop state.
      setTimeout(() => location.reload(), 1200);
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col gap-4 shadow-sm hover:border-slate-300 transition-colors">
      <div className="flex items-start gap-4">
        {/* Big FLORA score */}
        <div className="shrink-0 text-center w-16 rounded-xl border border-slate-100 bg-slate-50/70 py-2">
          <div className={'text-3xl font-bold leading-none tabular-nums ' + scoreTone(row.floraScore)}>
            {row.floraScore != null ? row.floraScore : '--'}
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mt-1">
            FLORA
          </div>
        </div>

        {/* Name + badges */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-900 truncate">
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
          <div className="text-[12px] text-slate-500 mt-1">
            {[row.businessType, [row.city, row.state].filter(Boolean).join(', ')]
              .filter((x) => x && x.trim())
              .join(' · ') || '--'}
          </div>
        </div>
      </div>

      {/* Reasoning (JJ free-text qualification notes) */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
          Por que &mdash; notas de JJ
        </div>
        <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-line break-words">
          {row.reasoning && row.reasoning.trim() ? row.reasoning : '--'}
        </p>
      </div>

      {/* Intel grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
        <Intel label="Proveedor actual" value={row.currentSupplier} />
        <Intel label="Precios que paga" value={row.pricesTheyPay} />
        <Intel label="Caja preferida" value={row.boxPreference} />
        <Intel label="Productos de interes" value={row.productsInterest} />
        <Intel label="Sub-score" value={row.subScore} />
        <Intel label="Telefono" value={row.phone} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-4">
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
          Aprobar = crear la caja (ruteada a Atlas).
        </span>
      </div>

      {done === 'yes' && boxRouted === true ? (
        <p className="text-[12px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Caja solicitada (ruteada a Atlas)
        </p>
      ) : null}
      {done === 'yes' && boxRouted === false ? (
        <p className="text-[12px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {boxReason === 'route_failed'
            ? 'Intent de caja capturado. Ruteo a Atlas fallo (reintentar).'
            : 'Intent de caja capturado. Ruteo a Atlas pendiente (PROD no configurado).'}
        </p>
      ) : null}

      {error ? (
        <p className="text-[11px] text-red-600 font-mono whitespace-normal">{error}</p>
      ) : null}
    </div>
  );
}

export default function FloraCohortPanel({ rows, prodBlocked }: Props) {
  if (!rows || rows.length === 0) {
    // Honest discrimination: empty because we CAN'T read PROD (service-role) vs
    // empty because JJ genuinely hasn't qualified anyone.
    if (prodBlocked) {
      return (
        <section className="mb-8">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Calificados por JJ (FLORA)
            </h2>
          </div>
          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
            <div className="text-amber-400 text-3xl mb-2" aria-hidden>
              &#9888;
            </div>
            <h3 className="text-base font-semibold text-amber-800">
              No puedo leer las cuentas calificadas (acceso a PROD)
            </h3>
            <p className="text-sm text-amber-700 mt-1 max-w-lg mx-auto leading-relaxed">
              Las cuentas FLORA EXISTEN en PROD, pero este entorno esta leyendo con
              la anon key y <code className="font-mono">zoho_accounts</code> requiere
              service-role (RLS). Falta <code className="font-mono">PROD_SUPABASE_SERVICE_KEY</code>{' '}
              real en el deploy. Escalado &mdash; no es que JJ no califico a nadie.
            </p>
          </div>
        </section>
      );
    }
    return (
      <section className="mb-8">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Calificados por JJ (FLORA)
          </h2>
        </div>
        <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
          <div className="text-slate-300 text-3xl mb-2" aria-hidden>
            &#9711;
          </div>
          <h3 className="text-base font-semibold text-slate-700">Sin cuentas calificadas</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Cuando JJ califique cuentas con un score FLORA real, aparecen aca para
            revisar y aprobar la caja de muestra.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-2 mb-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Calificados por JJ (FLORA) &mdash; para revisar
        </h2>
        <span className="text-[11px] font-semibold text-emerald-700 tabular-nums">
          {rows.length} cuenta{rows.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-[13px] text-slate-500 mb-3 max-w-2xl leading-relaxed">
        Cuentas que JJ califico con score FLORA real, ordenadas por score, listas para
        revisar. Aprobar = crear la caja (downstream); todavia no estan en dispatch.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map((row) => (
          <FloraCard key={row.zohoId ?? row.decideKey} row={row} />
        ))}
      </div>
    </section>
  );
}
