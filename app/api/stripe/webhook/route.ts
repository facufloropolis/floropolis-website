// POST /api/stripe/webhook — Stripe event receiver
// v1 | 2026-05-17 | Job_PM W3-S9 [V8 SHADOW]
// Implements d3_stripe_webhook_design.md §1 + §2.
// Writes to supabase-backup (NOT prod) via service-role client.
//
// Flow:
//   1. Read raw body (req.text() — signature requires exact bytes).
//   2. Verify stripe-signature with STRIPE_WEBHOOK_SECRET.
//   3. INSERT audit row into payments (idempotency_key=webhook:{evt.id}) OR detect dedup.
//   4. Dispatch to event-specific handler.
//   5. Return 200 within 10s. Always 200 unless signature invalid (400).
//
// Handlers are inline (per W3-S9 spec). If the file gets bigger, split to _handlers.ts.
//
// TODO wave-3-ops: register endpoint URL in Stripe dashboard + set STRIPE_WEBHOOK_SECRET.
// TODO wave-4: forward to scripts/jobs/scheduled_charges.py for cron-only events.
// TODO D7: hook invoice generation on payment_intent.succeeded (full_charge).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import type Stripe from 'stripe';

import { getStripe, assertStripeEnv } from '@/lib/stripe/client';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import {
  keyForWebhookEvent,
  keyForScheduledPreauth,
  keyForScheduledCharge,
} from '@/lib/stripe/idempotency';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1702689983';
const PER_ORDER_AMOUNT_CAP_USD = 5000;

async function alert(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error('[stripe/webhook] Telegram alert failed:', err);
  }
}

// ============================================================================
// Entry
// ============================================================================
export async function POST(req: NextRequest): Promise<NextResponse> {
  assertStripeEnv({ webhook: true });

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'signature_missing' }, { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET not set — refusing event');
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 });
  }

  // Must be raw body bytes — App Router req.text() preserves them.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error('[stripe/webhook] signature verification failed:', err);
    Sentry.captureException(err, {
      tags: { route: 'stripe/webhook', step: 'signature_verify' },
    });
    return NextResponse.json({ error: 'signature_invalid' }, { status: 400 });
  }

  // Dedup check via UNIQUE(payments.idempotency_key). We insert an audit row for
  // every event (kind/status set per handler below). If a dup arrives we short-
  // circuit to 200 {deduped:true} without re-running side effects.
  const backup = getBackupServiceClient();
  const auditKey = keyForWebhookEvent(event.id);

  try {
    const { data: existing } = await backup
      .from('payments')
      .select('id')
      .eq('idempotency_key', auditKey)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ received: true, deduped: true });
    }
  } catch (err) {
    // Non-fatal: continue, INSERT will fail with 23505 if it really exists.
    console.warn('[stripe/webhook] dedup lookup failed:', err);
  }

  try {
    switch (event.type) {
      case 'setup_intent.succeeded':
        await handleSetupIntentSucceeded(event, backup, auditKey);
        break;
      case 'setup_intent.setup_failed':
        await handleSetupIntentFailed(event, backup, auditKey);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event, backup, auditKey);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event, backup, auditKey);
        break;
      case 'payment_intent.requires_action':
        await handlePaymentIntentRequiresAction(event, backup, auditKey);
        break;
      case 'payment_intent.canceled':
        await handlePaymentIntentCanceled(event, backup, auditKey);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event, backup, auditKey);
        break;
      case 'charge.dispute.created':
      case 'charge.dispute.closed':
        await handleChargeDispute(event, backup, auditKey);
        break;
      default:
        // Unhandled event — still store audit row so we can replay later.
        await storeAuditOnly(event, backup, auditKey);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: 'stripe/webhook', step: 'handler', event_type: event.type },
      extra: { event_id: event.id },
    });
    console.error(`[stripe/webhook] handler error for ${event.type} ${event.id}:`, err);
    // Return 200 to prevent infinite Stripe retries on permanent errors.
    // Sentry captures the failure; ops can replay from stripe_event_raw.
    return NextResponse.json({ received: true, handler_error: true });
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** UPDATE orders.status + matching timestamps. Idempotent via single eq match. */
async function setOrderStatus(
  backup: ReturnType<typeof getBackupServiceClient>,
  orderId: number,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await backup.from('orders').update({ status, ...extra }).eq('id', orderId);
}

