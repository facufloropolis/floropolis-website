// Admin catalog -- approval queue (Facu triage for admin_proposals).
// v3 | 2026-05-19 | Job_PM Phase C [V8 SHADOW]
//
// BRD UCs in scope: UC-3, UC-4, UC-D-114, UC-D-128 (cascade computation),
// UC-O-204 (audit verification status), Section 5.M (multi-user collab).
//
// Reads admin_proposals from supabase-backup. Three tabs: awaiting_facu
// (default), approved, rejected. Tab state via ?status=.
//
// Phase C upgrades vs v2:
//   1. Reject reason is captured via RejectModal -> facu_rationale (NOT NULL).
//   2. Approve picks urgency_tier (routine / urgent / critical) in ApproveModal
//      and writes admin_approvals.urgency_tier.
//   3. Cascade impact is read directly from admin_proposals.cascade_summary
//      (pre-computed at proposal-creation time, see lib/admin/proposal-cascade.ts).
//      Old rows without cascade_summary fall back to legacy runtime compute.
//   4. Audit drill-down (UC-O-204): clicking an approved/rejected row opens a
//      side panel showing the override_audit rows for that proposal.
//   5. Replay button on approved rows with verification_passed=false.
//   6. Filter chips by proposal type and source_agent.
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
import WiringSection from '@/components/admin/WiringSection';
import MockupLinkBanner from '@/components/admin/MockupLinkBanner';
import { getWiringForPage } from '@/lib/admin/wiring';

import RowsList, { type ProposalRowVm } from './RowsList';
import type { AuditRow } from './AuditDrillDown';

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
  source_agent: string | null;
  source_rationale: string | null;
  cascade_summary: Record<string, unknown> | null;
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
  const parts: string[] = [];
  for (const k of keys.slice(0, 3)) {
    const v = (payload as Record<string, unknown>)[k];
    let s: string;
    if (v == null) s = 'null';
    else if (typeof v === 'string')
      s = v.length > 40 ? v.slice(0, 40) + '...' : v;
    else if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
    else s = JSON.stringify(v).slice(0, 40);
    parts.push(`${k}=${s}`);
  }
  const suffix = keys.length > 3 ? ` (+${keys.length - 3} more)` : '';
  return parts.join(', ') + suffix;
}

function tabHref(s: Status): string {
  if (s === 'awaiting_facu') return '/admin/catalog/approval-queue';
  return `/admin/catalog/approval-queue?status=${s}`;
}

