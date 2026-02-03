# Floropolis CTA tracking – full playbook

Use this whenever you update the website (new campaigns, new CTAs, or renaming e.g. Valentines → Shop / Top Varieties). It explains how tracking works, what the code must do, and what you must set up in GTM and GA4 so all key actions are tracked.

---

## 1. How it works (high level)

1. **Website** pushes an event to `window.dataLayer` when a user clicks a CTA (e.g. "Shop Now", "Get Free Sample Box").
2. **GTM** (container GTM-5WRG7GNX) loads on every page, listens for those events, and fires **GA4 Event** tags.
3. **GA4** (property G-TL18BYQ102) receives the events and shows them in Reports and Realtime.

If any of these is missing or misconfigured, events won’t show in GA4.

---

## 2. Event names and when to use them

The site uses **fixed event names**. GTM and GA4 are set up for these names. When you add or change CTAs, reuse these names and use **parameters** (e.g. `cta_location`, `campaign`) to differentiate.

| Event name | Use for |
|------------|--------|
| `valentine_shop_click` | Any CTA that goes to “shop” / Valentine’s / top varieties (same destination). Use params to distinguish campaign/location. |
| `sample_box_click` | Any link/button that goes to the sample-box page (“Get Free Sample Box”, “Free Sample Box”, etc.). |
| `sample_box_request` | Form submit on the sample-box page only (key conversion). |
| `shop_now_click` | Any CTA that goes to the external shop (e.g. kometsales.com). |
| `contact_click` | “Contact Us” / “Contact” links (to contact page or contact intent). |
| `footer_email_click` | Footer “orders@floropolis.com” (mailto). |
| `footer_whatsapp_click` | Footer WhatsApp link. |
| `footer_instagram_click` | Footer Instagram link (and same event for Instagram elsewhere, e.g. valentines page). |
| `footer_tiktok_click` | Footer TikTok link (and same for TikTok elsewhere). |
| `contact_email_click` | Contact page – Email (mailto). |
| `contact_whatsapp_click` | Contact page – WhatsApp. |
| `contact_call_click` | Contact page – Call (tel:). |

**Parameters we send (optional but useful):**

- `cta_location` – Where on the page (e.g. `"hero"`, `"nav"`, `"footer"`, `"green_banner"`, `"valentines_page"`, `"contact_page"`, `"sample_box_success"`). Lets you compare performance by placement.
- `product_type` – For shop/valentine-style CTAs (e.g. `"valentines_all"`, `"freedom_red"`). Only when it makes sense.
- `box_choice` – For `sample_box_request` only (e.g. `"roses"`, `"summer"`, `"gypsophilia"`).

When you **rename a campaign** (e.g. Valentines → Shop / Top Varieties):

- Keep the same **event name** (`valentine_shop_click` or whatever you use for “go to shop”) so GTM/GA4 don’t need tag changes.
- Optionally add a **parameter** like `campaign: "top_varieties_2026"` if you want to filter by campaign in GA4. Then add that parameter in GTM and GA4 as needed.

---

## 3. What the developer must do in the code

### 3.1 Files and patterns

- **Tracking helper:** `lib/gtm.ts`  
  - `pushEvent(eventName, params)` – for in-page navigation (e.g. Next.js `Link`).  
  - `handleOutboundClick(e, eventName, params)` – for links that leave the site (external URL, `mailto:`, `tel:`). Use this so the event fires before the page unloads.
- **Event names:** Use the constants in `lib/gtm.ts` (`CTA_EVENTS`) so names stay consistent.

### 3.2 Where CTAs live (so you know where to add tracking)

| Area | File(s) |
|------|--------|
| Top banner, hero, promo, green banner | `app/page.tsx` |
| Nav (desktop + mobile) | `components/Navigation.tsx` |
| Footer | `components/Footer.tsx` |
| Contact page | `app/contact/page.tsx` |
| Sample-box page (form + success “Browse catalog”) | `app/sample-box/page.tsx` |
| Valentines / shop / top varieties page | `app/valentines/page.tsx` (or future equivalent) |
| How It Works CTA | `app/how-it-works/page.tsx` |
| About CTA | `app/about/page.tsx` |
| Exit-intent popup (sample link) | `components/ExitIntentPopup.tsx` |

