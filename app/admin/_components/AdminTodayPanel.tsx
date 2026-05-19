// AdminTodayPanel -- "needs your attention" list on /admin.
// v1 | 2026-05-19 | Job_PM SHELL-V2 [V8 SHADOW]
//
// Reads admin_proposals WHERE status='awaiting_facu', takes top 8 by recency.
//
// NOTE on ordering: spec asked for ORDER BY urgency_tier. urgency_tier lives in
// admin_approvals (post-approve) and inside admin_proposals.payload.urgency_tier
// (for some proposal types). It is NOT a top-level admin_proposals column we
// can ORDER BY in Postgres. Pragmatic interpretation: order by proposed_at
// desc, surface payload.urgency_tier (if present) as a priority badge per row.
// When the column is promoted into admin_proposals proper, switch the order.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

interface ProposalRow {
  id: string;
  type: string;
  target_table: string;
  target_id: string | null;
  source_agent: string | null;
  proposed_at: string;
  payload: Record<string, unknown> | null;
}

type Priority = 'P0' | 'P1' | 'P2';

const PRIORITY_CLS: Record<Priority, string> = {
  P0: 'bg-red-100 text-red-800',
  P1: 'bg-amber-100 text-amber-800',
  P2: 'bg-slate-100 text-slate-600',
};

function urgencyToPriority(payload: Record<string, unknown> | null): Priority {
  const u = payload?.urgency_tier;
  if (u === 'critical') return 'P0';
  if (u === 'urgent') return 'P1';
  return 'P2';
}

function detailHrefFor(row: ProposalRow): string {
  // The approval queue is the universal sink for awaiting_facu proposals.
  // Filter by status to land Facu on the right row in context.
  return `/admin/catalog/approval-queue?status=awaiting_facu#${row.id}`;
}

function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function labelFor(row: ProposalRow): string {
  const payload = row.payload ?? {};
  const explicit = typeof payload.summary === 'string' ? payload.summary : null;
  if (explicit) return explicit;
  const tgt = row.target_id ? ` -> ${row.target_table}#${row.target_id}` : ` -> ${row.target_table}`;
  const by = row.source_agent ? ` (by ${row.source_agent})` : '';
  return `${row.type}${tgt}${by}`;
}

export default async function AdminTodayPanel(): Promise<ReactNode> {
  const svc = getBackupServiceClient();
  const { data, error } = await svc
    .from('admin_proposals')
    .select('id, type, target_table, target_id, source_agent, proposed_at, payload')
    .eq('status', 'awaiting_facu')
    .order('proposed_at', { ascending: false })
    .limit(8);

  if (error) {
    return (
      <section className="bg-white rounded-2xl border border-red-200 p-5">
        <h2 className="text-sm font-bold text-red-900 mb-1">Today</h2>
        <p className="text-xs text-red-700">Failed to load awaiting proposals: {error.message}</p>
      </section>
    );
  }

  const rows = (data ?? []) as unknown as ProposalRow[];

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-900">Needs your attention</h2>
        <span className="text-xs text-slate-500">{rows.length} items</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-8 text-center text-xs text-slate-400">
          Inbox zero. Nothing awaiting your sign-off right now.
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const priority = urgencyToPriority(r.payload);
            return (
              <div
                key={r.id}
                className="flex items-start gap-3 p-3 border border-slate-100 rounded-lg hover:bg-slate-50"
              >
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${PRIORITY_CLS[priority]}`}
                >
                  {priority}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-900 truncate">{labelFor(r)}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {relTime(r.proposed_at)} . type: {r.type}
                  </div>
                </div>
                <Link
                  href={detailHrefFor(r)}
                  className="text-xs px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium shrink-0"
                >
                  Open
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
