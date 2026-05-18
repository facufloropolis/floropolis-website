// Approval-execution registry for admin_proposals.
// v1 | 2026-05-18 | Job_PM admin-foundation [V8 SHADOW]
//
// When Facu approves a proposal in /api/admin/proposals/[id]/approve, the route
// calls executeProposal(proposal, serviceClient). This file owns the mapping
// from proposal.type -> the actual write operation against the source table.
//
// Rules:
//   - Each executor returns { ok, error?, auditEntries }. The route inserts
//     auditEntries into override_audit AFTER a successful executor run.
//   - If executor returns ok=false, the route does NOT mark the proposal
//     approved and does NOT write override_audit. The Facu approval record is
//     also not committed (the route surfaces the error).
//   - Executors NEVER write override_audit themselves -- they just return the
//     before/after snapshots so the route can do one atomic batch insert.
//   - All DB reads/writes use the passed service-role client (bypasses RLS).
//
// Adding a new proposal type:
//   1. Add a case in the switch in executeProposal.
//   2. Implement the executor following the existing shape.
//   3. Wire UI to POST { type: <new>, target_table, target_id?, payload }.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AdminProposal {
  id: string;
  type: string;
  target_table: string;
  target_id: string | null;
  payload: Record<string, unknown>;
  warnings: unknown;
  status: string;
  proposed_by: string | null;
  proposed_at: string;
  notes: string | null;
}

export interface AuditEntry {
  proposal_id: string;
  target_table: string;
  target_id: string | null;
  before_jsonb: Record<string, unknown> | null;
  after_jsonb: Record<string, unknown> | null;
  applied_by_function: string;
}

export interface ExecutorResult {
  ok: boolean;
  error?: string;
  auditEntries: AuditEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(error: string): ExecutorResult {
  return { ok: false, error, auditEntries: [] };
}

function payloadObject(p: AdminProposal): Record<string, unknown> | null {
  if (!p.payload || typeof p.payload !== 'object' || Array.isArray(p.payload)) {
    return null;
  }
  return p.payload;
}

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

async function execBoxMasterUpdate(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');
  if (!proposal.target_id) return fail('missing_target_id');

  const { data: before, error: readErr } = await service
    .from('box_master')
    .select('*')
    .eq('box_type', proposal.target_id)
    .maybeSingle();
  if (readErr) return fail(`read_failed: ${readErr.message}`);
  if (!before) return fail('target_not_found');

  const { data: after, error: updErr } = await service
    .from('box_master')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('box_type', proposal.target_id)
    .select('*')
    .maybeSingle();
  if (updErr) return fail(`update_failed: ${updErr.message}`);

  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'box_master',
        target_id: proposal.target_id,
        before_jsonb: before as Record<string, unknown>,
        after_jsonb: (after ?? null) as Record<string, unknown> | null,
        applied_by_function: 'proposal-executors.execBoxMasterUpdate',
      },
    ],
  };
}

async function execPricingConstantsUpdate(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');
  if (!proposal.target_id) return fail('missing_target_id');

  const { data: before, error: readErr } = await service
    .from('pricing_constants')
    .select('*')
    .eq('id', proposal.target_id)
    .maybeSingle();
  if (readErr) return fail(`read_failed: ${readErr.message}`);
  if (!before) return fail('target_not_found');

  const update: Record<string, unknown> = {
    ...payload,
    updated_at: new Date().toISOString(),
  };
  if (proposal.proposed_by) update.updated_by = proposal.proposed_by;

  const { data: after, error: updErr } = await service
    .from('pricing_constants')
    .update(update)
    .eq('id', proposal.target_id)
    .select('*')
    .maybeSingle();
  if (updErr) return fail(`update_failed: ${updErr.message}`);

  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'pricing_constants',
        target_id: proposal.target_id,
        before_jsonb: before as Record<string, unknown>,
        after_jsonb: (after ?? null) as Record<string, unknown> | null,
        applied_by_function: 'proposal-executors.execPricingConstantsUpdate',
      },
    ],
  };
}

async function execShippingConfigCreate(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');

  const required = ['origin_country', 'dest_port', 'zone', 'effective_from'];
  for (const k of required) {
    if (payload[k] === undefined || payload[k] === null || payload[k] === '') {
      return fail(`missing_field: ${k}`);
    }
  }

  const insertRow = {
    ...payload,
    created_by_proposal_id: proposal.id,
  };

  const { data: after, error: insErr } = await service
    .from('shipping_config_v2')
    .insert(insertRow)
    .select('*')
    .maybeSingle();
  if (insErr) return fail(`insert_failed: ${insErr.message}`);

  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'shipping_config_v2',
        target_id: (after?.id as string | undefined) ?? null,
        before_jsonb: null,
        after_jsonb: (after ?? null) as Record<string, unknown> | null,
        applied_by_function: 'proposal-executors.execShippingConfigCreate',
      },
    ],
  };
}

