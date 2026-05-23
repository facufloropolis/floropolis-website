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
  // Contract v1.1 fields (2026-05-19):
  source_agent?: string | null;
  source_table?: string | null;
  source_id?: string | null;
  source_rationale?: string | null;
  source_artifact?: string | null;  // URL/path to physical evidence (mandatory for box_master.update)
  before_value?: unknown;
  after_value?: unknown;
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

// visibility_override.create: admin force-show or force-hide a SKU on /shop.
// 2026-05-19 per Rose contract v1.0 (PB-1 counter):
//   - floropolis_inventory.live stays 100% Komet-driven (Job NEVER writes there)
//   - Admin override goes to visibility_overrides table with mandatory reason + expires_at
//   - /shop publication query reads both: live AND no active hide-override, OR active show-override
//   - Override expires after 30 days default (admin can specify shorter)
// Payload shape: { sku_id: bigint, decision: 'show'|'hide', reason: string, expires_at?: ISO date }
async function execVisibilityOverrideCreate(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');

  const skuIdRaw = payload.sku_id;
  const skuId = typeof skuIdRaw === 'number' ? skuIdRaw : Number(skuIdRaw);
  if (!Number.isFinite(skuId) || skuId <= 0) return fail('invalid_sku_id');

  const decision = payload.decision;
  if (decision !== 'show' && decision !== 'hide') return fail('invalid_decision');

  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
  if (reason.length < 5) return fail('invalid_reason: must be at least 5 chars');

  const proposedBy = proposal.proposed_by;
  if (!proposedBy) return fail('missing_proposed_by');

  const insertRow: Record<string, unknown> = {
    sku_id: skuId,
    decision,
    reason,
    set_by: proposedBy,
    proposal_id: proposal.id,
  };
  if (typeof payload.expires_at === 'string' && payload.expires_at.length > 0) {
    insertRow.expires_at = payload.expires_at;
  }

  const { data: after, error: insErr } = await service
    .from('visibility_overrides')
    .insert(insertRow)
    .select('*')
    .maybeSingle();
  if (insErr) return fail(`insert_failed: ${insErr.message}`);

  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'visibility_overrides',
        target_id: String((after as Record<string, unknown> | null)?.id ?? ''),
        before_jsonb: null,
        after_jsonb: (after ?? null) as Record<string, unknown> | null,
        applied_by_function: 'proposal-executors.execVisibilityOverrideCreate',
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

// client_profiles.update: update editable fields (business_name, phone, ein, notes, sales_owner_id)
// on a client_profiles row. Status changes flow through client_profiles.status_change separately.
// 2026-05-19 wired post Phase E (Phase E shipped UI but flagged exec gap).
async function execClientProfilesUpdate(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');
  if (!proposal.target_id) return fail('missing_target_id');

  const allowed = ['business_name', 'phone', 'ein', 'notes', 'sales_owner_id', 'role'] as const;
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (payload[k] !== undefined) update[k] = payload[k];
  }
  if (Object.keys(update).length === 0) return fail('no_allowed_fields_in_payload');

  // Hard guard: no_florist_as_admin
  if (update.role === 'admin') {
    const { data: existing } = await service
      .from('client_profiles')
      .select('status')
      .eq('user_id', proposal.target_id)
      .maybeSingle();
    const hasOrders = await service
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', proposal.target_id)
      .then((r) => (r.count ?? 0) > 0);
    if (existing?.status === 'approved' && hasOrders && !payload.allow_florist_promotion) {
      return fail('no_florist_as_admin: target is an active florist; requires explicit allow_florist_promotion flag + rationale');
    }
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
    .update(update)
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
        applied_by_function: 'proposal-executors.execClientProfilesUpdate',
      },
    ],
  };
}

