// Audit drill-down side panel for /admin/catalog/approval-queue.
// v1 | 2026-05-19 | Job_PM Phase C [V8 SHADOW]
//
// Click an approved/rejected row -> this panel slides in from the right and
// shows the override_audit rows tied to that proposal_id (BRD UC-O-204). For
// each audit row:
//   - target_table + target_id
//   - applied_at + applied_by_function
//   - verification status: passed / failed / pending / STALE (>24h)
//   - before_jsonb / after_jsonb diff (collapsed by default)
//   - verification_notes (if set)
//
// If the most-recent audit row has verification_passed=false, we render a
// "Replay" button that POSTs to /api/admin/proposals/[id]/replay. The replay
// route re-runs the executor + writes a new override_audit row.
//
// Data is fetched client-side from a JSON endpoint: we hit /api/admin/proposals/[id]/audit
// (NOT a new route -- below we read directly via Supabase service through the
// existing proposals endpoint pattern is overkill; we lift via a tiny GET fetch
// that we wire into the same route). To keep this PR scope-bounded, this
// component receives audit rows as a prop from the server-side page component
// (which already has access to the service client). That keeps things simple
// and SSR-correct.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AuditRow {
  id: string;
  target_table: string;
  target_id: string | null;
  before_jsonb: Record<string, unknown> | null;
  after_jsonb: Record<string, unknown> | null;
  applied_at: string | null;
  applied_by_function: string | null;
  verified_by: string | null;
  verified_at: string | null;
  verification_passed: boolean | null;
  verification_notes: string | null;
}

interface Props {
  open: boolean;
  proposalId: string | null;
  proposalShort: string;
  proposalType: string;
  rows: AuditRow[];
  onClose: () => void;
}

