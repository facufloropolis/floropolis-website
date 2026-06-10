// FLORA-qualified cohort — full-width vertical list, one card per row.
// v3 | 2026-06-10 | Job_PM (CPO)
//
// Redesign per Facu (2026-06-10):
//   - ONE card per row, full-width vertical list (no 2-up grid).
//   - TLDR always visible in ~3s: FLORA score + account name + Job-rec chip + JJ badge +
//     location; "Por que" line; "Mandar: ... / Hipotesis: ..."; Aprobar/Rechazar.
//   - Toggle "Ver detalle del cliente" → fetches /api/admin/deals/intel?leadMasterId=
//     on first expand; renders shared ClientIntelPanel. Cached in state (no refetch).
//   - If row.leadMasterId is null → honest note (no intel available).
//   - Existing decide/create-box logic fully preserved.
//
// Imports:
//   - @/app/admin/_components/shared/ClientIntelPanel — the shared rich intel card.
//   - @/lib/admin/sampleDerive — deriveJobRecommendation, deriveWhyGood, deriveBoxProposal,
//     deriveHypothesis, parseConfirmedAddress.

'use client';

import { useState } from 'react';
import type { FloraCohortRow } from '@/lib/admin/sample-review';
import type { ClientIntel } from '@/lib/deal/types';
import ClientIntelPanel from '@/app/admin/_components/shared/ClientIntelPanel';
import {
  parseConfirmedAddress,
  deriveWhyGood,
  deriveBoxProposal,
  deriveHypothesis,
  deriveJobRecommendation,
} from '@/lib/admin/sampleDerive';

interface Props {
  rows: FloraCohortRow[];
  // True when the cohort is empty BECAUSE the PROD read client can't see
  // zoho_accounts (RLS / service-role), NOT because JJ qualified nobody.
  prodBlocked?: boolean;
  // Per-account enrichment keyed by zohoId. Passed down when Rose supplies it.
  enrichmentMap?: Record<string, { status?: string | null; heat?: string | null; lastInteraction?: string | null; requestedAt?: string | null }>;
}

type Action = 'yes' | 'no';

function scoreTone(score: number | null): string {
  if (score == null) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 70) return 'text-emerald-700';
  return 'text-amber-600';
}

