// Quick view: one card per sample. Click -> onSelect(leadMasterId) opens the deep-dive.
// v1 | 2026-06-09 | Job_PM (CPO)
//
// businessName + jjScore/jjReasoning + engagement chips + quality verdict +
// winHypothesis (1 line) + label-readiness chips + status. Sort: in_review first.
//
// Style copied from app/admin/cohort-review (rounded cards, pill badges, slate/emerald).

'use client';

import type { SampleReviewRow } from './types';
import {
  fmtTalk,
  truncate,
  qualityBadge,
  statusBadge,
  dispatchBadge,
  readyChip,
  sortForReview,
} from './format';

interface Props {
  rows: SampleReviewRow[];
  onSelect: (leadMasterId: number | null) => void;
}

function Chip({ cls, title, children }: { cls: string; title?: string; children: React.ReactNode }) {
  return (
    <span
      title={title}
      className={
        'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ' +
        cls
      }
    >
      {children}
    </span>
  );
}

function SampleCard({
  row,
  onSelect,
}: {
  row: SampleReviewRow;
  onSelect: (leadMasterId: number | null) => void;
}) {
  const q = qualityBadge(row.qualityRead.verdict);
  const s = statusBadge(row.status);
  const d = dispatchBadge(row.dispatchState);
  const score = row.jjScore ?? '--';

  return (
    <button
      type="button"
      onClick={() => onSelect(row.leadMasterId)}
      className="block w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition-all space-y-3"
    >
      {/* Top row: name + score + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-900 truncate">
              {row.businessName}
            </h3>
            <Chip cls={q.cls}>{q.label}</Chip>
          </div>
          <p className="text-[12px] text-slate-500 mt-1 truncate">
            {row.jjReasoning ? truncate(row.jjReasoning, 90) : 'sin reasoning de JJ'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold rounded-md border tabular-nums text-xs px-2.5 py-1 bg-slate-50 text-slate-700 border-slate-200">
            JJ {score}
          </span>
          <Chip cls={s.cls}>{s.label}</Chip>
        </div>
      </div>

      {/* Dispatch state */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip
          cls={d.cls}
          title={
            row.dispatchState !== 'pending' && row.trackingNumber
              ? `tracking ${row.trackingNumber}`
              : undefined
          }
        >
          {d.label}
          {row.dispatchState !== 'pending' && row.trackingNumber
            ? ` · ${row.trackingNumber}`
            : ''}
        </Chip>
      </div>

      {/* Win hypothesis, 1 line -- the meat, given a left accent */}
      <div className="rounded-lg border-l-2 border-l-emerald-400 bg-emerald-50/40 pl-2.5 pr-2 py-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-600">
          Win
        </span>
        <p className="text-[13px] text-slate-700 truncate leading-snug">
          {truncate(row.winHypothesis, 110)}
        </p>
      </div>

      {/* Engagement chips */}
      <div className="flex flex-wrap gap-1.5">
        <Chip cls="bg-slate-50 text-slate-600 border-slate-200">
          <span aria-hidden>📞</span> {row.callsCount} &middot; {fmtTalk(row.talkSeconds)}
        </Chip>
        <Chip cls="bg-slate-50 text-slate-600 border-slate-200">
          <span aria-hidden>✉️</span> {row.emailsCount}
        </Chip>
        <Chip cls="bg-slate-50 text-slate-600 border-slate-200">
          <span aria-hidden>💬</span> {row.messagesCount}
        </Chip>
      </div>

      {/* Label-readiness chips */}
      <div className="flex flex-wrap gap-1.5">
        <Chip cls={readyChip(row.addressComplete)}>
          direccion {row.addressComplete ? 'OK' : 'falta'}
        </Chip>
        <Chip
          cls={readyChip(row.preShipOk)}
          title={!row.preShipOk ? row.preShipBlockReason ?? 'bloqueado' : undefined}
        >
          pre-ship {row.preShipOk ? 'OK' : 'bloqueado'}
        </Chip>
        <Chip cls={readyChip(!!row.productsSent)}>
          box {row.productsSent ? 'OK' : 'falta'}
        </Chip>
      </div>
    </button>
  );
}

export default function SampleReviewList({ rows, onSelect }: Props) {
  const sorted = sortForReview(rows);
  const pending = sorted.filter((r) => r.dispatchState === 'pending');
  const shipped = sorted.filter((r) => r.dispatchState !== 'pending');

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
        <div className="text-slate-300 text-3xl mb-2" aria-hidden>
          &#9711;
        </div>
        <h2 className="text-base font-semibold text-slate-700">No hay samples para revisar</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
          A medida que JJ proponga samples para despachar, sus tarjetas aparecen aca
          con el analisis, el engagement y la lectura de calidad &mdash; a una
          decision de distancia.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-slate-500">
        <span className="font-semibold text-slate-700 tabular-nums">{sorted.length}</span>{' '}
        {sorted.length === 1 ? 'sample' : 'samples'} &middot;{' '}
        <span className="tabular-nums">{pending.length}</span> pendientes de dispatch &middot;{' '}
        <span className="tabular-nums">{shipped.length}</span> ya enviados
      </p>

      {pending.length > 0 ? (
        <section className="space-y-3">
          <h2 className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Pendientes de dispatch
            <span className="text-amber-600 tabular-nums">{pending.length}</span>
          </h2>
          {pending.map((row) => (
            <SampleCard
              key={row.loopId ?? `${row.leadMasterId}-${row.businessName}`}
              row={row}
              onSelect={onSelect}
            />
          ))}
        </section>
      ) : null}

      {shipped.length > 0 ? (
        <section className="space-y-3">
          <h2 className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Ya enviados (follow-up)
            <span className="text-slate-500 tabular-nums">{shipped.length}</span>
          </h2>
          {shipped.map((row) => (
            <SampleCard
              key={row.loopId ?? `${row.leadMasterId}-${row.businessName}`}
              row={row}
              onSelect={onSelect}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
