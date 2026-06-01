# Floropolis Checkout + Login + Dispatch — Implementation Plan
v2 | 2026-05-14 | Job_PM [V8 SHADOW] — added Rose integration section + v2 decisions

## Context

Today every Floropolis order takes ~30 minutes of Facu's manual work in K2K:
WhatsApp vendor → update prices → create K2K user → eSuite basket → prebook → vendor accepts in ghost → send payment link → customer pays → fill dispatch sheet → generate FedEx labels → email farm.

12 real orders in the past 14 days = ~6 hours/week of repeatable work that scales linearly.

This plan replaces K2K end-to-end with:
- Secure Stripe-based checkout (card saved at order, auto-charged 5 days before delivery)
- Customer login (already built, needs extension)
- Admin dispatch dashboard (auto-generates FedEx CSV/labels, emails farms directly)

**The one non-negotiable:** money never moves on a card that hasn't been validated.

---

## Stripe Payment Flow (3 modes by lead time)

| Lead time at confirm | Flow |
|---|---|
| ≥10 days | T-0: SetupIntent saves card. T-7 cron: $1 preauth (manual capture, void 60s). T-5 cron: finalize Invoice → auto-charge. |
| 6–9 days | T-0: SetupIntent + immediate $1 preauth. T-5 cron: finalize Invoice → auto-charge. |
| ≤5 days | T-0: SetupIntent + full-amount PaymentIntent on-session (3DS if needed). Charged immediately. |

Smart Retries: 8 attempts over 2 weeks. Hosted invoice URL as manual fallback. **Credit card only** (ACH removed per v2 decisions — D6).

---

## Order State Machine

pending_review → confirmed → preauth_pending → preauth_ok → charging → paid → dispatching → in_transit → delivered

Branches: rejected | cancelled | payment_failed | uncollectible | refunded

Every state change writes audit_log (actor + timestamp + diff).

---

## System Architecture

Customer → /checkout → Stripe (SetupIntent, Invoice)
                                  ↓
                         Webhook → /api/stripe/webhook → DB
                                  ↓
                         Cron (T-7 preauth, T-5 charge, nightly reconcile)

Admin → /admin/orders/[id] (confirm/edit/cancel)
Admin → /admin/dispatch → FedEx Ship API → PDF labels → Brevo to vendor

Customer → /account/orders (track, invoice, cancel)

---

## Database — New Tables

- orders (order_number, buyer_user_id, delivery_date, lead_time_mode, totals, status, stripe IDs)
- order_lines (order_id, product snapshot, quantity_boxes, unit_price, hts_code)
- addresses (buyer_user_id, line1/2/city/state/zip/country, is_default)
- payments (order_id, kind, stripe_object_id, amount, status)
- invoices (order_id, stripe_invoice_id, hosted_invoice_url, pdf_url)
- vendor_contacts (vendor_code, primary_email, whatsapp, contact_name)
- customs_entries (order_id, iss_nsr, rel_number, cut_flowers, hts_code, declared_value)
- audit_log (actor, action, entity_type, entity_id, before/after JSONB)
- role_permissions (user_id, role, permissions JSONB)

Existing:
- client_profiles gains: stripe_customer_id, default_payment_method_id, is_2fa_enabled
- quote_requests becomes lead funnel only (FK from orders)
- floropolis_inventory provides immutable product snapshot at confirm time

---

## Admin Roles

Facu (admin): full access including refunds, role assignment, audit log, price edits
Rose (ops): read orders, confirm, mark dispatched, email farms — cannot refund, edit prices, see audit log

2FA mandatory for both (Supabase TOTP, AAL2 enforced in middleware.ts).

---

## Dispatch Automation

Trigger: orders.status='paid' AND delivery_date - now() ≤ 2 days

Pipeline:
1. Expand order_lines to 1 row per box (BOX_SEQ ordinal)
2. JOIN box_dimensions → L/W/H/kg
3. Compute UNIT_VALUE_USD from farm_cost_cents
4. Stamp customs columns (ISS_NSR='Y', REL_NUMBER from broker, CUT_FLOWERS='Y')
5. Write dispatch_tracking + farm_shipments rows