// discount_rule.status_change: pause/expire an active rule
async function execDiscountRuleStatusChange(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');
  const ruleId = typeof payload.rule_id === 'string' ? payload.rule_id : null;
  if (!ruleId) return fail('invalid_rule_id');
  const newStatus = payload.new_status;
  if (newStatus !== 'paused' && newStatus !== 'expired' && newStatus !== 'active') {
    return fail('invalid_new_status: must be paused|expired|active');
  }

  const { data: before } = await service.from('discount_rules').select('*').eq('id', ruleId).maybeSingle();
  if (!before) return fail('target_not_found');

  const { data: after, error: updErr } = await service
    .from('discount_rules')
    .update({ status: newStatus })
    .eq('id', ruleId)
    .select('*')
    .maybeSingle();
  if (updErr) return fail(`update_failed: ${updErr.message}`);

  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'discount_rules',
        target_id: ruleId,
        before_jsonb: before as Record<string, unknown>,
        after_jsonb: (after ?? null) as Record<string, unknown> | null,
        applied_by_function: 'proposal-executors.execDiscountRuleStatusChange',
      },
    ],
  };
}

// tier_visibility_window.accept_country: flip accepted=true for 1 or more rows in tier_visibility_windows
// Payload: { origin_country, pipeline_checks, row_ids: string[] }
async function execTierVisibilityWindowAcceptCountry(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');
  const rowIds = payload.row_ids;
  if (!Array.isArray(rowIds) || rowIds.length === 0) return fail('invalid_row_ids: must be non-empty array');

  const { data: before } = await service
    .from('tier_visibility_windows')
    .select('*')
    .in('id', rowIds as string[]);

  const { data: after, error: updErr } = await service
    .from('tier_visibility_windows')
    .update({
      accepted: true,
      pipeline_checks: payload.pipeline_checks ?? {},
      accepted_at: new Date().toISOString(),
      accepted_by_proposal_id: proposal.id,
    })
    .in('id', rowIds as string[])
    .select('*');
  if (updErr) return fail(`update_failed: ${updErr.message}`);

  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'tier_visibility_windows',
        target_id: (rowIds as string[]).join(','),
        before_jsonb: { rows: before } as Record<string, unknown>,
        after_jsonb: { rows: after } as Record<string, unknown>,
        applied_by_function: 'proposal-executors.execTierVisibilityWindowAcceptCountry',
      },
    ],
  };
}

// tier_visibility_window.update: change earliest/latest days for a window row
async function execTierVisibilityWindowUpdate(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');
  if (!proposal.target_id) return fail('missing_target_id');

  const update: Record<string, unknown> = {};
  if (payload.earliest_delivery_days !== undefined) update.earliest_delivery_days = Number(payload.earliest_delivery_days);
  if (payload.latest_delivery_days !== undefined) update.latest_delivery_days = Number(payload.latest_delivery_days);
  if (Object.keys(update).length === 0) return fail('no_fields_to_update');

  const { data: before } = await service.from('tier_visibility_windows').select('*').eq('id', proposal.target_id).maybeSingle();
  if (!before) return fail('target_not_found');

  const { data: after, error: updErr } = await service
    .from('tier_visibility_windows')
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
        target_table: 'tier_visibility_windows',
        target_id: proposal.target_id,
        before_jsonb: before as Record<string, unknown>,
        after_jsonb: (after ?? null) as Record<string, unknown> | null,
        applied_by_function: 'proposal-executors.execTierVisibilityWindowUpdate',
      },
    ],
  };
}

