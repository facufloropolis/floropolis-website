// FLORA-qualified cohort — decision-first card redesign.
// v2 | 2026-06-10 | Job_PM (CPO)
//
// Facu's objective: decide who to send a sample box to, understanding WHY each is a good
// bet (score logic + box contents + win hypothesis), with client evidence, then approve.
//
// What changed from v1:
//   - Removed the 6-cell Intel grid (noisy uppercase labels).
//   - Added Job recommendation chip (send/hold/skip) next to JJ badge.
//   - Added STATUS STRIP (status/heat/last interaction/requested) as honest pendiente
//     placeholders, ready for Rose enrichment via optional `enrichment` prop.
//   - "Por que es buena apuesta" — deriveWhyGood (real signal, one line).
//   - "Que mandarle + Hipotesis a probar" — deriveBoxProposal + deriveHypothesis.
//   - "Donde" — parseConfirmedAddress + honest JJ-entered note (NOT system-verified).
//   - Expandable "Ver actividad del cliente" section (collapsed, honest placeholder).
//   - Approve helper text updated: "crear la caja para el dispatch de manana (genera el label)."
//   - Precio que paga + proveedor actual folded into the "por que" line (not a grid).
//
// Decide contract: unchanged — POSTs to /api/admin/samples/decide.

'use client';

import { useState } from 'react';
import type { FloraCohortRow } from '@/lib/admin/sample-review';
import {
  parseConfirmedAddress,
  deriveWhyGood,
  deriveBoxProposal,
  deriveHypothesis,
  deriveJobRecommendation,
} from '@/lib/admin/sampleDerive';

// Optional enrichment prop — ready for Rose data when wiring is complete.
// Each field defaults to "pendiente" when undefined.
interface FloraEnrichment {
  status?: string | null;
  heat?: string | null;
  lastInteraction?: string | null;
  requestedAt?: string | null;
}

interface Props {
  rows: FloraCohortRow[];
  // True when the cohort is empty BECAUSE the PROD read client can't see
  // zoho_accounts (RLS / service-role), NOT because JJ qualified nobody.
  prodBlocked?: boolean;
  // Per-account enrichment keyed by zohoId. Passed down when Rose supplies it.
  enrichmentMap?: Record<string, FloraEnrichment>;
}

type Action = 'yes' | 'no';

function scoreTone(score: number | null): string {
  if (score == null) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 70) return 'text-emerald-700';
  return 'text-amber-600';
}

// STATUS STRIP — a single row of small pills. Values are "pendiente" when enrichment
// is not yet wired (Rose enrichment is a future step). Renders a visible placeholder
// so the structure is in place without pretending we have the data.
function StatusStrip({ enrichment }: { enrichment?: FloraEnrichment }) {
  const pending = (
    <span className="text-slate-400 italic">
      pendiente <span className="text-slate-300 not-italic text-[10px]">(Rose)</span>
    </span>
  );

  const items: { label: string; value: React.ReactNode }[] = [
    { label: 'Estado', value: enrichment?.status ? enrichment.status : pending },
    { label: 'Calor', value: enrichment?.heat ? enrichment.heat : pending },
    { label: 'Ult. contacto', value: enrichment?.lastInteraction ? enrichment.lastInteraction : pending },
    { label: 'Pidio caja', value: enrichment?.requestedAt ? enrichment.requestedAt : pending },
  ];

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      {items.map(({ label, value }) => (
        <span key={label} className="text-[11px] text-slate-500 inline-flex items-center gap-1">
          <span className="font-semibold text-slate-400">{label}:</span>
          <span>{value}</span>
        </span>
      ))}
    </div>
  );
}