// Read pre-computed cascade_summary from the row. If empty (old rows) we
// expose a legacy fallback flag the caller uses to drive a single follow-up
// query against floropolis_inventory_mirror. New rows skip that path entirely.
function cascadeFromSummary(
  cs: Record<string, unknown> | null,
): { value: number | null; label: string } | null {
  if (!cs || typeof cs !== 'object') return null;
  const cnt = cs.affected_sku_count;
  if (typeof cnt !== 'number') return null;
  const warnings = Array.isArray(cs.warnings)
    ? (cs.warnings.filter((w) => typeof w === 'string') as string[])
    : [];
  const isAll = warnings.some((w) => w.toLowerCase().includes('all skus'));
  if (cnt === 0 && warnings.length > 0) {
    // 0 + a warning means "no SKU footprint" or "TBD" -- show the warning text.
    const first = warnings[0];
    return { value: null, label: first };
  }
  const noun = `${cnt.toLocaleString()} SKU${cnt === 1 ? '' : 's'}`;
  return { value: cnt, label: isAll ? `${noun} (all)` : noun };
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

  const backup = getBackupServiceClient();

  // Counts for tab badges ------------------------------------------------
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
      'id, type, target_table, target_id, payload, warnings, status, proposed_by, proposed_at, notes, source_agent, source_rationale, cascade_summary',
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

  // Cascade fallback (only for old rows without cascade_summary) --------
  // Group SKU-by-box_type into a single query, and a single count() for the
  // total. This matches the v2 behavior for any legacy rows still without
  // pre-computed cascade.
  const legacyRows = rows.filter((r) => cascadeFromSummary(r.cascade_summary) === null);
  const legacyNeedsBoxCounts = legacyRows.some(
    (r) => r.type === 'box_master.update' && !!r.target_id,
  );
  const legacyNeedsTotal = legacyRows.some((r) =>
    r.type.startsWith('pricing_constants.'),
  );
  const boxTypeCounts: Record<string, number> = {};
  if (legacyNeedsBoxCounts) {
    const wantedBoxTypes = Array.from(
      new Set(
        legacyRows
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
  let legacyTotalSkuCount: number | null = null;
  if (legacyNeedsTotal) {
    const { count } = await backup
      .from('floropolis_inventory_mirror')
      .select('id', { count: 'exact', head: true });
    legacyTotalSkuCount = count ?? 0;
  }

  function legacyCascadeFor(p: ProposalRow): {
    value: number | null;
    label: string;
  } {
    if (p.type === 'box_master.update' && p.target_id) {
      const n = boxTypeCounts[p.target_id] ?? 0;
      return {
        value: n,
        label: `${n.toLocaleString()} SKU${n === 1 ? '' : 's'}`,
      };
    }
    if (p.type.startsWith('pricing_constants.')) {
      const n = legacyTotalSkuCount ?? 0;
      return {
        value: n,
        label: `${n.toLocaleString()} SKU${n === 1 ? '' : 's'} (all)`,
      };
    }
    return { value: null, label: 'TBD' };
  }

  // Audit drill-down data (approved/rejected tabs only) -----------------
  // Approved tabs: we want override_audit rows. Rejected tabs: we still allow
  // drill-down to show the rejection rationale and any audit history (usually
  // none, but we render the row so the panel is consistent).
  const proposalIds = rows.map((r) => r.id);
  const auditByProposal: Record<string, AuditRow[]> = {};
  // Track which proposals have a "stale" or "failed" verification on their
  // most-recent audit row so we can badge them in the card list.
  const staleByProposal = new Set<string>();
  const failedByProposal = new Set<string>();
  if (proposalIds.length > 0 && status !== 'awaiting_facu') {
    const { data: auditRowsRaw } = await backup
      .from('override_audit')
      .select(
        'id, proposal_id, target_table, target_id, before_jsonb, after_jsonb, applied_at, applied_by_function, verified_by, verified_at, verification_passed, verification_notes',
      )
      .in('proposal_id', proposalIds)
      .order('applied_at', { ascending: false });
    const auditRows = (auditRowsRaw ?? []) as Array<
      AuditRow & { proposal_id: string }
    >;
    for (const a of auditRows) {
      if (!auditByProposal[a.proposal_id]) auditByProposal[a.proposal_id] = [];
      auditByProposal[a.proposal_id].push(a);
    }
    // For each proposal, look at its most-recent audit (already sorted desc)
    // to determine staleness / failure.
    for (const [pid, arr] of Object.entries(auditByProposal)) {
      const newest = arr[0];
      if (!newest) continue;
      if (newest.verification_passed === false) failedByProposal.add(pid);
      if (
        newest.verification_passed == null &&
        newest.applied_at &&
        Date.now() - new Date(newest.applied_at).getTime() >
          24 * 60 * 60 * 1000
      ) {
        staleByProposal.add(pid);
      }
    }
  }

  // Build view models ---------------------------------------------------
  const vms: ProposalRowVm[] = rows.map((p) => {
    const cascade =
      cascadeFromSummary(p.cascade_summary) ?? legacyCascadeFor(p);
    return {
      id: p.id,
      type: p.type,
      target_table: p.target_table,
      target_id: p.target_id,
      payload_summary: payloadSummary(p),
      warnings: asWarnings(p.warnings),
      status: p.status,
      proposer_email: p.proposed_by
        ? (emailMap[p.proposed_by] ?? p.proposed_by.slice(0, 8) + '...')
        : 'unknown',
      proposed_at: p.proposed_at,
      notes: p.notes,
      source_agent: p.source_agent,
      source_rationale: p.source_rationale,
      cascade,
      has_stale_verification: staleByProposal.has(p.id),
      has_failed_verification: failedByProposal.has(p.id),
    };
  });

  // Filter chip universes ----------------------------------------------
  const typeUniverse = Array.from(new Set(vms.map((v) => v.type))).sort();
  const agentUniverse = Array.from(
    new Set(vms.map((v) => v.source_agent ?? 'unknown')),
  ).sort();

  // Cascade total + critical for the top tile (awaiting tab) -----------
  let cascadeTotal = 0;
  let cascadeHasUnknown = false;
  if (status === 'awaiting_facu') {
    for (const v of vms) {
      if (v.cascade.value == null) cascadeHasUnknown = true;
      else cascadeTotal += v.cascade.value;
    }
  }
  const criticalCount = vms.reduce(
    (acc, v) =>
      acc + (v.warnings.some((w) => w.severity === 'critical') ? 1 : 0),
    0,
  );

  const wiringEntry = getWiringForPage('/admin/catalog/approval-queue');
  const wm = (id: string) =>
    wiringEntry?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <MockupLinkBanner mockupHref="/mockups/admin-catalog-approval-queue" pageLabel="/admin/catalog/approval-queue" />
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Approval queue</h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Every proposal from across the catalog control plane lands here.
            Approve or reject each. Cascade impact is pre-computed and shown
            inline. Click any approved or rejected row to see its audit trail.
            Data source: admin_proposals on supabase-backup.
          </p>
        </div>

        {/* Tab bar */}
        <WiringSection level={wm('tabs').level} note={wm('tabs').note} id="tabs">
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

        </WiringSection>

        {/* Tiles (awaiting tab only) */}
        {status === 'awaiting_facu' && vms.length > 0 && (
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

        <WiringSection level={wm('rows').level} note={wm('rows').note} id="rows">
        <RowsList
          rows={vms}
          auditByProposal={auditByProposal}
          status={status}
          typeUniverse={typeUniverse}
          agentUniverse={agentUniverse}
        />
        </WiringSection>

        <p className="text-xs text-slate-400 mt-8">
          Data source: supabase-backup admin_proposals. Approve =&gt; executor
          runs against the target table, override_audit row written, status
          flips to approved. Reject =&gt; no executor, status flips to rejected
          with the rationale you give. Cascade impact is pre-computed at
          proposal-creation time (admin_proposals.cascade_summary).
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