// canonical_cost.* executors — these proposals come FROM Rose (source_agent='rose')
// per her 2026-05-19 plan to push inventory data cleanup through admin_proposals.
// Per Rose audit Section 1: canonical_cost.facu_approved is JOB cannot touch (AUDIT).
// So my executor records audit ONLY with verification_passed=null. Rose's verifier
// reads admin_approvals where source_table='canonical_cost' AND status='approved' and
// flips facu_approved / DELETEs the row server-side, then updates override_audit.
//
// Types: delete_cost_row | approve_cost_row | reject_cost_row | resolve_conflict
// Payload: { cost_id, ... varies by type }
async function execCanonicalCostAuditOnly(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');
  const costId = payload.cost_id;
  if (!costId) return fail('missing_cost_id');

  // Read the canonical_cost row for before-snapshot (Job has READ permission)
  const { data: before } = await service
    .from('canonical_cost')
    .select('*')
    .eq('cost_id', costId)
    .maybeSingle();
  if (!before) return fail('canonical_cost_row_not_found');

  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'canonical_cost',
        target_id: String(costId),
        before_jsonb: before as Record<string, unknown>,
        after_jsonb: null,  // intentional — Rose's verifier sets this post-execution
        applied_by_function: `proposal-executors.execCanonicalCostAuditOnly[${proposal.type}]`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// catalog_quality_weight.update / catalog_quality_threshold.update
// ---------------------------------------------------------------------------
//
// Catalog-v2 (2026-05-19) introduces two new config tables editable by Facu via
// /admin/catalog/config: catalog_quality_weights (per-gate weight 0..100, sum=100)
// and catalog_quality_thresholds (perfect_min_score etc.). Edits flow through
// admin_proposals just like pricing_constants.update.
//
// catalog_quality_weight.update:
//   target_id = gate_id
//   payload = { weight: number, evaluated?: boolean }
//   Enforces sum(weight)=100 AFTER the proposed change. If the sum drifts, the
//   executor fails and the audit row is not written.
//
// catalog_quality_threshold.update:
//   target_id = threshold_id ('perfect_min_score', 'competitive_min_comp_adv')
//   payload = { value: number }

async function execCatalogQualityWeightUpdate(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');
  if (!proposal.target_id) return fail('missing_target_id');

  const rawWeight = payload.weight;
  const weightNum =
    typeof rawWeight === 'number' ? rawWeight : Number(rawWeight);
  if (!Number.isFinite(weightNum) || weightNum < 0 || weightNum > 100) {
    return fail('invalid_weight: must be number 0..100');
  }
  const weightInt = Math.round(weightNum);

  const update: Record<string, unknown> = {
    weight: weightInt,
    updated_at: new Date().toISOString(),
  };
  if (typeof payload.evaluated === 'boolean') update.evaluated = payload.evaluated;
  if (proposal.proposed_by) update.updated_by = proposal.proposed_by;

  const { data: before, error: readErr } = await service
    .from('catalog_quality_weights')
    .select('*')
    .eq('gate_id', proposal.target_id)
    .maybeSingle();
  if (readErr) return fail(`read_failed: ${readErr.message}`);
  if (!before) return fail('target_not_found');

  // Verify the post-update sum stays at 100.
  const { data: allWeights, error: allErr } = await service
    .from('catalog_quality_weights')
    .select('gate_id, weight');
  if (allErr) return fail(`sum_check_read_failed: ${allErr.message}`);
  const projected = (allWeights ?? []).reduce<number>((acc, row) => {
    const w =
      row.gate_id === proposal.target_id
        ? weightInt
        : typeof row.weight === 'number'
          ? row.weight
          : Number(row.weight) || 0;
    return acc + w;
  }, 0);
  if (projected !== 100) {
    return fail(
      `weights_sum_drift: post-update sum=${projected}, expected 100. Adjust other weights first.`,
    );
  }

  const { data: after, error: updErr } = await service
    .from('catalog_quality_weights')
    .update(update)
    .eq('gate_id', proposal.target_id)
    .select('*')
    .maybeSingle();
  if (updErr) return fail(`update_failed: ${updErr.message}`);

  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'catalog_quality_weights',
        target_id: proposal.target_id,
        before_jsonb: before as Record<string, unknown>,
        after_jsonb: (after ?? null) as Record<string, unknown> | null,
        applied_by_function: 'proposal-executors.execCatalogQualityWeightUpdate',
      },
    ],
  };
}

async function execCatalogQualityThresholdUpdate(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');
  if (!proposal.target_id) return fail('missing_target_id');

  const rawValue = payload.value;
  const valueNum = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isFinite(valueNum)) {
    return fail('invalid_value: must be a finite number');
  }
  // Sanity-clamp for perfect_min_score so a typo can't render the queue empty.
  if (proposal.target_id === 'perfect_min_score' && (valueNum < 50 || valueNum > 100)) {
    return fail('perfect_min_score must be between 50 and 100');
  }

  const { data: before, error: readErr } = await service
    .from('catalog_quality_thresholds')
    .select('*')
    .eq('threshold_id', proposal.target_id)
    .maybeSingle();
  if (readErr) return fail(`read_failed: ${readErr.message}`);
  if (!before) return fail('target_not_found');

  const update: Record<string, unknown> = {
    value: valueNum,
    updated_at: new Date().toISOString(),
  };
  if (proposal.proposed_by) update.updated_by = proposal.proposed_by;

  const { data: after, error: updErr } = await service
    .from('catalog_quality_thresholds')
    .update(update)
    .eq('threshold_id', proposal.target_id)
    .select('*')
    .maybeSingle();
  if (updErr) return fail(`update_failed: ${updErr.message}`);

  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'catalog_quality_thresholds',
        target_id: proposal.target_id,
        before_jsonb: before as Record<string, unknown>,
        after_jsonb: (after ?? null) as Record<string, unknown> | null,
        applied_by_function: 'proposal-executors.execCatalogQualityThresholdUpdate',
      },
    ],
  };
}

