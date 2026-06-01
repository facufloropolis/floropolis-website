# Checkout System v2 — Full Execution Plan
**Author:** Job_PM [V8 SHADOW] | **Date:** 2026-05-14 | **Status:** Approved by Facu, ready to execute
**Target model for execution:** Claude Sonnet 4.6

---

## Context for the executing agent

You are picking up work on the Floropolis checkout/dispatch redesign. v1 mockups exist at `~/Desktop/floropolis-upgrade/app/mockups/`. Facu reviewed them and gave structured feedback. This plan implements v2.

**Read these files BEFORE you touch any code:**
1. `~/Desktop/floropolis-upgrade/checkout-system/plan.md` — overall 9-sprint plan
2. `~/Desktop/floropolis-upgrade/checkout-system/research.md` — Stripe + FedEx + customs research
3. `~/Claude_MA_v8/Rose_BI/kb/dispatch_runbook.md` — **CRITICAL** — Rose already automated most of the dispatch flow; we integrate, not replace
4. The 6 existing mockup files under `~/Desktop/floropolis-upgrade/app/mockups/`

**Stack:**
- Next.js 15 + React 19 + TypeScript
- Tailwind CSS v4
- lucide-react icons
- Supabase (auth + DB) — see `.env.local` for project ref `swhglnjyuorkycpgkmec`
- Deployed on Vercel (project `floropolis-clean`)

**Floropolis brand basics (use throughout):**
- Primary green: emerald-600 (`#059669`), hover emerald-700
- Accent gold/yellow: amber-400 (`#fbbf24`) for highlights
- Slate scale for text (slate-900 headers, slate-700 body, slate-500 secondary)
- Font: Inter (already loaded by Next.js)
- WhatsApp number: **+1 786 930 8463** — hardcode this
- Email: facu@floropolis.com (and jjp@floropolis.com for JJ)
- LLC: Floral Direct LLC, EIN 39-4713788, 200 S Wilton Pl, LA CA 90004

---

## Decisions locked (from Facu)

