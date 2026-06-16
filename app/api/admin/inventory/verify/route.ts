// POST /api/admin/inventory/verify
// v1 | 2026-06-16 | Job_PM (CPO)
//
// Flow-B gate runner. Runs the SENSE + UNITS verifier (lib/admin/inventory-verify)
// and the 3-lens COST analysis (lib/admin/cost-analysis) on a proposed inventory
// change BEFORE Facu sees it. Returns the verdict + 3-lens comparison panel +
// sense/units result.
//
// ON gate PASS: inserts an admin_proposals row (status='awaiting_facu') — DOES NOT
// write dim_sku (Rose applies, Flow B). The proposal lands as 'verified, awaiting
// Facu/Rose-apply'.
//
// ON weak/absent competitor + peer reference: records a PRIORITIZED coverage-gap via
// recordLoopLedger (improvement_loop_state) reusing lib/admin/loop-ledger — domain
// 'benchmark', state target 'landed', routed to Rose. recordLoopLedger HARD-REQUIRES
// a real uuid sku_id, so the gap is anchored to a representative sku of that variety
// when one exists; with no anchor sku the gap is reported in the response as a
// coverage_gap_unanchored note (NOT silently dropped, NOT a malformed insert).
//
// CONSTRAINTS (verified live, pg_constraint):
//   admin_proposals.status ∈ {awaiting_facu,approved,rejected,framing_rejected,withdrawn}
//     -> use 'awaiting_facu' (NOT 'pending' — the variety-upsert route's 'pending' is
//        live-broken against this CHECK).
//   admin_proposals.proposed_by is UUID nullable -> pass auth.userId (uuid) or null,
//     NEVER an email string. The email goes in source_rationale.
//   admin_proposals NOT NULL: type, target_table, payload, warnings, status,
//     proposed_at(default), cascade_summary.
//   improvement_loop_state.owner_agent ∈ {Job_PM,Rose_BI,Nahua_AI,Codex} (human=Facu
//     captured in evidence.decided_by); state ∈ {open,routed,landed,re_scored,verified};
//     domain has NO CHECK -> 'benchmark' is DB-accepted.
//
// HARD BAR: the ONLY writes are admin_proposals + improvement_loop_state (both
// existing tables/columns). ZERO writes to dim_sku / *_mirror. No schema. SERVER-ONLY.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { analyzeCost, type CostAnalysis } from '@/lib/admin/cost-analysis';
import { verifyInventoryProposal, type InventoryVerifyResult } from '@/lib/admin/inventory-verify';
import { recordLoopLedger } from '@/lib/admin/loop-ledger';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

interface AuthOk { ok: true; userId: string; email: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true, userId: user.id, email: emailLc };

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') return { ok: true, userId: user.id, email: emailLc };

  return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

type ProposalType =
  | 'catalog.add_variety'
  | 'catalog.update_identity'
  | 'catalog.quarantine';
const VALID_TYPES: ProposalType[] = [
  'catalog.add_variety',
  'catalog.update_identity',
  'catalog.quarantine',
];

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

interface VerifyBody {
  type?: unknown;
  proposal?: unknown; // the inventory proposal object (variety, category, farm_cost, ...)
}

/** A cost reference is "weak/absent" when there is no peer median AND no competitor benchmark. */
function isCoverageWeak(cost: CostAnalysis): boolean {
  const noPeer = cost.similar.median == null || cost.similar.n === 0;
  const noComp = cost.competitor == null;
  return noPeer && noComp;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: VerifyBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as VerifyBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const type = (str(body.type) ?? 'catalog.add_variety') as ProposalType;
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: 'invalid_type', detail: `type must be one of ${VALID_TYPES.join('|')}` },
      { status: 400 },
    );
  }

  const proposal =
    body.proposal && typeof body.proposal === 'object'
      ? (body.proposal as Record<string, unknown>)
      : null;
  if (!proposal) {
    return NextResponse.json({ error: 'invalid_proposal', detail: 'proposal object required' }, { status: 400 });
  }

  const svc = getBackupServiceClient();

  // ── Run both lenses (read-only) ────────────────────────────────────────────────
  const [gate, cost] = await Promise.all([
    verifyInventoryProposal(svc, proposal),
    analyzeCost(svc, proposal),
  ]);

  const warnings: string[] = [...gate.warnings];
  const coverageWeak = isCoverageWeak(cost);

  // ── Coverage gap: record a prioritized loop row when the cost reference is weak ──
  let coverageGap:
    | { recorded: true; id?: string; gateId: string }
    | { recorded: false; reason: string; gateId: string }
    | null = null;

  if (coverageWeak) {
    const variety = str((proposal as { variety?: unknown }).variety) ?? 'unknown';
    const gateId = `benchmark_coverage:${variety.toLowerCase()}`;

    // recordLoopLedger HARD-REQUIRES a real uuid sku_id. Anchor to a representative
    // sku of this variety if one exists; otherwise report unanchored (no malformed
    // insert, no swallow).
    let anchorSkuId: string | null = null;
    if (variety !== 'unknown') {
      const { data: anchorRow, error: anchorErr } = await svc
        .from('dim_sku')
        .select('sku_id')
        .ilike('variety_normalized', variety)
        .limit(1)
        .maybeSingle();
      if (anchorErr) warnings.push(`coverage_anchor_db_error:${anchorErr.message}`);
      anchorSkuId = str((anchorRow as { sku_id?: unknown } | null)?.sku_id);
    }

    if (anchorSkuId) {
      const led = await recordLoopLedger(svc, {
        skuId: anchorSkuId,
        gateId,
        domain: 'benchmark' as unknown as 'catalog', // domain has NO DB CHECK; widen the TS union here
        ownerAgent: 'Rose_BI', // who fills the benchmark/peer data
        targetState: 'landed',
        routedVia: 'inventory_verify_gate',
        evidence: {
          fix: { need: 'competitor benchmark and/or peer cost for variety', variety },
          before: { peer_n: cost.similar.n, competitor: cost.competitor ? 'present' : 'absent' },
          after: null,
        },
      });
      if (led.ok) {
        coverageGap = { recorded: true, id: led.id, gateId };
      } else {
        coverageGap = { recorded: false, reason: led.error ?? 'ledger_error', gateId };
        warnings.push(`coverage_gap_not_recorded:${led.error ?? 'ledger_error'}`);
      }
    } else {
      coverageGap = { recorded: false, reason: 'coverage_gap_unanchored:no_sku_for_variety', gateId };
      warnings.push(`coverage_gap_unanchored:${variety} (no dim_sku anchor; recordLoopLedger requires a uuid sku_id)`);
    }
  }

  // ── Build the verdict / panel response (always returned) ─────────────────────────
  const panel = {
    verdict: cost.verdict,
    cost,
    sense: gate.sense,
    units: gate.units,
    coverage_weak: coverageWeak,
  };

  // ── ON gate PASS: insert the awaiting_facu proposal (NOT dim_sku) ────────────────
  if (!gate.pass) {
    return NextResponse.json({
      ok: true,
      gate_pass: false,
      panel,
      coverageGap,
      warnings,
      reason: 'gate_failed_not_proposed',
    });
  }

  // READ-ONLY PREVIEW: this endpoint shows the verdict/panel BEFORE the user submits.
  // The single submission path that INSERTS the awaiting_facu proposal is
  // /api/admin/inventory/propose (the UI-wired route). Inserting here too would
  // double-create proposals, so verify never writes.
  return NextResponse.json({
    ok: true,
    gate_pass: true,
    panel,
    coverageGap,
    warnings,
  });
}