async function execCatalogQualityRebalance(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');

  const changes = payload.changes;
  if (!Array.isArray(changes) || changes.length === 0) {
    return fail('invalid_changes: must be non-empty array');
  }

  const newThreshold =
    typeof payload.new_threshold === 'number' ? payload.new_threshold : null;

  for (const c of changes) {
    if (!c || typeof c !== 'object') return fail('invalid_change_entry: must be object');
    const entry = c as Record<string, unknown>;
    if (typeof entry.gate_id !== 'string') return fail('invalid_change_entry: missing gate_id');
    const nw = typeof entry.new_weight === 'number' ? entry.new_weight : Number(entry.new_weight);
    if (!Number.isFinite(nw) || nw < 0 || nw > 100) return fail(`invalid_change_entry: bad new_weight for ${entry.gate_id}`);
  }

  const { data: allWeights, error: readErr } = await service
    .from('catalog_quality_weights')
    .select('gate_id, weight, display_label, evaluated, updated_at, updated_by');
  if (readErr) return fail(`read_failed: ${readErr.message}`);

  const currentMap = new Map<string, number>();
  for (const row of allWeights ?? []) {
    currentMap.set(row.gate_id as string, typeof row.weight === 'number' ? row.weight : Number(row.weight) || 0);
  }

  const updatedMap = new Map(currentMap);
  for (const c of changes as Array<Record<string, unknown>>) {
    updatedMap.set(c.gate_id as string, Math.round(c.new_weight as number));
  }
  const postSum = Array.from(updatedMap.values()).reduce((a, b) => a + b, 0);
  if (postSum !== 100) {
    return fail(`weights_sum_drift: post-rebalance sum=${postSum}, expected 100`);
  }

  const auditEntries: AuditEntry[] = [];
  const now = new Date().toISOString();

  for (const c of changes as Array<Record<string, unknown>>) {
    const gateId = c.gate_id as string;
    const newWeight = Math.round(c.new_weight as number);

    const beforeRow = (allWeights ?? []).find((r) => r.gate_id === gateId);
    if (!beforeRow) return fail(`gate_not_found: ${gateId}`);

    const { data: after, error: updErr } = await service
      .from('catalog_quality_weights')
      .update({ weight: newWeight, updated_at: now, updated_by: proposal.proposed_by })
      .eq('gate_id', gateId)
      .select('*')
      .maybeSingle();
    if (updErr) return fail(`weight_update_failed: ${gateId}: ${updErr.message}`);

    auditEntries.push({
      proposal_id: proposal.id,
      target_table: 'catalog_quality_weights',
      target_id: gateId,
      before_jsonb: beforeRow as Record<string, unknown>,
      after_jsonb: (after ?? null) as Record<string, unknown> | null,
      applied_by_function: 'proposal-executors.execCatalogQualityRebalance',
    });
  }

  if (newThreshold !== null) {
    if (newThreshold < 50 || newThreshold > 100) {
      return fail('invalid_new_threshold: perfect_min_score must be 50..100');
    }
    const { data: beforeThresh } = await service
      .from('catalog_quality_thresholds')
      .select('*')
      .eq('threshold_id', 'perfect_min_score')
      .maybeSingle();
    const { data: afterThresh, error: thrErr } = await service
      .from('catalog_quality_thresholds')
      .update({ value: newThreshold, updated_at: now, updated_by: proposal.proposed_by })
      .eq('threshold_id', 'perfect_min_score')
      .select('*')
      .maybeSingle();
    if (thrErr) return fail(`threshold_update_failed: ${thrErr.message}`);

    auditEntries.push({
      proposal_id: proposal.id,
      target_table: 'catalog_quality_thresholds',
      target_id: 'perfect_min_score',
      before_jsonb: (beforeThresh ?? null) as Record<string, unknown> | null,
      after_jsonb: (afterThresh ?? null) as Record<string, unknown> | null,
      applied_by_function: 'proposal-executors.execCatalogQualityRebalance',
    });
  }

  return { ok: true, auditEntries };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function executeProposal(
  proposal: AdminProposal,
  service: SupabaseClient,
): Promise<ExecutorResult> {
  switch (proposal.type) {
    // box_master.update RE-ENABLED 2026-05-19 per Nahua contract v1.1 (CEO directive)
    // Reverted Rose v1.0 delta 1: CEO prefers proposal loop + audit trail over direct escalation.
    // Pre-check: source_artifact (physical evidence URL/path) is MANDATORY. Server-side enforcement
    // here + Rose's verify_inventory_proposal_scope.py enforces the same at DB-level.
    case 'box_master.update': {
      const artifact = proposal.source_artifact;
      if (!artifact || typeof artifact !== 'string' || artifact.trim().length === 0) {
        return fail('box_master.update_requires_source_artifact: physical evidence (FedEx label / vendor packaging / Komet snapshot / scale photo) is mandatory per contract v1.1');
      }
      return execBoxMasterUpdate(proposal, service);
    }
    case 'pricing_constants.update':
      return execPricingConstantsUpdate(proposal, service);
    case 'shipping_config.create':
      return execShippingConfigCreate(proposal, service);
    case 'client_profiles.status_change':
      return execClientProfileStatusChange(proposal, service);
    case 'visibility_rule.create':
      return execVisibilityRuleCreate(proposal);
    case 'visibility_override.create':
      return execVisibilityOverrideCreate(proposal, service);
    case 'discount_rule.create':
      return execDiscountRuleCreate(proposal, service);
    case 'refund.create':
      return execRefundCreate(proposal, service);
    case 'sku_mapping.confirm':
      return execSkuMappingConfirm(proposal, service);
    case 'client_profiles.update':
      return execClientProfilesUpdate(proposal, service);
    case 'discount_rule.status_change':
      return execDiscountRuleStatusChange(proposal, service);
    case 'tier_visibility_window.accept_country':
      return execTierVisibilityWindowAcceptCountry(proposal, service);
    case 'tier_visibility_window.update':
      return execTierVisibilityWindowUpdate(proposal, service);
    case 'catalog_quality_weight.update':
      return execCatalogQualityWeightUpdate(proposal, service);
    case 'catalog_quality_threshold.update':
      return execCatalogQualityThresholdUpdate(proposal, service);
    case 'catalog_quality_rebalance':
      return execCatalogQualityRebalance(proposal, service);
    // Rose-originated canonical_cost cleanup proposals (2026-05-19 batch incoming):
    // audit-only on our side; Rose's verifier does the real canonical_cost write.
    case 'delete_cost_row':
    case 'approve_cost_row':
    case 'reject_cost_row':
    case 'resolve_conflict':
      return execCanonicalCostAuditOnly(proposal, service);
    default:
      return fail(`unknown_proposal_type: ${proposal.type}`);
  }
}

export const KNOWN_PROPOSAL_TYPES: readonly string[] = [
  // 'box_master.update' re-enabled per Nahua contract v1.1 (2026-05-19) — requires source_artifact
  'box_master.update',
  'client_profiles.update',
  'discount_rule.status_change',
  'tier_visibility_window.accept_country',
  'tier_visibility_window.update',
  'catalog_quality_weight.update',
  'catalog_quality_threshold.update',
  'catalog_quality_rebalance',
  // Rose-originated canonical_cost cleanup (audit-only; Rose verifier handles write):
  'delete_cost_row',
  'approve_cost_row',
  'reject_cost_row',
  'resolve_conflict',
  'pricing_constants.update',
  'shipping_config.create',
  'client_profiles.status_change',
  'visibility_rule.create',
  'visibility_override.create',
  'discount_rule.create',
  // TODO[refund.create executor]: see execRefundCreate. Until then approval
  // surfaces an explicit error and no Stripe refund is issued.
  'refund.create',
  'sku_mapping.confirm',
];