Output paths:
- CSV export matching FedEx Input columns (Week 6, stop-gap before API)
- FedEx Ship API → labels → Supabase Storage → Brevo email to vendor

Vendor confirmation: signed JWT magic link /v/[token] (14-day expiry)
No confirmation within 24h → Telegram alert to Facu.

---

---

## Rose_BI Integration — Dispatch Automation (CRITICAL — do not replace)

**Discovery (2026-05-14):** Rose_BI already runs an automated 9-step dispatch pipeline every dispatch day. The Admin Dispatch UI builds on top of it — it does NOT replace it.

### Rose's existing scripts (do not touch)

| Script | Location | What it does |
|---|---|---|
| `dispatch_prep.py` | `Rose_BI/scripts/` | Reads paid orders, generates the dispatch sheet (Google Sheets format) |
| `label_reader.py` | `Rose_BI/scripts/` | Parses FedEx label PDFs uploaded to Drive, extracts tracking numbers |
| `dispatch_vendor_email_drafter.py` | `Rose_BI/scripts/` | Drafts per-farm emails in Brevo with box manifest + pickup time |
| `dispatch_logger.py` | `Rose_BI/scripts/` | Writes dispatch events to Supabase + logs confirmation receipt |

### Rose's 9-step pipeline (automated, runs ~5 AM dispatch days)

```
Step 1: PREP           dispatch_prep.py — build dispatch sheet
Step 2: LABEL_PULL     label_reader.py — parse FedEx label PDFs from Drive
Step 3: FARM_EMAILS    dispatch_vendor_email_drafter.py — draft emails per farm
Step 4: FEDEX_NOTIFY   FedEx depot notification email (edgar.freire@fedex.com + dromero@entregas.ec)
Step 5: SEND_EMAILS    Brevo: send drafted farm emails
Step 6: LOG_SENT       dispatch_logger.py — mark emails sent
Step 7: AWAIT_CONFIRM  Vendor portal magic links sent — monitoring for farm confirmations
Step 8: LABELS_UPLOAD  FedEx labels pushed to Supabase Storage + shared Drive folder
Step 9: PRE_ARRIVAL    Customer tracking emails sent
```

### How the Admin Dispatch UI integrates

- **Rose Pipeline Stepper** in the UI shows live step status (PASS/FAIL per step from `dispatch_logger.py` output)
- Admin can click any step to see its log output
- Steps marked with 🟣 "F" badge require Facu's manual action (Steps 4, 7)
- UI shows Rose's drafted farm emails with a **Send** button — Facu reviews, sends manually or approves auto-send
- Label upload panel shows labels Rose parsed; Facu confirms before vendor portal gets the link
- **Admin cannot skip steps.** The UI enforces sequential flow matching Rose's pipeline order.

### What the Admin Dispatch UI adds (that Rose doesn't have)
- Visual 3-panel layout (dispatch / farm communications / labels)
- Box-level customs table with HTS codes + declared values
- Driver confirmation checkboxes + WhatsApp auto-confirmation detection
- FedEx depot clarification banner for farms
- Sample Box insert flow

### What admin Dispatch UI does NOT do
- Does not replace `dispatch_prep.py` — Rose owns the data pipeline
- Does not send emails independently — it surfaces Rose's drafts
- Does not parse labels — `label_reader.py` does that
- Does not write to Supabase directly for dispatch events — `dispatch_logger.py` owns that

---

## v2 Decisions (locked by Facu, 2026-05-14)

| # | Decision | Rule |
|---|---|---|
| D1 | Customer auth | Google + Apple + Email magic link + Email+password (all 4) |
| D2 | Instagram | Opt-in post-registration only, not a login method |
| D3 | Admin auth | Email+password + TOTP MFA mandatory. Never OAuth alone. |
| D4 | Device approval | One-way: Facu approves JJ's devices. JJ never approves Facu. |
| D5 | New customer status | `pending_approval` until Facu or JJ approves. Alert to both. |
| D6 | Payment methods | Credit card only. ACH removed. |
| D7 | Phase 4 cron host | supabase-backup project. See `phase4_security_spec.md`. |
| D8 | Alerts | Both Facu + JJ on all payment events + security alerts. |
| D9 | Refund quorum | JJ ≤$200. Facu >$200. Both required >$500. |
| D10 | 2-box minimum | Hard rule. Visible everywhere. Sample Box is the workaround. |
| D11 | Payment failed <48h | Facu decides (cancel based on box count + client trust). JJ flags, does not decide. |
| D12 | Dispatch sheet format | Use Rose's current Google Sheets format. Don't reinvent. |