async function findOrderBySetupIntent(
  backup: ReturnType<typeof getBackupServiceClient>,
  setupIntentId: string,
): Promise<{ id: number; payment_mode: string; grand_total: number; stripe_customer_id: string | null } | null> {
  const { data, error } = await backup
    .from('orders')
    .select('id,payment_mode,grand_total,stripe_customer_id')
    .eq('stripe_setup_intent_id', setupIntentId)
    .maybeSingle();
  if (error) {
    console.error('[stripe/webhook] order lookup by setup_intent failed:', error);
    return null;
  }
  return data ?? null;
}

async function findOrderByPaymentIntent(
  backup: ReturnType<typeof getBackupServiceClient>,
  paymentIntentId: string,
): Promise<{ payments_id: number; order_id: number; kind: string } | null> {
  const { data, error } = await backup
    .from('payments')
    .select('id,order_id,kind')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[stripe/webhook] payment lookup by PI failed:', error);
    return null;
  }
  return data
    ? { payments_id: data.id, order_id: data.order_id, kind: data.kind }
    : null;
}

async function storeAuditOnly(
  event: Stripe.Event,
  backup: ReturnType<typeof getBackupServiceClient>,
  auditKey: string,
): Promise<void> {
  // Use a sentinel order_id=0 not allowed by FK — instead, try to extract order_id
  // from event metadata. If we can't, skip (audit row needs FK). Log it.
  const orderId = extractOrderIdFromEvent(event);
  if (!orderId) {
    console.log(`[stripe/webhook] unhandled event ${event.type} ${event.id} — no order_id, skipping audit`);
    return;
  }
  await insertPaymentAudit(backup, {
    order_id: orderId,
    kind: 'capture', // catch-all kind for non-routed events; payments.kind enum allows it
    status: 'pending',
    amount: 0,
    idempotency_key: auditKey,
    stripe_event_raw: event as unknown as Record<string, unknown>,
  });
}

function extractOrderIdFromEvent(event: Stripe.Event): number | null {
  const obj = event.data.object as { metadata?: { order_id?: string } };
  const raw = obj?.metadata?.order_id;
  if (raw && !Number.isNaN(Number(raw))) return Number(raw);
  return null;
}

interface PaymentInsert {
  order_id: number;
  kind: 'preauth' | 'full_charge' | 'refund' | 'capture' | 'void';
  status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'cancelled' | 'disputed';
  amount: number;
  currency?: string;
  stripe_payment_intent_id?: string | null;
  stripe_charge_id?: string | null;
  stripe_refund_id?: string | null;
  stripe_setup_intent_id?: string | null;
  stripe_payment_method_id?: string | null;
  idempotency_key: string;
  parent_payment_id?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  next_action?: Record<string, unknown> | null;
  stripe_event_raw?: Record<string, unknown> | null;
}

async function insertPaymentAudit(
  backup: ReturnType<typeof getBackupServiceClient>,
  row: PaymentInsert,
): Promise<{ id: number | null; deduped: boolean }> {
  const { data, error } = await backup
    .from('payments')
    .insert({ currency: 'USD', ...row, processed_at: new Date().toISOString() })
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') {
      return { id: null, deduped: true };
    }
    throw error;
  }
  return { id: data?.id ?? null, deduped: false };
}

// ============================================================================
// Handlers
// ============================================================================

