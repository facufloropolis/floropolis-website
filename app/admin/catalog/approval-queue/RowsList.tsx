// Client-side rows list for /admin/catalog/approval-queue.
// v2 | 2026-05-26 | Job_PM [V8 SHADOW]
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
import { classifyProposalBucket, BUCKET_LABELS, type ProposalBucket } from '@/lib/admin/proposal-classifier';

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
  payload_raw: Record<string, unknown> | null;
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
      ) : status === 'awaiting_facu' ? (
        // Bucket view: group by actionable_now / needs_confirmation / strategic_backlog
        <BucketedList
          rows={filtered}
          setDrillId={setDrillId}
        />
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
            return (
              <div
                key={p.id}
                className={`bg-white rounded-xl border ${cardBorder} p-5 hover:border-slate-300 transition-colors cursor-pointer`}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest('button, a, textarea, input')) return;
                  setDrillId(p.id);
                }}
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
                      {p.status === 'framing_rejected' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-semibold">
                          FRAMING CORRECTED
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
                </div>

                {/* Payload */}
                {p.type === 'catalog_quality_rebalance' && p.payload_raw ? (
                  <RebalancePayloadCard payload={p.payload_raw} />
                ) : p.type === 'catalog_quality_tier_reclassification' && p.payload_raw ? (
                  <TierReclassificationCard payload={p.payload_raw} />
                ) : (
                  <div className="mb-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                      Payload
                    </div>
                    <div className="text-xs text-slate-700 font-mono break-words">
                      {p.payload_summary}
                    </div>
                  </div>
                )}

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

function BucketedList({
  rows,
  setDrillId: _setDrillId,
}: {
  rows: ProposalRowVm[];
  setDrillId: (id: string | null) => void;
}) {
  const buckets: ProposalBucket[] = [
    'actionable_now',
    'needs_confirmation',
    'strategic_backlog',
  ];
  const grouped: Record<ProposalBucket, ProposalRowVm[]> = {
    actionable_now: [],
    needs_confirmation: [],
    strategic_backlog: [],
  };
  for (const row of rows) {
    grouped[classifyProposalBucket(row.type)].push(row);
  }

  const bucketStyle: Record<
    ProposalBucket,
    { header: string }
  > = {
    actionable_now: { header: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
    needs_confirmation: { header: 'text-amber-700 border-amber-200 bg-amber-50' },
    strategic_backlog: { header: 'text-slate-600 border-slate-200 bg-slate-50' },
  };

  return (
    <div className="space-y-8">
      {buckets.map((bucket) => {
        const bucketRows = grouped[bucket];
        if (bucketRows.length === 0) return null;
        const { header } = bucketStyle[bucket];
        return (
          <div key={bucket}>
            <div
              className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border ${header}`}
            >
              <span className="text-xs font-semibold uppercase tracking-wide">
                {BUCKET_LABELS[bucket]}
              </span>
              <span className="text-[10px] font-mono bg-white/60 px-1.5 py-0.5 rounded">
                {bucketRows.length}
              </span>
            </div>
            <div className="space-y-4">
              {bucketRows.map((p) => {
                const hasCritical = p.warnings.some((w) => w.severity === 'critical');
                const hasWarn = p.warnings.some((w) => w.severity === 'warn');
                const cardBorder = hasCritical
                  ? 'border-red-300'
                  : hasWarn
                    ? 'border-amber-300'
                    : 'border-slate-200';
                return (
                  <div
                    key={p.id}
                    className={`bg-white rounded-xl border ${cardBorder} p-5 hover:border-slate-300 transition-colors`}
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
                      <ProposalActions
                        id={p.id}
                        proposalType={p.type}
                        cascadeLabel={p.cascade.label}
                      />
                    </div>

                    {p.type === 'catalog_quality_rebalance' && p.payload_raw ? (
                      <RebalancePayloadCard payload={p.payload_raw} />
                    ) : p.type === 'catalog_quality_tier_reclassification' &&
                      p.payload_raw ? (
                      <TierReclassificationCard payload={p.payload_raw} />
                    ) : (
                      <div className="mb-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                          Payload
                        </div>
                        <div className="text-xs text-slate-700 font-mono break-words">
                          {p.payload_summary}
                        </div>
                      </div>
                    )}

                    <div className="border-t border-slate-100 pt-3 mb-3">
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

                    {p.notes && (
                      <div className="border-t border-slate-100 pt-3 mt-3 text-xs text-slate-600">
                        <span className="font-semibold text-slate-700">Notes:</span>{' '}
                        {p.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RebalancePayloadCard({ payload }: { payload: Record<string, unknown> }) {
  const changes = Array.isArray(payload.changes)
    ? (payload.changes as Array<{ gate_id: string; old_weight: number; new_weight: number }>)
    : [];
  const impact = payload.impact as
    | { current_perfect?: number; projected_perfect?: number; unlocked?: number }
    | undefined;
  const newThreshold = typeof payload.new_threshold === 'number' ? payload.new_threshold : null;

  return (
    <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-3">
      {/* Impact headline */}
      {impact && (
        <div className="flex flex-wrap items-center gap-4 pb-2 border-b border-emerald-200">
          <div className="text-xs">
            <span className="text-slate-500">Today: </span>
            <span className="font-bold text-slate-900">{impact.current_perfect ?? '--'} perfect</span>
          </div>
          <span className="text-slate-400 text-xs">→</span>
          <div className="text-xs">
            <span className="text-slate-500">After approval: </span>
            <span className="font-bold text-emerald-700">{impact.projected_perfect ?? '--'} perfect</span>
          </div>
          {typeof impact.unlocked === 'number' && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-300">
              +{impact.unlocked} unlocked
            </span>
          )}
          {newThreshold !== null && (
            <span className="text-[11px] text-slate-500">
              perfect_min_score → {newThreshold}
            </span>
          )}
        </div>
      )}

      {/* Weight changes table */}
      {changes.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">
            Weight changes ({changes.length} gates)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-1 font-medium pr-3">Gate</th>
                  <th className="pb-1 font-medium pr-3 text-right">Before</th>
                  <th className="pb-1 font-medium pr-3 text-right">After</th>
                  <th className="pb-1 font-medium text-right">Delta</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => {
                  const delta = c.new_weight - c.old_weight;
                  return (
                    <tr key={c.gate_id} className="border-t border-emerald-100">
                      <td className="py-1 pr-3 font-mono text-slate-700">{c.gate_id}</td>
                      <td className="py-1 pr-3 text-right text-slate-500">{c.old_weight}</td>
                      <td className="py-1 pr-3 text-right font-semibold text-slate-900">{c.new_weight}</td>
                      <td className={`py-1 text-right font-semibold ${delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {delta > 0 ? '+' : ''}{delta}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TierReclassificationCard({ payload }: { payload: Record<string, unknown> }) {
  const changes = Array.isArray(payload.changes)
    ? (payload.changes as Array<{ gate_id: string; old_tier: string; new_tier: string; reason?: string }>)
    : [];
  const minAfter = Array.isArray(payload.minimum_to_publish_after)
    ? (payload.minimum_to_publish_after as string[])
    : [];
  const minBefore = Array.isArray(payload.minimum_to_publish_before)
    ? (payload.minimum_to_publish_before as string[])
    : [];

  const TIER_CLS: Record<string, string> = {
    blocking: 'bg-red-100 text-red-800 border-red-200',
    publishable_gap: 'bg-amber-100 text-amber-800 border-amber-200',
    perfect_gap: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
      {/* Minimum to publish comparison */}
      <div className="flex gap-6 pb-2 border-b border-amber-200">
        <div className="flex-1">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1">
            Blocks publication today ({minBefore.length} gates)
          </div>
          <div className="flex flex-wrap gap-1">
            {minBefore.map((g) => (
              <span key={g} className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200 font-mono">
                {g}
              </span>
            ))}
          </div>
        </div>
        <div className="text-slate-300 self-center">→</div>
        <div className="flex-1">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1">
            Blocks publication after ({minAfter.length} gates)
          </div>
          <div className="flex flex-wrap gap-1">
            {minAfter.map((g) => (
              <span key={g} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono">
                {g}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Per-gate changes */}
      {changes.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">
            Gate tier changes ({changes.length})
          </div>
          <div className="space-y-1.5">
            {changes.map((c) => (
              <div key={c.gate_id} className="flex items-start gap-2">
                <span className="font-mono text-[11px] text-slate-700 w-36 shrink-0">{c.gate_id}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold shrink-0 ${TIER_CLS[c.old_tier] ?? ''}`}>
                  {c.old_tier}
                </span>
                <span className="text-slate-400 text-xs">→</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold shrink-0 ${TIER_CLS[c.new_tier] ?? ''}`}>
                  {c.new_tier}
                </span>
                {c.reason && (
                  <span className="text-[10px] text-slate-500 italic">{c.reason}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
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
