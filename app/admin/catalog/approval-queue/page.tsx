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
import WiringSection from '@/components/admin/WiringSection';
import MockupLinkBanner from '@/components/admin/MockupLinkBanner';
import { getWiringForPage } from '@/lib/admin/wiring';

import RowsList, { type ProposalRowVm } from './RowsList';
import type { AuditRow } from './AuditDrillDown';
import BatchPriceProposalPanel, { type BatchProposal } from './BatchPriceProposalPanel';
import SupplyQualityBar, { type PendingCorrection, type PotentialUnlock, type HistoricalMetric } from './SupplyQualityBar';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

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
  if (p.type === 'catalog_quality_tier_reclassification') {
    const payload = p.payload;
    if (!payload) return '(no payload)';
    const changes = Array.isArray(payload.changes) ? payload.changes.length : 0;
    const minAfter = Array.isArray(payload.minimum_to_publish_after)
      ? (payload.minimum_to_publish_after as string[]).join(', ')
      : '?';
    return `${changes} gate tier changes. Min to publish after: ${minAfter}`;
  }
  if (p.type === 'catalog_quality_rebalance') {
    const payload = p.payload;
    if (!payload) return '(no payload)';
    const impact = payload.impact as Record<string, unknown> | undefined;
    const changes = Array.isArray(payload.changes) ? payload.changes.length : 0;
    if (impact && typeof impact.projected_perfect === 'number') {
      return `Conversion model v1: ${changes} weight changes + threshold→${payload.new_threshold ?? '?'}. Impact: ${impact.current_perfect ?? '?'}→${impact.projected_perfect} perfect (${impact.unlocked ?? '?'} unlocked)`;
    }
  }
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
// query against v_catalog_admin. New rows skip that path entirely.
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
  // 'rejected' tab includes framing_rejected proposals (visually distinguished).
  const countResults = await Promise.all(
    STATUS_VALUES.map(async (s) => {
      const q = backup
        .from('admin_proposals')
        .select('id', { count: 'exact', head: true });
      const { count } = s === 'rejected'
        ? await q.in('status', ['rejected', 'framing_rejected'])
        : await q.eq('status', s);
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
  // 'rejected' tab fetches both rejected and framing_rejected.
  const { data: rowsRaw, error: rowsErr } = await backup
    .from('admin_proposals')
    .select(
      'id, type, target_table, target_id, payload, warnings, status, proposed_by, proposed_at, notes, source_agent, source_rationale, cascade_summary',
    )
    .in('status', status === 'rejected'
      ? ['rejected', 'framing_rejected']
      : [status])
    .order('proposed_at', { ascending: false })
    .limit(200);
  if (rowsErr) {
    console.error('[admin/catalog/approval-queue] fetch:', rowsErr);
  }
  const rows = (rowsRaw ?? []) as unknown as ProposalRow[];

  // ── Supply quality counts (always, for SupplyQualityBar) ─────────────
  // Read from catalog_classifications. These counts show the current state
  // of the catalog so Facu can see supply improving as corrections land.
  let supplyBlockedCount = 0;
  let supplyPublishableCount = 0;
  let supplyPerfectCount = 0;
  let supplyTotalCount = 0;
  {
    const [{ count: blocked }, { count: publishable }, { count: perfect }, { count: total }] =
      await Promise.all([
        backup.from('catalog_classifications').select('id', { count: 'exact', head: true }).eq('status', 'blocked'),
        backup.from('catalog_classifications').select('id', { count: 'exact', head: true }).eq('status', 'publishable'),
        backup.from('catalog_classifications').select('id', { count: 'exact', head: true }).eq('status', 'perfect'),
        backup.from('catalog_classifications').select('id', { count: 'exact', head: true }),
      ]);
    supplyBlockedCount    = blocked    ?? 0;
    supplyPublishableCount = publishable ?? 0;
    supplyPerfectCount    = perfect    ?? 0;
    supplyTotalCount      = total      ?? 0;
  }

  // ── Pending correction records for SupplyQualityBar (awaiting_facu only) ─
  // Pulls all Facu-authored correction proposals still in the queue so the
  // bar can show what's in flight and how long each has been open.
  const CORRECTION_TYPES = [
    'ingest.price_field_bug',
    'cost_source.facu_correction',
    'price_alert.facu_correction',
  ];
  const CORRECTION_LABELS: Record<string, string> = {
    'ingest.price_field_bug':       'Ingest price bug',
    'cost_source.facu_correction':  'Cost source correction',
    'price_alert.facu_correction':  'Price alert correction',
  };
  let pendingCorrections: PendingCorrection[] = [];
  if (status === 'awaiting_facu') {
    const { data: corrRows } = await backup
      .from('admin_proposals')
      .select('id, type, payload, proposed_at')
      .in('type', CORRECTION_TYPES)
      .eq('status', 'awaiting_facu')
      .order('proposed_at', { ascending: false });
    const now = Date.now();
    pendingCorrections = ((corrRows ?? []) as Array<{
      id: string; type: string; payload: Record<string, unknown> | null; proposed_at: string;
    }>).map(r => ({
      id: r.id,
      type: r.type,
      label: CORRECTION_LABELS[r.type] ?? r.type,
      priority: (r.payload?.priority as string | null) ?? null,
      proposed_at: r.proposed_at,
      days_open: Math.floor((now - new Date(r.proposed_at).getTime()) / (24 * 60 * 60 * 1000)),
    }));
  }

  // ── Historical metrics for SupplyQualityBar track record ─────────────
  // Counts approved corrections per type + avg days from proposed to decided.
  // Uses admin_approvals table (decided_at) joined via proposal_id.
  const ALL_CORRECTION_TYPES = [
    'ingest.price_field_bug',
    'cost_source.facu_correction',
    'price_alert.facu_correction',
    'contents_description.facu_correction',
  ];
  const CORRECTION_LABEL_MAP: Record<string, string> = {
    'ingest.price_field_bug':               'Ingest price bug',
    'cost_source.facu_correction':          'Cost source correction',
    'price_alert.facu_correction':          'Price alert correction',
    'contents_description.facu_correction': 'Description correction',
  };
  let historicalMetrics: HistoricalMetric[] = ALL_CORRECTION_TYPES.map(t => ({
    label: CORRECTION_LABEL_MAP[t] ?? t,
    applied_count: 0,
    avg_days_to_apply: null,
    last_applied_at: null,
  }));
  {
    const { data: approvedCorrs } = await backup
      .from('admin_proposals')
      .select('id, type, proposed_at')
      .in('type', ALL_CORRECTION_TYPES)
      .eq('status', 'approved')
      .order('proposed_at', { ascending: false });
    if (approvedCorrs && approvedCorrs.length > 0) {
      // Group by type
      const byType: Record<string, Array<{ proposed_at: string }>> = {};
      for (const r of approvedCorrs as Array<{ id: string; type: string; proposed_at: string }>) {
        if (!byType[r.type]) byType[r.type] = [];
        byType[r.type].push(r);
      }
      historicalMetrics = ALL_CORRECTION_TYPES.map(t => {
        const rows = byType[t] ?? [];
        return {
          label: CORRECTION_LABEL_MAP[t] ?? t,
          applied_count: rows.length,
          avg_days_to_apply: null, // would need admin_approvals.decided_at join; skipped for now
          last_applied_at: rows[0]?.proposed_at ?? null,
        };
      });
    }
  }

  // ── Price formula batch proposals (7 batches, awaiting_facu tab only) ──
  let batchProposals: BatchProposal[] = [];
  let deployedSha: string | undefined;
  let deployedAt: string | undefined;
  if (status === 'awaiting_facu') {
    const { data: batchRaw } = await backup
      .from('admin_proposals')
      .select('id, urgency_tier, source_rationale, before_value, after_value')
      .eq('proposal_type', 'price.formula_review.batch')
      .like('proposed_by', 'Job_PM%')
      .eq('status', 'pending')
      .order('proposed_at', { ascending: true });
    batchProposals = ((batchRaw ?? []) as Array<{
      id: string;
      urgency_tier: string | null;
      source_rationale: string | null;
      before_value: Record<string, unknown> | null;
      after_value: Record<string, unknown> | null;
    }>).map(r => ({
      id: r.id,
      urgency_tier: r.urgency_tier ?? 'routine',
      source_rationale: r.source_rationale ?? '',
      before_value: r.before_value as BatchProposal['before_value'],
      after_value: r.after_value as BatchProposal['after_value'],
    }));

    try {
      const versionRes = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.floropolis.com'}/api/__version`,
        { cache: 'no-store' },
      );
      if (versionRes.ok) {
        const vj = await versionRes.json() as { sha?: string; deployed_at?: string };
        deployedSha = vj.sha;
        deployedAt = vj.deployed_at;
      }
    } catch {
      // non-fatal — card footer shows 'unknown'
    }
  }






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
        .from('v_catalog_admin')
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
      .from('v_catalog_admin')
      .select('sku_id', { count: 'exact', head: true });
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
  // Exclude price.formula_reset proposals — handled by separate batch panel.
  const visibleRows = rows.filter((p) => p.type !== 'price.formula_reset');
  const vms: ProposalRowVm[] = visibleRows.map((p) => {
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
      payload_raw: p.payload,
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
    <>
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

        {/* Supply quality bar — always visible, shows current state + corrections in flight */}
        <SupplyQualityBar
          blockedCount={supplyBlockedCount}
          publishableCount={supplyPublishableCount}
          perfectCount={supplyPerfectCount}
          totalCount={supplyTotalCount}
          pendingCorrections={pendingCorrections}
          historicalMetrics={historicalMetrics}
          potentialUnlocks={batchProposals.map((p) => ({
            label: p.source_rationale || `Batch ${p.id.slice(0, 8)}`,
            sku_count: (p.before_value?.batch_size as number | undefined) ?? 0,
            panel: 'batch_proposals',
          } satisfies PotentialUnlock))}
        />

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

        {/* Price formula batch proposals — 7 batches v2 (SYMPTOM + ROOT CAUSE + FIX + DEPENDENCIES + DEPLOYMENT VERIFICATION) */}
        {status === 'awaiting_facu' && batchProposals.length > 0 && (
          <BatchPriceProposalPanel
            proposals={batchProposals}
            deployedSha={deployedSha}
            deployedAt={deployedAt}
          />
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
    </>
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
