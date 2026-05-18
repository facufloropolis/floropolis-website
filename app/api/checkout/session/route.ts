// POST /api/checkout/session — cart -> orders/order_lines + Stripe SetupIntent
// v1 | 2026-05-17 | Job_PM W3-S9 [V8 SHADOW]
// Implements d3_stripe_webhook_design.md §4 (checkout session creator).
// Writes to supabase-backup (NOT prod) via service-role client.
// Returns client_secret for Stripe.js Elements to confirm the card.
//
// Modes (lead_time_days from requested_delivery_date - today):
//   Mode A: lead_time >= 10  -> save card only; cron does preauth at T-7 + charge at T-5
//   Mode B: 5 <= lead_time < 10 -> save card + immediate $1 preauth; cron does charge at T-5
//   Mode C: lead_time < 5    -> save card + immediate full charge
//
// This route writes the SetupIntent + seeds the payments ledger row. The Mode B/C
// inline preauth/charge fires when setup_intent.succeeded webhook arrives.
//
// TODO wave-3: rate limit (Layer 4) currently in-process counter; replace with
//              Supabase RPC or Upstash when we have multi-instance traffic.
// TODO wave-3: day-total cap value pending Facu confirm ($10k vs $20k — design Q1).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getStripe, STRIPE_PUBLISHABLE_KEY, assertStripeEnv } from '@/lib/stripe/client';
import { keyForSetupIntent } from '@/lib/stripe/idempotency';
import {
  computeTotals,
  TotalsError,
  type CartItem,
  type SkuMirrorSnapshot,
} from '@/lib/checkout/totals';

// ============================================================================
// Constants (Phase-4 security layers, design §5)
// ============================================================================
const PER_ORDER_AMOUNT_CAP_USD = 5000;
const PER_DAY_TOTAL_CAP_USD = 10000; // OPEN: Facu confirm $10k vs $20k
const RATE_LIMIT_PER_USER_HOURLY = 5;
const US_POSTAL_REGEX = /^\d{5}(-\d{4})?$/;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1702689983';

// ============================================================================
// Types
// ============================================================================
interface InlineAddress {
  recipient_name: string;
  business_name?: string | null;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  country?: string; // default 'US'
}

interface CheckoutBody {
  items: CartItem[];
  requested_delivery_date: string; // YYYY-MM-DD
  billing_address_id?: number;
  billing_address?: InlineAddress;
  shipping_address_id?: number;
  shipping_address?: InlineAddress;
  customer_note?: string | null;
}

type PaymentMode = 'mode_a' | 'mode_b' | 'mode_c';

interface PaymentModeResult {
  mode: PaymentMode;
  lead_time_days: number;
  scheduled_preauth_at: string | null;
  scheduled_charge_at: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

function daysBetween(from: Date, to: Date): number {
  const ms = to.setHours(0, 0, 0, 0) - from.setHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** Map lead-time days -> payment mode + scheduled timestamps (design §3). */
function computePaymentMode(
  deliveryDate: Date,
  today: Date = new Date(),
): PaymentModeResult {
  const lead = daysBetween(new Date(today), new Date(deliveryDate));
  if (lead >= 10) {
    const preauth = new Date(deliveryDate);
    preauth.setDate(preauth.getDate() - 7);
    const charge = new Date(deliveryDate);
    charge.setDate(charge.getDate() - 5);
    return {
      mode: 'mode_a',
      lead_time_days: lead,
      scheduled_preauth_at: preauth.toISOString(),
      scheduled_charge_at: charge.toISOString(),
    };
  }
  if (lead >= 5) {
    const charge = new Date(deliveryDate);
    charge.setDate(charge.getDate() - 5);
    return {
      mode: 'mode_b',
      lead_time_days: lead,
      scheduled_preauth_at: null, // fires inline on setup_intent.succeeded
      scheduled_charge_at: charge.toISOString(),
    };
  }
  return {
    mode: 'mode_c',
    lead_time_days: Math.max(lead, 0),
    scheduled_preauth_at: null,
    scheduled_charge_at: null, // fires inline on setup_intent.succeeded
  };
}

function validateAddress(a: InlineAddress | undefined): string | null {
  if (!a) return 'address_missing';
  if (!a.recipient_name || !a.line1 || !a.city || !a.state || !a.postal_code) {
    return 'address_incomplete';
  }
  const country = (a.country || 'US').toUpperCase();
  if (country === 'US' && !US_POSTAL_REGEX.test(a.postal_code)) {
    return 'postal_code_invalid';
  }
  return null;
}

async function sendTelegramAlert(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      },
    );
  } catch (err) {
    console.error('[checkout/session] Telegram alert failed:', err);
  }
}

