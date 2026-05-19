// Recent (Rose) tab: read-only view of dispatch_batches + dispatch_events (last 30d).
// v1 | 2026-05-19 | Job_PM disp-real [V8 SHADOW]

'use client';

import { useState } from 'react';
import type {
  RecentBatchWithEvents,
  RoseTabResult,
} from './RoseDispatchData';
import RoseFreshnessBadge from './RoseFreshnessBadge';

interface RoseRecentTabProps {
  data: RoseTabResult<RecentBatchWithEvents>;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export default function RoseRecentTab({ data }: RoseRecentTabProps) {
  const { configured, rows, lastSyncedAt, error } = data;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (k: string) => setExpanded((e) => ({ ...e, [k]: !e[k] }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Recent batches ({rows.length}) - last 30 days
        </h2>
        <RoseFreshnessBadge
          configured={configured}
          lastSyncedAt={lastSyncedAt}
          source="AI-Infra pipeline (dispatch_batches + dispatch_events)"
          error={error}
        />
      </div>

      {!configured ? (
        <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <p className="font-semibold text-slate-600">Production read client not configured</p>
          <p className="text-sm mt-1">
            Set PROD_SUPABASE_SERVICE_KEY in the environment to enable Rose-tab reads.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <p className="font-semibold text-slate-600">No recent batches</p>
          <p className="text-sm mt-1">
            No dispatch_batches rows created in the last 30 days.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const b = r.batch;
            const key =
              (b.id != null ? String(b.id) : null) ??
              (b.batch_id ?? null) ??
              `batch-${i}`;
            const isOpen = !!expanded[key];
            const batchLabel = b.batch_id ?? (b.id != null ? String(b.id) : '(no id)');
            const batchDate = fmtDate(b.batch_date ?? b.created_at as string | null);
            return (
              <div
                key={key}
                className="border border-slate-200 rounded-xl overflow-hidden bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs font-semibold text-slate-700">
                      {batchLabel}
                    </span>
                    <span className="text-xs text-slate-500">{batchDate}</span>
                    <span className="text-xs text-slate-500">
                      {r.events.length} event{r.events.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <span className="text-xs text-emerald-700">
                    {isOpen ? 'Hide' : 'Show'} events
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    {r.events.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        No events found for this batch.
                      </p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500">
                            <th className="text-left py-1 font-semibold uppercase tracking-wide">
                              Event
                            </th>
                            <th className="text-left py-1 font-semibold uppercase tracking-wide">
                              Dispatch
                            </th>
                            <th className="text-left py-1 font-semibold uppercase tracking-wide">
                              At
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.events.map((e, j) => {
                            const ek =
                              (e.id != null ? String(e.id) : null) ?? `event-${i}-${j}`;
                            return (
                              <tr key={ek} className="border-t border-slate-200/60">
                                <td className="py-1.5 text-slate-700">
                                  {e.event_type ?? '-'}
                                </td>
                                <td className="py-1.5 text-slate-500 font-mono">
                                  {e.dispatch_id ?? '-'}
                                </td>
                                <td className="py-1.5 text-slate-700">
                                  {fmtDateTime(e.event_at ?? (e.created_at as string | null))}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
