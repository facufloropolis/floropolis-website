// Client-side rows list for /admin/catalog/approval-queue.
// v1 | 2026-05-19 | Job_PM Phase C [V8 SHADOW]
//
// The page server-component computes everything (proposals, cascade summaries,
// audit rows, proposer emails, filter chip universes) and hands it here.
// This component owns:
//   - filter chip state (proposal type, source agent)
//   - which row is "drilled down" (opens AuditDrillDown side panel)
//   - row click -> opens drill-down (approved/rejected tabs only)
//
// Rendering: filtered subset of the rows array, with the same card layout the
// page used to render server-side (now ported here). ProposalActions remains
// the inline approve/reject island.

'use client';

import { useMemo, useState } from 'react';

import ProposalActions from './Actions';
import AuditDrillDown, { type AuditRow } from './AuditDrillDown';

interface WarningPill {
  severity: 'critical' | 'warn' | 'info';
  text: string;
}

export interface ProposalRowVm {
  id: string;
  type: string;
  target_table: string;
  target_id: string | null;
  payload_summary: string;
  warnings: WarningPill[];
  status: string;
  proposer_email: string;
  proposed_at: string;
  notes: string | null;
  source_agent: string | null;
  source_rationale: string | null;
  cascade: { value: number | null; label: string };
  has_stale_verification: boolean;
  has_failed_verification: boolean;
}

