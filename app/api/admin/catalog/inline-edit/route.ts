// POST /api/admin/catalog/inline-edit
// v1 | 2026-05-28 | Job_PM Catalog Ship 1 [V8 SHADOW]
//
// Body: {
//   sku_id: number,
//   gate: GateId,             // identifies which blocking gate is being fixed
//   target_field: string,     // floropolis_inventory_mirror column to UPDATE
//   before_value: unknown,    // current value (display context, not used as the write)
//   after_value: string,      // new value typed in the inline-edit panel
//   rationale: string         // mandatory; min 20 chars; written to BOTH
//                             //   admin_proposals.source_rationale AND
//                             //   admin_approvals.facu_rationale.
// }
//
// What this route does, in order:
//   1. Auth + admin gate (email allowlist or client_profiles.status='admin').
//   2. Validate body (target_field allowlist, after_value per gate, rationale len).
//   3. INSERT admin_proposals row:
//        type='mirror.field_correction',
//        target_table='floropolis_inventory_mirror',
//        target_id=sku_id,
//        payload={ field, before, after, gate },
//        status='awaiting_facu',
//        proposed_by=user_id,
//        source_rationale=rationale,
//        source_agent='Job_PM'.
//   4. IMMEDIATELY run the approve flow against the proposal just inserted:
//        - executeProposal() applies the UPDATE to floropolis_inventory_mirror
//        - override_audit rows inserted
//        - admin_approvals row inserted with facu_rationale=rationale
//        - admin_proposals row transitioned to status='approved'.
//
// Why steps 3+4 in one route (rather than a client-side two-hop): the inline
// edit is a single user gesture — type → submit → see row update. The proposal
// + approval are coupled in intent. A failure between steps leaves the
// proposal in 'awaiting_facu' for manual triage (visible in the approval queue).
//
// Maps to executor branch in lib/admin/proposal-executors.ts case
// 'mirror.field_correction' which UPDATEs the field on floropolis_inventory_mirror
// and writes the override_audit row capturing before/after JSONB.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import {
  executeProposal,
  type AdminProposal,
} from '@/lib/admin/proposal-executors';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

// Allowlist of target_field values (matches BlockingChips.CHIP_TARGET_FIELD).
const ALLOWED_FIELDS = new Set<string>([
  'cost_source',
  'price',
  'images',
  'unit',
  'vendor',
  'contents_note',
  'arrival_date',
]);

// Allowlist of gate IDs (matches BlockingChips.GateId).
const ALLOWED_GATES = new Set<string>([
  'missing_cost_source',
  'price_zero',
  'missing_image',
  'missing_unit',
  'missing_vendor_name',
  'missing_contents_description',
  't2_outside_5d_window',
  't3_outside_14d_window',
  'missing_arrival_date',
]);

const RATIONALE_MIN_CHARS = 20;
const RATIONALE_MAX_CHARS = 4000;

// ---------------------------------------------------------------------------
// Auth helper (same pattern as /api/admin/proposals/[id]/approve)
// ---------------------------------------------------------------------------

interface AuthOk { ok: true; userId: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true, userId: user.id };

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') return { ok: true, userId: user.id };

  return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

// ---------------------------------------------------------------------------
// Per-field value coercion + validation
// ---------------------------------------------------------------------------

interface CoercedValue {
  ok: true;
  // Value to PUT in admin_proposals.payload.after AND target on mirror UPDATE.
  // For 'images' this becomes ['<url>'] (jsonb string[]).
  // For 'price' this becomes a positive number.
  // For 'arrival_date' this is YYYY-MM-DD string.
  // Everything else: trimmed string.
  storedValue: unknown;
}
interface CoercedFail {
  ok: false;
  detail: string;
}

