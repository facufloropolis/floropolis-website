// POST /api/checkout/session — cart -> orders/order_lines + Stripe SetupIntent
// v2 | 2026-05-19 | Job_PM [V8 SHADOW] — T1 guest checkout + T2 EIN/B2B tax
// v1 | 2026-05-17 | Job_PM W3-S9 [V8 SHADOW]
// Implements d3_stripe_webhook_design.md §4 (checkout session creator).
// Writes to supabase-backup (NOT prod) via service-role client.
// Returns client_secret for Stripe.js Elements to confirm the card.
//
// v2 changes (T1 + T2):
//   - Auth optional. Guest checkout creates an auth.users row on the fly
//     (via service-role admin createUser with email-confirm bypass) so the
//     FK on orders.user_id stays intact. Guests are NOT auto-confirmed for
//     password login — admin creates them as confirmed but with no password
//     so they can't sign in later without going through /signup.
//   - EIN body field, normalized to 9 digits. Drives tax_treatment = B2B.
//   - Shipping state + EIN feed computeTotals() so tax_total + grand_total
//     reflect the chosen mode. Persisted on orders.tax_treatment / tax_amount
//     / ein at INSERT time.
//   - Optional discount_amount accepted from body (Phase D wires real
//     consumption later; we accept + clamp here so callers can pass it
//     today without breaking).
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
  normalizeEIN,
  TotalsError,
  type CartItem,
  type SkuMirrorSnapshot,
} from '@/lib/checkout/totals';
import {
  computeDiscountApplications,
  type DiscountRule,
} from '@/lib/checkout/discounts';

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
  // CHK-POLISH (2026-05-18): if true, the user picked their saved payment_method
  // on the checkout page. We confirm the SetupIntent server-side with that pm_id
  // instead of returning a client_secret for the browser Elements widget.
  use_saved_payment_method?: boolean;
  // T1 guest checkout: when no session is present the page sends contact info
  // here. We provision an auth.users row + client_profile so orders.user_id FK
  // stays intact and the user can later upgrade to a real signup.
  guest_email?: string | null;
  guest_phone?: string | null;
  guest_business_name?: string | null;
  // T2 EIN/B2B: optional 9-digit US Tax ID. If present + valid, order is
  // marked B2B and tax_total = 0 regardless of shipping_state.
  ein?: string | null;
  // Phase D discount consumption (accepted now, real consumer to land in
  // a later commit). Applies BEFORE tax. Clamped to subtotal.
  discount_amount?: number | null;
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

  // ---- 1. Parse body (we need guest_email BEFORE auth fallback) ----
  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // ---- 2. Auth (BACKUP session) OR guest provisioning (T1) ----
  // Signed-in path takes priority. If no session AND guest_email is provided,
  // we provision a confirmed-but-passwordless auth.users row so the order FK
  // is satisfied and the user can later "claim" the account via /signup.
  let userId: string;
  let userEmail: string | null = null;
  let isGuest = false;
  try {
    const userClient = await createBackupServerClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      userId = user.id;
      userEmail = user.email ?? null;
    } else {
      // Guest flow.
      const guestEmail = (body.guest_email ?? '').trim().toLowerCase();
      if (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
        return NextResponse.json(
          { error: 'guest_email_required' },
          { status: 401 },
        );
      }
      const backupAdmin = getBackupServiceClient();
      // Try to find an existing auth user with this email (returning guest
      // or someone who signed up but forgot). Service-role admin scan.
      const existing = await backupAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      let matched = existing?.data?.users?.find(
        (u) => (u.email ?? '').toLowerCase() === guestEmail,
      );
      if (!matched) {
        // Create a new confirmed user. No password set — they can claim
        // the account later via /signup or email OTP (signInWithOtp creates
        // the password via the magic-link flow).
        const created = await backupAdmin.auth.admin.createUser({
          email: guestEmail,
          email_confirm: true,
          user_metadata: {
            source: 'guest_checkout',
            business_name: body.guest_business_name ?? null,
          },
        });
        if (created.error || !created.data?.user) {
          Sentry.captureException(created.error, {
            tags: { route: 'checkout/session', step: 'guest_provision' },
          });
          return NextResponse.json(
            { error: 'guest_provision_failed', detail: created.error?.message },
            { status: 500 },
          );
        }
        matched = created.data.user;
        // Seed a client_profile row so the user lands in our directory.
        await backupAdmin.from('client_profiles').insert({
          user_id: matched.id,
          business_name: body.guest_business_name ?? null,
          phone: body.guest_phone ?? null,
          status: 'approved', // guest checkout = approved by default; admin reviews later
          notes: 'created via guest checkout',
        });
      }
      userId = matched.id;
      userEmail = matched.email ?? guestEmail;
      isGuest = true;
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'checkout/session', step: 'auth' } });
    return NextResponse.json({ error: 'auth_failed' }, { status: 500 });
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
    .select('id,name,variety,length,unit,vendor,price,is_on_deal,deal_price,category')
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
  // Phase D: keep per-sku vendor + category for discount-rule matching.
  const discountMeta = new Map<number, { vendor: string | null; category: string | null }>();
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
    discountMeta.set(Number(row.id), {
      vendor: row.vendor ?? null,
      category: (row as { category?: string | null }).category ?? null,
    });
  }

  // ---- 6a. Tax rates (T2) — fetch us_state_sales_tax for the shipping state ----
  const shippingState =
    (body.shipping_address?.state ?? '').trim().toUpperCase() || null;
  const taxRates = new Map<string, number>();
  if (shippingState) {
    const { data: taxRows } = await backup
      .from('us_state_sales_tax')
      .select('state_code,rate_pct')
      .eq('state_code', shippingState);
    for (const r of taxRows ?? []) {
      taxRates.set(String(r.state_code), Number(r.rate_pct));
    }
  }
  const einDigits = normalizeEIN(body.ein);

  // ---- 6b. Pre-compute lines + active discount rules (Phase D) -----------
  // We need lines from computeTotals to feed the discount matcher, but
  // computeTotals also needs the discount amount as an input. To avoid double
  // work we run computeTotals once with discount=0 to get lines, then re-run
  // with the matched discount layered in. Slightly wasteful but keeps both
  // functions pure + deterministic.
  let baseTotals;
  try {
    baseTotals = computeTotals(body.items, mirror, {
      shipping_state: shippingState,
      taxRates,
      ein: body.ein ?? null,
      discount_amount: 0,
    });
  } catch (e) {
    if (e instanceof TotalsError) {
      return NextResponse.json(
        { error: e.code, message: e.message, sku_id: e.sku_id },
        { status: 400 },
      );
    }
    throw e;
  }

  // Fetch active discount_rules. We pull all in-window 'active' rules and let
  // the matcher decide. Volume is small (<<1000 rules) so no pagination needed.
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: ruleRows, error: rulesErr } = await backup
    .from('discount_rules')
    .select('id,scope,scope_value,discount_pct,valid_from,valid_until,min_qty,status')
    .eq('status', 'active');
  if (rulesErr) {
    console.error('[checkout/session] discount_rules fetch:', rulesErr);
    // Non-fatal: continue with no discounts rather than blocking checkout.
  }
  const activeRules: DiscountRule[] = (ruleRows ?? []).map((r) => ({
    id: String(r.id),
    scope: String(r.scope),
    scope_value: String(r.scope_value),
    discount_pct: Number(r.discount_pct),
    status: String(r.status),
    valid_from: r.valid_from ?? null,
    valid_until: r.valid_until ?? null,
    min_qty: Number(r.min_qty) || 1,
  }));

  const discountResult = computeDiscountApplications(
    baseTotals.lines,
    activeRules,
    discountMeta,
    userId,
    todayIso,
  );

  // ---- 6c. Re-compute totals with discount layered in ----
  let totals;
  try {
    totals = computeTotals(body.items, mirror, {
      shipping_state: shippingState,
      taxRates,
      ein: body.ein ?? null,
      discount_amount: discountResult.totalDiscount,
    });
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
      tax_amount: totals.tax_total, // T2: orders.tax_amount mirrors tax_total
      tax_treatment: totals.tax_treatment, // T2: 'B2B' or 'B2C'
      ein: einDigits ? `${einDigits.slice(0, 2)}-${einDigits.slice(2)}` : null, // T2: XX-XXXXXXX snapshot
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
  const { data: insertedLines, error: linesErr } = await backup
    .from('order_lines')
    .insert(lineRows)
    .select('id, sku_id');
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

  // ---- 12b. INSERT discount_applications (Phase D) ----------------------
  // One row per matched application. Map back from sku_id -> order_lines.id
  // using the just-inserted rows. Best-effort: a failure here is logged but
  // does not block checkout (the discount is already in the order totals).
  if (discountResult.applications.length > 0 && insertedLines) {
    const lineIdBySku: Record<number, number> = {};
    for (const row of insertedLines as Array<{ id: number; sku_id: number }>) {
      lineIdBySku[Number(row.sku_id)] = Number(row.id);
    }
    const applicationRows = discountResult.applications.map((a) => ({
      rule_id: a.rule_id,
      order_id: orderId,
      order_line_id:
        a.matched_line_sku_id != null
          ? (lineIdBySku[a.matched_line_sku_id] ?? null)
          : null,
      scope: a.scope,
      scope_value: a.scope_value,
      discount_pct: a.discount_pct,
      applied_amount: a.applied_amount,
    }));
    const { error: appsErr } = await backup
      .from('discount_applications')
      .insert(applicationRows);
    if (appsErr) {
      Sentry.captureException(appsErr, {
        tags: { route: 'checkout/session', step: 'insert_discount_applications' },
      });
      console.error('[checkout/session] discount_applications insert failed:', appsErr);
    }
  }

  // ---- 13. Stripe: get-or-create Customer + SetupIntent ----
  const stripe = getStripe();
  let stripeCustomerId: string;
  // CHK-POLISH: track saved pm_id from prior orders so we can both surface it
  // back to the page (for the "Use saved card" option) AND confirm the SetupIntent
  // server-side when the user picks it.
  let savedPaymentMethodId: string | null = null;
  try {
    // Reuse existing Customer if user already has one (look in most recent order).
    // ALSO grab the most recent stripe_payment_method_id — that's the saved card.
    const { data: priorOrder } = await backup
      .from('orders')
      .select('stripe_customer_id,stripe_payment_method_id')
      .eq('user_id', userId)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (priorOrder?.stripe_customer_id) {
      stripeCustomerId = priorOrder.stripe_customer_id;
      // Pull the most recent saved pm from ANY prior order for this user
      // (not just the one matched above — the user might have multiple cards
      // and the latest order might be from before they saved one).
      const { data: priorPmRow } = await backup
        .from('orders')
        .select('stripe_payment_method_id')
        .eq('user_id', userId)
        .not('stripe_payment_method_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      savedPaymentMethodId = priorPmRow?.stripe_payment_method_id ?? null;
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

  // CHK-POLISH: look up saved pm brand+last4 so the page can render
  // "Use saved card ending in 4242 (Visa)". Best-effort: if Stripe rejects the
  // lookup, fall back to "no saved card" rather than failing the whole session.
  let savedPaymentMethod: { pm_id: string; brand: string; last4: string } | null = null;
  if (savedPaymentMethodId) {
    try {
      const pm = await stripe.paymentMethods.retrieve(savedPaymentMethodId);
      if (pm.card?.brand && pm.card?.last4) {
        savedPaymentMethod = {
          pm_id: savedPaymentMethodId,
          brand: pm.card.brand,
          last4: pm.card.last4,
        };
      }
    } catch (err) {
      // Card may have been deleted / detached / customer churned. Swallow and
      // just don't offer the saved-card option this time.
      console.warn('[checkout/session] saved pm lookup failed (non-fatal):', err);
    }
  }

  const setupIdempotencyKey = keyForSetupIntent(orderId);
  let setupIntent;
  // CHK-POLISH: if the user picked "Use saved card", attach the pm AND confirm
  // server-side. The SetupIntent transitions straight to `succeeded` and our
  // existing webhook fires the Mode A/B/C side-effects normally — no browser-side
  // Elements widget needed.
  const useSaved =
    body.use_saved_payment_method === true && savedPaymentMethod != null;
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
          // Phase D: surface the discount total + N applications on the
          // SetupIntent so downstream Stripe-side observers (refund flow,
          // dashboards) can see why grand_total differs from subtotal.
          discount_total_usd: totals.discount_total.toFixed(2),
          discount_applications_count: String(discountResult.applications.length),
        },
        ...(useSaved && savedPaymentMethod
          ? {
              payment_method: savedPaymentMethod.pm_id,
              confirm: true,
            }
          : {}),
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

  // T2: snapshot EIN on client_profiles for signed-in users so it autofills
  // next checkout. Skipped for guests — they'd need to claim the account first.
  if (!isGuest && einDigits) {
    try {
      await backup
        .from('client_profiles')
        .update({ ein: `${einDigits.slice(0, 2)}-${einDigits.slice(2)}` })
        .eq('user_id', userId);
    } catch (err) {
      // Non-fatal — EIN already snapped on the order row.
      console.warn('[checkout/session] client_profiles ein update failed:', err);
    }
  }

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
    subtotal: totals.subtotal,
    discount_total: totals.discount_total,
    // Phase D: applied discount lines for the order-confirmation page to
    // render. Stripped to UI-safe fields (no PII, no rule internals beyond
    // scope + pct).
    discount_applications: discountResult.applications.map((a) => ({
      scope: a.scope,
      scope_value: a.scope_value,
      discount_pct: a.discount_pct,
      applied_amount: a.applied_amount,
      matched_line_sku_id: a.matched_line_sku_id,
    })),
    tax_total: totals.tax_total,
    tax_treatment: totals.tax_treatment,
    tax_rate_pct: totals.tax_rate_pct,
    tax_state: totals.tax_state,
    grand_total: totals.grand_total,
    currency: 'USD',
    // T1: flag so the page can show a "You're checking out as guest — claim
    // your account later" hint on the order-confirmation page.
    is_guest: isGuest,
    // CHK-POLISH: surface the saved card (if any) so the page can offer
    // "Use saved card" before mounting Stripe Elements. null if user has no
    // prior usable pm.
    saved_payment_method: savedPaymentMethod,
    // 'succeeded' when use_saved_payment_method was true and Stripe confirmed
    // the SetupIntent inline. Page uses this to skip the Elements widget and
    // jump straight to the order-confirmation interstitial.
    setup_intent_status: setupIntent.status,
    next_step: useSaved ? 'order_saved' : 'confirm_card',
  });
}