// JOB RECOMMENDATION CHIP — Job's own verdict, separate from JJ's score.
function JobChip({ verdict, reason }: { verdict: 'send' | 'hold' | 'skip'; reason: string }) {
  const styles = {
    send: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    hold: 'bg-amber-50 text-amber-700 border-amber-200',
    skip: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  const labels = {
    send: 'Job: mandar',
    hold: 'Job: esperar',
    skip: 'Job: no',
  };
  return (
    <span
      title={reason}
      className={
        'text-[10px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 cursor-help ' +
        styles[verdict]
      }
    >
      {labels[verdict]}
    </span>
  );
}

function FloraCard({
  row,
  enrichment,
}: {
  row: FloraCohortRow;
  enrichment?: FloraEnrichment;
}) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Action | null>(null);
  // After Aprobar, the create-box step routes the PROD write to Atlas. We surface that
  // honestly: Job captures the intent + routes; it does NOT write PROD sample_box_status.
  // boxReason carries the discriminated outcome so we never presume "PROD no configurado"
  // when the real cause was a route failure (RLS/permission/transient).
  const [boxRouted, setBoxRouted] = useState<boolean | null>(null);
  const [boxReason, setBoxReason] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);

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

  // Derived signals — all null-safe, real data only
  const jobRec = deriveJobRecommendation(row);
  const whyGood = deriveWhyGood(row);
  const boxProposal = deriveBoxProposal(row);
  const hypothesis = deriveHypothesis(row);
  const address = parseConfirmedAddress(row.reasoning);

  const decisionChip = row.decision
    ? row.decision.toUpperCase().includes('NURTUR')
      ? { label: row.decision, cls: 'bg-amber-50 text-amber-700 border-amber-200' }
      : { label: row.decision, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col gap-4 shadow-sm hover:border-slate-300 transition-colors">

      {/* ── HEADER: score + name + chips ── */}
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
            {/* Job recommendation chip — independent of JJ */}
            <JobChip verdict={jobRec.verdict} reason={jobRec.reason} />
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
          {/* Business type + location */}
          <div className="text-[12px] text-slate-500 mt-1">
            {[row.businessType, [row.city, row.state].filter(Boolean).join(', ')]
              .filter((x) => x && x.trim())
              .join(' · ') || '--'}
          </div>
        </div>
      </div>

      {/* ── STATUS STRIP (placeholders until Rose enrichment wired) ── */}
      <StatusStrip enrichment={enrichment} />

      {/* ── WHY IT'S A GOOD BET ── */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
          Por que es buena apuesta
        </div>
        <p className="text-[13px] text-slate-700 leading-relaxed">
          {whyGood}
        </p>
        {/* Fold precio + proveedor as a compact muted line — not a separate grid */}
        {(row.pricesTheyPay || row.currentSupplier) && (
          <p className="text-[11px] text-slate-400 mt-1">
            {[
              row.currentSupplier ? `Proveedor: ${row.currentSupplier}` : null,
              row.pricesTheyPay ? `Precio: ${row.pricesTheyPay}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>

      {/* ── QUE MANDARLE + HIPOTESIS ── */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
          Que mandarle
        </div>
        <p className="text-[13px] text-slate-700 leading-relaxed">{boxProposal}</p>
        <p className="text-[12px] text-slate-500 mt-1.5 italic leading-relaxed">
          <span className="font-semibold not-italic text-slate-400">Hipotesis a probar: </span>
          {hypothesis}
        </p>
      </div>

      {/* ── DONDE (confirmed address) ── */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
          Donde
        </div>
        {address ? (
          <div>
            <p className="text-[13px] text-slate-700">{address.line}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Direccion confirmada por JJ en la calificacion (no verificacion de sistema).
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-slate-400 italic">
            Sin direccion &mdash; pendiente confirmar con JJ.
          </p>
        )}
      </div>

      {/* ── ACTIVIDAD DEL CLIENTE (expandable, honest placeholder) ── */}
      <div className="rounded-lg border border-slate-100 overflow-hidden">
        <button
          type="button"
          onClick={() => setActivityOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-[12px] font-medium text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <span>Ver actividad del cliente</span>
          <span className="text-slate-300 text-[10px]">{activityOpen ? '▲' : '▼'}</span>
        </button>
        {activityOpen && (
          <div className="px-3 py-3 border-t border-slate-100 bg-slate-50/60">
            <p className="text-[12px] text-slate-400 italic leading-relaxed">
              Actividad / llamadas / mensajes &mdash; pendiente (enriquecimiento de Rose).
            </p>
          </div>
        )}
      </div>

      {/* ── ACTIONS ── */}
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
          Aprobar = crear la caja para el dispatch de manana (genera el label).
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

export default function FloraCohortPanel({ rows, prodBlocked, enrichmentMap }: Props) {
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
        Cuentas calificadas por JJ con score FLORA real, ordenadas por score. Cada tarjeta
        muestra por que es buena apuesta, que mandarle y la hipotesis a probar. Aprobar =
        crear la caja para el dispatch de manana.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map((row) => (
          <FloraCard
            key={row.zohoId ?? row.decideKey}
            row={row}
            enrichment={enrichmentMap?.[row.zohoId ?? '']}
          />
        ))}
      </div>
    </section>
  );
}
