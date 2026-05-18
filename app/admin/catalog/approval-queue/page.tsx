// Admin catalog -- approval queue (Facu triage for admin_proposals).
// v2 | 2026-05-18 | Job_PM admin-port X7 [V8 SHADOW]
//
// Reads admin_proposals from supabase-backup and lets Facu approve or reject
// each one. Three tabs: awaiting_facu (default), approved, rejected. Tab state
// via search param ?status=.
//
// For each row we render:
//   - type badge + target table/id + short payload summary
//   - cascade impact: count of SKUs affected (computed from payload)
//     - box_master.update      -> SKUs in floropolis_inventory_mirror with that box_type
//     - pricing_constants.*    -> all SKUs (single global pricing constant)
//     - shipping_config.create -> TBD (no join key in mirror today)
//     - stub types             -> TBD
//   - warnings rendered as red (critical) / amber (warn) / slate pills
//   - proposed_by email (resolved via get_client_emails RPC) + proposed_at
//   - awaiting tab: Approve (green) + Reject (with reason prompt) buttons
//
// Access:
//   - Middleware guards /admin and restricts to ADMIN_EMAILS or
//     client_profiles.status='admin'.
//   - Server-side belt-and-suspenders: re-check session + admin status here.
//   - Non-admin -> redirect("/").
//
// Style: emerald-600 primary, Plus Jakarta Sans (inherited), ASCII-clean copy.

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';
import ProposalActions from './Actions';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

type Status = 'awaiting_facu' | 'approved' | 'rejected';
const STATUS_VALUES: Status[] = ['awaiting_facu', 'approved', 'rejected'];
const STATUS_LABELS: Record<Status, string> = {
  awaiting_facu: 'Awaiting your sign-off',
  approved: 'Approved',
  rejected: 'Rejected',
};

interface ProposalRow {
  id: string;
  type: string;
  target_table: string;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  warnings: unknown;
  status: string;
  proposed_by: string | null;
  proposed_at: string;
  notes: string | null;
}

interface WarningPill {
  severity: 'critical' | 'warn' | 'info';
  text: string;
}

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

function asWarnings(raw: unknown): WarningPill[] {
  if (!Array.isArray(raw)) return [];
  const out: WarningPill[] = [];
  for (const w of raw) {
    if (typeof w === 'string') {
      out.push({ severity: 'info', text: w });
      continue;
    }
    if (w && typeof w === 'object') {
      const obj = w as Record<string, unknown>;
      const sev = typeof obj.severity === 'string' ? obj.severity : 'info';
      const text =
        typeof obj.text === 'string'
          ? obj.text
          : typeof obj.message === 'string'
            ? (obj.message as string)
            : JSON.stringify(obj);
      const normalized: 'critical' | 'warn' | 'info' =
        sev === 'critical' ? 'critical' : sev === 'warn' ? 'warn' : 'info';
      out.push({ severity: normalized, text });
    }
  }
  return out;
}