async function execClientProfileStatusChange(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');
  if (!proposal.target_id) return fail('missing_target_id');

  const newStatus = payload.new_status;
  if (typeof newStatus !== 'string' || newStatus.length === 0) {
    return fail('invalid_new_status');
  }

  const { data: before, error: readErr } = await service
    .from('client_profiles')
    .select('*')
    .eq('user_id', proposal.target_id)
    .maybeSingle();
  if (readErr) return fail(`read_failed: ${readErr.message}`);
  if (!before) return fail('target_not_found');

  const { data: after, error: updErr } = await service
    .from('client_profiles')
    .update({ status: newStatus })
    .eq('user_id', proposal.target_id)
    .select('*')
    .maybeSingle();
  if (updErr) return fail(`update_failed: ${updErr.message}`);

  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'client_profiles',
        target_id: proposal.target_id,
        before_jsonb: before as Record<string, unknown>,
        after_jsonb: (after ?? null) as Record<string, unknown> | null,
        applied_by_function: 'proposal-executors.execClientProfileStatusChange',
      },
    ],
  };
}

// STUB: visibility_rule.create -- table doesn't exist yet. Records intent in
// override_audit so we can later replay/backfill once visibility_rules table lands.
async function execVisibilityRuleCreate(
  proposal: AdminProposal,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');
  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'visibility_rules',
        target_id: null,
        before_jsonb: null,
        after_jsonb: { stub: true, intended_payload: payload },
        applied_by_function: 'proposal-executors.execVisibilityRuleCreate[STUB]',
      },
    ],
  };
}

// discount_rule.create -- inserts a row into discount_rules with status='active'
// on Facu approval. The proposal payload must carry { scope, scope_value,
// discount_pct } at minimum; valid_from / valid_until / min_qty / notes are
// optional. created_by_proposal_id is stamped from the proposal so we can
// trace any active rule back to its approval.
async function execDiscountRuleCreate(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');

  const VALID_SCOPES = ['category', 'vendor', 'sku', 'client', 'client_category'];
  const scope = payload.scope;
  if (typeof scope !== 'string' || !VALID_SCOPES.includes(scope)) {
    return fail(`invalid_scope: must be one of ${VALID_SCOPES.join(', ')}`);
  }
  const scopeValue = payload.scope_value;
  if (typeof scopeValue !== 'string' || scopeValue.trim().length === 0) {
    return fail('invalid_scope_value');
  }
  const discountPctRaw = payload.discount_pct;
  const discountPct =
    typeof discountPctRaw === 'number'
      ? discountPctRaw
      : typeof discountPctRaw === 'string'
        ? Number(discountPctRaw)
        : NaN;
  if (!Number.isFinite(discountPct) || discountPct <= 0 || discountPct > 100) {
    return fail('invalid_discount_pct: must be (0, 100]');
  }

  const insertRow: Record<string, unknown> = {
    scope,
    scope_value: scopeValue.trim(),
    discount_pct: discountPct,
    status: 'active',
    created_by_proposal_id: proposal.id,
  };

  if (
    payload.valid_from !== undefined &&
    payload.valid_from !== null &&
    payload.valid_from !== ''
  ) {
    if (typeof payload.valid_from !== 'string') return fail('invalid_valid_from');
    insertRow.valid_from = payload.valid_from;
  }
  if (
    payload.valid_until !== undefined &&
    payload.valid_until !== null &&
    payload.valid_until !== ''
  ) {
    if (typeof payload.valid_until !== 'string') return fail('invalid_valid_until');
    insertRow.valid_until = payload.valid_until;
  }
  if (payload.min_qty !== undefined && payload.min_qty !== null) {
    const minQty =
      typeof payload.min_qty === 'number'
        ? payload.min_qty
        : Number(payload.min_qty);
    if (!Number.isFinite(minQty) || minQty < 1 || !Number.isInteger(minQty)) {
      return fail('invalid_min_qty: must be integer >= 1');
    }
    insertRow.min_qty = minQty;
  }
  if (
    payload.notes !== undefined &&
    payload.notes !== null &&
    payload.notes !== ''
  ) {
    if (typeof payload.notes !== 'string') return fail('invalid_notes');
    insertRow.notes = payload.notes.slice(0, 4000);
  }

  const { data: after, error: insErr } = await service
    .from('discount_rules')
    .insert(insertRow)
    .select('*')
    .maybeSingle();
  if (insErr) return fail(`insert_failed: ${insErr.message}`);

  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'discount_rules',
        target_id: (after?.id as string | undefined) ?? null,
        before_jsonb: null,
        after_jsonb: (after ?? null) as Record<string, unknown> | null,
        applied_by_function: 'proposal-executors.execDiscountRuleCreate',
      },
    ],
  };
}