---

## 9-Sprint Work Breakdown

| Wk | Scope |
|---|---|
| 1 | Migrations 1–4. requireRole(). Role seed. Stripe + FedEx accounts. |
| 2 | Stripe checkout Mode C (immediate). /checkout page, SetupIntent, webhook skeleton. |
| 3 | Order lifecycle + admin queue. Confirm/cancel. Brevo+Telegram alerts. |
| 4 | Modes A & B (preauth + scheduled charge). Vercel Cron T-7/T-5. Reconcile cron. |
| 5 | Customer account: order history, branded invoice PDF, cancellation, Stripe Portal. |
| 6 | Dispatch UI + CSV export matching FedEx columns. Box dim lookup. |
| 7 | FedEx Ship API. OAuth, label creation, ETD invoice, vendor email. |
| 8 | Vendor portal /v/[token], FedEx tracking webhook, customer tracking. |
| 9 | Hardening: 2FA enforcement, audit UI, runbooks, 5 parallel orders vs K2K. |

---

## Week 0 Business Prerequisites (parallel to dev — Facu owns)

- [ ] PPQ 587 permit (USDA APHIS) — 30–60 day lead time. FILE THIS WEEK.
- [ ] CBP Form 5106 IOR registration — 2 days, $0.
- [ ] Customs broker contract (Flexport / T.H. Weiss / MHLS) — ~$8K/month for ~35 shipments.
- [ ] Confirm phytosanitary cert ownership (K2K or Floropolis direct?). → JJ email sent.
- [ ] Vendor contact data backfill (emails/WhatsApp for all 5 farms). Owner: Rose, Week 1.
- [ ] Stripe account business verification (3–7 days). Enable Invoicing + ACH.
- [ ] FedEx Developer Portal sandbox registration (instant). Prod approval 2–3 days.

Cutover gate: PPQ 587 issued + broker signed + 5 parallel orders match on price/customs/labels.

---

## Top 10 Risks

1. PPQ 587 takes >60 days → File day 1, keep K2K hot-standby
2. FedEx prod access delayed → CSV export path (Wk 6) works without API
3. Smart Retries don't recover → Branded fail email + Facu manual charge button
4. Webhook out of order/dropped → Reconciliation cron is backstop
5. Customer chargeback → audit_log timestamp+IP attached to Stripe metadata
6. Vendor email missing → Block dispatch until vendor_contacts.primary_email populated
7. HTS/customs misclassification → Broker validates every entry first 4 weeks
8. RLS too tight/loose → All admin reads via SECURITY DEFINER RPCs, pgtap tests
9. Card decline at T-5 → hosted invoice + Brevo pay-now + Telegram within 60s
10. Vercel cron silently fails → External uptime monitor + heartbeat in audit_log

---

## Definition of Done (K2K replacement complete when all true)

- [ ] PPQ 587 active, IOR registered, broker contract signed
- [ ] Stripe live mode; webhook signing verified prod
- [ ] FedEx prod credentials; 5 real labels printed without error
- [ ] All 5 farms have vendor_contacts.primary_email
- [ ] Migrations 1–4 in prod; RLS pgtap suite passes
- [ ] Branded invoice PDF matches brand guide
- [ ] Customer: place order → /account/orders → cancel within window → download invoice
- [ ] Admin: confirm/edit-before-charge/refund/mark-dispatched; every action in audit_log
- [ ] Reconciliation cron ran 7 nights with zero drift
- [ ] 2FA enforced on Facu + Rose
- [ ] 5 parallel K2K + new-system orders match on price, customs, FedEx labels
- [ ] Runbooks committed
- [ ] Telegram alerts wired for Stripe failure, cron miss, recon drift
