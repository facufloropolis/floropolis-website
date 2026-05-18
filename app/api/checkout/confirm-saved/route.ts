// POST /api/checkout/confirm-saved — confirm a SetupIntent with user's saved pm
// v1 | 2026-05-18 | Job_PM CHK-POLISH [V8 SHADOW]
//
// Why: when the /checkout page already created a session (order + SetupIntent)
// and the user picks "Use saved card ending in 4242", we don't want to create a
// SECOND order. We just confirm the existing SetupIntent server-side with the
// saved payment_method_id. The setup_intent.succeeded webhook then fires the
// Mode A/B/C side-effects exactly like a browser-side confirmSetup() would.
//
// Body: { order_id: number }
//   Loads the order, checks user_id == auth.uid, looks up the saved pm from
//   prior orders, attaches+confirms on the existing setup intent.
//
// Auth: REQUIRED. Cross-checks order ownership before touching Stripe.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getStripe, assertStripeEnv } from '@/lib/stripe/client';

interface ConfirmBody {
  order_id: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  assertStripeEnv();

  // ---- 1. Auth ----
  let userId: string;
  try {
    const userClient = await createBackupServerClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    userId = user.id;
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'checkout/confirm-saved', step: 'auth' } });
    return NextResponse.json({ error: 'auth_failed' }, { status: 500 });
  }

  // ---- 2. Parse body ----
  let body: ConfirmBody;
  try {
    body = (await req.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const orderId = Number(body.order_id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'invalid_order_id' }, { status: 400 });
  }

  const backup = getBackupServiceClient();

  // ---- 3. Load order, verify ownership + extract setup_intent_id ----
  const { data: order, error: orderErr } = await backup
    .from('orders')
    .select('id,user_id,stripe_setup_intent_id,stripe_customer_id,status')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr || !order) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  }
  if (order.user_id !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!order.stripe_setup_intent_id) {
    return NextResponse.json({ error: 'order_has_no_setup_intent' }, { status: 400 });
  }

  // ---- 4. Find most recent saved pm for this user ----
  const { data: priorPmRow } = await backup
    .from('orders')
    .select('stripe_payment_method_id')
    .eq('user_id', userId)
    .not('stripe_payment_method_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const savedPmId: string | null = priorPmRow?.stripe_payment_method_id ?? null;
  if (!savedPmId) {
    return NextResponse.json({ error: 'no_saved_card' }, { status: 400 });
  }

  // ---- 5. Confirm the SetupIntent with the saved pm ----
  const stripe = getStripe();
  let setupIntent;
  try {
    setupIntent = await stripe.setupIntents.confirm(order.stripe_setup_intent_id, {
      payment_method: savedPmId,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: 'checkout/confirm-saved', step: 'stripe_confirm' },
    });
    const stripeErr = err as { message?: string; type?: string; code?: string; raw?: { message?: string } };
    return NextResponse.json(
      {
        error: 'stripe_confirm_failed',
        message: `${stripeErr.type ?? 'StripeError'}/${stripeErr.code ?? 'unknown'}: ${stripeErr.message ?? stripeErr.raw?.message ?? 'unknown'}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    order_id: orderId,
    setup_intent_id: setupIntent.id,
    status: setupIntent.status,
    next_action: setupIntent.next_action ?? null,
  });
}