| # | Decision | Rule |
|---|---|---|
| D1 | Login methods | Google + Apple + Email magic link + Email+password (all 4) |
| D2 | Instagram | Opt-in feature post-registration, NOT a login method |
| D3 | Admin auth | Email+password + TOTP MFA mandatory (Facu + JJ) |
| D4 | Device approval | One-way: Facu approves JJ's new devices. JJ never approves Facu. |
| D5 | New customer accounts | Status `pending_approval` until Facu (or JJ) approves. Email alert. |
| D6 | Stripe webhook host | Vercel (Next.js API route) |
| D7 | Phase 4 cron host | **supabase-backup** project (isolated from main) |
| D8 | Alert recipients | Both Facu and JJ for payment failures, security alerts |
| D9 | Refund quorum | JJ can approve refunds ≤$200. Facu required for >$200. Both required for >$500. |
| D10 | 2-box minimum | Hard business rule. Visible flag in Admin Orders + Dispatch. Sample Box is the workaround. |
| D11 | Payment failed | If >48h to cutoff: contact client. If <48h: Facu decides (cancel based on box count + client trust). |
| D12 | Dispatch Excel | Use current Google Sheets format (Rose's `dispatch_prep.py` output). Don't reinvent. |

---

## Architecture: 7 screens

Existing (need v2 refresh):
1. `/mockups/checkout`
2. `/mockups/admin-orders`
3. `/mockups/admin-order-detail`
4. `/mockups/admin-dispatch`
5. `/mockups/account-orders`
6. `/mockups/vendor-portal`

New:
7. `/mockups/login` (with admin variant at `/mockups/login-admin`)

Plus update:
- `/mockups/page.tsx` (index) — add login screen, polish layout
- New shared component: `app/mockups/_components/` for reused UI (status badges, banners, layout shell)

---

## Phase A — Foundation (DO FIRST)

### A1. Shared mockup component library
Create `app/mockups/_components/` with:
- `MockupShell.tsx` — consistent header (Floropolis logo + "MOCKUP — v2" badge + back link) + footer
- `StatusBadge.tsx` — props: variant (`pending`, `confirmed`, `payment_failed`, `arrived`, `cancelled`, `pending_approval`)
- `FloropolisLogo.tsx` — inline SVG logo (extract from existing site if present, otherwise text "Floropolis" in serif + 🌹 emoji)
- `WhatsAppLink.tsx` — wraps `+17869308463`, opens wa.me with prefill text

Why: Right now every mockup has duplicate styling. After v2 we want consistency. Build the shell once, use everywhere.

### A2. Floropolis brand constants
Create `app/mockups/_constants/brand.ts`:
```ts
export const BRAND = {
  primary: 'emerald-600',
  primaryHover: 'emerald-700',
  accent: 'amber-400',
  textPrimary: 'slate-900',
  textBody: 'slate-700',
  textMuted: 'slate-500',
  whatsapp: '+17869308463',
  whatsappDisplay: '+1 (786) 930-8463',
  supportEmail: 'facu@floropolis.com',
  adminEmail: 'facu@floropolis.com',
  jjEmail: 'jjp@floropolis.com',
} as const;
```

---

## Phase B — Login screen (NEW)

### B1. Customer login at `/mockups/login`

Layout:
- Centered card on emerald-50 gradient background
- Floropolis logo on top
- Heading: "Welcome back" / "Sign in to Floropolis"
- 3 OAuth buttons stacked:
  - `Continue with Google` — white bg, Google G icon (use lucide or inline SVG), border-slate-300
  - `Continue with Apple` — black bg, white text, Apple icon
  - `Continue with Email` — emerald-600 bg, white text (this opens email magic link flow)
- Divider "or"
- "Sign in with password" link (collapsible expansion → email + password fields)
- Footer: "New to Floropolis? Create an account →"
- Below: tiny "Need help? WhatsApp us +1 786 930 8463"

States to mock (use query params `?state=`):
- `?state=default` — initial view
- `?state=email-sent` — "Check your inbox at f***@example.com for the magic link"
- `?state=pending-approval` — "Account created. We're reviewing your application — you'll hear from us within 24h. We do this to keep the wholesale community high-quality."
- `?state=device-verify` — "New device detected. We sent a 6-digit code to your email."

### B2. Admin login at `/mockups/login-admin`

Different layout — darker, more serious feel (slate-900 background).
- Floropolis logo + small "Admin Console" subtitle
- Email + password fields (no OAuth options — admins never use OAuth alone)
- TOTP code input (6 digits)
- "Trust this device for 8 hours" checkbox
- Below: "First time on this device? Ask Facu to approve."

States:
- `?state=default`
- `?state=password-entered` — show TOTP prompt
- `?state=device-pending` — "Approval pending. Facu has been notified via email."
- `?state=device-approved-by-Facu` — success animation

### B3. New customer onboarding at `/mockups/signup`

Wizard with 3 steps:
1. Email + password (or Google/Apple to skip)
2. Business info: business name, role (florist/event planner/funeral home/other), shipping address
3. Verify email → "Pending approval" screen explaining the manual review

---

## Phase C — Admin screens (Facu + JJ)

### C1. Admin Orders v2 at `/mockups/admin-orders`

**Major changes:**

**Header additions:**
- Date range filter (default: next 14 days). Buttons: "Today", "Next 7 days", "Next 14 days", "Next 30 days", custom range
- Tabs: `Upcoming` | `Confirmed` | `Dispatched` | `Arrived` | `Issues` | `All`
- Currently logged-in admin badge top-right (e.g. "JJ" or "Facu")

**2-box minimum flag (the big one):**
- Each day in the orders table is a group/section
- If a day has only 1 box total → red banner: "⚠️ Only 1 box on May 18 — Ecuador minimum is 2 boxes. Either add a Sample Box, move an order, or cancel the day."
- "Add Sample Box" button next to the banner — clicking it opens a modal: "Send a sample box to a prospect on this day. Pick from prospect list →" (mock the modal with 3 fake prospects)
- "Move order to another day" button — opens a date-shift modal for any order in that day

**Order row updates:**
- New column: `Status` with badge (use StatusBadge component)
- New badge variant: `Payment Failed` (red) — clicking opens action menu: Retry charge / Contact client / Cancel
- New badge variant: `Pending Approval` (amber) — for customer accounts not yet approved
- Inline "Change date" pencil icon next to delivery date

**Arrived tab (new):**
- Shows past orders (last 30 days, dispatched + past delivery date)
- Per-order: "Did it arrive on time?" (Yes/No/Late toggle)
- "Quality issue reported?" — link to customer feedback if any
- Hooks for v3: auto-pull tracking from FedEx API to mark Arrived automatically

**Payment Failed badge logic:**
- Show this badge when `orders.payment_status = 'failed'`
- Click → action menu with conditional UI:
  - If `hours_to_cutoff > 48`: show "Email client to update payment" + "Retry charge" buttons
  - If `hours_to_cutoff <= 48` AND admin = Facu: show "I'll decide now: [Cancel order] [Force charge anyway] [Email client + give 1h]"
  - If `hours_to_cutoff <= 48` AND admin = JJ: show "⏰ <48h. Facu must decide. [Flag for Facu]"

Mock 3 fake orders in each state so Facu can see the variants.

### C2. Admin Order Detail v2 at `/mockups/admin-order-detail`

**Add 3 new sections below existing order info:**

**Section: "Arrived?"**
- Toggle: Did this order arrive? Yes/No/Late
- If Yes: timestamp + "marked by [admin]"
- If No/Late: free-text field "what happened?"
- Note: v1 is manual. v3 will pull from FedEx tracking webhook.

**Section: "Email log"**
- Timeline of automatic emails sent for this order:
  - ✉️ Order confirmation (sent on order creation)
  - ✉️ Payment receipt (sent after charge)
  - ✉️ Tracking number (sent after FedEx label uploaded)
  - ✉️ "Arrives tomorrow" reminder (sent T-1)
  - ✉️ "Just arrived — how was it?" (sent on arrival confirmation)
- Each entry: status (sent/delivered/opened/bounced), timestamp, "View email →" link to see content

**Section: "Customer conversations"**
- Threaded view of customer messages about this order
- Sources: WhatsApp messages tagged with order #, emails replying to order#, SMS
- v1: manual entry by admin (textarea + "Add note" button)
- v2: ingest from WhatsApp + Gmail with order# parsing

Also add at the top:
- Quick-action row: "Send tracking update" | "Send arrival reminder" | "Request feedback" — each opens a draft email preview

### C3. Admin Dispatch v2 at `/mockups/admin-dispatch`

**This is the most complex screen. The job is: build the UI ON TOP of Rose's existing automation, not replace it.**

**Layout — 3 panels side by side (or stacked on mobile):**

**Left panel: "Today's dispatch"**
- Headline: "Friday May 16, 2026 — 4 orders, 3 boxes"
- 2-box check status: ✅ Met / ⚠️ Below minimum
- Box assignments table (columns matching Rose's Google Sheet format):
  - `BOX #` | `FARM` | `WEIGHT` | `ITEMS COUNT` | `RECIPIENT` | `TRACKING#` | `STATUS`
- "Insert Sample Box" button (opens modal: pick prospect → assigns to today)
- "Move order between boxes" — drag-and-drop placeholder (mock the visual, not the interaction)

**Middle panel: "Communications"**
- Sub-section "Farm emails" — Rose's `dispatch_vendor_email_drafter.py` already creates drafts. Show:
  - List of drafted emails: "Olimpo Flowers — Box 1 (12 stems) — DRAFT" with preview + Send button
  - Status: ⏸ Draft / 📧 Sent / ✅ Acknowledged
  - "Edit draft" inline
- Sub-section "FedEx notification" — manual for v1:
  - "Send pickup confirmation to FedEx" button → opens draft email to edgar.freire@fedex.com + dromero@entregas.ec
  - Pre-filled with box count + weight + recipient list

**Right panel: "Labels & confirmations"**
- Section "FedEx labels"
  - "Upload PDFs from Drive" button (mock — would integrate with Google Drive folder Rose uses)
  - List of uploaded labels with thumbnail + tracking#
  - Status: ⏳ Awaiting / ✅ Parsed by label_reader.py
- Section "FedEx confirmation"
  - Note: "FedEx receives at depot by 10pm. Driver typically picks up at vendor."
  - Manual checkbox: "Vendor confirmed driver pickup" + timestamp
  - Future: "Auto-detect from WhatsApp" — placeholder text only
- Section "Quality check on arrival"
  - List of yesterday's deliveries with status icons
  - Quick "Mark arrived" button per order

**Add at the very bottom: "Rose pipeline status"**
- Show the 9-step Rose pipeline as a horizontal stepper:
  - PREP ✅ | REVIEW (Facu) ✅ | DISPATCH (Facu) ⏳ | LABELS ⏳ | READ ⏸ | EMAILS ⏸ | SEND (Facu) ⏸ | LOG ⏸ | PRE-ARRIVAL ⏸
- Visual indicator of where in the pipeline we are right now
- Click each step → tooltip with description

---

## Phase D — Customer screens

### D1. Checkout v2 at `/mockups/checkout`

**Changes:**
- Remove all payment methods except credit card (no Apple Pay, no Klarna, no Google Pay)
- Add a clear "When will I be charged?" expandable section showing the 3-tier model:
  - "Your delivery is in 12 days. Your card will be authorized for $1 on May 23 (7 days before), then charged $487.50 on May 25 (5 days before)."
  - "Your delivery is in 7 days. Card will be charged $1 today, then $487.50 on May 25."
  - "Your delivery is in 4 days. Card will be charged $487.50 today."
- Show which tier applies based on `delivery_date` (mock with query param `?lead=12` or `?lead=7` or `?lead=4`)
- Trust badges: "Powered by Stripe — your card is encrypted and never stored on Floropolis servers"
- Order summary on right with: items, subtotal, customs, freight, total
- Floropolis branding throughout

### D2. Account Orders v2 at `/mockups/account-orders`

**Major additions:**

**Top: Personalized banner (with logic placeholder)**
- v1 rule: if `days_since_last_order > 30` → show "Welcome back! Here's 10% off your next order — code RETURN10"
- v1 rule: if `next_order_count < 2` → show "Order again from your last list? [Re-order →]"
- Show as a dismissable card at top of page

**Order list updates:**
- Each order card shows:
  - Status (Pending / Confirmed / Dispatched / In transit / Delivered)
  - Delivery address (highlighted prominently, with "✓ Confirmed" badge — if not confirmed, show banner "Please confirm this is correct")
  - **Edit order** button — visible only if `status = 'pending_confirmation'`
  - **Add item** button — visible if status in [pending, confirmed] AND `hours_to_cutoff > 24`
  - Tracking info if dispatched: tracking#, "Arrives tomorrow" / "Arriving today" / delivery confirmation

**Feedback section per delivered order:**
- "How was this order?" → 5-star rating + textarea
- "What could be better?" optional dropdown: Quality / Timing / Variety / Packaging / Other
- Auto-collapses after submitted

**Bottom: Contact CTA (always visible)**
- "Questions about an order? Message us on WhatsApp" → wa.me link with order context prefilled
- Email link as fallback

### D3. /mockups/signup new (already covered in Phase B3)

---

## Phase E — Vendor Portal v2 at `/mockups/vendor-portal`

**Major changes:**

**Multi-day view:**
- Tab list of upcoming days (next 14 days)
- Each day shows: "What we need from you on [date]"
- Per-item: variety, quantity, quality grade, expected dispatch time
- Vendor can click "Confirm this box" per day

**FedEx clarification banner at top:**
- "📦 FedEx receives at their Quito depot by 10pm. Driver pickup at your farm typically same-day afternoon. Pickup confirmation usually via WhatsApp."

**Confirmation flow:**
- "✅ Confirm box for May 18" button per day
- After click: ask "Send confirmation via WhatsApp +1 786 930 8463 too?"
- Status badges per day: ⏳ Pending / ✅ Confirmed / 📦 Driver picked up / 🚚 In transit to US

**Contact box:**
- Big WhatsApp button: "Message us +1 786 930 8463"
- Email fallback
- Note: "Best response time via WhatsApp during business hours Ecuador"

**Auto-confirmation placeholder:**
- "Driver pickup confirmed via WhatsApp at 4:23pm" — show what an auto-ingested confirmation would look like

---

## Phase F — Index + navigation

### F1. Update `/mockups/page.tsx`
- Add tile for Login (with two sub-tiles: Customer + Admin)
- Group tiles by audience: Customer / Admin / Vendor
- Polish styling — currently a bit utilitarian, should feel like the rest of Floropolis

---

## Phase G — Documentation updates

### G1. Update `~/Desktop/floropolis-upgrade/checkout-system/plan.md`
- Add section "Integration with existing Rose dispatch automation" — reference dispatch_runbook.md, note we BUILD ON, not REPLACE
- Update sprint timeline if necessary
- Note the supabase-backup decision for the cron

### G2. Create `~/Desktop/floropolis-upgrade/checkout-system/phase4_security_spec.md`
Full spec for Phase 4 cron security (8 layers):
1. Secrets isolated in env vars
2. SECURITY DEFINER role `payment_processor` with minimal permissions
3. RLS on all tables
4. Stripe idempotency keys
5. Append-only `payment_audit` table (trigger blocks UPDATE/DELETE)
6. No PII in logs
7. Webhook signature verification
8. Aggressive alerting (>2 failures, off-hour attempts, audit log tampering)

Plus the supabase-backup isolation rationale.
Plus the alerting recipients table:
| Event | Email |
|---|---|
| Payment failed (any) | facu@floropolis.com, jjp@floropolis.com |
| >2 failures in a day | facu@floropolis.com, jjp@floropolis.com |
| Suspected fraud | facu@floropolis.com, jjp@floropolis.com |
| Refund requested >$200 | facu@floropolis.com (JJ's authority ceiling) |
| Refund requested >$500 | facu@floropolis.com, jjp@floropolis.com (both required) |
| New admin login from unknown device | facu@floropolis.com |

### G3. Create `~/Desktop/floropolis-upgrade/checkout-system/stripe_facu_checklist.md`
Facu's manual tasks in order:
1. [ ] Open Stripe account at stripe.com using facu@floropolis.com
2. [ ] Business info: Floral Direct LLC, EIN 39-4713788, 200 S Wilton Pl, LA CA 90004
3. [ ] Bank account: provide routing + account
4. [ ] Identity verification: SSN + photo ID
5. [ ] Wait 1-3 days for Stripe approval
6. [ ] Configure branding (logo + green primary color)
7. [ ] Set statement descriptor: "FLOROPOLIS"
8. [ ] Disable all payment methods except cards
9. [ ] Add JJ as team member (Administrator role)
10. [ ] Save API keys (publishable + secret) and share with dev
11. [ ] Enable 2FA on the Stripe dashboard (TOTP)

Plus a similar checklist for JJ:
1. [ ] Accept Stripe team invite
2. [ ] Enable 2FA on his account
3. [ ] Familiarize with refund flow (his ceiling: $200)

---

## Execution order (DO IN THIS ORDER)

Why this order: foundation before screens, admin before customer (so JJ-access patterns stabilize), then documentation last (so it reflects what was actually built).

1. **Phase A** (foundation components + brand constants) — ~30 min
2. **Phase B** (login screens — customer + admin + signup) — ~45 min
3. **Phase C1** (Admin Orders v2) — ~45 min (most complex, biggest change)
4. **Phase C2** (Admin Order Detail v2) — ~30 min
5. **Phase C3** (Admin Dispatch v2) — ~60 min (biggest single screen)
6. **Phase D1** (Checkout v2) — ~20 min
7. **Phase D2** (Account Orders v2) — ~40 min
8. **Phase E** (Vendor Portal v2) — ~30 min
9. **Phase F** (Mockup index polish) — ~15 min
10. **Phase G1+G2+G3** (Doc updates + Phase 4 spec + Stripe checklist) — ~45 min

**Total estimated time: ~6 hours focused work.**

After each phase: visually verify the mockup by checking that `http://127.0.0.1:3000/mockups/<screen>` loads and looks consistent. The dev server is already running.

---

## Acceptance criteria for v2

Facu reviews tomorrow. v2 is "accepted" when:
- [ ] All 7 screens render with consistent Floropolis branding
- [ ] Login screen shows all 4 auth options
- [ ] Admin Orders shows the 2-box flag in at least one day
- [ ] Admin Orders has the Arrived tab
- [ ] Admin Dispatch references Rose's existing pipeline (stepper at bottom)
- [ ] Account Orders has edit/add-item buttons + feedback section + banner
- [ ] Vendor Portal shows multi-day view + WhatsApp +1 786 930 8463
- [ ] Phase 4 security spec is written
- [ ] Stripe checklist is written
- [ ] Plan.md updated to reflect Rose integration

---

## What you must NOT do

- **Don't reinvent dispatch** — Rose has it. Read her runbook. We build UI on top.
- **Don't build real auth** — these are mockups. Use `?state=` query params to simulate states. No Supabase Auth integration yet.
- **Don't store secrets** — there are no secrets in the mockups. Stripe/Supabase keys go in env vars LATER during real implementation.
- **Don't add features Facu didn't approve** — if something seems like a good idea, write it in `~/Desktop/floropolis-upgrade/checkout-system/v2_ideas_for_v3.md` instead of building it. Surface it to Facu.
- **Don't touch production code** outside the `app/mockups/` folder.
- **Don't run `git push` or any destructive command without asking Facu.**

---

## Open items deferred to v3

These came up in Facu's feedback but won't ship in v2 mockups:
- Auto-ingest WhatsApp confirmations (vendor pickup, customer messages)
- FedEx tracking webhook integration (auto-mark Arrived)
- Instagram OAuth feature (opt-in post-registration)
- Cross-order intelligence in customer banners (recommendation engine)
- IP whitelist for admin (mentioned as optional)

These go in `v2_ideas_for_v3.md` for later prioritization.

---

## End of plan
Execute top to bottom. Ping Facu via this conversation thread if something is ambiguous. Save state to mockup files (no need for separate state files during build).