function coerceAfterValue(field: string, raw: string): CoercedValue | CoercedFail {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, detail: `${field} cannot be empty` };

  if (field === 'price') {
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, detail: 'price must be a positive number' };
    }
    return { ok: true, storedValue: n };
  }
  if (field === 'images') {
    if (trimmed.length > 600) {
      return { ok: false, detail: 'image url max 600 chars' };
    }
    // Light URL sanity check; full validation happens at DB constraint level.
    if (!/^https?:\/\//i.test(trimmed)) {
      return { ok: false, detail: 'image url must start with http:// or https://' };
    }
    return { ok: true, storedValue: [trimmed] };
  }
  if (field === 'arrival_date') {
    // Expect YYYY-MM-DD from the <input type="date"> control.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return { ok: false, detail: 'arrival_date must be YYYY-MM-DD' };
    }
    const t = new Date(trimmed + 'T00:00:00').getTime();
    if (!Number.isFinite(t)) return { ok: false, detail: 'arrival_date is not a real date' };
    return { ok: true, storedValue: trimmed };
  }
  if (field === 'unit') {
    const allowed = new Set(['Stem', 'Bunch', 'Box']);
    if (!allowed.has(trimmed)) {
      return { ok: false, detail: 'unit must be one of Stem, Bunch, Box' };
    }
    return { ok: true, storedValue: trimmed };
  }
  if (field === 'contents_note') {
    if (trimmed.length > 2000) {
      return { ok: false, detail: 'contents_note max 2000 chars' };
    }
    return { ok: true, storedValue: trimmed };
  }
  // cost_source, vendor — free text within bounds.
  if (trimmed.length > 400) {
    return { ok: false, detail: `${field} max 400 chars` };
  }
  return { ok: true, storedValue: trimmed };
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

