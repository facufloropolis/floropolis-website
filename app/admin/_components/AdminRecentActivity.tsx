// AdminRecentActivity -- last 5 admin_proposals (any status), most-recent first.
// v1 | 2026-05-19 | Job_PM SHELL-V2 [V8 SHADOW]
//
// Designed as a thin server component. Once the override_audit + executor-log
// surfaces stabilize we can expand this into a unified activity stream
// (mappings, approvals, rejects, dispatch events). For W3 we ship with
// admin_proposals alone -- shipping is the rule, breadth is W4.

import type { ReactNode } from 'react';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

interface ActivityRow {
  id: string;
  type: string;
  status: string;
  target_table: string;
  target_id: string | null;
  source_agent: string | null;
  proposed_at: string;
}

function actor(row: ActivityRow): string {
  if (row.source_agent && row.source_agent.length > 0) return row.source_agent;
  return 'system';
}

function action(row: ActivityRow): string {
  const verb =
    row.status === 'approved'
      ? 'approved'
      : row.status === 'rejected'
        ? 'rejected'
        : row.status === 'awaiting_facu'
          ? 'proposed'
          : row.status;
  const tgt = row.target_id ? `${row.target_table}#${row.target_id}` : row.target_table;
  return `${verb} ${row.type} on ${tgt}`;
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

export default async function AdminRecentActivity(): Promise<ReactNode> {
  const svc = getBackupServiceClient();
  const { data, error } = await svc
    .from('admin_proposals')
    .select('id, type, status, target_table, target_id, source_agent, proposed_at')
    .order('proposed_at', { ascending: false })
    .limit(5);

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-5">
        <h2 className="text-sm font-bold text-red-900 mb-2">Recent activity</h2>
        <p className="text-xs text-red-700">Failed to load: {error.message}</p>
      </div>
    );
  }

  const rows = (data ?? []) as unknown as ActivityRow[];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h2 className="text-sm font-bold text-slate-900 mb-3">Recent activity</h2>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-400">No activity yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="text-xs">
              <div className="text-slate-700">
                <span className="font-semibold">{actor(r)}</span> {action(r)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">{relTime(r.proposed_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