function fmt(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isStale(row: AuditRow): boolean {
  if (row.verification_passed != null) return false;
  if (!row.applied_at) return false;
  const applied = new Date(row.applied_at).getTime();
  if (!Number.isFinite(applied)) return false;
  return Date.now() - applied > 24 * 60 * 60 * 1000;
}

function diffPairs(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Array<{ key: string; before: unknown; after: unknown }> {
  const keys = new Set<string>();
  if (before) Object.keys(before).forEach((k) => keys.add(k));
  if (after) Object.keys(after).forEach((k) => keys.add(k));
  const out: Array<{ key: string; before: unknown; after: unknown }> = [];
  for (const k of Array.from(keys).sort()) {
    const b = before ? before[k] : undefined;
    const a = after ? after[k] : undefined;
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    out.push({ key: k, before: b, after: a });
  }
  return out;
}

function fmtValue(v: unknown): string {
  if (v === undefined) return '<unset>';
  if (v === null) return 'null';
  if (typeof v === 'string') return v.length > 80 ? v.slice(0, 80) + '...' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = JSON.stringify(v);
  return s.length > 80 ? s.slice(0, 80) + '...' : s;
}

export default function AuditDrillDown({
  open,
  proposalId,
  proposalShort,
  proposalType,
  rows,
  onClose,
}: Props) {
  const router = useRouter();
  const [replayBusy, setReplayBusy] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayReason, setReplayReason] = useState('');

  if (!open || !proposalId) return null;

  const sorted = [...rows].sort((a, b) => {
    const ta = a.applied_at ? new Date(a.applied_at).getTime() : 0;
    const tb = b.applied_at ? new Date(b.applied_at).getTime() : 0;
    return tb - ta;
  });
  const mostRecent = sorted[0];
  const canReplay =
    mostRecent && mostRecent.verification_passed === false;

  async function doReplay() {
    if (!proposalId) return;
    setReplayBusy(true);
    setReplayError(null);
    try {
      const res = await fetch(`/api/admin/proposals/${proposalId}/replay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: replayReason || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.detail
            ? `${body.error}: ${body.detail}`
            : (body.error ?? `HTTP ${res.status}`),
        );
      }
      setReplayReason('');
      router.refresh();
    } catch (e) {
      setReplayError(e instanceof Error ? e.message : 'replay failed');
    } finally {
      setReplayBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-900/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Audit details"
        className="absolute right-0 top-0 h-full w-full sm:w-[480px] bg-white border-l border-slate-200 shadow-2xl overflow-y-auto"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">
              Audit drill-down
            </div>
            <h2 className="text-sm font-semibold text-slate-900 mt-0.5">
              Proposal{' '}
              <span className="font-mono text-slate-500">#{proposalShort}</span>
            </h2>
            <div className="text-[11px] text-slate-500 mt-0.5">
              type: <span className="font-mono">{proposalType}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-400 px-2 py-1 rounded-md"
          >
            Close
          </button>
        </div>

        {sorted.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            No override_audit rows for this proposal.
            <p className="text-[11px] mt-1 text-slate-400">
              Likely a rejected proposal (no executor ran) or audit insert
              failed.
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {sorted.map((row, idx) => {
              const stale = isStale(row);
              const passed = row.verification_passed === true;
              const failed = row.verification_passed === false;
              const pending = row.verification_passed == null && !stale;
              const pairs = diffPairs(row.before_jsonb, row.after_jsonb);

              return (
                <div
                  key={row.id}
                  className={`rounded-lg border p-4 ${
                    failed
                      ? 'border-red-300 bg-red-50/30'
                      : stale
                        ? 'border-red-300 bg-red-50/30'
                        : passed
                          ? 'border-emerald-200 bg-emerald-50/30'
                          : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wide">
                        Audit row {sorted.length - idx}
                      </div>
                      <div className="text-xs text-slate-900 font-mono break-all">
                        {row.target_table}
                        {row.target_id ? ` / ${row.target_id}` : ''}
                      </div>
                    </div>
                    <div>
                      {stale ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-semibold">
                          verification STALE
                        </span>
                      ) : failed ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-semibold">
                          verification FAILED
                        </span>
                      ) : passed ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                          VERIFIED
                        </span>
                      ) : pending ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                          pending
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 mb-3">
                    <div>
                      <div className="text-slate-400 uppercase tracking-wide text-[9px]">
                        applied_at
                      </div>
                      <div className="font-mono">{fmt(row.applied_at)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 uppercase tracking-wide text-[9px]">
                        applied_by
                      </div>
                      <div className="font-mono break-all">
                        {row.applied_by_function ?? '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 uppercase tracking-wide text-[9px]">
                        verified_by
                      </div>
                      <div className="font-mono">{row.verified_by ?? '-'}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 uppercase tracking-wide text-[9px]">
                        verified_at
                      </div>
                      <div className="font-mono">{fmt(row.verified_at)}</div>
                    </div>
                  </div>

                  {row.verification_notes && (
                    <div className="text-[11px] text-slate-700 mb-3 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
                      <span className="font-semibold">Notes: </span>
                      {row.verification_notes}
                    </div>
                  )}

                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-slate-700 font-semibold">
                      Diff ({pairs.length} field
                      {pairs.length === 1 ? '' : 's'} changed)
                    </summary>
                    {pairs.length === 0 ? (
                      <div className="mt-1 text-slate-500">No-op (no diff).</div>
                    ) : (
                      <div className="mt-1.5 space-y-1">
                        {pairs.map((p) => (
                          <div
                            key={p.key}
                            className="font-mono text-[10px] border border-slate-200 rounded px-2 py-1 bg-white"
                          >
                            <div className="text-slate-700 font-semibold">
                              {p.key}
                            </div>
                            <div className="text-red-700">
                              - {fmtValue(p.before)}
                            </div>
                            <div className="text-emerald-700">
                              + {fmtValue(p.after)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </details>
                </div>
              );
            })}
          </div>
        )}

        {canReplay && (
          <div className="px-5 py-4 border-t border-slate-200 bg-slate-50">
            <div className="text-[11px] font-semibold text-slate-700 mb-1">
              Replay failed verification
            </div>
            <p className="text-[10px] text-slate-500 mb-2">
              Re-runs the executor. Idempotent for UPDATE-style proposals.
              Create-style proposals (discount_rule, shipping_config, refund)
              will insert a new row -- only replay if the original write didn&apos;t
              land.
            </p>
            <textarea
              value={replayReason}
              onChange={(e) => setReplayReason(e.target.value)}
              placeholder="Why replay (optional, lands in override_audit.verification_notes)"
              className="w-full h-16 rounded border border-slate-300 px-2 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-amber-300"
              disabled={replayBusy}
              maxLength={2000}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              {replayError ? (
                <span className="text-[10px] text-red-600 font-mono">
                  {replayError}
                </span>
              ) : (
                <span className="text-[10px] text-slate-500">
                  applied_by_function will be tagged [REPLAY]
                </span>
              )}
              <button
                type="button"
                disabled={replayBusy}
                onClick={doReplay}
                className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-md disabled:opacity-50 shrink-0"
              >
                {replayBusy ? 'Replaying...' : 'Replay'}
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