function payloadSummary(p: ProposalRow): string {
  const payload = p.payload;
  if (!payload || typeof payload !== 'object') return '(no payload)';
  const keys = Object.keys(payload);
  if (keys.length === 0) return '(empty payload)';
  // Render up to 3 fields as key=value, truncating long values.
  const parts: string[] = [];
  for (const k of keys.slice(0, 3)) {
    const v = (payload as Record<string, unknown>)[k];
    let s: string;
    if (v == null) s = 'null';
    else if (typeof v === 'string') s = v.length > 40 ? v.slice(0, 40) + '...' : v;
    else if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
    else s = JSON.stringify(v).slice(0, 40);
    parts.push(`${k}=${s}`);
  }
  const suffix = keys.length > 3 ? ` (+${keys.length - 3} more)` : '';
  return parts.join(', ') + suffix;
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

function tabHref(s: Status): string {
  if (s === 'awaiting_facu') return '/admin/catalog/approval-queue';
  return `/admin/catalog/approval-queue?status=${s}`;
}

export const metadata = {
  title: 'Approval queue | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function AdminCatalogApprovalQueuePage({
  searchParams,
}: PageProps) {
  // Auth gate ------------------------------------------------------------
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
    if (!profile || profile.status !== 'admin') {
      redirect('/');
    }
  }

  // Tab state ------------------------------------------------------------
  const sp = await searchParams;
  const requested = (sp.status ?? 'awaiting_facu') as Status;
  const status: Status = STATUS_VALUES.includes(requested)
    ? requested
    : 'awaiting_facu';

  // Counts for tab badges (single round trip per status; small table) ----
  const backup = getBackupServiceClient();
  const countResults = await Promise.all(
    STATUS_VALUES.map(async (s) => {
      const { count } = await backup
        .from('admin_proposals')
        .select('id', { count: 'exact', head: true })
        .eq('status', s);
      return [s, count ?? 0] as const;
    }),
  );
  const counts: Record<Status, number> = {
    awaiting_facu: 0,
    approved: 0,
    rejected: 0,
  };
  for (const [s, n] of countResults) counts[s] = n;

  // Fetch proposals for the active tab ----------------------------------
  const { data: rowsRaw, error: rowsErr } = await backup
    .from('admin_proposals')
    .select(
      'id, type, target_table, target_id, payload, warnings, status, proposed_by, proposed_at, notes',
    )
    .eq('status', status)
    .order('proposed_at', { ascending: false })
    .limit(200);
  if (rowsErr) {
    console.error('[admin/catalog/approval-queue] fetch:', rowsErr);
  }
  const rows = (rowsRaw ?? []) as unknown as ProposalRow[];

  // Resolve proposer emails via the shared RPC --------------------------
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

  // Cascade impact pre-compute ------------------------------------------
  //   - box_master.update    -> SKUs with that box_type
  //   - pricing_constants.*  -> total SKU count (single global constant)
  //   - shipping_config.*    -> TBD
  //   - everything else      -> TBD (stubs)
  const needsBoxCounts = rows.some(
    (r) => r.type === 'box_master.update' && !!r.target_id,
  );
  const needsTotal = rows.some((r) =>
    r.type.startsWith('pricing_constants.'),
  );

  const boxTypeCounts: Record<string, number> = {};
  if (needsBoxCounts) {
    // Group SKU counts by box_type in a single query.
    const wantedBoxTypes = Array.from(
      new Set(
        rows
          .filter((r) => r.type === 'box_master.update' && !!r.target_id)
          .map((r) => r.target_id as string),
      ),
    );
    if (wantedBoxTypes.length > 0) {
      const { data: mirrorRows } = await backup
        .from('floropolis_inventory_mirror')
        .select('box_type')
        .in('box_type', wantedBoxTypes);
      for (const row of (mirrorRows ?? []) as { box_type: string | null }[]) {
        if (!row.box_type) continue;
        boxTypeCounts[row.box_type] = (boxTypeCounts[row.box_type] ?? 0) + 1;
      }
    }
  }

  let totalSkuCount: number | null = null;
  if (needsTotal) {
    const { count } = await backup
      .from('floropolis_inventory_mirror')
      .select('id', { count: 'exact', head: true });
    totalSkuCount = count ?? 0;
  }

  function cascadeFor(p: ProposalRow): { value: number | null; label: string } {
    if (p.type === 'box_master.update' && p.target_id) {
      const n = boxTypeCounts[p.target_id] ?? 0;
      return { value: n, label: `${n.toLocaleString()} SKU${n === 1 ? '' : 's'}` };
    }
    if (p.type.startsWith('pricing_constants.')) {
      const n = totalSkuCount ?? 0;
      return {
        value: n,
        label: `${n.toLocaleString()} SKU${n === 1 ? '' : 's'} (all)`,
      };
    }
    return { value: null, label: 'TBD' };
  }

  // Cascade total across the awaiting tab (for the top tile).
  let cascadeTotal = 0;
  let cascadeHasUnknown = false;
  if (status === 'awaiting_facu') {
    for (const r of rows) {
      const c = cascadeFor(r);
      if (c.value == null) cascadeHasUnknown = true;
      else cascadeTotal += c.value;
    }
  }

  // Critical-warning count for the top tile.
  const criticalCount = rows.reduce((acc, r) => {
    const ws = asWarnings(r.warnings);
    return acc + (ws.some((w) => w.severity === 'critical') ? 1 : 0);
  }, 0);

  // Render --------------------------------------------------------------
  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Approval queue</h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Every proposal from across the catalog control plane lands here.
            Approve or reject each. Cascade impact and warnings are shown
            inline. Data source: admin_proposals on supabase-backup.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 mb-5 border-b border-slate-200">
          {STATUS_VALUES.map((s) => {
            const active = status === s;
            return (
              <a
                key={s}
                href={tabHref(s)}
                className={
                  active
                    ? 'px-4 py-2 text-sm font-semibold text-emerald-700 border-b-2 border-emerald-600 -mb-px'
                    : 'px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 border-b-2 border-transparent -mb-px'
                }
              >
                {STATUS_LABELS[s]}
                <span
                  className={
                    active
                      ? 'ml-2 inline-flex items-center justify-center text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5'
                      : 'ml-2 inline-flex items-center justify-center text-[11px] font-medium rounded-full bg-slate-100 text-slate-600 px-2 py-0.5'
                  }
                >
                  {counts[s]}
                </span>
              </a>
            );
          })}
        </div>

        {/* Tiles (awaiting tab only) */}
        {status === 'awaiting_facu' && rows.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <Tile
              label="Awaiting your sign-off"
              value={String(counts.awaiting_facu)}
              hint="From all proposers"
              tone="orange"
            />
            <Tile
              label="With critical warnings"
              value={String(criticalCount)}
              hint="Flagged on this page"
              tone="red"
            />
            <Tile
              label="SKUs affected (cascade)"
              value={
                cascadeHasUnknown
                  ? `${cascadeTotal.toLocaleString()}+`
                  : cascadeTotal.toLocaleString()
              }
              hint={
                cascadeHasUnknown
                  ? 'Some proposals have no SKU join key (TBD)'
                  : 'Sum across visible proposals'
              }
              tone="amber"
            />
          </div>
        )}

        {/* Body */}
        {rows.length === 0 ? (
          <div className="text-center py-20 text-slate-500 border border-dashed border-slate-200 rounded-xl">
            {status === 'awaiting_facu' ? (
              <>
                <p className="font-semibold text-slate-700">
                  No proposals awaiting your sign-off.
                </p>
                <p className="text-sm mt-1">
                  The catalog is in steady state.
                </p>
              </>
            ) : status === 'approved' ? (
              <>
                <p className="font-semibold text-slate-700">
                  No approved proposals yet.
                </p>
                <p className="text-sm mt-1">
                  Once you approve one it will show up here.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-700">
                  No rejected proposals.
                </p>
                <p className="text-sm mt-1">
                  Anything you reject will land here with the reason you gave.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((p) => {
              const warnings = asWarnings(p.warnings);
              const hasCritical = warnings.some((w) => w.severity === 'critical');
              const hasWarn = warnings.some((w) => w.severity === 'warn');
              const cardBorder = hasCritical
                ? 'border-red-300'
                : hasWarn
                  ? 'border-amber-300'
                  : 'border-slate-200';
              const cascade = cascadeFor(p);
              const proposerEmail = p.proposed_by
                ? (emailMap[p.proposed_by] ?? p.proposed_by.slice(0, 8) + '...')
                : 'unknown';

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
                        Proposed by {proposerEmail} on {fmtDate(p.proposed_at)}
                      </p>
                    </div>
                    {status === 'awaiting_facu' && (
                      <ProposalActions id={p.id} />
                    )}
                  </div>

                  {/* Payload summary */}
                  <div className="mb-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                      Payload
                    </div>
                    <div className="text-xs text-slate-700 font-mono break-words">
                      {payloadSummary(p)}
                    </div>
                  </div>

                  {/* Cascade impact */}
                  <div className="border-t border-slate-100 pt-3 mb-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-700">
                        Cascade impact:{' '}
                        <span
                          className={
                            cascade.value == null
                              ? 'font-mono text-slate-500'
                              : 'font-mono text-slate-900'
                          }
                        >
                          {cascade.label}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Warnings */}
                  {warnings.length > 0 && (
                    <div className="border-t border-slate-100 pt-3 space-y-1.5">
                      {warnings.map((w, i) => {
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

        <p className="text-xs text-slate-400 mt-8">
          Data source: supabase-backup admin_proposals. Approve =&gt; executor
          runs against the target table, override_audit row written, status
          flips to approved. Reject =&gt; no executor, status flips to rejected
          with the reason you give.
        </p>
      </main>

      <Footer />
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'orange' | 'red' | 'amber';
}) {
  const cls =
    tone === 'orange'
      ? 'bg-orange-50 border-orange-200 text-orange-900'
      : tone === 'red'
        ? 'bg-red-50 border-red-200 text-red-900'
        : 'bg-amber-50 border-amber-200 text-amber-900';
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
      <div className="text-[11px] mt-0.5 opacity-70">{hint}</div>
    </div>
  );
}