### 3.3 Rules for every CTA

1. **Internal link** (stays on floropolis.com, e.g. `Link href="/sample-box"`):  
   Add `onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "…" })}` (or the right event + `cta_location`).

2. **External link** (kometsales, mailto, tel, WhatsApp, etc.):  
   Add `onClick={(e) => handleOutboundClick(e, CTA_EVENTS.shop_now_click, { cta_location: "…" })}` (or the right event). Do **not** use plain `pushEvent` for these; the delay in `handleOutboundClick` ensures the hit is sent before navigation.

3. **Form submit** (e.g. sample box form):  
   In the submit handler, call `pushEvent(CTA_EVENTS.sample_box_request, { cta_location: "sample_box_form", box_choice: … })` before or right when you submit.

4. **New campaign (e.g. Valentines → “Top Varieties”)**  
   - Keep existing event names; only change copy and URLs if needed.  
   - If you want campaign-level reporting, add a param (e.g. `campaign: "top_varieties_2026"`) and pass it in the relevant `pushEvent` / `handleOutboundClick` calls.  
   - If you introduce a **new** CTA type that doesn’t fit existing names, add a new event name in `lib/gtm.ts` and use it everywhere that CTA appears; then add one trigger + one GA4 Event tag in GTM for it (see below).

### 3.4 Checklist when you add or change CTAs

- [ ] Every new or changed button/link has an `onClick` that calls either `pushEvent` or `handleOutboundClick` with the correct event name from `CTA_EVENTS`.
- [ ] External/mailto/tel links use `handleOutboundClick`, not `pushEvent`.
- [ ] Each call includes `cta_location` (and optionally `product_type`, `box_choice`, or `campaign`) so you can compare performance.
- [ ] If you added a **new event name**, you’ll need a new GTM trigger + GA4 Event tag (see Section 4).

---

## 4. What you (or your team) must set up in GTM

### 4.1 Container and base tag

- GTM container **GTM-5WRG7GNX** is loaded in `app/layout.tsx` (head + body noscript). Do not remove it.
- One **Google Tag** (GA4 config) with Measurement ID **G-TL18BYQ102**, firing on **Initialization - All Pages**. All GA4 Event tags use this same tag’s configuration.

### 4.2 Variables (User-Defined)

Create **Data Layer Variables** for every parameter the site pushes:

| Variable name (in GTM) | Type | Data Layer Variable Name (exact key from site) |
|------------------------|------|------------------------------------------------|
| `cta_location`         | Data Layer Variable | `cta_location`  |
| `product_type`         | Data Layer Variable | `product_type`  |
| `box_choice`           | Data Layer Variable | `box_choice`    |
| (if you use it) `campaign` | Data Layer Variable | `campaign` |

The **Data Layer Variable Name** must match the key the code pushes (e.g. `cta_location`), not a label like "DLV - cta_location".

### 4.3 Triggers

- One **Custom Event** trigger per event name.
- **Event name** = exact string from the table in Section 2 (e.g. `valentine_shop_click`, `sample_box_click`).
- Use “All Custom Events” or “Some Custom Events” with condition “Event equals [event name]”.

### 4.4 Tags

- One **Google Analytics: GA4 Event** tag per event name.
  - **Measurement ID:** G-TL18BYQ102 (or your GA4 config variable).
  - **Event Name:** same as the Custom Event (e.g. `valentine_shop_click`).
  - **Event parameters:** add only the parameters that event actually sends:
    - Parameter name: `cta_location` → Value: `{{cta_location}}`
    - Parameter name: `product_type` → Value: `{{product_type}}` (for shop/valentine events)
    - Parameter name: `box_choice` → Value: `{{box_choice}}` (for `sample_box_request`)
  - **Trigger:** the Custom Event trigger with the same name.
