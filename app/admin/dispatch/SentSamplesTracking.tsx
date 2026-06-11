'use client';
// SentSamplesTracking — 3-level Dispatch "Enviadas" view.
// v1 | 2026-06-11 | Job_PM (CPO)
//
// LEVEL 1 — Period rollup card: avg time-to-ship, avg interactions,
//            close rate (won/lost/pending), learnings TLDR.
// LEVEL 2 — Per-client summary rows (one per sent sample), clickable.
// LEVEL 3 — Deep-dive (on click): timeline table + enrichment card.
//
// Props: { from, to } — YYYY-MM-DD. Refetches when either changes.
// Style: emerald-600/slate, ASCII-clean Spanish, rounded-2xl.

import { useState, useEffect, useCallback } from 'react';
import type {
  SentSamplesPayload,
  SentSample,
  PeriodRollup,
  TrackingEvent,
  SampleDeepDive,
} from '@/lib/admin/sample-tracking';
import type { CloseStatus } from '@/lib/admin/sample-tracking';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(n: number | null): string {
  if (n === null) return 'sin data';
  return `${Math.round(n * 100)}%`;
}

function num(n: number | null, unit = ''): string {
  if (n === null) return 'sin data';
  return `${n}${unit}`;
}

function fmtSeconds(s: number | null): string {
  if (s === null || s <= 0) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  return `${m}m ${sec}s`;
}

function closeLabel(s: CloseStatus): string {
  if (s === 'won') return 'Ganado';
  if (s === 'lost') return 'Perdido';
  return 'Pendiente';
}

function closeColor(s: CloseStatus): string {
  if (s === 'won') return 'bg-emerald-50 border-emerald-200 text-emerald-700';
  if (s === 'lost') return 'bg-red-50 border-red-200 text-red-600';
  return 'bg-amber-50 border-amber-200 text-amber-700';
}

function phaseLabel(p: TrackingEvent['phase']): string {
  if (p === 'pre') return 'Pre';
  if (p === 'durante') return 'Durante';
  if (p === 'post') return 'Post';
  return '?';
}

function phaseColor(p: TrackingEvent['phase']): string {
  if (p === 'pre') return 'bg-slate-100 text-slate-600';
  if (p === 'durante') return 'bg-blue-50 text-blue-700';
  if (p === 'post') return 'bg-emerald-50 text-emerald-700';
  return 'bg-slate-100 text-slate-400';
}