// ============================================================================
// Handler
// ============================================================================
export async function POST(req: NextRequest): Promise<NextResponse> {
  assertStripeEnv();
  const startedAt = Date.now();

  // ---- 1. Auth (BACKUP session -- Phase 4 SEGURISIMA) ----
  let userId: string;
  let userEmail: string | null = null;
  try {
    const userClient = await createBackupServerClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'unauthenticated' },
        { status: 401 },
      );
    }
    userId = user.id;
    userEmail = user.email ?? null;
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'checkout/session', step: 'auth' } });
    return NextResponse.json({ error: 'auth_failed' }, { status: 500 });
  }

  // ---- 2. Parse body ----
  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.items?.length) {
    return NextResponse.json({ error: 'empty_cart' }, { status: 400 });
  }
  if (!body.requested_delivery_date) {
    return NextResponse.json(
      { error: 'requested_delivery_date_missing' },
      { status: 400 },
    );
  }
  const deliveryDate = new Date(body.requested_delivery_date + 'T00:00:00Z');
  if (Number.isNaN(deliveryDate.getTime())) {
    return NextResponse.json(
      { error: 'invalid_delivery_date' },
      { status: 400 },
    );
  }

  // ---- 3. Address validation (Layer 6) ----
  const billing = body.billing_address;
  const shipping = body.shipping_address;
  if (!body.billing_address_id && !billing) {
    return NextResponse.json({ error: 'billing_address_required' }, { status: 400 });
  }
  if (!body.shipping_address_id && !shipping) {
    return NextResponse.json({ error: 'shipping_address_required' }, { status: 400 });
  }
  for (const a of [billing, shipping]) {
    if (!a) continue;
    const err = validateAddress(a);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const backup = getBackupServiceClient();

  // ---- 4. Rate limit (Layer 4): >5 orders/1h -> 429 ----
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: rlErr } = await backup
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', oneHourAgo);
    if (rlErr) {
      console.error('[checkout/session] rate-limit query failed:', rlErr);
    } else if ((count ?? 0) >= RATE_LIMIT_PER_USER_HOURLY) {
      return NextResponse.json(
        { error: 'rate_limited', retry_after_seconds: 3600 },
        { status: 429 },
      );
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'checkout/session', step: 'rate_limit' } });
  }

  // ---- 5. SKU validity vs mirror (Layer 5) ----
  const skuIds = Array.from(new Set(body.items.map((i) => i.sku_id)));
  const { data: mirrorRows, error: mirrorErr } = await backup
    .from('floropolis_inventory_mirror')
    .select('id,name,variety,length,unit,vendor,price,is_on_deal,deal_price')
    .in('id', skuIds);
  if (mirrorErr) {
    Sentry.captureException(mirrorErr, {
      tags: { route: 'checkout/session', step: 'mirror_fetch' },
    });
    return NextResponse.json(
      { error: 'mirror_unavailable' },
      { status: 500 },
    );
  }
  const mirror = new Map<number, SkuMirrorSnapshot>();
  for (const row of mirrorRows ?? []) {
    mirror.set(Number(row.id), {
      id: Number(row.id),
      name: row.name,
      variety: row.variety,
      length: row.length,
      unit: row.unit,
      vendor: row.vendor,
      price: Number(row.price),
      is_on_deal: !!row.is_on_deal,
      deal_price: row.deal_price != null ? Number(row.deal_price) : null,
    });
  }

  // ---- 6. Compute totals ----
  let totals;
  try {
    totals = computeTotals(body.items, mirror);
  } catch (e) {
    if (e instanceof TotalsError) {
      return NextResponse.json(
        { error: e.code, message: e.message, sku_id: e.sku_id },
        { status: 400 },
      );
    }
    throw e;
  }

  // ---- 7. Amount cap (Layer 2) ----
  if (totals.grand_total > PER_ORDER_AMOUNT_CAP_USD) {
    await sendTelegramAlert(
      `*Amount cap exceeded* — user \`${userId}\` tried checkout for $${totals.grand_total.toFixed(2)} (cap $${PER_ORDER_AMOUNT_CAP_USD})`,
    );
    return NextResponse.json(
      {
        error: 'amount_cap_exceeded',
        cap: PER_ORDER_AMOUNT_CAP_USD,
        attempted: totals.grand_total,
      },
      { status: 400 },
    );
  }

  // ---- 8. Day total cap (Layer 3): alert-only ----
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: todayOrders } = await backup
      .from('orders')
      .select('grand_total')
      .eq('user_id', userId)
      .gte('created_at', startOfDay.toISOString());
    const dayTotal =
      (todayOrders ?? []).reduce(
        (s: number, o: { grand_total: number | string }) => s + Number(o.grand_total),
        0,
      ) + totals.grand_total;
    if (dayTotal > PER_DAY_TOTAL_CAP_USD) {
      await sendTelegramAlert(
        `*Day total cap exceeded* — user \`${userId}\` day total $${dayTotal.toFixed(2)} (cap $${PER_DAY_TOTAL_CAP_USD}). Alert-only, NOT blocked.`,
      );
    }
  } catch (err) {
    console.warn('[checkout/session] day-cap check failed (non-fatal):', err);
  }

  // ---- 9. Payment mode + schedule ----
  const modeInfo = computePaymentMode(deliveryDate);

  // ---- 10. Persist inline addresses if provided ----
  let billingAddressId = body.billing_address_id ?? null;
  let shippingAddressId = body.shipping_address_id ?? null;

  async function insertAddress(
    a: InlineAddress,
    kind: 'billing' | 'shipping',
  ): Promise<number | null> {
    const { data, error } = await backup
      .from('addresses')
      .insert({
        user_id: userId,
        kind,
        recipient_name: a.recipient_name,
        business_name: a.business_name ?? null,
        phone: a.phone ?? null,
        line1: a.line1,
        line2: a.line2 ?? null,
        city: a.city,
        state: a.state,
        postal_code: a.postal_code,
        country: (a.country || 'US').toUpperCase(),
      })
      .select('id')
      .single();
    if (error) {
      Sentry.captureException(error, {
        tags: { route: 'checkout/session', step: `insert_${kind}_address` },
      });
      return null;
    }
    return data?.id ?? null;
  }

  if (!billingAddressId && billing) {
    billingAddressId = await insertAddress(billing, 'billing');
  }
  if (!shippingAddressId && shipping) {
    shippingAddressId = await insertAddress(shipping, 'shipping');
  }

  const billingSnap = billing ?? null;
  const shippingSnap = shipping ?? null;

  // ---- 11. INSERT order ----
  const { data: orderRow, error: orderErr } = await backup
    .from('orders')
    .insert({
      user_id: userId,
      status: 'pending_payment',
      payment_mode: modeInfo.mode,
      lead_time_days: modeInfo.lead_time_days,
      requested_delivery_date: body.requested_delivery_date,
      scheduled_preauth_at: modeInfo.scheduled_preauth_at,
      scheduled_charge_at: modeInfo.scheduled_charge_at,
      currency: 'USD',
      subtotal: totals.subtotal,
      shipping_total: totals.shipping_total,
      tax_total: totals.tax_total,
      discount_total: totals.discount_total,
      grand_total: totals.grand_total,
      billing_address_id: billingAddressId,
      shipping_address_id: shippingAddressId,
      billing_address_snapshot: billingSnap,
      shipping_address_snapshot: shippingSnap,
      customer_note: body.customer_note ?? null,
      source: 'web',
      submitted_at: new Date().toISOString(),
    })
    .select('id,order_number')
    .single();

  if (orderErr || !orderRow) {
    Sentry.captureException(orderErr, {
      tags: { route: 'checkout/session', step: 'insert_order' },
    });
    return NextResponse.json(
      { error: 'order_insert_failed', detail: orderErr?.message },
      { status: 500 },
    );
  }

  const orderId: number = orderRow.id;

  // ---- 12. INSERT order_lines ----
  const lineRows = totals.lines.map((l) => ({
    order_id: orderId,
    sku_id: l.sku_id,
    sku_name_snapshot: l.sku_name_snapshot,
    sku_variety_snapshot: l.sku_variety_snapshot,
    sku_length_snapshot: l.sku_length_snapshot,
    sku_unit_snapshot: l.sku_unit_snapshot,
    sku_vendor_snapshot: l.sku_vendor_snapshot,
    quantity: l.quantity,
    unit_price_locked: l.unit_price_locked,
    line_total_locked: l.line_total_locked,
    currency: 'USD',
    catalog_price_at_lock: l.catalog_price_at_lock,
    is_on_deal_at_lock: l.is_on_deal_at_lock,
  }));
  const { error: linesErr } = await backup.from('order_lines').insert(lineRows);
  if (linesErr) {
    Sentry.captureException(linesErr, {
      tags: { route: 'checkout/session', step: 'insert_order_lines' },
    });
    // Don't abandon — order exists, surface as 500. Cleanup is a manual ops task.
    return NextResponse.json(
      { error: 'order_lines_insert_failed', order_id: orderId },
      { status: 500 },
    );
  }

  // ---- 13. Stripe: get-or-create Customer + SetupIntent ----
  const stripe = getStripe();
  let stripeCustomerId: string;
  try {
    // Reuse existing Customer if user already has one (look in most recent order).
    const { data: priorOrder } = await backup
      .from('orders')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (priorOrder?.stripe_customer_id) {
      stripeCustomerId = priorOrder.stripe_customer_id;
    } else {
      // Idempotency key includes a v2 suffix so an earlier diagnostic test
      // (which consumed `customer:${userId}` with potentially different params)
      // doesn't collide with this real request. Bump on any breaking schema change.
      const customer = await stripe.customers.create(
        {
          email: userEmail ?? undefined,
          metadata: { floropolis_user_id: userId },
        },
        { idempotencyKey: `customer:${userId}:v2` },
      );
      stripeCustomerId = customer.id;
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: 'checkout/session', step: 'stripe_customer' },
    });
    // Surface the actual Stripe error message so we can debug from the frontend
    // (kept terse; full stack goes to Sentry).
    const stripeErr = err as { message?: string; type?: string; code?: string; raw?: { message?: string } };
    return NextResponse.json(
      {
        error: 'stripe_customer_failed',
        // 'message' so the existing /checkout page displays it inline.
        message: `${stripeErr.type ?? 'StripeError'}/${stripeErr.code ?? 'unknown'}: ${stripeErr.message ?? stripeErr.raw?.message ?? 'unknown'}`,
      },
      { status: 500 },
    );
  }

  const setupIdempotencyKey = keyForSetupIntent(orderId);
  let setupIntent;
  try {
    setupIntent = await stripe.setupIntents.create(
      {
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        usage: 'off_session',
        metadata: {
          order_id: String(orderId),
          order_number: orderRow.order_number,
          floropolis_user_id: userId,
          payment_mode: modeInfo.mode,
        },
      },
      { idempotencyKey: setupIdempotencyKey },
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: 'checkout/session', step: 'stripe_setup_intent' },
    });
    return NextResponse.json(
      { error: 'stripe_setup_intent_failed' },
      { status: 500 },
    );
  }

  // ---- 14. Persist stripe_customer_id + stripe_setup_intent_id on order ----
  await backup
    .from('orders')
    .update({
      stripe_customer_id: stripeCustomerId,
      stripe_setup_intent_id: setupIntent.id,
    })
    .eq('id', orderId);

  // ---- 15. Seed payments ledger row (kind=preauth, status=pending, amount=0) ----
  const { error: paymentSeedErr } = await backup.from('payments').insert({
    order_id: orderId,
    kind: 'preauth',
    status: 'pending',
    amount: 0,
    currency: 'USD',
    stripe_setup_intent_id: setupIntent.id,
    idempotency_key: setupIdempotencyKey,
  });
  if (paymentSeedErr) {
    // UNIQUE violation = retry of same checkout; safe to ignore.
    if (paymentSeedErr.code !== '23505') {
      Sentry.captureException(paymentSeedErr, {
        tags: { route: 'checkout/session', step: 'seed_payments' },
      });
    }
  }

  console.log(
    `[checkout/session] order=${orderId} mode=${modeInfo.mode} grand=$${totals.grand_total.toFixed(2)} user=${userId} elapsed=${Date.now() - startedAt}ms`,
  );

  return NextResponse.json({
    order_id: orderId,
    order_number: orderRow.order_number,
    mode: modeInfo.mode,
    lead_time_days: modeInfo.lead_time_days,
    client_secret: setupIntent.client_secret,
    publishable_key: STRIPE_PUBLISHABLE_KEY,
    grand_total: totals.grand_total,
    currency: 'USD',
    next_step: 'confirm_card',
  });
}
