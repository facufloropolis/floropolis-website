# GTM & Analytics: Maximize Value & Don’t Break It

**GA4 is now only in GTM** (no gtag in the site). The site pushes events to `dataLayer`; GTM sends them to GA4. Full setup, events, conversions, and remarketing: **`docs/GTM-GA4-SETUP-AND-AUDIENCES.md`**.

## 1. Where the tag code lives (don’t break this)

All tag code is in **one file** plus event pushes in pages:

| File | What’s there |
|------|----------------|
| **`app/layout.tsx`** | GTM snippet only (head + body) |
| **`app/valentines/page.tsx`** | `dataLayer.push` for `valentine_shop_click`, `valentine_sample_click` |
| **`app/sample-box/page.tsx`** | `dataLayer.push` for `sample_box_request` |

**In `app/layout.tsx`:**

- **Constant `GTM_ID`** — don’t remove; GTM container ID (default `GTM-5WRG7GNX`).
- **GTM script in `<head>`** — don’t remove or change the inline script.
- **GTM `<noscript>` iframe** — first thing inside `<body>`; keep it.

**IDs:**

- **GTM:** `GTM-5WRG7GNX` (in layout; GA4 is configured inside GTM).
- **GA4:** `G-TL18BYQ102` (only in GTM tags, not in site code).

Optional: `NEXT_PUBLIC_GTM_ID` in `.env.local` to override the GTM container.

---

## 2. How to maximize the tag

### GA4 lives in GTM

- All GA4 tags (Configuration + Event tags) are in **GTM**. The site only has GTM + `dataLayer.push` for custom events.
- Add any **new tags** (ads, remarketing, other tools) **inside GTM**.

### Track key actions (events)

The site pushes `valentine_shop_click`, `valentine_sample_click`, `sample_box_request` to `dataLayer`. You must add matching **GA4 Event tags** in GTM (see **`docs/GTM-GA4-SETUP-AND-AUDIENCES.md`**). You can add more events in GTM or via `dataLayer.push`:

| Goal | How |
|------|-----|
| **Clicks** (e.g. “Shop Valentine’s”, “Get Sample Box”) | GTM: trigger = Click – All Elements (or specific link); tag = GA4 Event. Or keep/expand `dataLayer.push` in your pages. |
| **Form submits** (contact, sample box) | GTM: trigger = Form Submission; tag = GA4 Event `form_submit` (or similar). |
| **Outbound / Shop Now** | GTM: trigger when link URL contains `kometsales.com` (or your shop domain); tag = GA4 Event `outbound_click` or `shop_click`. |
| **Scroll depth** | GTM: built-in or community template “Scroll Depth”; tag = GA4 Event. |

**In GA4:** Admin → Events → mark important events as **Conversions** (e.g. `sample_box_request`, `valentine_shop_click`). See **`docs/GTM-GA4-SETUP-AND-AUDIENCES.md`** for which events to mark and how to build **remarketing audiences**.

### Keep the snippet intact

- **Don’t** remove or move the GTM block from **`app/layout.tsx`**; it must load on every page.
- **Don’t** remove the GTM `<noscript>` at the start of `<body>`.

### Use Preview and Realtime before going live

- **GTM:** use **Preview** to confirm GA4 Configuration and Event tags fire.
- **GA4:** use **Reports → Realtime** to confirm page_view and custom events.

---

## 3. How to not break it when you update the website

### Before changing layout or global code

1. **Open `app/layout.tsx`** and make sure you’re not:
   - Deleting the GTM `<head>` script or the GTM `<noscript>` at the start of `<body>`
   - Changing `GTM_ID` unless you’re switching container
2. **Event tracking:** `app/valentines/page.tsx` and `app/sample-box/page.tsx` use `dataLayer.push`; if you rename or remove those events, add matching GA4 Event tags/triggers in GTM.

### Before every deploy

1. **Quick check in code:**  
   Search for `GTM-5WRG7GNX` in `app/layout.tsx`; it should still be present.
2. **After deploy:**  
   - Open the live site (e.g. https://www.floropolis.com).  
   - GTM: use **Preview**; confirm GA4 Configuration and Event tags fire.  
   - GA4: **Realtime**; confirm page_view and custom events.

### Optional: automated check

Add a check (e.g. in CI) that fails if `app/layout.tsx` no longer contains `GTM-5WRG7GNX`.

---

## 4. One-page checklist

**Maximize:**

- [ ] GA4 Configuration + Event tags set up in GTM (see **GTM-GA4-SETUP-AND-AUDIENCES.md**).
- [ ] Mark key events as conversions in GA4; build audiences for remarketing.
- [ ] Add any new third-party tags in GTM.

**Don’t break:**

- [ ] GTM snippet stays in `app/layout.tsx`; don’t remove GTM block or noscript.
- [ ] Before deploy: search for `GTM-5WRG7GNX` in `layout.tsx`.
- [ ] After deploy: GTM Preview + GA4 Realtime on the live site.