function eventTypeLabel(t: string | null): string {
  if (!t) return 'evento';
  const l = t.toLowerCase();
  if (l === 'call') return 'Llamada';
  if (l === 'email') return 'Email';
  if (l === 'requested') return 'Solicitud';
  if (l === 'sent' || l === 'dispatched') return 'Enviado';
  if (l === 'delivered') return 'Entregado';
  if (l === 'received') return 'Recibido';
  if (l === 'liked') return 'Le gusto';
  return t;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// -- Level 1: Rollup card --

function RollupCard({ rollup }: { rollup: PeriodRollup }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-emerald-700">
          Resumen del periodo
        </span>
        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
          {rollup.sampleCount} muestra{rollup.sampleCount === 1 ? '' : 's'}
        </span>
      </div>

      {/* 4 KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
        <KpiCell
          label="Tiempo promedio a envio"
          value={rollup.avgDaysToShip !== null ? `${rollup.avgDaysToShip}d` : 'sin data'}
        />
        <KpiCell
          label="Interacciones prom."
          value={rollup.avgInteractions !== null ? String(rollup.avgInteractions) : 'sin data'}
        />
        <KpiCell
          label="Close rate"
          value={rollup.closeRate !== null ? pct(rollup.closeRate) : 'sin cerrados'}
          sub={`${rollup.wonCount} ganados / ${rollup.lostCount} perdidos / ${rollup.pendingCount} pendientes`}
        />
        <KpiCell
          label="TLDR del cohorte"
          value={
            rollup.mostCommonObjection
              ? `Objecion mas comun: ${rollup.mostCommonObjection}`
              : 'Sin objeciones registradas'
          }
          sub={[
            rollup.pctQuoted !== null ? `${rollup.pctQuoted}% cotizaron` : null,
            rollup.likedCount > 0 ? `${rollup.likedCount} les gusto` : null,
            rollup.molestoCount > 0 ? `${rollup.molestoCount} mala experiencia` : null,
          ]
            .filter(Boolean)
            .join(' · ') || undefined}
        />
      </div>
    </div>
  );
}

function KpiCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-3">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="text-sm font-bold text-slate-800">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-slate-400 leading-tight">{sub}</div>}
    </div>
  );
}

// -- Level 3: Deep-dive --

function DeepDivePanel({ sample }: { sample: SentSample }) {
  const { deepDive } = sample;
  return (
    <div className="mt-3 space-y-4">
      {/* Enrichment card */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 space-y-1.5">
        <div className="font-bold text-slate-700 mb-2">Enriquecimiento</div>
        <EnrichRow
          label="Le gusto la caja"
          value={
            deepDive.likedBox === true
              ? 'Si'
              : deepDive.likedBox === false
              ? 'No'
              : 'sin data'
          }
        />
        <EnrichRow label="Razon won/lost" value={deepDive.reasonWonLost ?? 'sin data'} />
        <EnrichRow label="Razon de cierre" value={deepDive.closeReason ?? 'sin data'} />
        <EnrichRow label="Ultima objecion" value={deepDive.objection ?? 'sin data'} />
        <EnrichRow
          label="Hipotesis"
          value={deepDive.hypothesis ?? 'sin signal suficiente'}
        />
        {deepDive.prebooksCount !== null && (
          <EnrichRow label="Prebooks" value={String(deepDive.prebooksCount)} />
        )}
        {deepDive.totalRevenue !== null && (
          <EnrichRow
            label="Revenue total"
            value={`$${deepDive.totalRevenue.toLocaleString()}`}
          />
        )}
        {deepDive.lastOrderDate && (
          <EnrichRow label="Ultimo pedido" value={deepDive.lastOrderDate} />
        )}
        {deepDive.zohoNotes && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">
              Notas Zoho
            </div>
            <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
              {deepDive.zohoNotes.slice(0, 600)}
              {deepDive.zohoNotes.length > 600 ? '...' : ''}
            </div>
          </div>
        )}
      </div>

      {/* Timeline table */}
      {deepDive.timeline.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-4 text-center text-xs text-slate-400">
          Sin eventos registrados para esta muestra.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Fase</th>
                <th className="px-3 py-2 text-left">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {deepDive.timeline.map((ev, i) => (
                <TimelineRow key={i} event={ev} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EnrichRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-32 shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

function TimelineRow({ event }: { event: TrackingEvent }) {
  const details: string[] = [];
  if (event.direction) details.push(event.direction);
  if (event.subject) details.push(event.subject);
  if (event.outcome) details.push(`outcome: ${event.outcome}`);
  if (event.leadQuality) details.push(`heat: ${event.leadQuality}`);
  if (event.objection) details.push(`objecion: ${event.objection}`);
  if (event.keyQuote) details.push(`"${event.keyQuote}"`);
  if (event.durationSeconds) details.push(fmtSeconds(event.durationSeconds));

  return (
    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
      <td className="px-3 py-2 whitespace-nowrap text-slate-500">
        {event.eventAt
          ? new Date(event.eventAt).toLocaleDateString('es-AR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })
          : '—'}
      </td>
      <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-700">
        {eventTypeLabel(event.eventType)}
      </td>
      <td className="px-3 py-2">
        <span
          className={[
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            phaseColor(event.phase),
          ].join(' ')}
        >
          {phaseLabel(event.phase)}
        </span>
      </td>
      <td className="px-3 py-2 text-slate-500">
        {details.length > 0 ? details.join(' · ') : '—'}
      </td>
    </tr>
  );
}

// -- Level 2: Per-client summary row --

function SampleRow({ sample }: { sample: SentSample }) {
  const [expanded, setExpanded] = useState(false);

  const totalInteractions =
    sample.interactionsPre + sample.interactionsDurante + sample.interactionPost;

  return (
    <div
      className={[
        'rounded-2xl border bg-white transition-shadow',
        expanded ? 'border-emerald-200 shadow-sm' : 'border-slate-200 hover:border-slate-300',
      ].join(' ')}
    >
      {/* Summary row — clickable */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* Left: name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">
              {sample.businessName}
            </span>
            {sample.sinMatch && (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                sin match
              </span>
            )}
            <span
              className={[
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                closeColor(sample.closeStatus),
              ].join(' ')}
            >
              {closeLabel(sample.closeStatus)}
            </span>
            {sample.heat && (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                heat: {sample.heat}
              </span>
            )}
          </div>
          {/* Right: expand indicator */}
          <span className="text-xs text-slate-400">{expanded ? 'cerrar ▲' : 'ver mas ▼'}</span>
        </div>

        {/* Second row: dates + interactions */}
        <div className="mt-2 flex items-center gap-4 flex-wrap text-xs text-slate-500">
          {sample.dispatchedFmt && (
            <span>
              Enviado:{' '}
              <span className="font-medium text-slate-700">{sample.dispatchedFmt}</span>
              {sample.daysToShip !== null && (
                <span className="ml-1 text-slate-400">(tardamos {sample.daysToShip}d)</span>
              )}
            </span>
          )}
          {sample.arrivalFmt && (
            <span>
              Llego:{' '}
              <span className="font-medium text-slate-700">{sample.arrivalFmt}</span>
              {sample.arrivalIsEstimated && (
                <span className="ml-1 text-slate-400">(estimado)</span>
              )}
            </span>
          )}
          {sample.lastCallAt && (
            <span>
              Ultima llamada:{' '}
              <span className="font-medium text-slate-700">
                {new Date(sample.lastCallAt).toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </span>
            </span>
          )}
          {totalInteractions > 0 && (
            <span>
              Interacciones:{' '}
              <span className="font-medium text-slate-700">
                {sample.interactionsPre}pre · {sample.interactionsDurante}dur · {sample.interactionPost}post
              </span>
            </span>
          )}
        </div>
      </button>

      {/* Level 3: Deep-dive (expanded) */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4">
          <DeepDivePanel sample={sample} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  from: string;
  to: string;
}

interface FetchState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  payload: SentSamplesPayload | null;
  error: string | null;
}

export default function SentSamplesTracking({ from, to }: Props) {
  const [state, setState] = useState<FetchState>({
    status: 'idle',
    payload: null,
    error: null,
  });

  const fetchData = useCallback((f: string, t: string) => {
    if (!f || !t) return;
    setState((s) => ({ ...s, status: 'loading' }));
    fetch(`/api/admin/dispatch/sent-tracking?from=${f}&to=${t}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json()) as SentSamplesPayload & { error?: string | null };
        if (!res.ok || json.error) {
          setState({
            status: 'error',
            payload: null,
            error: json.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        setState({ status: 'ok', payload: json, error: null });
      })
      .catch((err: unknown) => {
        setState({
          status: 'error',
          payload: null,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }, []);

  useEffect(() => {
    if (from && to) fetchData(from, to);
  }, [from, to, fetchData]);

  // -- Loading --
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="py-8 text-center text-sm text-slate-400 animate-pulse">
        Cargando seguimiento de muestras enviadas...
      </div>
    );
  }

  // -- Error --
  if (state.status === 'error') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
        Error al cargar seguimiento: {state.error ?? 'desconocido'}
      </div>
    );
  }

  const { payload } = state;
  if (!payload || payload.samples.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
        Sin muestras enviadas en este periodo.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Level 1 — Period rollup */}
      <RollupCard rollup={payload.rollup} />

      {/* Level 2 — Per-client rows */}
      <div className="space-y-2">
        {payload.samples.map((sample, i) => (
          <SampleRow key={sample.leadMasterId ?? `s-${i}`} sample={sample} />
        ))}
      </div>
    </div>
  );
}
