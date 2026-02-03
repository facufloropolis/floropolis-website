# GA4 tracking – what’s needed to track everything

The site pushes these **12 event names** to `dataLayer` (and optional params). For GA4 to receive and use them, GTM and GA4 must be set up as below.

---

## 1. Site (done)

- **Layout:** GTM container **GTM-5WRG7GNX** is loaded in the layout (replaces old gtag). GA4 **G-TL18BYQ102** should be configured inside GTM as the Google tag.
- **Events:** All important CTAs call `pushEvent(...)` or `handleOutboundClick(...)` with the event names and params below.

---

## 2. GTM – triggers and tags

For each event name, GTM needs a **Custom Event** trigger and a **GA4 Event** tag that sends that event to GA4.

| Event name (exact) | Use | Params to send to GA4 |
|--------------------|-----|------------------------|
| `valentine_shop_click` | Valentine’s / Shop Valentine’s | `cta_location`, `product_type` (when present) |
| `sample_box_click` | Get Free Sample Box / Free Sample Box links | `cta_location` |
| `sample_box_request` | Sample box form submit (key conversion) | `cta_location`, `box_choice` |
| `shop_now_click` | Shop Now (external) | `cta_location` |
| `contact_click` | Contact Us / Contact link | `cta_location` |
| `footer_email_click` | Footer orders@ | — |
| `footer_whatsapp_click` | Footer WhatsApp | — |
| `footer_instagram_click` | Footer Instagram | `cta_location` (optional, when sent) |
| `footer_tiktok_click` | Footer TikTok | `cta_location` (optional) |
| `contact_email_click` | Contact page – Email | — |
| `contact_whatsapp_click` | Contact page – WhatsApp | — |
| `contact_call_click` | Contact page – Call | — |

**In GTM:**

1. **Variables → New → Data Layer Variable** (create these):
   - Name: `DLV - cta_location`, Data Layer Variable Name: `cta_location`
   - Name: `DLV - product_type`, Data Layer Variable Name: `product_type`
   - Name: `DLV - box_choice`, Data Layer Variable Name: `box_choice`

2. **Triggers:** For each event name above, create a **Custom Event** trigger:
   - Trigger type: Custom Event  
   - Event name: *(exact string from table)*  
   - e.g. `valentine_shop_click`, `sample_box_click`, …

3. **Tags:** For each trigger, create a **Google Analytics: GA4 Event** tag:
   - Measurement ID: **G-TL18BYQ102** (or your GA4 config variable)
   - Event name: same as the Custom Event name (e.g. `valentine_shop_click`)
   - Event parameters (optional but recommended):
     - `cta_location` → `{{DLV - cta_location}}`
     - `product_type` → `{{DLV - product_type}}` (for valentine_shop_click)
     - `box_choice` → `{{DLV - box_choice}}` (for sample_box_request)
   - Trigger: the matching Custom Event trigger

4. **Submit** the container (Publish to Live) after changes.

---

## 3. GA4 – custom dimensions and key events

**Custom dimensions (so you can break down by location / product):**

1. GA4 → **Admin** → **Data display** → **Custom definitions** → **Create custom dimension**
2. Create **event-scoped** dimensions:
   - **Dimension name:** `CTA location`  
     **Event parameter:** `cta_location`
   - **Dimension name:** `Product type`  
     **Event parameter:** `product_type`
   - **Dimension name:** `Box choice`  
     **Event parameter:** `box_choice`

**Key events (conversions):**

1. GA4 → **Admin** → **Data display** → **Events**
2. In **Recent events**, find the events that matter as conversions (e.g. `sample_box_request`, `sample_box_click`, `shop_now_click`, `valentine_shop_click`).
3. Click the **star** next to each to mark as **Key event** so they appear in conversions and attribution.

---

## 4. Quick check

- **GTM:** Tag Assistant or GTM Preview on floropolis.com → click a CTA → confirm the right Custom Event fires and the GA4 Event tag fires.
- **GA4:** **Reports → Realtime** → click CTAs on the site → in “Event count by Event name” you should see the 12 event names and counts.
- **GA4:** After 24–48 hours, **Reports → Engagement → Events** should show the same events with `cta_location` (and other params) if dimensions are set up.

---

## 5. Optional – nav/footer “How It Works” and “About”

“How It Works” and “About” in nav and footer are **not** sending custom events; only default `page_view` will record those visits. If you want click-level tracking for those, we can add `how_it_works_click` and `about_click` in the code and you can add matching triggers/tags in GTM.
