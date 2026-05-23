// Admin catalog -- Proposals (full history).
// v2 | 2026-05-22 | Job_PM [V8 SHADOW]
//
// Replaced the static planning/meta page with a live view of admin_proposals
// across ALL statuses. Facu uses this to audit what has been proposed, by whom,
// and what happened to each proposal.
//
// Use /admin/catalog/approval-queue for the TRIAGE view (awaiting_facu only,
// with inline approve / reject actions). This page = read-only history log.

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

interface ProposalRow {
  id: string;
  type: string;
  target_table: string;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  status: string;
  proposed_by: string | null;
  proposed_at: string;
  notes: string | null;
  source_agent: string | null;
  source_rationale: string | null;
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

function statusBadge(s: string): string {
  if (s === 'awaiting_facu')
    return 'bg-orange-100 text-orange-800 border-orange-200';
  if (s === 'approved') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (s === 'rejected') return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function statusLabel(s: string): string {
  if (s === 'awaiting_facu') return 'awaiting sign-off';
  return s;
}

function payloadSnippet(p: Record<string, unknown> | null): string {
  if (!p) return '(no payload)';
  const keys = Object.keys(p);
  if (keys.length === 0) return '(empty)';
  const parts: string[] = [];
  for (const k of keys.slice(0, 3)) {
    const v = p[k];
    let s: string;
    if (v == null) s = 'null';
    else if (typeof v === 'string') s = v.length > 40 ? v.slice(0, 40) + '…' : v;
    else if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
    else s = JSON.stringify(v).slice(0, 40);
    parts.push(`${k}=${s}`);
  }
  return parts.join(', ') + (keys.length > 3 ? ` +${keys.length - 3}` : '');
}

export const metadata = {
  title: 'Proposals | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function AdminCatalogProposalsPage() {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect('/');

  const adminClient = getBackupServiceClient();
  const emailLc = (user.email ?? '').toLowerCase();
  const isAdminByEmail = ADMIN_EMAILS.includes(emailLc);
  if (!isAdminByEmail) {
    const { data: profile } = await adminClient
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!profile || profile.status !== 'admin') redirect('/');
  }

  const backup = getBackupServiceClient();

  // Counts per status
  const [awaitingRes, approvedRes, rejectedRes, allRes] = await Promise.all([
    backup.from('admin_proposals').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_facu'),
    backup.from('admin_proposals').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    backup.from('admin_proposals').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
    backup
      .from('admin_proposals')
      .select('id, type, target_table, target_id, payload, status, proposed_by, proposed_at, notes, source_agent, source_rationale')
      .order('proposed_at', { ascending: false })
      .limit(100),
  ]);

  const awaitingCount = awaitingRes.count ?? 0;
  const approvedCount = approvedRes.count ?? 0;
  const rejectedCount = rejectedRes.count ?? 0;
  const rows = (allRes.data ?? []) as ProposalRow[];

  // Resolve proposer emails
  const proposerIds = Array.from(
    new Set(rows.map((r) => r.proposed_by).filter((v): v is string => !!v)),
  );
  const emailMap: Record<string, string> = {};
  if (proposerIds.length > 0) {
    const { data: emailRows } = await userClient.rpc('get_client_emails', {
      user_ids: proposerIds,
    });
    (emailRows ?? []).forEach((r: { user_id: string; email: string }) => {
      emailMap[r.user_id] = r.email;
    });
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Proposals</h1>
            <p className="text-sm text-slate-500 mt-1">
              Full history of every admin_proposals row — all statuses.{' '}
              <Link
                href="/admin/catalog/approval-queue"
                className="text-emerald-700 font-semibold underline hover:text-emerald-900"
              >
                Go to approval queue →
              </Link>{' '}
              to approve or reject pending items.
            </p>
          </div>
          {awaitingCount > 0 && (
            <Link
              href="/admin/catalog/approval-queue"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-50 border border-orange-200 text-orange-900 text-sm font-semibold hover:bg-orange-100"
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-200 text-orange-900 text-[11px] font-bold">
                {awaitingCount}
              </span>
              awaiting your sign-off
            </Link>
          )}
        </div>
      </div>

      {/* Count tiles */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Tile label="Awaiting sign-off" value={awaitingCount} href="/admin/catalog/approval-queue" tone="orange" />
        <Tile label="Approved" value={approvedCount} href="/admin/catalog/approval-queue?status=approved" tone="green" />
        <Tile label="Rejected" value={rejectedCount} href="/admin/catalog/approval-queue?status=rejected" tone="slate" />
      </div>

      {/* Proposal list */}
      {rows.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-500">
          <p className="font-semibold text-slate-600">No proposals yet</p>
          <p className="text-sm mt-1">Proposals are created from SKU detail pages and other admin forms.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => {
            const email = p.proposed_by
              ? (emailMap[p.proposed_by] ?? p.proposed_by.slice(0, 12) + '…')
              : 'unknown';
            const isAwaitingSelf = p.status === 'awaiting_facu';
            return (
              <div
                key={p.id}
                className={`border rounded-xl p-4 bg-white ${isAwaitingSelf ? 'border-orange-200' : 'border-slate-200'}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                        {p.type}
                      </span>
                      <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 ${statusBadge(p.status)}`}>
                        {statusLabel(p.status)}
                      </span>
                      {p.source_agent && (
                        <span className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
                          by {p.source_agent}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      target: {p.target_table}
                      {p.target_id ? ` / ${p.target_id}` : ''}
                    </p>
                    {p.notes && (
                      <p className="text-xs text-slate-700 mt-1.5 leading-relaxed line-clamp-2">
                        {p.notes}
                      </p>
                    )}
                    {!p.notes && p.source_rationale && (
                      <p className="text-xs text-slate-600 italic mt-1.5 line-clamp-2">
                        {p.source_rationale}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400 font-mono mt-1.5">
                      payload: {payloadSnippet(p.payload)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-slate-500">{fmtDate(p.proposed_at)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{email}</p>
                    <p className="text-[10px] font-mono text-slate-300 mt-0.5">#{p.id.slice(0, 8)}</p>
                  </div>
                </div>
                {isAwaitingSelf && (
                  <div className="mt-3 pt-3 border-t border-orange-100">
                    <Link
                      href={`/admin/catalog/approval-queue#${p.id}`}
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Review in approval queue →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-6">
        Showing last 100 proposals. Source: admin_proposals on supabase-backup.
        Approve / reject actions are in{' '}
        <Link href="/admin/catalog/approval-queue" className="underline">
          /admin/catalog/approval-queue
        </Link>.
      </p>
    </main>
  );
}

function Tile({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href: string;
  tone: 'orange' | 'green' | 'slate';
}) {
  const cls =
    tone === 'orange'
      ? 'bg-orange-50 border-orange-200 text-orange-900 hover:bg-orange-100'
      : tone === 'green'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100'
        : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100';
  return (
    <Link href={href} className={`rounded-xl border p-4 block transition-colors ${cls}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
    </Link>
  );
}