async function handleSetupIntentSucceeded(
  event: Stripe.Event,
  backup: ReturnType<typeof getBackupServiceClient>,
  auditKey: string,
): Promise<void> {
  const si = event.data.object as Stripe.SetupIntent;
  const order = await findOrderBySetupIntent(backup, si.id);
  if (!order) {
    console.warn(`[stripe/webhook] setup_intent.succeeded but no order for ${si.id}`);
    return;
  }

  const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id ?? null;
  const customerId =
    typeof si.customer === 'string' ? si.customer : si.customer?.id ?? null;

  // Update existing seeded payments row (kind=preauth, status=pending, amount=0)
  await backup
    .from('payments')
    .update({
      status: 'succeeded',
      stripe_payment_method_id: pmId,
      processed_at: new Date().toISOString(),
      stripe_event_raw: event as unknown as Record<string, unknown>,
    })
    .eq('stripe_setup_intent_id', si.id)
    .eq('kind', 'preauth')
    .eq('amount', 0);

  // Audit row for the webhook event itself.
  await insertPaymentAudit(backup, {
    order_id: order.id,
    kind: 'preauth',
    status: 'succeeded',
    amount: 0,
    stripe_setup_intent_id: si.id,
    stripe_payment_method_id: pmId,
    idempotency_key: auditKey,
    stripe_event_raw: event as unknown as Record<string, unknown>,
  });

  // Promote orders.status pending_payment -> card_saved + save PM id.
  await setOrderStatus(backup, order.id, 'card_saved', {
    stripe_payment_method_id: pmId,
    stripe_customer_id: customerId ?? order.stripe_customer_id,
  });

  // Mode-specific follow-up.
  const stripe = getStripe();
  if (order.payment_mode === 'mode_b') {
    // Inline $1 preauth.
    const preauthKey = keyForScheduledPreauth(order.id);
    try {
      const { id: paymentRowId, deduped } = await insertPaymentAudit(backup, {
        order_id: order.id,
        kind: 'preauth',
        status: 'pending',
        amount: 1.0,
        stripe_payment_method_id: pmId,
        idempotency_key: preauthKey,
      });
      if (!deduped) {
        const pi = await stripe.paymentIntents.create(
          {
            amount: 100, // $1.00 in cents
            currency: 'usd',
            customer: customerId ?? undefined,
            payment_method: pmId ?? undefined,
            off_session: true,
            confirm: true,
            capture_method: 'manual', // preauth = hold, no capture
            metadata: { order_id: String(order.id), kind: 'preauth' },
          },
          { idempotencyKey: preauthKey },
        );
        await backup
          .from('payments')
          .update({
            stripe_payment_intent_id: pi.id,
            status: pi.status === 'requires_capture' ? 'succeeded' : 'pending',
          })
          .eq('id', paymentRowId);
        if (pi.status === 'requires_capture') {
          await setOrderStatus(backup, order.id, 'preauth_held');
        }
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { route: 'stripe/webhook', step: 'mode_b_inline_preauth' },
        extra: { order_id: order.id },
      });
      await setOrderStatus(backup, order.id, 'failed');
      await alert(`*Mode B preauth failed* — order \`${order.id}\``);
    }
  } else if (order.payment_mode === 'mode_c') {
    // Inline full charge.
    const chargeKey = keyForScheduledCharge(order.id);
    if (Number(order.grand_total) > PER_ORDER_AMOUNT_CAP_USD) {
      await setOrderStatus(backup, order.id, 'failed');
      await alert(
        `*Mode C blocked* — order \`${order.id}\` exceeds cap ($${order.grand_total} > $${PER_ORDER_AMOUNT_CAP_USD})`,
      );
      return;
    }
    try {
      const { id: paymentRowId, deduped } = await insertPaymentAudit(backup, {
        order_id: order.id,
        kind: 'full_charge',
        status: 'pending',
        amount: Number(order.grand_total),
        stripe_payment_method_id: pmId,
        idempotency_key: chargeKey,
      });
      if (!deduped) {
        const pi = await stripe.paymentIntents.create(
          {
            amount: Math.round(Number(order.grand_total) * 100),
            currency: 'usd',
            customer: customerId ?? undefined,
            payment_method: pmId ?? undefined,
            off_session: true,
            confirm: true,
            metadata: { order_id: String(order.id), kind: 'full_charge' },
          },
          { idempotencyKey: chargeKey },
        );
        await backup
          .from('payments')
          .update({
            stripe_payment_intent_id: pi.id,
            status: pi.status === 'succeeded' ? 'succeeded' : 'pending',
          })
          .eq('id', paymentRowId);
        if (pi.status === 'succeeded') {
          await setOrderStatus(backup, order.id, 'paid', {
            paid_at: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { route: 'stripe/webhook', step: 'mode_c_inline_charge' },
        extra: { order_id: order.id },
      });
      await setOrderStatus(backup, order.id, 'failed');
      await alert(`*Mode C charge failed* — order \`${order.id}\``);
    }
  }
  // Mode A: nothing else; cron picks up at scheduled_preauth_at.
}

async function handleSetupIntentFailed(
  event: Stripe.Event,
  backup: ReturnType<typeof getBackupServiceClient>,
  auditKey: string,
): Promise<void> {
  const si = event.data.object as Stripe.SetupIntent;
  const order = await findOrderBySetupIntent(backup, si.id);
  if (!order) return;

  await backup
    .from('payments')
    .update({
      status: 'failed',
      error_code: si.last_setup_error?.code ?? null,
      error_message: si.last_setup_error?.message ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq('stripe_setup_intent_id', si.id)
    .eq('kind', 'preauth')
    .eq('amount', 0);

  await insertPaymentAudit(backup, {
    order_id: order.id,
    kind: 'preauth',
    status: 'failed',
    amount: 0,
    stripe_setup_intent_id: si.id,
    idempotency_key: auditKey,
    error_code: si.last_setup_error?.code ?? null,
    error_message: si.last_setup_error?.message ?? null,
    stripe_event_raw: event as unknown as Record<string, unknown>,
  });

  await setOrderStatus(backup, order.id, 'failed');
  await alert(`*Card setup failed* — order \`${order.id}\` (${si.last_setup_error?.code ?? 'unknown'})`);
}

async function handlePaymentIntentSucceeded(
  event: Stripe.Event,
  backup: ReturnType<typeof getBackupServiceClient>,
  auditKey: string,
): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const existing = await findOrderByPaymentIntent(backup, pi.id);
  if (!existing) {
    // No prior row -- happens when the charge is fired directly to Stripe
    // (e.g. by scheduled_charges.py cron) without our API seeding a row first.
    // Audit + transition the order status based on metadata.order_id + amount.
    const orderId = extractOrderIdFromEvent(event);
    if (orderId) {
      const kind = pi.amount === 100 ? 'preauth' : 'full_charge';
      await insertPaymentAudit(backup, {
        order_id: orderId,
        kind,
        status: 'succeeded',
        amount: pi.amount / 100,
        stripe_payment_intent_id: pi.id,
        stripe_charge_id: (pi.latest_charge as string | null) ?? null,
        idempotency_key: auditKey,
        stripe_event_raw: event as unknown as Record<string, unknown>,
      });
      // Same status transition logic as the existing-row branch below.
      if (kind === 'preauth') {
        await setOrderStatus(backup, orderId, 'preauth_held');
      } else {
        await setOrderStatus(backup, orderId, 'paid', {
          paid_at: new Date().toISOString(),
        });
      }
    }
    return;
  }

  // Update existing payments row with charge id + status.
  await backup
    .from('payments')
    .update({
      status: 'succeeded',
      stripe_charge_id: (pi.latest_charge as string | null) ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', existing.payments_id);

  // Audit row for the event itself.
  await insertPaymentAudit(backup, {
    order_id: existing.order_id,
    kind: existing.kind as PaymentInsert['kind'],
    status: 'succeeded',
    amount: pi.amount / 100,
    stripe_payment_intent_id: pi.id,
    stripe_charge_id: (pi.latest_charge as string | null) ?? null,
    idempotency_key: auditKey,
    stripe_event_raw: event as unknown as Record<string, unknown>,
  });

  // Status transition.
  if (existing.kind === 'preauth' && pi.amount === 100) {
    await setOrderStatus(backup, existing.order_id, 'preauth_held');
  } else if (existing.kind === 'full_charge') {
    await setOrderStatus(backup, existing.order_id, 'paid', {
      paid_at: new Date().toISOString(),
    });
    // TODO D7: trigger invoice generation here.
  }
}

async function handlePaymentIntentFailed(
  event: Stripe.Event,
  backup: ReturnType<typeof getBackupServiceClient>,
  auditKey: string,
): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const existing = await findOrderByPaymentIntent(backup, pi.id);
  const orderId = existing?.order_id ?? extractOrderIdFromEvent(event);
  if (!orderId) return;

  if (existing) {
    await backup
      .from('payments')
      .update({
        status: 'failed',
        error_code: pi.last_payment_error?.code ?? null,
        error_message: pi.last_payment_error?.message ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', existing.payments_id);
  }

  await insertPaymentAudit(backup, {
    order_id: orderId,
    kind: existing?.kind as PaymentInsert['kind'] ?? 'full_charge',
    status: 'failed',
    amount: pi.amount / 100,
    stripe_payment_intent_id: pi.id,
    idempotency_key: auditKey,
    error_code: pi.last_payment_error?.code ?? null,
    error_message: pi.last_payment_error?.message ?? null,
    stripe_event_raw: event as unknown as Record<string, unknown>,
  });

  await setOrderStatus(backup, orderId, 'failed');
  await alert(
    `*Payment failed* — order \`${orderId}\` $${(pi.amount / 100).toFixed(2)} (${pi.last_payment_error?.code ?? 'unknown'})`,
  );
}

async function handlePaymentIntentRequiresAction(
  event: Stripe.Event,
  backup: ReturnType<typeof getBackupServiceClient>,
  auditKey: string,
): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const existing = await findOrderByPaymentIntent(backup, pi.id);
  if (!existing) return;

  await backup
    .from('payments')
    .update({
      status: 'requires_action',
      next_action: (pi.next_action as unknown as Record<string, unknown>) ?? null,
    })
    .eq('id', existing.payments_id);

  await insertPaymentAudit(backup, {
    order_id: existing.order_id,
    kind: existing.kind as PaymentInsert['kind'],
    status: 'requires_action',
    amount: pi.amount / 100,
    stripe_payment_intent_id: pi.id,
    idempotency_key: auditKey,
    next_action: (pi.next_action as unknown as Record<string, unknown>) ?? null,
    stripe_event_raw: event as unknown as Record<string, unknown>,
  });
  // orders.status unchanged — frontend Stripe.js completes 3DS.
}

async function handlePaymentIntentCanceled(
  event: Stripe.Event,
  backup: ReturnType<typeof getBackupServiceClient>,
  auditKey: string,
): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const existing = await findOrderByPaymentIntent(backup, pi.id);
  if (!existing) return;

  await backup
    .from('payments')
    .update({ status: 'cancelled', processed_at: new Date().toISOString() })
    .eq('id', existing.payments_id);

  await insertPaymentAudit(backup, {
    order_id: existing.order_id,
    kind: existing.kind as PaymentInsert['kind'],
    status: 'cancelled',
    amount: pi.amount / 100,
    stripe_payment_intent_id: pi.id,
    idempotency_key: auditKey,
    stripe_event_raw: event as unknown as Record<string, unknown>,
  });

  // Only set order cancelled if no other succeeded payment exists.
  const { count } = await backup
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', existing.order_id)
    .eq('status', 'succeeded');
  if ((count ?? 0) === 0) {
    await setOrderStatus(backup, existing.order_id, 'cancelled', {
      cancelled_at: new Date().toISOString(),
    });
  }
}

async function handleChargeRefunded(
  event: Stripe.Event,
  backup: ReturnType<typeof getBackupServiceClient>,
  auditKey: string,
): Promise<void> {
  const charge = event.data.object as Stripe.Charge;

  // Find parent payment by charge id.
  const { data: parent } = await backup
    .from('payments')
    .select('id,order_id,amount')
    .eq('stripe_charge_id', charge.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const orderId = parent?.order_id ?? extractOrderIdFromEvent(event);
  if (!orderId) return;

  const refundedAmount = (charge.amount_refunded ?? 0) / 100;

  // INSERT refund audit row. If the admin-execute path already inserted
  // (idempotency_key=refund:{approval_id}), this audit-key insert is independent.
  const refundList = charge.refunds?.data ?? [];
  const latestRefund = refundList[0];

  await insertPaymentAudit(backup, {
    order_id: orderId,
    kind: 'refund',
    status: 'succeeded',
    amount: refundedAmount,
    stripe_charge_id: charge.id,
    stripe_refund_id: latestRefund?.id ?? null,
    parent_payment_id: parent?.id ?? null,
    idempotency_key: auditKey,
    stripe_event_raw: event as unknown as Record<string, unknown>,
  });

  // Recompute orders.status: cumulative refunds >= paid -> refunded.
  const { data: payRows } = await backup
    .from('payments')
    .select('kind,status,amount')
    .eq('order_id', orderId)
    .eq('status', 'succeeded');
  if (payRows) {
    const paid = payRows
      .filter((r: { kind: string; amount: number | string }) => r.kind === 'full_charge')
      .reduce((s: number, r: { amount: number | string }) => s + Number(r.amount), 0);
    const refunded = payRows
      .filter((r: { kind: string; amount: number | string }) => r.kind === 'refund')
      .reduce((s: number, r: { amount: number | string }) => s + Number(r.amount), 0);
    if (paid > 0 && refunded >= paid) {
      await setOrderStatus(backup, orderId, 'refunded');
    }
  }
}

async function handleChargeDispute(
  event: Stripe.Event,
  backup: ReturnType<typeof getBackupServiceClient>,
  auditKey: string,
): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return;

  const { data: parent } = await backup
    .from('payments')
    .select('id,order_id')
    .eq('stripe_charge_id', chargeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!parent) return;

  // Set the original payment row to disputed (open) or succeeded (won).
  const newStatus =
    event.type === 'charge.dispute.closed' && dispute.status === 'won'
      ? 'succeeded'
      : 'disputed';

  await backup.from('payments').update({ status: newStatus }).eq('id', parent.id);

  await insertPaymentAudit(backup, {
    order_id: parent.order_id,
    kind: 'capture', // overload: dispute audit goes in capture kind (no dispute enum in D1)
    status: newStatus as PaymentInsert['status'],
    amount: dispute.amount / 100,
    stripe_charge_id: chargeId,
    parent_payment_id: parent.id,
    idempotency_key: auditKey,
    stripe_event_raw: event as unknown as Record<string, unknown>,
  });

  if (event.type === 'charge.dispute.created') {
    await alert(
      `*DISPUTE OPENED* — order \`${parent.order_id}\` $${(dispute.amount / 100).toFixed(2)} (${dispute.reason})`,
    );
  } else if (dispute.status === 'lost') {
    await alert(`*Dispute LOST* — order \`${parent.order_id}\``);
  } else if (dispute.status === 'won') {
    await alert(`*Dispute WON* — order \`${parent.order_id}\``);
  }
}
