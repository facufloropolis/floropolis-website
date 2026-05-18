// POST /api/refunds/[id]/execute — Admin executes an approved refund.
// v1 | 2026-05-17 | Job_PM W4-S13 [V8 SHADOW]
// Implements d3_stripe_webhook_design.md §7.
//
// Flow:
//   1. Auth — must be signed in (user-context client via lib/supabase/server).
//   2. Authz — must be admin (client_profiles.status = 'admin' for auth.uid()).
//   3. Load refund_approvals row by id. Assert status='pending' AND quorum_met=true
//      AND expires_at > now(). Else 400 with specific error code.
//   4. Resolve parent payments row by payment_id → stripe_charge_id.
//   5. INSERT new payments row kind='refund' status='pending'
//      idempotency_key='refund:{id}'.
//   6. stripe.refunds.create({ charge, amount, metadata }) with same Idempotency-Key.
//   7. UPDATE that payments row with stripe_refund_id + status.
//   8. UPDATE refund_approvals: status='executed', executed_at, executed_payment_id.
//   9. Recompute orders.status: cumulative refunds >= paid → 'refunded'.
//  10. Return { refund_id, payments_row_id, new_order_status }.
//
// Error responses:
//   400  quorum_not_met | already_executed | expired | invalid_amount | no_parent_charge
//   401  unauthenticated
//   403  not_admin
//   404  not_found
//   500  stripe_failed (includes upstream detail)
//
// Notes:
//   - Webhook handler `charge.refunded` will arrive after the Stripe call. The audit
//     INSERT there uses key 'webhook:{evt.id}' (independent UNIQUE), so it does not
//     collide with this 'refund:{id}' row. The webhook UPDATE path keys off
//     stripe_charge_id; we keep our admin-execute row separate by design.
//   - Writes go to supabase-backup (NOT prod) per wave-3 architecture.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getStripe, assertStripeEnv } from '@/lib/stripe/client';
import { keyForRefund } from '@/lib/stripe/idempotency';

interface RefundApprovalRow {
  id: number;
  order_id: number;
  payment_id: number | null;
  proposed_amount: number | string;
  currency: string;
  status: string;
  quorum_met: boolean;
  expires_at: string;
}

interface ParentPaymentRow {
  id: number;
  order_id: number;
  amount: number | string;
  kind: string;
  status: string;
  stripe_charge_id: string | null;
  stripe_payment_intent_id: string | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  assertStripeEnv();

  const { id: idParam } = await params;
  const refundApprovalId = Number(idParam);
  if (!Number.isFinite(refundApprovalId) || refundApprovalId <= 0) {
    return NextResponse.json(
      { error: 'not_found', detail: 'invalid refund id' },
      { status: 404 },
    );
  }

