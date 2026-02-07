# What You Missed & How to Move Forward

## What you missed

### 1. **GTM wasn’t in the site code (fixed in code, not yet deployed)**

The layout was loading **gtag** with an old GA ID (**G-511166381**), not your **GTM** container (**GTM-5WRG7GNX**). So:

- The site was pushing events to `dataLayer`, but **no GTM container** was reading them (unless you injected GTM via Vercel or another tool).
- Custom events like `valentine_shop_click`, `sample_box_click`, etc. were never sent to GA4 via GTM.

**Fix in repo:** `app/layout.tsx` was updated to load **GTM-5WRG7GNX** (head script + body noscript) and the old gtag block was removed. **This change is not yet committed or deployed.**

---

### 2. **GTM: 12 events need triggers + tags**

The site sends **12 custom event names**. For GA4 to receive them, in GTM you need:

- **12 Custom Event triggers** (one per event name).
- **12 GA4 Event tags** (Measurement ID **G-TL18BYQ102**, event name = trigger name, optional params: `cta_location`, `product_type`, `box_choice`).
- **Data Layer Variables** in GTM: `cta_location`, `product_type`, `box_choice`.
- **Publish** the container after changes.

If any of these are missing, those events won’t show in GA4.

---

### 3. **GA4: dimensions and key events**

- **Custom dimensions** (event-scoped): `cta_location`, `product_type`, `box_choice` so you can break down reports by CTA location and product.
- **Key events:** Mark the events that are conversions (e.g. `sample_box_request`, `sample_box_click`, `shop_now_click`) with the star in **Admin → Data display → Events** so they appear in conversions and attribution.

Without this, you’ll see events but won’t be able to segment or use them as conversions properly.

---

## How to move forward

### Step 1: Deploy the GTM layout change (code)

1. Commit the layout + checklist:
   - `app/layout.tsx` (GTM load)
   - `docs/GA4-TRACKING-CHECKLIST.md`
   - `docs/WHAT-YOU-MISSED-AND-NEXT-STEPS.md` (this file, optional)
2. Merge **dev** into **main** and push **main** (or your usual deploy flow).
3. Confirm on the live site (e.g. view source or Tag Assistant) that **GTM-5WRG7GNX** loads on every page.

If you already load GTM via Vercel (or similar), you can skip changing the layout and keep your current setup; just ensure GTM is the one reading `dataLayer` and sending to **G-TL18BYQ102**.

---

### Step 2: Finish GTM setup

1. In GTM, create **Data Layer Variables**: `cta_location`, `product_type`, `box_choice`.
2. For each of the 12 event names, create:
   - A **Custom Event** trigger (event name = exact string).
   - A **GA4 Event** tag (Measurement ID **G-TL18BYQ102**, same event name, add event parameters from the Data Layer Variables above where relevant).
3. **Submit** and **Publish** the container.

Use **docs/GA4-TRACKING-CHECKLIST.md** for the full list of event names and parameters.

---

### Step 3: Finish GA4 setup

1. **Admin → Data display → Custom definitions** → create event-scoped dimensions for `cta_location`, `product_type`, `box_choice`.
2. **Admin → Data display → Events** → in Recent events, mark the conversion events as **Key events** (star).

---

### Step 4: Verify

1. On the **live site**, open Tag Assistant (or GTM Preview).
2. Click a few CTAs (e.g. “Shop Flowers”, “Get Free Sample Box”, “Shop Now”, footer email).
3. Confirm the corresponding **Custom Event** and **GA4 Event** tag fire.
4. In **GA4 → Reports → Realtime**, confirm those event names and counts increase when you click.

---

## Summary

| What you missed              | Where it’s fixed / what to do                    |
|-----------------------------|--------------------------------------------------|
| GTM not loaded by the site  | **Code:** `app/layout.tsx` (commit + deploy)     |
| GTM triggers/tags/variables | **You:** GTM UI – 12 triggers, 12 tags, 3 vars, Publish |
| GA4 dimensions + key events | **You:** GA4 Admin – custom dimensions + star key events |
| Verification                | **You:** Tag Assistant + GA4 Realtime            |

After Step 1 (deploy layout), Step 2 (GTM), and Step 3 (GA4), you’ll be set to track everything properly in GA4 and move forward with reporting and optimization.