interface Props {
  rows: ProposalRowVm[];
  // audit rows keyed by proposal_id
  auditByProposal: Record<string, AuditRow[]>;
  status: 'awaiting_facu' | 'approved' | 'rejected';
  // filter chip universes (sorted, distinct)
  typeUniverse: string[];
  agentUniverse: string[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RowsList({
  rows,
  auditByProposal,
  status,
  typeUniverse,
  agentUniverse,
}: Props) {
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [drillId, setDrillId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter && r.type !== typeFilter) return false;
      if (agentFilter && (r.source_agent ?? 'unknown') !== agentFilter)
        return false;
      return true;
    });
  }, [rows, typeFilter, agentFilter]);

  const drillRow = drillId ? rows.find((r) => r.id === drillId) ?? null : null;
  const drillAudits = drillId ? (auditByProposal[drillId] ?? []) : [];

  return (
    <>
      {/* Filter chips */}
      {(typeUniverse.length > 0 || agentUniverse.length > 0) && (
        <div className="mb-5 space-y-2">
          {typeUniverse.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mr-1">
                Type:
              </span>
              <Chip
                label="all"
                active={typeFilter == null}
                onClick={() => setTypeFilter(null)}
              />
              {typeUniverse.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={typeFilter === t}
                  onClick={() => setTypeFilter(t)}
                />
              ))}
            </div>
          )}
          {agentUniverse.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mr-1">
                Proposer:
              </span>
              <Chip
                label="all"
                active={agentFilter == null}
                onClick={() => setAgentFilter(null)}
              />
              {agentUniverse.map((a) => (
                <Chip
                  key={a}
                  label={a}
                  active={agentFilter === a}
                  onClick={() => setAgentFilter(a)}
                />
              ))}
            </div>
          )}
          {(typeFilter || agentFilter) && (
            <div className="text-[11px] text-slate-500">
              Showing {filtered.length} of {rows.length} row
              {rows.length === 1 ? '' : 's'} after filter.{' '}
              <button
                type="button"
                onClick={() => {
                  setTypeFilter(null);
                  setAgentFilter(null);
                }}
                className="underline hover:text-slate-700"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Body */}
      {filtered.length === 0 ? (
        <EmptyState status={status} filtered={rows.length > 0} />
      ) : (
        <div className="space-y-4">
          {filtered.map((p) => {
            const hasCritical = p.warnings.some(
              (w) => w.severity === 'critical',
            );
            const hasWarn = p.warnings.some((w) => w.severity === 'warn');
            const cardBorder = hasCritical
              ? 'border-red-300'
              : hasWarn
                ? 'border-amber-300'
                : 'border-slate-200';
            const clickable = status !== 'awaiting_facu';

            return (
              <div
                key={p.id}
                className={`bg-white rounded-xl border ${cardBorder} p-5 hover:border-slate-300 transition-colors ${
                  clickable ? 'cursor-pointer' : ''
                }`}
                onClick={
                  clickable
                    ? (e) => {
                        // Don't open drill if click was on a button or link inside.
                        const target = e.target as HTMLElement;
                        if (target.closest('button, a, textarea, input')) {
                          return;
                        }
                        setDrillId(p.id);
                      }
                    : undefined
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400">
                        {p.id.slice(0, 8)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold uppercase tracking-wide">
                        {p.type}
                      </span>
                      {p.source_agent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 font-semibold uppercase tracking-wide">
                          {p.source_agent}
                        </span>
                      )}
                      <span className="font-semibold text-slate-900 text-sm break-all">
                        {p.target_table}
                        {p.target_id ? ` / ${p.target_id}` : ''}
                      </span>
                      {hasCritical && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-semibold">
                          CRITICAL
                        </span>
                      )}
                      {hasWarn && !hasCritical && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                          WARN
                        </span>
                      )}
                      {p.has_stale_verification && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-semibold">
                          verification STALE
                        </span>
                      )}
                      {p.has_failed_verification && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-semibold">
                          verification FAILED
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Proposed by {p.proposer_email} on {fmtDate(p.proposed_at)}
                    </p>
                    {p.source_rationale && (
                      <p className="text-[11px] text-slate-600 mt-1.5 italic">
                        &ldquo;{p.source_rationale.slice(0, 200)}
                        {p.source_rationale.length > 200 ? '...' : ''}&rdquo;
                      </p>
                    )}
                  </div>
                  {status === 'awaiting_facu' ? (
                    <ProposalActions
                      id={p.id}
                      cascadeLabel={p.cascade.label}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDrillId(p.id);
                      }}
                      className="text-xs font-semibold text-slate-700 border border-slate-200 hover:border-slate-400 hover:bg-slate-50 px-3 py-1.5 rounded-md shrink-0"
                    >
                      View audit
                    </button>
                  )}
                </div>

                {/* Payload summary */}
                <div className="mb-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                    Payload
                  </div>
                  <div className="text-xs text-slate-700 font-mono break-words">
                    {p.payload_summary}
                  </div>
                </div>

                {/* Cascade impact */}
                <div className="border-t border-slate-100 pt-3 mb-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-700">
                      Cascade impact:{' '}
                      <span
                        className={
                          p.cascade.value == null
                            ? 'font-mono text-slate-500'
                            : 'font-mono text-slate-900'
                        }
                      >
                        {p.cascade.label}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Warnings */}
                {p.warnings.length > 0 && (
                  <div className="border-t border-slate-100 pt-3 space-y-1.5">
                    {p.warnings.map((w, i) => {
                      const pill =
                        w.severity === 'critical'
                          ? 'bg-red-100 text-red-800 border-red-200'
                          : w.severity === 'warn'
                            ? 'bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200';
                      return (
                        <div
                          key={i}
                          className={`text-xs flex items-start gap-2 px-2.5 py-1.5 rounded border ${pill}`}
                        >
                          <span className="font-bold shrink-0">
                            {w.severity === 'critical'
                              ? '!!'
                              : w.severity === 'warn'
                                ? '!'
                                : '.'}
                          </span>
                          <span>{w.text}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Notes (if any) */}
                {p.notes && (
                  <div className="border-t border-slate-100 pt-3 mt-3 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">
                      Notes:
                    </span>{' '}
                    {p.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AuditDrillDown
        open={drillRow !== null}
        proposalId={drillRow?.id ?? null}
        proposalShort={drillRow ? drillRow.id.slice(0, 8) : ''}
        proposalType={drillRow?.type ?? ''}
        rows={drillAudits}
        onClose={() => setDrillId(null)}
      />
    </>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'text-[11px] px-2.5 py-1 rounded-full font-semibold border border-emerald-600 bg-emerald-600 text-white'
          : 'text-[11px] px-2.5 py-1 rounded-full font-medium border border-slate-300 bg-white text-slate-700 hover:border-slate-500'
      }
    >
      {label}
    </button>
  );
}

function EmptyState({
  status,
  filtered,
}: {
  status: 'awaiting_facu' | 'approved' | 'rejected';
  filtered: boolean;
}) {
  if (filtered) {
    return (
      <div className="text-center py-20 text-slate-500 border border-dashed border-slate-200 rounded-xl">
        <p className="font-semibold text-slate-700">No matches.</p>
        <p className="text-sm mt-1">Try clearing filters.</p>
      </div>
    );
  }
  if (status === 'awaiting_facu') {
    return (
      <div className="text-center py-20 text-slate-500 border border-dashed border-slate-200 rounded-xl">
        <p className="font-semibold text-slate-700">
          No proposals awaiting your sign-off.
        </p>
        <p className="text-sm mt-1">The catalog is in steady state.</p>
      </div>
    );
  }
  if (status === 'approved') {
    return (
      <div className="text-center py-20 text-slate-500 border border-dashed border-slate-200 rounded-xl">
        <p className="font-semibold text-slate-700">
          No approved proposals yet.
        </p>
        <p className="text-sm mt-1">
          Once you approve one it will show up here.
        </p>
      </div>
    );
  }
  return (
    <div className="text-center py-20 text-slate-500 border border-dashed border-slate-200 rounded-xl">
      <p className="font-semibold text-slate-700">No rejected proposals.</p>
      <p className="text-sm mt-1">
        Anything you reject will land here with the reason you gave.
      </p>
    </div>
  );
}
