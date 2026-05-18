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

// STUB: discount_rule.create -- table doesn't exist yet. Same shape as above.
async function execDiscountRuleCreate(
  proposal: AdminProposal,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');
  return {
    ok: true,
    auditEntries: [
      {
        proposal_id: proposal.id,
        target_table: 'discount_rules',
        target_id: null,
        before_jsonb: null,
        after_jsonb: { stub: true, intended_payload: payload },
        applied_by_function: 'proposal-executors.execDiscountRuleCreate[STUB]',
      },
    ],
  };
}

// TODO[refund.create executor missing]: Wire to the existing refund pipeline.
// On Facu approval this should call /api/refunds/[id]/execute OR insert a
// refund_approvals row and let the existing quorum flow handle the Stripe call.
// For now the executor records the intent only -- approval will fail with
// 'refund.create executor not implemented yet' so no Stripe refund is issued.
// /admin/orders/[id] surfaces this via a TODO badge next to the proposed
// refund. Payload shape: { order_id, order_number, amount, currency, reason }.
async function execRefundCreate(
  proposal: AdminProposal,
): Promise<ExecutorResult> {
  const payload = payloadObject(proposal);
  if (!payload) return fail('invalid_payload');
  return {
    ok: false,
    error:
      'refund.create executor not implemented yet -- TODO: call /api/refunds/[id]/execute or insert a refund_approvals row to route through Stripe',
    auditEntries: [],
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
      return execDiscountRuleCreate(proposal);
    case 'refund.create':
      return execRefundCreate(proposal);
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
];
