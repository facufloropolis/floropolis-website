# Stripe Setup Checklist — Facu (Floral Direct LLC)
v1 | 2026-05-14 | Job_PM [V8 SHADOW]

## Company info for Stripe onboarding

| Field | Value |
|---|---|
| Legal entity name | **Floral Direct LLC** |
| DBA / brand name | Floropolis |
| EIN | **39-4713788** |
| Business address | 200 S Wilton Pl, Los Angeles, CA 90004 |
| Business type | LLC |
| Industry | Wholesale / Retail — Floral Products |
| Website | floropolis.com |
| Support email | facu@floropolis.com |
| Support phone | (786) 930-8463 |
| Statement descriptor | FLOROPOLIS (appears on customer card statements) |

---

## Stripe account structure

```
Stripe account: Floral Direct LLC (production)
├── Restricted key: Phase 4 cron (write:payment_intents, write:invoices, read:customers only)
├── Webhook endpoint: https://floropolis.com/api/stripe/webhook
│   Events to listen for:
│   ├── payment_intent.succeeded
│   ├── payment_intent.payment_failed
│   ├── invoice.finalized
│   ├── invoice.payment_succeeded
│   ├── invoice.payment_failed
│   ├── setup_intent.succeeded
│   └── customer.subscription.deleted (for future use)
└── Radar rules: block prepaid cards, block cards from high-fraud countries (review list)
```

---

## Pre-launch checklist

### Stripe Dashboard — Business setup
- [ ] Create Stripe account under **Floral Direct LLC** (or transfer existing)
- [ ] Enter EIN **39-4713788** in Tax settings
- [ ] Enter business address: **200 S Wilton Pl, Los Angeles, CA 90004**
- [ ] Set statement descriptor: **FLOROPOLIS** (11 chars max)
- [ ] Upload supporting docs if prompted (LLC formation documents)
- [ ] Verify bank account for payouts (Floral Direct LLC checking account)
- [ ] Set payout schedule: Daily (to minimize float)

### API keys
- [ ] Generate **publishable key** for Next.js frontend (`NEXT_PUBLIC_STRIPE_PK`)
- [ ] Generate **secret key** for server-side API routes (`STRIPE_SECRET_KEY`)
- [ ] Generate **restricted key** for Phase 4 cron — permissions: customers:read, payment_intents:write, invoices:write (`STRIPE_RESTRICTED_KEY_PHASE4`)
- [ ] Store all keys in Vercel environment variables (NOT in `.env.local` in git)
- [ ] Store Phase 4 key in supabase-backup vault (not Vercel)

### Webhook
- [ ] Register webhook endpoint: `https://floropolis.com/api/stripe/webhook`
- [ ] Copy webhook signing secret → `STRIPE_WEBHOOK_SECRET` in Vercel
- [ ] Test webhook delivery from Stripe dashboard
- [ ] Verify signature validation in `app/api/stripe/webhook/route.ts`

### Stripe Elements / Payment methods
- [ ] Enable: Cards (Visa, Mastercard, Amex)
- [ ] Disable: ACH, SEPA, Klarna, Afterpay — credit card only per D6
- [ ] Enable 3DS automatic (Radar handles this)
- [ ] Set capture method: `manual` for SetupIntents (preauth flow)

### Radar fraud rules (recommended)
- [ ] Block if card is prepaid
- [ ] Review if order amount > $2,000
- [ ] Block if card country is on Stripe's high-fraud list

### Test mode first
- [ ] Run all 3 charge modes (A/B/C) in Stripe test mode with test cards
- [ ] Test card: `4242 4242 4242 4242` — succeeds
- [ ] Test card: `4000 0000 0000 9995` — insufficient funds
- [ ] Test card: `4000 0027 6000 3184` — 3DS required
- [ ] Test failed payment + retry flow
- [ ] Test Phase 4 dry-run mode (Layer 4)
- [ ] Test idempotency (fire same charge twice, confirm single charge)

### Go-live
- [ ] Switch to live API keys in Vercel
- [ ] Place a real $1 test order with your own card (Mode C — charged immediately)
- [ ] Confirm $1 charge appears on Stripe dashboard
- [ ] Confirm alert email received by both Facu + JJ
- [ ] Refund the $1 test charge
- [ ] Turn off dry-run mode after 7 clean days of production

---

## Refund authority (for Stripe)

| Amount | Who can approve | Flow |
|---|---|---|
| ≤$200 | JJ or Facu | Single-click in admin console |
| >$200 | Facu only | Admin console enforces identity check |
| >$500 | Both Facu + JJ | Two-party confirmation, 15-min window |

All refunds appear in `refund_audit_log` table with approver, timestamp, and Stripe refund ID.

---

## Notes
- Do NOT connect Stripe to Floropolis.com's existing K2K billing. These are separate systems.
- The Phase 4 cron lives entirely on supabase-backup — it never touches the Vercel Stripe key.
- Customer card data never touches Floropolis servers — Stripe handles tokenization via Stripe Elements.