  // 1. Auth -----------------------------------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // 2. Authz — admin check via client_profiles.status = 'admin'.
  //    Using user-context client so RLS is enforced as a second line of defense
  //    (only the row owner can SELECT their own profile under existing policy).
  const { data: profile, error: profileErr } = await userClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileErr) {
    Sentry.captureException(profileErr, {
      tags: { route: 'refunds/execute', step: 'profile_lookup' },
    });
    return NextResponse.json(
      { error: 'not_admin', detail: 'profile lookup failed' },
      { status: 403 },
    );
  }
  if (!profile || profile.status !== 'admin') {
    return NextResponse.json({ error: 'not_admin' }, { status: 403 });
  }

  // All subsequent DB work uses the service-role client against supabase-backup,
  // which is where the D1 wave-3 tables live.
  const backup = getBackupServiceClient();

  // 3. Load refund_approval -------------------------------------------------
  const { data: approvalRaw, error: approvalErr } = await backup
    .from('refund_approvals')
    .select(
      'id, order_id, payment_id, proposed_amount, currency, status, quorum_met, expires_at',
    )
    .eq('id', refundApprovalId)
    .maybeSingle();
  if (approvalErr) {
    Sentry.captureException(approvalErr, {
      tags: { route: 'refunds/execute', step: 'approval_lookup' },
      extra: { refund_approval_id: refundApprovalId },
    });
    return NextResponse.json(
      { error: 'not_found', detail: 'approval lookup failed' },
      { status: 404 },
    );
  }
  if (!approvalRaw) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const approval = approvalRaw as RefundApprovalRow;

  // Status / quorum / expiry assertions ------------------------------------
  if (approval.status === 'executed') {
    return NextResponse.json({ error: 'already_executed' }, { status: 400 });
  }
  if (approval.status !== 'pending') {
    return NextResponse.json(
      { error: 'already_executed', detail: `status=${approval.status}` },
      { status: 400 },
    );
  }
  if (!approval.quorum_met) {
    return NextResponse.json({ error: 'quorum_not_met' }, { status: 400 });
  }
  if (new Date(approval.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 400 });
  }

  const proposedAmount = Number(approval.proposed_amount);
  if (!Number.isFinite(proposedAmount) || proposedAmount <= 0) {
    return NextResponse.json({ error: 'invalid_amount' }, { status: 400 });
  }

  // 4. Resolve parent payment + charge id ----------------------------------
  let parent: ParentPaymentRow | null = null;
  if (approval.payment_id) {
    const { data: parentRow, error: parentErr } = await backup
      .from('payments')
      .select(
        'id, order_id, amount, kind, status, stripe_charge_id, stripe_payment_intent_id',
      )
      .eq('id', approval.payment_id)
      .maybeSingle();
    if (parentErr) {
      Sentry.captureException(parentErr, {
        tags: { route: 'refunds/execute', step: 'parent_payment_lookup' },
      });
    }
    parent = (parentRow as ParentPaymentRow | null) ?? null;
  }
  // Fallback: pick the most recent succeeded full_charge for this order.
  if (!parent) {
    const { data: fallbackRow } = await backup
      .from('payments')
      .select(
        'id, order_id, amount, kind, status, stripe_charge_id, stripe_payment_intent_id',
      )
      .eq('order_id', approval.order_id)
      .eq('kind', 'full_charge')
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    parent = (fallbackRow as ParentPaymentRow | null) ?? null;
  }
  if (!parent) {
    return NextResponse.json(
      { error: 'no_parent_charge', detail: 'no parent full_charge payment row' },
      { status: 400 },
    );
  }
  if (!parent.stripe_charge_id) {
    return NextResponse.json(
      { error: 'no_parent_charge', detail: 'parent payment missing stripe_charge_id' },
      { status: 400 },
    );
  }

  // Refund cannot exceed parent charge amount.
  if (proposedAmount > Number(parent.amount)) {
    return NextResponse.json(
      { error: 'invalid_amount', detail: 'exceeds parent charge amount' },
      { status: 400 },
    );
  }

  // 5. INSERT pending refund payments row ----------------------------------
  const idempotencyKey = keyForRefund(refundApprovalId);
  const insertPayload = {
    order_id: approval.order_id,
    parent_payment_id: parent.id,
    kind: 'refund' as const,
    status: 'pending' as const,
    amount: proposedAmount,
    currency: approval.currency || 'USD',
    refund_approval_id: refundApprovalId,
    idempotency_key: idempotencyKey,
    processed_at: null,
  };

  const { data: insertedRow, error: insertErr } = await backup
    .from('payments')
    .insert(insertPayload)
    .select('id')
    .maybeSingle();

  let paymentsRowId: number | null = insertedRow?.id ?? null;

  if (insertErr) {
    // Idempotency collision: a prior execute attempt is already in flight or
    // succeeded. Reuse the existing row instead of erroring.
    if (insertErr.code === '23505') {
      const { data: existingRow } = await backup
        .from('payments')
        .select('id, status, stripe_refund_id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (existingRow?.status === 'succeeded') {
        return NextResponse.json(
          { error: 'already_executed', detail: 'refund already processed' },
          { status: 400 },
        );
      }
      paymentsRowId = existingRow?.id ?? null;
    } else {
      Sentry.captureException(insertErr, {
        tags: { route: 'refunds/execute', step: 'payments_insert' },
      });
      return NextResponse.json(
        { error: 'stripe_failed', detail: 'payments insert failed' },
        { status: 500 },
      );
    }
  }

  if (!paymentsRowId) {
    return NextResponse.json(
      { error: 'stripe_failed', detail: 'payments row id missing after insert' },
      { status: 500 },
    );
  }

  // 6. Call Stripe ---------------------------------------------------------
  const stripe = getStripe();
  const amountCents = Math.round(proposedAmount * 100);
  let stripeRefundId: string | null = null;
  let stripeStatus: 'succeeded' | 'failed' = 'failed';
  let stripeErrorCode: string | null = null;
  let stripeErrorMessage: string | null = null;

  try {
    const refund = await stripe.refunds.create(
      {
        charge: parent.stripe_charge_id,
        amount: amountCents,
        metadata: {
          refund_approval_id: String(refundApprovalId),
          order_id: String(approval.order_id),
        },
      },
      { idempotencyKey },
    );
    stripeRefundId = refund.id;
    // Stripe refund.status: 'pending' | 'succeeded' | 'failed' | 'requires_action' | 'canceled'
    stripeStatus = refund.status === 'succeeded' ? 'succeeded' : 'failed';
    if (stripeStatus === 'failed') {
      stripeErrorCode = refund.failure_reason ?? 'unknown';
      stripeErrorMessage = `stripe refund returned status=${refund.status}`;
    }
  } catch (err: unknown) {
    const stripeErr = err as {
      type?: string;
      code?: string;
      message?: string;
      raw?: { code?: string; message?: string };
    };
    stripeErrorCode = stripeErr.code ?? stripeErr.raw?.code ?? stripeErr.type ?? 'stripe_error';
    stripeErrorMessage = stripeErr.message ?? stripeErr.raw?.message ?? 'unknown stripe error';
    Sentry.captureException(err, {
      tags: { route: 'refunds/execute', step: 'stripe_refunds_create' },
      extra: { refund_approval_id: refundApprovalId, charge: parent.stripe_charge_id },
    });
  }

  // 7. UPDATE payments row with outcome ------------------------------------
  await backup
    .from('payments')
    .update({
      stripe_refund_id: stripeRefundId,
      stripe_charge_id: parent.stripe_charge_id,
      status: stripeStatus,
      processed_at: new Date().toISOString(),
      error_code: stripeErrorCode,
      error_message: stripeErrorMessage,
    })
    .eq('id', paymentsRowId);

  if (stripeStatus === 'failed') {
    // Do NOT mark refund_approvals executed; leave it pending for retry.
    return NextResponse.json(
      {
        error: 'stripe_failed',
        detail: stripeErrorMessage,
        code: stripeErrorCode,
        payments_row_id: paymentsRowId,
      },
      { status: 500 },
    );
  }

  // 8. UPDATE refund_approvals -> executed ---------------------------------
  await backup
    .from('refund_approvals')
    .update({
      status: 'executed',
      executed_at: new Date().toISOString(),
      executed_payment_id: paymentsRowId,
    })
    .eq('id', refundApprovalId);

  // 9. Recompute orders.status ---------------------------------------------
  let newOrderStatus: string | null = null;
  const { data: payRows } = await backup
    .from('payments')
    .select('kind, status, amount')
    .eq('order_id', approval.order_id)
    .eq('status', 'succeeded');
  if (payRows) {
    const paid = payRows
      .filter((r: { kind: string }) => r.kind === 'full_charge')
      .reduce((s: number, r: { amount: number | string }) => s + Number(r.amount), 0);
    const refunded = payRows
      .filter((r: { kind: string }) => r.kind === 'refund')
      .reduce((s: number, r: { amount: number | string }) => s + Number(r.amount), 0);
    if (paid > 0 && refunded >= paid) {
      await backup
        .from('orders')
        .update({ status: 'refunded' })
        .eq('id', approval.order_id);
      newOrderStatus = 'refunded';
    } else {
      const { data: orderRow } = await backup
        .from('orders')
        .select('status')
        .eq('id', approval.order_id)
        .maybeSingle();
      newOrderStatus = orderRow?.status ?? null;
    }
  }

  // 10. Return -------------------------------------------------------------
  return NextResponse.json({
    refund_id: stripeRefundId,
    payments_row_id: paymentsRowId,
    new_order_status: newOrderStatus,
    refund_approval_id: refundApprovalId,
  });
}
