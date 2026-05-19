// Upcoming (Rose) tab: read-only view of n8n_dispatch_queue.
// v1 | 2026-05-19 | Job_PM disp-real [V8 SHADOW]
//
// HARD BOUNDARY (rose_table_audit_v1.md section 4): Job CANNOT write to
// n8n_dispatch_queue. Status changes / cancels go through Rose via
// admin_proposals (type='dispatch_cancel'). UI exposes NO action buttons.

import type { RoseQueueRow, RoseTabResult } from './RoseDispatchData';
import RoseFreshnessBadge from './RoseFreshnessBadge';

interface RoseUpcomingTabProps {
  data: RoseTabResult<RoseQueueRow>;
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

function statusBadge(status: string | null | undefined): { cls: string; label: string } {
  const s = (status ?? 'UNKNOWN').toUpperCase();
  if (s === 'PENDING' || s === 'QUEUED' || s === 'SCHEDULED') {
    return { cls: 'bg-slate-100 text-slate-700 border-slate-200', label: s };
  }
  if (s === 'SENDING' || s === 'IN_PROGRESS' || s === 'PROCESSING') {
    return { cls: 'bg-blue-50 text-blue-800 border-blue-200', label: s };
  }
  if (s === 'FAILED' || s === 'ERROR') {
    return { cls: 'bg-red-50 text-red-800 border-red-200', label: s };
  }
  return { cls: 'bg-slate-100 text-slate-700 border-slate-200', label: s };
}

export default function RoseUpcomingTab({ data }: RoseUpcomingTabProps) {
  const { configured, rows, lastSyncedAt, error } = data;

  return (
    <div className="space-y-4">
      {/* Read-only banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900">
        <span className="font-semibold">View only.</span>{' '}
        This queue is managed by the AI-Infra (Rose) pipeline. Cancels and re-queues
        must go through Rose via admin_proposals (type=&apos;dispatch_cancel&apos;).
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Upcoming dispatch queue ({rows.length})
        </h2>
        <RoseFreshnessBadge
          configured={configured}
          lastSyncedAt={lastSyncedAt}
          source="AI-Infra pipeline (n8n_dispatch_queue)"
          error={error}
        />
      </div>

      {!configured ? (
        <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <p className="font-semibold text-slate-600">Production read client not configured</p>
          <p className="text-sm mt-1">
            Set PROD_SUPABASE_SERVICE_KEY (and optionally PROD_SUPABASE_URL) in the
            environment to enable Rose-tab reads.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <p className="font-semibold text-slate-600">No upcoming dispatches</p>
          <p className="text-sm mt-1">
            Nothing pending in n8n_dispatch_queue (excluding SENT and CANCELLED).
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                  Customer
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                  Template
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                  Scheduled
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                  Brevo ID
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => {
                const s = statusBadge(r.status);
                const key =
                  (r.id != null ? String(r.id) : null) ??
                  (r.brevo_message_id ?? null) ??
                  `row-${i}`;
                return (
                  <tr key={key} className="hover:bg-slate-50">
                    <td className="px-3 py-3 text-slate-700">
                      {r.customer_email ?? '-'}
                    </td>
                    <td className="px-3 py-3 text-slate-700 font-mono text-xs">
                      {r.template_id != null ? String(r.template_id) : '-'}
                    </td>
                    <td className="px-3 py-3 text-slate-700 text-xs">
                      {fmtDateTime(r.scheduled_send_at)}
                    </td>
                    <td className="px-3 py-3 text-slate-500 font-mono text-xs">
                      {r.brevo_message_id ?? '-'}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${s.cls}`}
                      >
                        {s.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
