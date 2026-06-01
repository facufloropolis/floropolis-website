# Floropolis Checkout System — Research Notes
v1 | 2026-05-13 | Job_PM

---

## Stripe Payment Architecture

### Why SetupIntent + Invoice (not PaymentIntent directly)

PaymentIntent is one charge. Invoice lets us:
- Finalize later (scheduled for T-5 via `scheduled_finalization_at`)
- Auto-retry via Smart Retries (8 attempts over 2 weeks)
- Send hosted_invoice_url as fallback if card is declined
- Issue ACH without code changes (Stripe handles routing)

Flow:
1. Customer submits checkout → Stripe.SetupIntent(usage='off_session') → saves pm_xxx
2. SetupIntent confirmed → attach to Stripe Customer as default_payment_method
3. Create Stripe Invoice (status: draft) with delivery line items
4. At T-5: server action calls invoice.finalize() + invoice.pay() → charges saved card
5. Webhook invoice.payment_succeeded → update orders.status = 'paid'

### $1 Preauth (T-7 card validation)

PaymentIntent with:
- amount: 100 (cents)
- capture_method: 'manual'
- confirm: true (off-session, using saved payment method)
- customer: stripe_customer_id

After successful auth → immediately call paymentIntent.cancel() (releases hold).
If auth fails → Telegram alert + Brevo email to customer → fallback to hosted invoice URL.

### Idempotency

Every Stripe create call uses idempotency_key = `{order_id}:{operation}`:
- `{order_id}:setup_intent`
- `{order_id}:preauth`
- `{order_id}:invoice`
- `{order_id}:charge`

Safe to retry on network failure without double-charging.

### Webhook events to handle

| Event | Action |
|---|---|
| setup_intent.succeeded | save payment_method to customer |
| payment_intent.amount_capturable_updated | preauth passed → update orders.status |
| payment_intent.payment_failed | preauth failed → alert |
| invoice.payment_succeeded | order paid → update status, generate PDF, email customer |
| invoice.payment_failed | retry scheduled → Telegram alert to Facu |
| invoice.marked_uncollectible | after retries exhausted → flag for manual intervention |

All handlers are idempotent (upsert by stripe_object_id, check if already processed).

### ACH via Stripe

- Only for orders ≥$500 (Stripe minimum for ACH is ~$1)
- Fee: 0.80% capped at $5 vs 2.9% + 30¢ for card
- T+4 clearing — requires customer to log in and verify bank account via Stripe Link
- Show ACH option in checkout only when subtotal ≥ $500

---

## FedEx API

### Authentication

FedEx uses OAuth2 client credentials:
```
POST https://apis.fedex.com/oauth/token
body: grant_type=client_credentials&client_id={API_KEY}&client_secret={SECRET}
```
Token expires in 3600s. Cache in memory, refresh when expired.

### Create Shipment

```
POST https://apis.fedex.com/ship/v1/shipments
```

Key fields:
- `requestedShipment.serviceType`: FEDEX_INTERNATIONAL_PRIORITY (FIP)
- `requestedShipment.packagingType`: YOUR_PACKAGING
- `requestedShipment.labelSpecification.labelFormatType`: PDF (for Brevo attachment)
- `requestedShipment.customsClearanceDetail.commodities[].harmonizedCode`: 0603.11 (roses) / 0603.19 (other)
- `requestedShipment.shipmentSpecialServices.specialServiceTypes`: ['ELECTRONIC_TRADE_DOCUMENTS']
- `requestedShipment.customsClearanceDetail.dutiesPayment.paymentType`: SENDER

### Electronic Trade Documents (ETD)

Setting `generateCommercialInvoice: true` in the ETD service tells FedEx to generate and file the commercial invoice electronically. This replaces paper docs. Requires:
- ISS/NSR flag in customs details
- Accurate declared value (farm cost, not retail price, for customs)
- Country of manufacture (EC = Ecuador, CO = Colombia)
- HTS code per commodity type

### Label PDF

Response includes `base64EncodedLabel` in the output. Decode → save to Supabase Storage:
```
fedex-labels/{order_id}/{BOX_SEQ}.pdf
```
Generate signed URL (7-day expiry) → attach to Brevo email to farm.

### Tracking

FedEx webhooks push tracking events to our `/api/fedex/webhook` endpoint.
Signature verified via HMAC-SHA256 using FedEx webhook secret.
Events update `dispatch_tracking.fedex_status`.

---

## Customs / Phytosanitary Research

### Cut flower import chain (US side)

1. **USDA APHIS PPQ 587** — permit required for each country of origin. Cut flowers from Ecuador and Colombia are eligible for the National Cut Flower Release Program. With this permit, flowers can be released without individual USDA inspection at every shipment. Without it, every shipment needs a USDA inspector present at point of entry.