- After any change: **Submit** (Publish) the container.

### 4.5 When you add a new event name (e.g. new CTA type)

1. Add the event name in `lib/gtm.ts` (`CTA_EVENTS`) and use it in the code.
2. In GTM: New **Custom Event** trigger (Event name = new name).
3. In GTM: New **GA4 Event** tag (Event name = new name, trigger = new trigger, add any parameters you push).
4. Publish the container.

---

## 5. What you must set up in GA4

### 5.1 Custom dimensions (so you can break down by CTA location / product)

- **Admin** → **Data display** → **Custom definitions** → **Create custom dimension**.
- Create **event-scoped** dimensions for every parameter you send:
  - **Dimension name:** e.g. “CTA location” → **Event parameter:** `cta_location`
  - **Dimension name:** e.g. “Product type” → **Event parameter:** `product_type`
  - **Dimension name:** e.g. “Box choice” → **Event parameter:** `box_choice`
  - (If you use `campaign`) **Dimension name:** e.g. “Campaign” → **Event parameter:** `campaign`

### 5.2 Key events (conversions)

- **Admin** → **Data display** → **Events**.
- In **Recent events**, find the events that are conversions (e.g. `sample_box_request`, `sample_box_click`, `shop_now_click`, `valentine_shop_click`).
- Click the **star** next to each to mark as **Key event** so they appear in conversions and attribution.

### 5.3 When you add a new event name

- No extra GA4 setup is required for the event to appear in **Reports** and **Realtime** once GTM is sending it.
- If you send new **parameters**, add matching **custom dimensions** (event parameter = parameter name) so you can use them in reports.
- Mark the new event as a **Key event** if it’s a conversion.

---

## 6. Quick check after every update

1. **Code:** Search the repo for new `<a href=` and `<Link` and buttons that look like CTAs; confirm each has `pushEvent` or `handleOutboundClick` with the right event name and `cta_location`.
2. **GTM:** Tag Assistant (or GTM Preview) on the live site → click each CTA → in the **Tags** tab, confirm the right GA4 Event tag fired.
3. **GA4:** **Reports** → **Realtime** → click CTAs → in “Event count by Event name” confirm the events and (after 24–48 h) in **Engagement** → **Events** that they appear with correct parameters.

---

## 7. Example: “We’re changing from Valentines to Shop / Top Varieties”

**Developer (code):**

- Replace copy (e.g. “Valentine’s Day” → “Top Varieties”, “Shop Valentine’s” → “Shop Top Varieties”) and update URLs if the shop URL or path changes.
- **Do not** change event names: keep `valentine_shop_click` (and any `shop_now_click`) so existing GTM tags keep working.
- Optionally add `campaign: "top_varieties_2026"` (or similar) to the relevant `pushEvent` / `handleOutboundClick` calls if you want to segment by campaign in GA4.

**You (GTM/GA4):**

- No change needed in GTM if event names and parameter names stay the same.
- If you added a `campaign` parameter: in GTM, add a Data Layer Variable for `campaign` and add it as an event parameter to the relevant GA4 Event tag(s). In GA4, create a custom dimension for the `campaign` event parameter.

---

## 8. One-shot “prompt” you can paste for future updates

You can paste this (or a link to this doc) when asking for CTA tracking on a new update:

**Prompt:**

“We’re updating the Floropolis site [describe change: e.g. new campaign, new page, Valentines → Top Varieties]. Follow the CTA tracking playbook in `docs/CTA-TRACKING-PLAYBOOK.md`:

1. Use only the event names and helpers in `lib/gtm.ts`; use `handleOutboundClick` for any link that leaves the site (external, mailto, tel).
2. Every CTA must have an onClick that pushes the right event and `cta_location` (and other params where relevant).
3. If you add a new event name, list it so we can add one Custom Event trigger and one GA4 Event tag in GTM and optionally a custom dimension in GA4.
4. After your changes, confirm no new CTAs (buttons/links) were added without tracking.”

That keeps code and GTM/GA4 in sync and ensures all key actions stay tracked after every update.
