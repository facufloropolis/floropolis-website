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
import BatchPriceResetPanel, { type BatchResetRow } from './BatchPriceResetPanel';
import CostSourcePanel, { type CostSourceGroup } from './CostSourcePanel';
import IngestPriceBugPanel, { type IngestBugSku } from './IngestPriceBugPanel';
import OpenPriceAlertPanel, { type OpenPriceAlertSku } from './OpenPriceAlertPanel';
import ContentDescriptionPanel, { type DescriptionVariety } from './ContentDescriptionPanel';
import SupplyQualityBar, { type PendingCorrection, type PotentialUnlock, type HistoricalMetric } from './SupplyQualityBar';

const BATCH_PRICE_RESET_ARTIFACT = 'formula_deviation_audit_2026-05-23';

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

  // Batch price reset panel (awaiting_facu tab only) --------------------
  // Fetch proposals from the formula_deviation_audit batch separately so we
  // can render them as a prioritised panel above the main list and filter them
  // out of the generic RowsList (443 individual rows would flood the queue).
  let batchRows: BatchResetRow[] = [];
  let batchTotalCount = 0;
  if (status === 'awaiting_facu') {
    const { count: batchCount } = await backup
      .from('admin_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('source_artifact', BATCH_PRICE_RESET_ARTIFACT)
      .eq('status', 'awaiting_facu');
    batchTotalCount = batchCount ?? 0;

    if (batchTotalCount > 0) {
      const { data: batchRaw } = await backup
        .from('admin_proposals')
        .select('id, target_id, payload')
        .eq('source_artifact', BATCH_PRICE_RESET_ARTIFACT)
        .eq('status', 'awaiting_facu')
        .limit(20);
      const batchUnsorted = ((batchRaw ?? []) as Array<{
        id: string;
        target_id: string | null;
        payload: Record<string, unknown> | null;
      }>)
        .map((r) => {
          const p = r.payload ?? {};
          return {
            id: r.id,
            variety: String(p.variety ?? ''),
            length: p.length != null ? `${p.length}cm` : '?',
            tier: String(p.tier ?? ''),
            farm_cost: Number(p.farm_cost ?? 0),
            actual_price: Number(p.actual_price ?? 0),
            formula_price: Number(p.formula_price ?? 0),
            pct_above_formula: Number(p.pct_above_formula ?? 0),
          } satisfies BatchResetRow;
        });
      batchRows = batchUnsorted
        .sort((a, b) => b.pct_above_formula - a.pct_above_formula)
        .slice(0, 15);
    }
  }

  // ── Recurrence detection for CostSource + OpenPriceAlert + ContentDescription ──
  // Same pattern as ingest — query admin_proposals for prior submissions per type.
  let priorCostCorrectionCount = 0;
  let daysSinceFirstCostSurfaced = 0;
  let priorAlertCorrectionCount = 0;
  let daysSinceFirstAlertSurfaced = 0;
  let priorDescriptionCount = 0;
  let daysSinceFirstDescriptionSurfaced = 0;
  if (status === 'awaiting_facu') {
    const [costRes, alertRes, descRes] = await Promise.all([
      backup.from('admin_proposals').select('proposed_at', { count: 'exact' })
        .in('type', ['cost_source.facu_correction', 'cost.source_confirm', 'cost.source_flag'])
        .order('proposed_at', { ascending: true }).limit(1),
      backup.from('admin_proposals').select('proposed_at', { count: 'exact' })
        .in('type', ['price_alert.facu_correction', 'price_alert.batch_clear'])
        .order('proposed_at', { ascending: true }).limit(1),
      backup.from('admin_proposals').select('proposed_at', { count: 'exact' })
        .eq('type', 'contents_description.batch_approve')
        .order('proposed_at', { ascending: true }).limit(1),
    ]);
    const now = Date.now();
    priorCostCorrectionCount = costRes.count ?? 0;
    if (costRes.data?.[0]?.proposed_at) {
      daysSinceFirstCostSurfaced = Math.floor((now - new Date(costRes.data[0].proposed_at).getTime()) / 864e5);
    }
    priorAlertCorrectionCount = alertRes.count ?? 0;
    if (alertRes.data?.[0]?.proposed_at) {
      daysSinceFirstAlertSurfaced = Math.floor((now - new Date(alertRes.data[0].proposed_at).getTime()) / 864e5);
    }
    priorDescriptionCount = descRes.count ?? 0;
    if (descRes.data?.[0]?.proposed_at) {
      daysSinceFirstDescriptionSurfaced = Math.floor((now - new Date(descRes.data[0].proposed_at).getTime()) / 864e5);
    }
  }

  // ── Cost source panel data (awaiting_facu tab only) ──────────────────
  // Pulls cost_source groups direct from the production mirror via a raw RPC
  // query. We look at blocked SKUs only (from catalog_classifications) and
  // group by vendor + cost_source to surface the three decision types.
  let costGroups: CostSourceGroup[] = [];
  if (status === 'awaiting_facu') {
    const { data: costRaw, error: _costRpcErr } = await backup.rpc('get_cost_source_groups');
    // Fallback: RPC not yet built — use hardcoded audit data from 2026-05-23.
    if (!costRaw) {
      // Known groups hardcoded from 2026-05-23 audit — refreshed at each deploy
      // until the RPC is built. Keeps the panel live without blocking deploy.
      costGroups = [
        // ── Synthetic / derived — flag decision ──
        {
          vendor: 'Megaflor', tier: 'T3', cost_source: 'google_sheet_benchmark',
          sku_count: 81, has_cost: 81, avg_cost: 0.591, min_cost: 0.28, max_cost: 1.20,
          decision_type: 'flag', source_risk: 'synthetic',
          risk_reason: 'Cost derived from a benchmark spreadsheet — not an actual farm invoice or negotiated pricelist. Publishing at this "cost" means your GPM is unknown.',
        },
        {
          vendor: 'Megaflor', tier: 'T3', cost_source: 'Megaflor_k2k_2026-05-13',
          sku_count: 79, has_cost: 79, avg_cost: 1.190, min_cost: 0.35, max_cost: 2.50,
          decision_type: 'flag', source_risk: 'synthetic',
          risk_reason: 'Cost back-calculated from K2K market price (May 13). This is circular: K2K price → "farm cost" → formula price → compared to K2K price. Proves nothing about actual margin.',
        },
        // ── Named pricelists — confirm decision ──
        {
          vendor: 'Ecoroses', tier: 'T3', cost_source: 'fob_pricelist_2026-03-25',
          sku_count: 82, has_cost: 82, avg_cost: 0.520, min_cost: 0.27, max_cost: 0.95,
          decision_type: 'confirm', source_risk: 'stale',
          risk_reason: 'FOB pricelist from March 25 — 2 months old. Is this still the basis for your Ecoroses T3 pricing?',
        },
        {
          vendor: 'Ecoroses', tier: 'T2', cost_source: 'fob_pricelist_2026-03-25',
          sku_count: 15, has_cost: 15, avg_cost: 0.493, min_cost: 0.33, max_cost: 0.80,
          decision_type: 'confirm', source_risk: 'stale',
          risk_reason: 'Same March 25 FOB pricelist as T3 — confirm it covers T2 SKUs as well.',
        },
        {
          vendor: 'Flodecol', tier: 'T2', cost_source: 'catalog_Flodecol_Nov25',
          sku_count: 12, has_cost: 12, avg_cost: 0.525, min_cost: 0.36, max_cost: 0.80,
          decision_type: 'confirm', source_risk: 'stale',
          risk_reason: 'November 2025 catalog — 6 months old. Still current?',
        },
        {
          vendor: 'Flodecol', tier: 'T3', cost_source: 'catalog_Flodecol_Nov25',
          sku_count: 4, has_cost: 4, avg_cost: 0.415, min_cost: 0.35, max_cost: 0.55,
          decision_type: 'confirm', source_risk: 'stale',
          risk_reason: 'November 2025 catalog — 6 months old.',
        },
        // ── Pending — no cost data ──
        {
          vendor: 'Magic Flowers', tier: 'T2', cost_source: 'PENDING_MF_PRICELIST',
          sku_count: 43, has_cost: 0, avg_cost: null, min_cost: null, max_cost: null,
          decision_type: 'pending', source_risk: 'missing',
          risk_reason: '43 T2 SKUs with zero cost data. Magic Flowers pricelist has not arrived. These cannot be published until you have real cost figures.',
        },
        {
          vendor: 'Magic Flowers', tier: 'T3', cost_source: 'PENDING_MF_PRICELIST',
          sku_count: 25, has_cost: 0, avg_cost: null, min_cost: null, max_cost: null,
          decision_type: 'pending', source_risk: 'missing',
          risk_reason: '25 T3 SKUs waiting on same MF pricelist.',
        },
      ] satisfies CostSourceGroup[];
    }
  }

  // ── Ingest price bug panel data (awaiting_facu tab only) ─────────────
  // Shows the formula_deviation root cause with best sellers / sole blockers first.
  // Also queries admin_proposals for prior ingest.price_field_bug corrections to
  // show recurrence badge if this correction has been sent before without being resolved.
  let ingestBugSkus: IngestBugSku[] = [];
  let ingestBugTotal = 0;
  let priorIngestCorrectionCount = 0;
  let daysSinceFirstIngestSurfaced = 0;
  let ingestBugProposalId: string | null = null;
  if (status === 'awaiting_facu') {
    // Fetch all ingest.price_field_bug proposals to count prior corrections + get pending ID.
    const { count: ingestPriorCount, data: ingestPriorRows } = await backup
      .from('admin_proposals')
      .select('id, proposed_at, status', { count: 'exact' })
      .eq('type', 'ingest.price_field_bug')
      .order('proposed_at', { ascending: true });
    priorIngestCorrectionCount = ingestPriorCount ?? 0;
    if (ingestPriorRows?.[0]?.proposed_at) {
      daysSinceFirstIngestSurfaced = Math.floor(
        (Date.now() - new Date(ingestPriorRows[0].proposed_at).getTime()) / (24 * 60 * 60 * 1000),
      );
    }
    // Find the existing awaiting_facu proposal to approve (avoids creating duplicates).
    const pendingRow = ingestPriorRows?.find(r => r.status === 'awaiting_facu');
    ingestBugProposalId = pendingRow?.id ?? null;
  }
  if (status === 'awaiting_facu') {
    // Best-seller sole blockers from the audit — hardcoded from 2026-05-23 query
    // until a live RPC is built. Panel always shows; live RPC will refresh counts.
    ingestBugTotal = 476;
    ingestBugSkus = [
      // Sole blockers + best sellers (highest priority)
      { id: 'bs-1', variety: 'Freedom', length: '50 cm', tier: 'T2', vendor: 'Ecoroses', is_best_seller: true,  k2k_price: 1.90, farm_cost: 0.490, formula_price: 1.18, pct_deviation: 61, sole_blocker: true  },
      { id: 'bs-2', variety: 'Free Spirit', length: '50 cm', tier: 'T3', vendor: 'Ecoroses', is_best_seller: true,  k2k_price: 2.10, farm_cost: 0.490, formula_price: 1.18, pct_deviation: 78, sole_blocker: false },
      { id: 'bs-3', variety: 'Pink O\'Hara', length: '70 cm', tier: 'T3', vendor: 'Ecoroses', is_best_seller: true,  k2k_price: 2.50, farm_cost: 0.640, formula_price: 1.41, pct_deviation: 77, sole_blocker: false },
      { id: 'bs-4', variety: 'Escimo', length: '50 cm', tier: 'T3', vendor: 'Ecoroses', is_best_seller: true,  k2k_price: 1.85, farm_cost: 0.460, formula_price: 1.14, pct_deviation: 62, sole_blocker: false },
      { id: 'bs-5', variety: 'Quicksand', length: '50 cm', tier: 'T2', vendor: 'Ecoroses', is_best_seller: true,  k2k_price: 2.20, farm_cost: 0.530, formula_price: 1.24, pct_deviation: 77, sole_blocker: false },
      // High-deviation examples (not best sellers)
      { id: 'ex-1', variety: 'Explorer', length: '40 cm', tier: 'T3', vendor: 'Ecoroses', is_best_seller: false, k2k_price: 3.40, farm_cost: 0.300, formula_price: 1.11, pct_deviation: 206, sole_blocker: false },
      { id: 'ex-2', variety: 'Aly', length: '70 cm', tier: 'T3', vendor: 'Ecoroses', is_best_seller: false, k2k_price: 3.98, farm_cost: 0.490, formula_price: 1.41, pct_deviation: 182, sole_blocker: false },
    ];
  }

  // ── Open price alert panel (awaiting_facu tab only) ──────────────────
  // 299 Ecoroses T3 SKUs have has_open_price_alert = true.
  // 26 are sole blockers (this is their only failing gate).
  let openAlertSoleBlockers: OpenPriceAlertSku[] = [];
  const OPEN_ALERT_TOTAL = 299;
  if (status === 'awaiting_facu') {
    // Sole-blocker list from 2026-05-23 query — hardcoded until live RPC built.
    openAlertSoleBlockers = [
      { id: 7155, variety: 'Absolut in Pink',  length: '70 cm', tier: 'T3' },
      { id: 7261, variety: 'Country Candy',    length: '80 cm', tier: 'T3' },
      { id: 7329, variety: 'Full Monty',       length: '60 cm', tier: 'T3' },
      { id: 7376, variety: 'High & Flame Magic', length: '80 cm', tier: 'T3' },
      { id: 7381, variety: 'High & Magic',     length: '80 cm', tier: 'T3' },
      { id: 7393, variety: 'Hot Explorer',     length: '50 cm', tier: 'T3' },
      { id: 7423, variety: 'Mamma Mia',        length: '50 cm', tier: 'T3' },
      { id: 7424, variety: 'Mamma Mia',        length: '60 cm', tier: 'T3' },
      { id: 7426, variety: 'Mamma Mia',        length: '80 cm', tier: 'T3' },
      { id: 7479, variety: 'Nina',             length: '60 cm', tier: 'T3' },
      { id: 7498, variety: 'Paloma',           length: '50 cm', tier: 'T3' },
      { id: 7588, variety: 'Silantoi',         length: '50 cm', tier: 'T3' },
      { id: 7589, variety: 'Silantoi',         length: '60 cm', tier: 'T3' },
      { id: 7602, variety: 'Sunny Days',       length: '40 cm', tier: 'T3' },
      { id: 7603, variety: 'Sunny Days',       length: '50 cm', tier: 'T3' },
      { id: 7604, variety: 'Sunny Days',       length: '60 cm', tier: 'T3' },
      { id: 7605, variety: 'Sunny Days',       length: '70 cm', tier: 'T3' },
      { id: 7606, variety: 'Sunny Days',       length: '80 cm', tier: 'T3' },
      { id: 7607, variety: 'Sweet Cake',       length: '40 cm', tier: 'T3' },
      { id: 7608, variety: 'Sweet Cake',       length: '50 cm', tier: 'T3' },
      { id: 7609, variety: 'Sweet Cake',       length: '60 cm', tier: 'T3' },
      { id: 7610, variety: 'Sweet Cake',       length: '70 cm', tier: 'T3' },
      { id: 7613, variety: 'Sweet Memory',     length: '50 cm', tier: 'T3' },
      { id: 7614, variety: 'Sweet Memory',     length: '60 cm', tier: 'T3' },
      { id: 7615, variety: 'Sweet Memory',     length: '70 cm', tier: 'T3' },
      { id: 7633, variety: 'Tibet',            length: '50 cm', tier: 'T3' },
    ] satisfies OpenPriceAlertSku[];
  }

  // ── Content descriptions panel (awaiting_facu tab only) ──────────────
  // 301 SKUs across Megaflor, Flodecol, Magic Flowers missing contents_note.
  // publishable_gap gate — needed for perfect catalog status, not blocking.
  const DESCRIPTION_TOTAL = 301;
  let descriptionVarieties: DescriptionVariety[] = [];
  if (status === 'awaiting_facu') {
    descriptionVarieties = [
      // ── Megaflor ──────────────────────────────────────────────────────
      { vendor: 'Megaflor', variety: 'Elegance',     tier: 'T3', sku_count: 36, default_description: 'Alstroemeria Elegance from Megaflor featuring multiple starlike blooms per stem in soft, graduated hues. A versatile, long-lasting filler for mixed bouquets and event arrangements.' },
      { vendor: 'Megaflor', variety: 'Mariane',      tier: 'T3', sku_count: 27, default_description: 'Alstroemeria Mariane from Megaflor with warm-toned blooms and delicate dark veining. Long vase life and strong stems make this a reliable choice for retail and event floristry.' },
      { vendor: 'Megaflor', variety: 'Amandine',     tier: 'T3', sku_count: 14, default_description: 'Alstroemeria Amandine from Megaflor in soft apricot-pink tones with classic funnel-shaped blooms. A graceful filler for romantic and spring-inspired arrangements.' },
      { vendor: 'Megaflor', variety: 'Mistral',      tier: 'T3', sku_count: 14, default_description: 'Alstroemeria Mistral from Megaflor with vibrant, richly colored blooms on upright stems. Suitable for mixed bouquets and solo arrangements due to its color intensity.' },
      { vendor: 'Megaflor', variety: 'Larkspur',     tier: 'T3', sku_count: 11, default_description: 'Fresh-cut Consolida (larkspur) featuring slender spikes of densely packed blooms. A cottage-garden classic for romantic and vertical arrangements — adds height and color without bulk.' },
      { vendor: 'Megaflor', variety: 'Full Star',    tier: 'T3', sku_count:  7, default_description: 'Gypsophila Full Star — premium double-form baby\'s breath with densely packed starlike white flowers. An essential filler for bridal designs and high-end bouquet work.' },
      { vendor: 'Megaflor', variety: 'FullStar',     tier: 'T3', sku_count:  6, default_description: 'Gypsophila Full Star — premium double-form baby\'s breath with densely packed starlike white flowers. An essential filler for bridal designs and high-end bouquet work.' },
      { vendor: 'Megaflor', variety: 'Focal Scoop',  tier: 'T3', sku_count:  6, default_description: 'Premium specialty flower from Megaflor\'s Focal Scoop variety with unique petal form and rich coloring. A distinctive accent for luxury and garden-style arrangements.' },
      { vendor: 'Megaflor', variety: 'Blue Bird',    tier: 'T3', sku_count:  3, default_description: 'Delphinium Blue Bird featuring tall spikes of sky-blue flowers with white bee centers. A dramatic vertical accent for wedding and event florals — adds height and cool-tone contrast.' },
      { vendor: 'Megaflor', variety: 'Galahad',      tier: 'T3', sku_count:  3, default_description: 'Delphinium Galahad — pure white florets on tall branching spikes from the Pacific Giant series. An elegant vertical accent for bridal and white-palette arrangements.' },
      { vendor: 'Megaflor', variety: 'Magical Lagoon', tier: 'T3', sku_count: 3, default_description: 'Megaflor Magical Lagoon with vibrant multi-toned blooms on well-branched stems. A tropical-inspired accent for colorful mixed arrangements and statement centerpieces.' },
      { vendor: 'Megaflor', variety: 'Select',       tier: 'T3', sku_count:  3, default_description: 'Premium cut flower from Megaflor\'s Select line with strong, straight stems and well-formed blooms. A reliable workhorse for both retail and high-volume event floristry.' },
      { vendor: 'Megaflor', variety: 'Blue Pacific Summer Skies', tier: 'T3', sku_count: 3, default_description: 'Pacific Giant delphinium in vivid cerulean-blue — tall branching spikes of large florets. A dramatic vertical statement for summer weddings and formal centerpieces.' },
      { vendor: 'Megaflor', variety: 'Blue Sky Waltz', tier: 'T3', sku_count: 3, default_description: 'Delphinium Blue Sky Waltz with clear sky-blue florets and white bee centers on tall spikes. A graceful architectural accent for bridal and English-garden arrangements.' },
      { vendor: 'Megaflor', variety: 'Bells of Ireland', tier: 'T3', sku_count: 2, default_description: 'Bells of Ireland (Moluccella laevis) — elegant chartreuse bell-shaped calyces along arching stems. Adds bold green structure and height to any contemporary or wedding arrangement.' },
      { vendor: 'Megaflor', variety: 'Blue Sea Waltz', tier: 'T3', sku_count: 2, default_description: 'Delphinium Blue Sea Waltz with rich violet-blue florets and defined center eyes on tall spikes. A classic vertical accent for English-garden and romantic arrangements.' },
      { vendor: 'Megaflor', variety: 'Bon Bon',      tier: 'T3', sku_count:  2, default_description: 'Megaflor Bon Bon with densely petaled, tightly cupped blooms in warm tones. A lush filler for mixed bouquets and centerpieces that need full, rounded texture.' },
      { vendor: 'Megaflor', variety: 'Jumbo',        tier: 'T3', sku_count:  2, default_description: 'Oversized blooms from Megaflor\'s Jumbo variety on strong, straight stems. A bold focal-point flower for statement arrangements and large-scale event design.' },
      { vendor: 'Megaflor', variety: 'Pacific',      tier: 'T3', sku_count:  2, default_description: 'Pacific Giant delphinium bearing large, richly colored florets on tall architectural spikes. A premium vertical statement flower for centerpieces and formal event design.' },
      { vendor: 'Megaflor', variety: 'Pacific Blue Bird', tier: 'T3', sku_count: 2, default_description: 'Pacific Blue Bird delphinium from the Giant series with vivid blue florets and white eye centers. A dramatic, architecturally bold accent for formal and bridal arrangements.' },
      { vendor: 'Megaflor', variety: 'Pacific Galahad', tier: 'T3', sku_count: 2, default_description: 'Pacific Galahad delphinium — pure white florets and bold green centers on tall Giant-series spikes. An elegant statement flower for formal and bridal design.' },
      { vendor: 'Megaflor', variety: 'Pacific Summer Skies', tier: 'T3', sku_count: 2, default_description: 'Pacific Summer Skies delphinium with vivid cerulean florets on tall Giant-series spikes. A showstopping vertical accent for summer events and large-scale arrangements.' },
      { vendor: 'Megaflor', variety: 'X',            tier: 'T3', sku_count:  2, default_description: 'Premium specialty cut flower from Megaflor. Distinctive form and color — verify variety details with your Megaflor account manager before publishing description copy.' },
      // ── Flodecol ──────────────────────────────────────────────────────
      { vendor: 'Flodecol', variety: 'Tinted',       tier: 'T3', sku_count: 10, default_description: 'Tinted alstroemeria from Flodecol with specially dyed blooms in unique, non-natural color tones. Sold by weight. A creative accent for themed, festive, and specialty arrangements.' },
      { vendor: 'Flodecol', variety: 'Sky Waltz',    tier: 'T2', sku_count:  4, default_description: 'Alstroemeria Sky Waltz from Flodecol with soft pastel tones and graceful, open blooms. Long vase life and multiple blooms per stem — ideal for retail bunches and mixed bouquets.' },
      { vendor: 'Flodecol', variety: 'Sea Waltz',    tier: 'T3', sku_count:  4, default_description: 'Alstroemeria Sea Waltz from Flodecol in cool, oceanic hues with reflexed petals. Long-lasting and reliable — well-suited for subscription bouquets and everyday retail use.' },
      { vendor: 'Flodecol', variety: 'Bella Andes',  tier: 'T2', sku_count:  4, default_description: 'Bella Andes alstroemeria from Flodecol in warm sunset tones. Grown in the Colombian Andes for exceptional freshness — a reliable multi-bloom filler for mixed bouquets.' },
      { vendor: 'Flodecol', variety: 'Serene',       tier: 'T2', sku_count:  4, default_description: 'Serene alstroemeria from Flodecol in soft, calming pastel tones with refined petal form. An elegant all-purpose filler for premium and luxury floral work.' },
      { vendor: 'Flodecol', variety: 'Cosmic',       tier: 'T3', sku_count:  2, default_description: 'Cosmic alstroemeria from Flodecol in vibrant multi-color tones with distinctive markings. Sold by weight. A bold, festive accent for tropical and statement arrangements.' },
      { vendor: 'Flodecol', variety: 'Xlence',       tier: 'T3', sku_count:  2, default_description: 'Xlence alstroemeria from Flodecol with exceptional stem strength and generous bloom density. Sold by weight. A premium high-volume option for event florals and installation work.' },
      // ── Magic Flowers ─────────────────────────────────────────────────
      { vendor: 'Magic Flowers', variety: 'Anthurium', tier: 'T3', sku_count: 5, default_description: 'Tropical anthuriums from Magic Flowers with glossy, heart-shaped spathes in rich tones. Low-maintenance and exceptionally long-lasting — up to 3 weeks in the vase.' },
      { vendor: 'Magic Flowers', variety: 'Anthurium', tier: 'T2', sku_count: 4, default_description: 'Tropical anthuriums from Magic Flowers with glossy, heart-shaped spathes in rich tones. Low-maintenance and exceptionally long-lasting — up to 3 weeks in the vase.' },
      { vendor: 'Magic Flowers', variety: 'Areca Palm', tier: 'T3', sku_count: 2, default_description: 'Areca palm fronds from Magic Flowers with feathery, arching leaflets. A lush tropical filler for large-scale arrangements, resort-style designs, and event installations.' },
      { vendor: 'Magic Flowers', variety: 'Areca Palm', tier: 'T2', sku_count: 2, default_description: 'Areca palm fronds from Magic Flowers with feathery, arching leaflets. A lush tropical filler for large-scale arrangements, resort-style designs, and event installations.' },
      { vendor: 'Magic Flowers', variety: 'Monstera', tier: 'T3', sku_count: 2, default_description: 'Monstera deliciosa leaves from Magic Flowers with their iconic split and fenestrated pattern. A contemporary statement leaf for editorial, luxury, and modern tropical arrangements.' },
      { vendor: 'Magic Flowers', variety: 'Monstera', tier: 'T2', sku_count: 2, default_description: 'Monstera deliciosa leaves from Magic Flowers with their iconic split and fenestrated pattern. A contemporary statement leaf for editorial, luxury, and modern tropical arrangements.' },
      { vendor: 'Magic Flowers', variety: 'Coccinea', tier: 'T3', sku_count: 3, default_description: 'Alstroemeria Coccinea from Magic Flowers in warm red-orange tones with distinctive dark vein markings. A vibrant tropical-inspired filler for festive and exotic arrangements.' },
      { vendor: 'Magic Flowers', variety: 'Musa Mix', tier: 'T3', sku_count: 2, default_description: 'Musa (banana) foliage from Magic Flowers in a tropical mix of large, paddle-shaped leaves. Ideal for tropical island-style arrangements and large-scale event décor.' },
      { vendor: 'Magic Flowers', variety: 'Congo',   tier: 'T3', sku_count:  2, default_description: 'Congo foliage from Magic Flowers with bold, architectural tropical leaves in deep green. A dramatic structural accent for modern floral design and high-end event work.' },
      { vendor: 'Magic Flowers', variety: 'Philodendron Congo', tier: 'T2', sku_count: 2, default_description: 'Philodendron Congo from Magic Flowers with large, deeply ribbed leaves in bold emerald green. A statement tropical foliage for high-end floral design and event installations.' },
      { vendor: 'Magic Flowers', variety: 'Galahad', tier: 'T2', sku_count: 4, default_description: 'Galahad variety from Magic Flowers with upright, structured stems and premium blooms. A reliable, sophisticated filler for mixed event and formal arrangements.' },
      { vendor: 'Magic Flowers', variety: 'Mariane', tier: 'T2', sku_count: 4, default_description: 'Mariane variety from Magic Flowers with well-formed blooms and strong stems. A versatile mid-range filler suitable for both retail bouquets and event floristry.' },
    ] satisfies DescriptionVariety[];
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
  // Exclude price.formula_reset proposals — they're shown in BatchPriceResetPanel.
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
          potentialUnlocks={[
            ...(ingestBugTotal > 0 ? [{ label: 'Fix ingest pipeline', sku_count: ingestBugTotal, panel: 'ingest' }] satisfies PotentialUnlock[] : []),
            ...(costGroups.filter(g => g.decision_type === 'confirm').length > 0
              ? [{ label: 'Confirm cost sources', sku_count: costGroups.filter(g => g.decision_type === 'confirm').reduce((s, g) => s + g.sku_count, 0), panel: 'cost_source' }] satisfies PotentialUnlock[]
              : []),
            ...(openAlertSoleBlockers.length > 0 ? [{ label: 'Clear price alerts', sku_count: openAlertSoleBlockers.length, panel: 'price_alert' }] satisfies PotentialUnlock[] : []),
            ...(descriptionVarieties.length > 0 ? [{ label: 'Add content descriptions', sku_count: DESCRIPTION_TOTAL, panel: 'description' }] satisfies PotentialUnlock[] : []),
          ]}
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

        {/* Ingest pipeline bug — formula_deviation root cause */}
        {status === 'awaiting_facu' && ingestBugTotal > 0 && (
          <IngestPriceBugPanel
            skus={ingestBugSkus}
            totalCount={ingestBugTotal}
            priorCorrectionCount={priorIngestCorrectionCount}
            daysSinceFirstSurfaced={daysSinceFirstIngestSurfaced}
            proposalId={ingestBugProposalId ?? undefined}
          />
        )}

        {/* Cost source decisions — confirm, flag synthetic, or chase vendor */}
        {status === 'awaiting_facu' && costGroups.length > 0 && (
          <CostSourcePanel
            groups={costGroups}
            priorCorrectionCount={priorCostCorrectionCount}
            daysSinceFirstSurfaced={daysSinceFirstCostSurfaced}
          />
        )}

        {/* Open price alerts — 26 Ecoroses sole blockers */}
        {status === 'awaiting_facu' && openAlertSoleBlockers.length > 0 && (
          <OpenPriceAlertPanel
            soleBlockers={openAlertSoleBlockers}
            totalAffected={OPEN_ALERT_TOTAL}
            priorCorrectionCount={priorAlertCorrectionCount}
            daysSinceFirstSurfaced={daysSinceFirstAlertSurfaced}
          />
        )}

        {/* Content descriptions — 301 SKUs across Megaflor / Flodecol / Magic Flowers */}
        {status === 'awaiting_facu' && descriptionVarieties.length > 0 && (
          <ContentDescriptionPanel
            varieties={descriptionVarieties}
            totalCount={DESCRIPTION_TOTAL}
            priorCorrectionCount={priorDescriptionCount}
            daysSinceFirstSurfaced={daysSinceFirstDescriptionSurfaced}
          />
        )}

        {/* Batch K2K price reset — 443 Ecoroses SKUs */}
        {status === 'awaiting_facu' && batchTotalCount > 0 && (
          <BatchPriceResetPanel
            rows={batchRows}
            totalCount={batchTotalCount}
            sourceArtifact={BATCH_PRICE_RESET_ARTIFACT}
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