2. **CBP Form 5106 (IOR)** — Importer of Record registration. Whoever's EIN/SSN is on this form is legally responsible for the import. Currently unknown whether K2K or Floropolis is the IOR. → JJ email sent.

3. **Customs broker** — required to file the CBP entry on each shipment. Entry cost ~$100–$250 per shipment. For ~35 shipments/month = ~$3,500–$8,750/month. Key brokers: Flexport (tech-forward), T.H. Weiss & Sons (NYC cut flower specialist, has existing Floropolis relationships possible), MHLS (Miami-based, common for flower imports).

4. **REL_NUMBER** — the CBP entry release number assigned by the broker. Currently used in the FedEx dispatch sheet as a fixed value (34458984). If this is K2K's number, Floropolis needs its own series from a broker.

5. **ISS/NSR** — International Services Summary / National Service Release. Y = shipment qualifies for the cut flower release program (inspected and approved for release without hold). Requires PPQ 587.

### Origin side (Ecuador/Colombia)

Each shipment needs a **Phytosanitary Certificate** issued by the origin country's agricultural authority (AGROCALIDAD in Ecuador, ICA in Colombia). This certifies the flowers are pest-free. Currently arranged by K2K. If Floropolis goes direct:
- Growers (Ecoroses, Magic Flowers ECU, Flodecol, Megaflor, Petaluma) need to apply with AGROCALIDAD/ICA per shipment.
- Some large growers handle this themselves. Smaller ones may need facilitation.

### HTS Codes (cut flowers)

| Commodity | HTS Code | Description |
|---|---|---|
| Roses (fresh cut) | 0603.11.00 | Fresh cut roses |
| Carnations | 0603.12.00 | Fresh cut carnations |
| Orchids | 0603.13.00 | Fresh cut orchids |
| Chrysanthemums | 0603.14.00 | Fresh cut chrysanthemums |
| Other cut flowers | 0603.19.01 | Other fresh cut flowers |

Duty rate: most cut flowers from Ecuador and Colombia enter under ATPA (Andean Trade Promotion and Drug Eradication Act) — 0% duty. Broker confirms eligibility per shipment.

---

## Security Design

### Authentication layers
- Supabase Auth: Google OAuth + magic link + phone OTP (already in prod)
- Admin/ops: TOTP 2FA (Supabase MFA, AAL2) enforced in middleware.ts
- Vendor portal: signed JWT (jose library), 14-day expiry, single-use

### Authorization (belt + suspenders)
1. RLS on every new table (customers see own rows via auth.uid())
2. Admin reads via SECURITY DEFINER RPCs (bypass RLS for server actions)
3. requireRole() helper in every server action as redundant check

### PCI Scope
Zero. We never see card numbers. Stripe Elements runs in an iframe. Only pm_xxx IDs stored in our DB.

### Webhook security
- Stripe: constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET) — throws if tampered
- FedEx: HMAC-SHA256 with FedEx webhook secret

### Idempotency on webhooks
All handlers upsert by (stripe_object_id, event_type). If same event delivered twice → second write is no-op. Stripe can retry webhooks — this is the protection.

---

## Vendor Portal (JWT design)

Token payload:
```json
{
  "sub": "farm_shipment_id",
  "vendor": "ecoroses",
  "order_id": "ord_xxx",
  "exp": 1747584000  (14 days from issue)
}
```

Signed with VENDOR_JWT_SECRET (Vercel env). Single use — once vendor clicks "Confirm", server marks `farm_shipments.confirmed_at = now()` and the confirm button is disabled/removed on subsequent loads.

Route: GET /v/[token] → verify JWT → show shipment summary → POST /v/[token]/confirm → mark confirmed.

---

## Brevo (email) Design

Transactional emails sent via Brevo API (BREVO_API_KEY already in env):

| Trigger | Template | Recipient |
|---|---|---|
| Order placed | order_confirmation | Customer |
| Order confirmed by admin | admin_confirmed | Customer |
| Payment scheduled (T-5 notice) | payment_scheduled | Customer |
| Payment succeeded | payment_receipt + invoice PDF | Customer |
| Payment failed | payment_failed + hosted_invoice_url | Customer |
| Dispatch created | dispatch_to_vendor | Farm (vendor) |
| Vendor confirmation received | vendor_confirmed | Facu (Telegram) |
| Order cancelled | cancellation_notice | Customer |

---

## Telegram Alerts (Facu only)

Via Telegram Bot API. Fires on:
- Preauth failed (T-7)
- Charge failed after first retry
- Invoice marked uncollectible
- Vendor hasn't confirmed 24h before delivery
- Reconciliation cron detects drift
- Vercel cron misses its schedule

Message format:
```
🚨 FLOROPOLIS ALERT
Order: #FLO-20260518-003
Event: preauth_failed
Customer: Miami Blooms (miami@blooms.com)
Card: •••• 4242
Action needed: https://floropolis.com/admin/orders/xxx
```