interface InlineEditBody {
  sku_id?: unknown;
  gate?: unknown;
  target_field?: unknown;
  before_value?: unknown;
  after_value?: unknown;
  rationale?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: InlineEditBody;
  try {
    body = (await req.json()) as InlineEditBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  // Validate sku_id
  const skuId = typeof body.sku_id === 'number' ? body.sku_id : Number(body.sku_id);
  if (!Number.isFinite(skuId) || skuId <= 0) {
    return NextResponse.json({ error: 'invalid_sku_id' }, { status: 400 });
  }

  // Validate gate + target_field
  if (typeof body.gate !== 'string' || !ALLOWED_GATES.has(body.gate)) {
    return NextResponse.json({ error: 'invalid_gate' }, { status: 400 });
  }
  if (typeof body.target_field !== 'string' || !ALLOWED_FIELDS.has(body.target_field)) {
    return NextResponse.json({ error: 'invalid_target_field' }, { status: 400 });
  }
  const gate = body.gate;
  const targetField = body.target_field;

  // Validate after_value (must be a string from the form)
  if (typeof body.after_value !== 'string') {
    return NextResponse.json({ error: 'invalid_after_value' }, { status: 400 });
  }
  const coerced = coerceAfterValue(targetField, body.after_value);
  if (!coerced.ok) {
    return NextResponse.json(
      { error: 'invalid_after_value', detail: coerced.detail },
      { status: 400 },
    );
  }

  // Rationale (NOT NULL, captured into BOTH source_rationale AND facu_rationale)
  if (typeof body.rationale !== 'string') {
    return NextResponse.json({ error: 'invalid_rationale' }, { status: 400 });
  }
  const rationale = body.rationale.trim();
  if (rationale.length < RATIONALE_MIN_CHARS) {
    return NextResponse.json(
      {
        error: 'invalid_rationale',
        detail: `rationale must be at least ${RATIONALE_MIN_CHARS} chars`,
      },
      { status: 400 },
    );
  }
  const rationaleStored = rationale.slice(0, RATIONALE_MAX_CHARS);

  const service = getBackupServiceClient();

  // Confirm the SKU exists before opening a proposal (avoids stale rows).
  const { data: skuRow, error: skuErr } = await service
    .from('floropolis_inventory_mirror')
    .select('id')
    .eq('id', skuId)
    .maybeSingle();
  if (skuErr) {
    Sentry.captureException(skuErr, { tags: { route: 'admin/catalog/inline-edit', step: 'sku_read' } });
    return NextResponse.json({ error: 'sku_read_failed', detail: skuErr.message }, { status: 500 });
  }
  if (!skuRow) {
    return NextResponse.json({ error: 'sku_not_found' }, { status: 404 });
  }

  // -------------------------------------------------------------------------
  // Step A: insert admin_proposals row
  // -------------------------------------------------------------------------
  const proposalPayload = {
    field: targetField,
    gate,
    before: body.before_value ?? null,
    after: coerced.storedValue,
  };

  const { data: insertedProposal, error: insErr } = await service
    .from('admin_proposals')
    .insert({
      type: 'mirror.field_correction',
      target_table: 'floropolis_inventory_mirror',
      target_id: String(skuId),
      payload: proposalPayload,
      warnings: [],
      status: 'awaiting_facu',
      proposed_by: auth.userId,
      notes: null,
      source_agent: 'Job_PM',
      source_table: 'floropolis_inventory_mirror',
      source_id: String(skuId),
      source_rationale: rationaleStored,
      source_artifact: null,
      before_value: body.before_value ?? null,
      after_value: coerced.storedValue,
      filter_status: 'passed',
    })
    .select('*')
    .maybeSingle();
  if (insErr || !insertedProposal) {
    Sentry.captureException(insErr ?? new Error('admin_proposals_insert_returned_null'), {
      tags: { route: 'admin/catalog/inline-edit', step: 'proposal_insert' },
    });
    return NextResponse.json(
      { error: 'proposal_insert_failed', detail: insErr?.message ?? 'no_row_returned' },
      { status: 500 },
    );
  }
  const proposal = insertedProposal as AdminProposal;

  // -------------------------------------------------------------------------
  // Step B: auto-approve (same flow as /api/admin/proposals/[id]/approve)
  // executeProposal → override_audit insert → admin_approvals insert →
  // admin_proposals status=approved.
  // -------------------------------------------------------------------------
  const result = await executeProposal(proposal, service);
  if (!result.ok) {
    Sentry.captureMessage('inline_edit_executor_failed', {
      level: 'error',
      tags: {
        route: 'admin/catalog/inline-edit',
        proposal_type: proposal.type,
        gate,
      },
      extra: { proposal_id: proposal.id, error: result.error },
    });
    return NextResponse.json(
      {
        error: 'execution_failed',
        detail: result.error ?? 'unknown',
        proposal_id: proposal.id,
      },
      { status: 500 },
    );
  }

  if (result.auditEntries.length > 0) {
    const { error: auditErr } = await service
      .from('override_audit')
      .insert(result.auditEntries);
    if (auditErr) {
      Sentry.captureException(auditErr, {
        tags: { route: 'admin/catalog/inline-edit', step: 'audit_insert' },
        extra: { proposal_id: proposal.id },
      });
      // Don't bail — the mirror is already updated; the audit gap is logged.
    }
  }

  const { error: apprErr } = await service.from('admin_approvals').insert({
    proposal_id: proposal.id,
    decision: 'approve',
    decided_by: auth.userId,
    reason: null,
    facu_rationale: rationaleStored,
    urgency_tier: 'routine',
  });
  if (apprErr) {
    Sentry.captureException(apprErr, {
      tags: { route: 'admin/catalog/inline-edit', step: 'approval_insert' },
      extra: { proposal_id: proposal.id },
    });
  }

  const { error: updErr } = await service
    .from('admin_proposals')
    .update({ status: 'approved' })
    .eq('id', proposal.id);
  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { route: 'admin/catalog/inline-edit', step: 'status_update' },
      extra: { proposal_id: proposal.id },
    });
    return NextResponse.json(
      { error: 'status_update_failed', detail: updErr.message, proposal_id: proposal.id },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    proposal_id: proposal.id,
    audit_count: result.auditEntries.length,
  });
}
