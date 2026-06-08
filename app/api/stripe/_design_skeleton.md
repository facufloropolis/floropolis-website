# D3 Stripe API — File Skeleton (DESIGN ONLY, NO CODE)

v1 | 2026-05-17 | Job_PM W2-S6
Pairs with: /Users/facu/Claude_MA_v8/Job_PM/kb/projects/d3_stripe_webhook_design.md
Status: skeleton for wave 3 implementation
DO NOT add runnable code to this file.

## File 1: `app/api/stripe/webhook/route.ts`

```
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

POST(req: NextRequest): Promise<NextResponse>
  reads:    raw body, 'stripe-signature' header
  reads DB: orders, payments (lookup by stripe_payment_intent_id / setup_intent_id)
  writes DB: payments (INSERT new per event, UPDATE existing on PI match),
             orders (status transitions, stripe_* ids, paid_at)
  returns:  200 {received:true} | 200 {deduped:true} | 400 {signature_invalid|malformed}
  throws:   never (wraps + Sentry)

Internal handlers (split to _handlers.ts):
  handleSetupIntentSucceeded(evt)   — Mode B/C inline follow-up
  handleSetupIntentFailed(evt)
  handlePaymentIntentSucceeded(evt) — preauth → preauth_held, full → paid
  handlePaymentIntentFailed(evt)    — Telegram alert
  handlePaymentIntentRequiresAction(evt) — store next_action
  handleChargeRefunded(evt)         — idempotent, recompute orders.status
  handleChargeDispute(evt)          — Telegram alert
```

## File 2: `app/api/checkout/session/route.ts`

```
export const runtime = 'nodejs'

POST(req: NextRequest): Promise<NextResponse>
  body:     { items: [{sku_id, quantity}], requested_delivery_date,
              billing_address_id|inline, shipping_address_id|inline, customer_note? }
  auth:     supabase.auth.getUser() — 401 if anonymous
  reads DB: client_profiles, catalog_published, orders (rate limit),
            payments (day cap), addresses
  writes DB: addresses (if inline new), orders (INSERT status='pending_payment'),
             order_lines (one per item, snapshot cols), payments (seed kind='preauth' status='pending')
  external: Stripe.customers.create-or-retrieve, Stripe.setupIntents.create
  returns:  200 { order_id, order_number, mode, client_secret, publishable_key, next_step }
            400 { sku_unavailable | amount_cap_exceeded | postal_code_invalid | invalid_delivery_date }
            401 { unauthenticated } | 429 { rate_limited, retry_after_seconds }
            500 { stripe_unavailable }

helper: computePaymentMode(deliveryDate, today): {
  mode, lead_time_days, scheduled_preauth_at, scheduled_charge_at
}
```

## File 3: `app/api/refunds/[id]/execute/route.ts`

```
export const runtime = 'nodejs'

POST(req, { params: { id } }): Promise<NextResponse>
  auth:     getUser() + is_admin()
  reads DB: refund_approvals (status='pending', quorum_met, expires_at),
            payments (parent charge), orders
  writes DB: payments (INSERT kind='refund' status='pending', then UPDATE with stripe_refund_id),
             refund_approvals (status='executed', executed_at, executed_payment_id),
             orders (status='refunded' if cumulative refunds ≥ paid)
  external: stripe.refunds.create({charge, amount, metadata}) with Idempotency-Key=refund:{id}
  returns:  200 {refund_id, payments_row_id, new_order_status}
            400 {quorum_not_met|already_executed|expired} | 403 {not_admin} | 404 | 500 {stripe_failed}
```

## File 4: `lib/stripe/client.ts`

```
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.acacia',
  typescript: true,
  appInfo: { name: 'floropolis', version: '0.1.0' },
})

export function assertStripeEnv(): void
  // throws at import time if STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET missing
```

## File 5: `lib/stripe/idempotency.ts`

```
keyForWebhookEvent(eventId): `webhook:${eventId}`
keyForScheduledCharge(orderId, when): `charge:${orderId}:${YYYY-MM-DD}`
keyForScheduledPreauth(orderId, when): `preauth:${orderId}:${YYYY-MM-DD}`
keyForSetupIntent(orderId): `setup:${orderId}`
keyForRefund(refundApprovalId): `refund:${refundApprovalId}`
```

## File 6: `lib/checkout/totals.ts`

```
interface CartItem { sku_id, quantity }
interface SkuCatalogSnapshot { sku_id, name, variety, size_cm, selling_unit, vendor, computed_price, deal_price }
interface CartTotals {
  lines: [{sku_id, sku_*_snapshot, quantity, unit_price_locked, line_total_locked,
           catalog_price_at_lock, is_on_deal_at_lock}],
  subtotal, shipping_total: 0, tax_total: 0, discount_total: 0, grand_total, currency: 'USD'
}

computeTotals(items: CartItem[], catalog: Map<sku_id, snapshot>): CartTotals
  reads: none (pure)
  writes: none (pure)
  throws: 'sku_missing' | 'quantity_invalid' | 'amount_negative'
```

## ENV VARS REQUIRED (wave 3 ops)

| Name | Source | Already set? |
|------|--------|--------------|
| `STRIPE_SECRET_KEY` | Stripe dashboard | YES (sk_test_*) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe dashboard | YES (pk_test_*) |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard (after registering endpoint) | NO — wave 3 task |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | verify |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | existing | YES |

## TEST PLAN (wave 3 reference)

- `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- Test cards: 4242 (success), 4000 0027 6000 3184 (3DS), 4000 0000 0000 0341 (insufficient_funds on capture)
- Manual /api/checkout/session with lead=12/7/4 fixtures
- `python scripts/jobs/scheduled_charges.py --dry-run`