// refund.create: on Facu approval, insert a row into refund_approvals so the
// existing JJ/Facu quorum + Stripe-execute flow takes over. We don't call
// Stripe directly here -- that's still gated by quorum_met=true in
// /admin/refunds. Payload shape: { order_id, order_number, amount, currency, reason }.
async function execRefundCreate(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');

  const orderId = Number(payload.order_id);
  if (!Number.isFinite(orderId) || orderId <= 0) return fail('invalid_order_id');
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) return fail('invalid_amount');
  const currency = typeof payload.currency === 'string' && payload.currency.length === 3
    ? payload.currency
    : 'USD';
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
  if (reason.length < 3) return fail('invalid_reason');

  const proposedBy = proposal.proposed_by ?? null;
  if (!proposedBy) return fail('missing_proposed_by');

  // Look up parent payment_id (latest captured payment for this order, if any)
  const { data: pay } = await service
    .from('payments')
    .select('id')
    .eq('order_id', orderId)
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: inserted, error: insertErr } = await service
    .from('refund_approvals')
    .insert({
      order_id: orderId,
      payment_id: pay?.id ?? null,
      proposed_amount: amount,
      currency,
      status: 'pending',
      proposed_by: proposedBy,
      reason,
    })
    .select('id')
    .single();
  if (insertErr) return fail(`insert_failed: ${insertErr.message}`);

  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'refund_approvals',
        target_id: String(inserted.id),
        before_jsonb: null,
        after_jsonb: {
          order_id: orderId,
          proposed_amount: amount,
          currency,
          status: 'pending',
          reason,
        },
        applied_by_function: 'execRefundCreate',
      },
    ],
  };
}

// sku_mapping.confirm: bind a vendor SKU row in sku_mappings to a canonical
// (parent_sku_id, quality_family_id). Triggered from /admin/catalog/mapping.
// Payload shape: { mapping_id: uuid, parent_sku_id: string, quality_family_id: string }
// target_table is informational ('sku_mappings'); the mapping row id is in payload
// so the executor can update it regardless of what target_id holds.
async function execSkuMappingConfirm(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');

  const mappingId = payload.mapping_id;
  if (typeof mappingId !== 'string' || mappingId.length === 0) {
    return fail('invalid_mapping_id');
  }
  const parentSkuId = payload.parent_sku_id;
  if (typeof parentSkuId !== 'string' || parentSkuId.trim().length === 0) {
    return fail('invalid_parent_sku_id');
  }
  const qualityFamilyId = payload.quality_family_id;
  if (typeof qualityFamilyId !== 'string' || qualityFamilyId.trim().length === 0) {
    return fail('invalid_quality_family_id');
  }

  const { data: before, error: readErr } = await service
    .from('sku_mappings')
    .select('*')
    .eq('id', mappingId)
    .maybeSingle();
  if (readErr) return fail(`read_failed: ${readErr.message}`);
  if (!before) return fail('target_not_found');

  // Only awaiting_review and low_confidence rows can be confirmed. Already-mapped
  // or rejected rows should be re-opened explicitly before remapping.
  const beforeStatus = (before as Record<string, unknown>).status;
  if (beforeStatus !== 'awaiting_review' && beforeStatus !== 'low_confidence') {
    return fail(`invalid_state: mapping status is ${String(beforeStatus)}`);
  }

  const { data: after, error: updErr } = await service
    .from('sku_mappings')
    .update({
      status: 'mapped',
      parent_sku_id: parentSkuId.trim(),
      quality_family_id: qualityFamilyId.trim(),
      mapped_by: proposal.proposed_by,
      mapped_at: new Date().toISOString(),
      mapped_via_proposal_id: proposal.id,
    })
    .eq('id', mappingId)
    .select('*')
    .maybeSingle();
  if (updErr) return fail(`update_failed: ${updErr.message}`);

  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'sku_mappings',
        target_id: mappingId,
        before_jsonb: before as Record<string, unknown>,
        after_jsonb: (after ?? null) as Record<string, unknown> | null,
        applied_by_function: 'proposal-executors.execSkuMappingConfirm',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function executeProposal(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  switch (proposal.type) {
    case 'box_master.update':
      return execBoxMasterUpdate(proposal, service);
    case 'pricing_constants.update':
      return execPricingConstantsUpdate(proposal, service);
    case 'shipping_config.create':
      return execShippingConfigCreate(proposal, service);
    case 'client_profiles.status_change':
      return execClientProfileStatusChange(proposal, service);
    case 'visibility_rule.create':
      return execVisibilityRuleCreate(proposal);
    case 'discount_rule.create':
      return execDiscountRuleCreate(proposal, service);
    case 'refund.create':
      return execRefundCreate(proposal, service);
    case 'sku_mapping.confirm':
      return execSkuMappingConfirm(proposal, service);
    default:
      return fail(`unknown_proposal_type: ${proposal.type}`);
  }
}

export const KNOWN_PROPOSAL_TYPES: readonly string[] = [
  'box_master.update',
  'pricing_constants.update',
  'shipping_config.create',
  'client_profiles.status_change',
  'visibility_rule.create',
  'discount_rule.create',
  // TODO[refund.create executor]: see execRefundCreate. Until then approval
  // surfaces an explicit error and no Stripe refund is issued.
  'refund.create',
  'sku_mapping.confirm',
];
