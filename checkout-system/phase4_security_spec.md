# Phase 4 Security Spec — Scheduled Stripe Charges
v1 | 2026-05-14 | Job_PM [V8 SHADOW]

## Overview

Phase 4 is the automated cron that fires Stripe charges 5 days before each delivery date (and 7-day preauths for Mode A orders). This spec defines the 8 security layers protecting it, and the isolation architecture using the **supabase-backup** project.

---

## Hosting Decision

| Concern | Choice | Reason |
|---|---|---|
| Cron host | **supabase-backup** project (ref: separate from `swhglnjyuorkycpgkmec`) | Blast radius isolation — a Phase 4 failure cannot affect the main DB, auth, or storefront |
| Vercel | Used for webhooks only (Stripe → Next.js API route) | Stateless, no persistent cron authority |
| Main Supabase | Read-only access from Phase 4 | Phase 4 reads orders, writes charge results — cannot mutate users, prices, or auth |

The cron fires a Supabase Edge Function in the **supabase-backup** project. That function calls the Stripe API and writes results to the shared `order_charges` table (via service-role key scoped to that table only).

---

## 8 Security Layers

### Layer 1 — Service-role key isolation
- Phase 4 has its own Stripe restricted key: `read:customers`, `write:payment_intents`, `write:invoices` — nothing else.
- Cannot refund, create customers, change prices, or access other Stripe resources.
- Stored in supabase-backup vault (Supabase secret store), never in `.env` files.

### Layer 2 — Supabase RLS on charge table
- The `order_charges` table has RLS enabled.
- Phase 4 service role can only INSERT rows where `status = 'pending'` and `charge_date = today`.
- Cannot read or mutate rows for other dates.
- Main app reads with anon key; customers only see their own rows (RLS by `user_id`).

### Layer 3 — Idempotency keys on every Stripe call
- Every PaymentIntent and Invoice finalization uses `idempotency_key = order_id + charge_type + charge_date`.
- A double-fire (cron bug, retry, duplicate trigger) returns the same Stripe object — charge never fires twice.

### Layer 4 — Dry-run mode in supabase-backup
- `PHASE4_DRY_RUN=true` env var causes the function to log all actions without calling Stripe.
- Dry-run result goes to `order_charges` with `status = 'dry_run'`.
- First 7 days of production: dry-run at 5 AM, real run at 6 AM. Compare outputs. Only remove dry-run after 7 clean days.

### Layer 5 — Charge window guard
- Phase 4 will ONLY process orders where `charge_date` is within ±1 hour of NOW().
- Orders outside this window are skipped and logged as `skipped_window`.
- Prevents runaway retries from charging orders that already completed or are far future.

### Layer 6 — Alert on every charge event
- Every charge attempt (success or failure) fires an alert to **both Facu AND JJ**.
- Alert channel: email via Resend + Supabase realtime push to admin dashboard.
- Alert includes: order ID, customer, amount, mode (A/B/C), result, Stripe payment_intent ID.
- Threshold alerts: >3 failures in 1 run → page Facu immediately (separate high-priority alert).

### Layer 7 — Refund quorum enforcement
- Phase 4 never initiates refunds. Refunds are admin-only actions in the admin console.
- Refund authority enforced at the API route level:
  - ≤$200: JJ or Facu can approve
  - >$200: Facu required (checked against admin session identity)
  - >$500: both Facu + JJ must approve (async two-party confirmation, 15-min window)
- All refund attempts logged to `refund_audit_log` with approver identity + timestamp.

### Layer 8 — Charge cap per run
- Phase 4 will not charge more than 20 orders per cron run.
- If > 20 orders are due on the same day, it processes oldest 20 and sends "manual review required" alert to Facu + JJ.
- Prevents a misconfigured date query from charging the entire customer database.

---

## supabase-backup Project Setup

```
Project: supabase-backup (separate from main)
Purpose: Phase 4 cron isolation only
Edge Functions:
  - phase4_charge_runner      (fires at 6:00 AM PDT daily)
  - phase4_preauth_runner     (fires at 6:00 AM PDT, T-7 for Mode A)
  - phase4_dry_run_validator  (fires at 5:00 AM PDT daily — first 7 days)
Secrets stored:
  - STRIPE_RESTRICTED_KEY_PHASE4
  - MAIN_SUPABASE_URL
  - MAIN_SUPABASE_SERVICE_KEY_PHASE4 (scoped RLS)
  - RESEND_API_KEY
  - ALERT_EMAIL_FACU
  - ALERT_EMAIL_JJ
```

The supabase-backup project has **NO customer-facing traffic**. Its only public surface is the Edge Functions triggered by its internal cron.

---

## Failure Handling

| Failure type | Response | Who gets paged |
|---|---|---|
| Stripe charge declined | Retry per smart-retry schedule, email customer | Both |
| Stripe API timeout | Idempotency key ensures safe retry next minute | Both |
| Supabase-backup Edge Function crash | Retry 3x with exponential backoff, then page | Both |
| >3 failures in one run | Immediate high-priority alert | Facu only |
| Customer card expired | Email customer with hosted invoice link | Customer + both admins |
| >48h before cutoff + failure | Contact customer per D11 | JJ handles |
| <48h before cutoff + failure | Facu decides: cancel or force | Facu only |

---

## Not in scope for Phase 4

- ACH (removed per D6 — credit card only)
- Refund initiation (admin console only)
- New customer approval (handled by main app auth flow, not Phase 4)
- Any write to auth.users (forbidden from Phase 4 role)