// JOB RECOMMENDATION CHIP
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
}: {
  row: FloraCohortRow;
}) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Action | null>(null);
  const [boxRouted, setBoxRouted] = useState<boolean | null>(null);
  const [boxReason, setBoxReason] = useState<string | null>(null);

  // Client intel expand/fetch state
  const [intelOpen, setIntelOpen] = useState(false);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intel, setIntel] = useState<ClientIntel | null | 'error'>(null);
  const [intelFetched, setIntelFetched] = useState(false);
  const [intelFetchError, setIntelFetchError] = useState<string | null>(null);

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

      if (decision === 'yes') {
        try {
          const boxRes = await fetch('/api/admin/samples/create-box', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              accountName: row.accountName,
              floraScore: row.floraScore,
              zohoId: row.zohoId,
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
          setError(boxErr instanceof Error ? boxErr.message : 'create-box failed');
          setBusy(null);
          setDone(decision);
          return;
        }
      }

      setDone(decision);
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'decision failed');
      setBusy(null);
    }
  }

  async function handleIntelToggle() {
    const opening = !intelOpen;
    setIntelOpen(opening);
    // Only fetch on first open, only when leadMasterId is known
    if (opening && !intelFetched && row.leadMasterId != null) {
      setIntelLoading(true);
      setIntelFetchError(null);
      try {
        const res = await fetch(`/api/admin/deals/intel?leadMasterId=${row.leadMasterId}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as ClientIntel | null;
        setIntel(data);
      } catch (e) {
        setIntel('error');
        setIntelFetchError(e instanceof Error ? e.message : 'fetch error');
      } finally {
        setIntelLoading(false);
        setIntelFetched(true);
      }
    }
  }

  // Derived signals
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
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-slate-300 transition-colors">

      {/* ── TLDR SECTION (always visible) ── */}
      <div className="p-5 flex flex-col gap-3">

        {/* Header: FLORA score + account name + badges */}
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

          {/* Name + badges + location */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900">{row.accountName}</h3>
              <JobChip verdict={jobRec.verdict} reason={jobRec.reason} />
              {row.byJJ && (
                <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-0.5">
                  Calificado por JJ
                </span>
              )}
              {decisionChip && (
                <span className={'text-[10px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 ' + decisionChip.cls}>
                  {decisionChip.label}
                </span>
              )}
            </div>
            <div className="text-[12px] text-slate-500 mt-1">
              {[row.businessType, [row.city, row.state].filter(Boolean).join(', ')]
                .filter((x) => x && x.trim())
                .join(' · ') || '--'}
            </div>
          </div>
        </div>

        {/* Por que (single always-visible line) */}
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Por que:{' '}
          </span>
          <span className="text-[13px] text-slate-700">{whyGood}</span>
          {(row.pricesTheyPay || row.currentSupplier) && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              {[
                row.currentSupplier ? `Proveedor: ${row.currentSupplier}` : null,
                row.pricesTheyPay ? `Precio: ${row.pricesTheyPay}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>

        {/* Mandar + Hipotesis (compact) */}
        <div className="text-[13px] text-slate-700 leading-relaxed">
          <span className="font-medium text-slate-600">Mandar: </span>
          {boxProposal}
          {' '}
          <span className="text-slate-400">&middot;</span>
          {' '}
          <span className="font-medium text-slate-600">Hipotesis: </span>
          <span className="text-[12px] text-slate-500 italic">{hypothesis}</span>
        </div>

        {/* Direccion */}
        {address ? (
          <div className="text-[12px] text-slate-500">
            <span className="font-semibold text-slate-400 uppercase tracking-wide text-[10px]">Donde: </span>
            {address.line}
            <span className="text-slate-300 ml-1 text-[10px] not-italic">(confirmada por JJ)</span>
          </div>
        ) : (
          <div className="text-[12px] text-slate-400 italic">
            Sin direccion &mdash; pendiente confirmar con JJ.
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3 mt-1">
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
            Aprobar = crea la caja para el dispatch de manana + el label.
          </span>
        </div>

        {done === 'yes' && boxRouted === true && (
          <p className="text-[12px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            Caja solicitada (ruteada a Atlas)
          </p>
        )}
        {done === 'yes' && boxRouted === false && (
          <p className="text-[12px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {boxReason === 'route_failed'
              ? 'Intent de caja capturado. Ruteo a Atlas fallo (reintentar).'
              : 'Intent de caja capturado. Ruteo a Atlas pendiente (PROD no configurado).'}
          </p>
        )}
        {error && (
          <p className="text-[11px] text-red-600 font-mono whitespace-normal">{error}</p>
        )}
      </div>

      {/* ── CLIENT INTEL EXPAND TOGGLE ── */}
      <div className="border-t border-slate-100">
        <button
          type="button"
          onClick={handleIntelToggle}
          className="w-full flex items-center justify-between px-5 py-2.5 text-[12px] font-medium text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <span>
            {intelOpen ? '▾' : '▸'}{' '}
            Ver detalle del cliente (conversaciones, engagement)
          </span>
          {row.leadMasterId == null && (
            <span className="text-[10px] text-slate-300 italic">sin lead_master_id</span>
          )}
        </button>

        {intelOpen && (
          <div className="px-5 pb-5 pt-2">
            {row.leadMasterId == null ? (
              <p className="text-[12px] text-slate-400 italic leading-relaxed">
                No pude resolver el cliente en v_sample_review (sin lead_master_id) &mdash;
                engagement/conversaciones pendientes.
              </p>
            ) : intel === 'error' ? (
              <p className="text-[12px] text-red-500 font-mono">
                Error al cargar intel: {intelFetchError ?? 'fetch error'}
              </p>
            ) : (
              <ClientIntelPanel
                intel={intel as ClientIntel | null}
                loading={intelLoading}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FloraCohortPanel({ rows, prodBlocked, enrichmentMap: _enrichmentMap }: Props) {
  if (!rows || rows.length === 0) {
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
      <p className="text-[13px] text-slate-500 mb-4 max-w-2xl leading-relaxed">
        Cuentas calificadas por JJ con score FLORA real, ordenadas por score. Cada tarjeta
        muestra por que es buena apuesta, que mandarle y la hipotesis a probar. Aprobar =
        crear la caja para el dispatch de manana.
      </p>
      <div className="space-y-4">
        {rows.map((row) => (
          <FloraCard
            key={row.zohoId ?? row.decideKey}
            row={row}
          />
        ))}
      </div>
    </section>
  );
}
