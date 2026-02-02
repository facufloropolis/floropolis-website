# GTM + GA4: Setup, Events, Conversions & Remarketing Audiences

GA4 is now **only** in GTM (no gtag in the site code). The site pushes events to `dataLayer`; GTM sends them to GA4. This doc covers: (1) setting up GA4 in GTM, (2) which events matter and which are conversions, (3) how to build audiences for remarketing.

---

## Part 1: Set up GA4 in GTM (do this first)

You must add the GA4 tag in GTM or GA4 will not receive data.

### 1.1 GA4 Configuration tag (page views)

1. In **GTM** (tagmanager.google.com) → your container **GTM-5WRG7GNX** → **Tags** → **New**.
2. Name: `GA4 - Configuration`.
3. Tag type: **Google Analytics: GA4 Configuration**.
4. **Measurement ID:** `G-TL18BYQ102`.
5. **Trigger:** **All Pages** (so it fires on every page load and sends page_view).
6. **Save**.

### 1.2 GA4 Event tags (custom events from the site)

The site pushes these to `dataLayer`; GTM must fire a GA4 Event tag when each one occurs.

| dataLayer event name        | Where it fires              | Use in GA4        |
|-----------------------------|-----------------------------|--------------------|
| `valentine_shop_click`      | Valentine’s page – shop CTA | Event + conversion  |
| `valentine_sample_click`    | Valentine’s page – sample CTA | Event + conversion |
| `sample_box_request`        | Sample box form submit      | Event + conversion  |

**For each event above, create one GA4 Event tag:**

1. **Tags** → **New** → Tag type: **Google Analytics: GA4 Event**.
2. **Configuration Tag:** select `GA4 - Configuration` (the tag from 1.1).
3. **Event Name:** use the exact name (e.g. `valentine_shop_click`).
4. **Event Parameters (optional):** add parameters so they appear in GA4:
   - For `valentine_shop_click`: `product_type` (Data Layer Variable → `product_type`), `campaign` (Data Layer Variable → `campaign`).
   - For `valentine_sample_click`: `campaign` (Data Layer Variable → `campaign`).
   - For `sample_box_request`: `box_choice`, `campaign` (Data Layer Variables).
5. **Trigger:** **Custom Event** → Event name = same as above (e.g. `valentine_shop_click`).
6. **Save**.

**Data Layer Variables (create once, reuse):**

- **Variables** → **New** → **Data Layer Variable** → Data Layer Variable Name: `product_type` (or `campaign`, `box_choice`). Create one variable per parameter you use.

### 1.3 Publish and test

1. **Submit** → **Publish** in GTM.
2. On your site: use GTM **Preview** and trigger the actions (click Valentine’s shop, sample box, submit sample form).
3. In Preview, confirm the GA4 Configuration tag and each GA4 Event tag fire.
4. In **GA4** → **Reports** → **Realtime** → **Event count by Event name**, confirm `valentine_shop_click`, `valentine_sample_click`, `sample_box_request` (and `page_view`) appear.

---

## Part 2: Which events matter & which are conversions

### Events that matter (track these)

| Event                     | Why it matters                         |
|---------------------------|----------------------------------------|
| `page_view`               | Built-in; shows traffic and pages.     |
| `valentine_shop_click`    | Intent to buy Valentine’s product.      |
| `valentine_sample_click`  | Intent to request sample.              |
| `sample_box_request`      | Lead: someone asked for a sample box.  |
| (future) Form submits     | Contact / lead.                        |
| (future) Clicks to shop   | Outbound to your shop (e.g. kometsales). |

### Conversions (mark these in GA4)

Conversions = events you treat as “goals” (leads, sign-ups, purchases). GA4 uses them for reporting and for audiences.

**Recommended conversions:**

1. **`sample_box_request`** – someone requested a sample (high-value lead).
2. **`valentine_shop_click`** – strong intent (browsing Valentine’s and clicked to shop).
3. **`valentine_sample_click`** – intent to get a sample (can add as conversion if you use it in audiences).

**How to mark an event as a conversion:**

1. **GA4** → **Admin** (gear) → **Data display** → **Events**.
2. Find the event (e.g. `sample_box_request`).
3. Toggle **Mark as conversion** to ON.
4. Repeat for `valentine_shop_click` (and optionally `valentine_sample_click`).

After 24–48 hours you’ll see them under **Reports** → **Engagement** → **Conversions**.

---

## Part 3: Audiences for remarketing

Audiences = groups of users GA4 builds from your data. You can send these to Google Ads (and other tools) for remarketing and similar-audience campaigns.

### 3.1 Where to create audiences

- **GA4** → **Admin** → **Data display** → **Audiences** → **New audience**.
- Or **Explore** → create an exploration and later save as audience.

### 3.2 Audiences that work well for remarketing

**1. All visitors (last 30 days)**  
- **Include:** All users.  
- **Use:** Broad remarketing (anyone who came to the site).

**2. High-intent (clicked Valentine’s or sample)**  
- **Include:** Users who had **Event** = `valentine_shop_click` **or** `valentine_sample_click` **or** `sample_box_request` in the last 30 days.  
- **Use:** Stronger remarketing list (warmer leads).

**3. Sample box requesters (leads)**  
- **Include:** Users who had **Event** = `sample_box_request` in the last 90 days (or 180 if you want a longer list).  
- **Use:** Remarketing to people who already asked for a sample; exclude from “request sample” ads if you want to avoid redundancy.

**4. Valentine’s page, no conversion**  
- **Include:** Users who had **Page path** contains `/valentines` in the last 14 days.  
- **Exclude:** Users who had **Event** = `valentine_shop_click` or `sample_box_request`.  
- **Use:** Remarketing to people who looked at Valentine’s but didn’t click through.

**5. Homepage only (bounced)**  
- **Include:** Users with **Page path** = `/` (or “first page” = homepage).  
- **Exclude:** Users with 2+ sessions or any conversion.  
- **Use:** Light remarketing to one-page visitors.

### 3.3 How to build an audience in GA4 (step-by-step)

1. **Admin** → **Audiences** → **New audience** → **Create a custom audience**.
2. **Audience name:** e.g. `High-intent - Valentine or sample (30d)`.
3. **Scope:** User (so we’re grouping by user, not by event).
4. **Add condition:**
   - **Include** → **Event name** → **Exactly matches** → `valentine_shop_click`.
   - **Or** → **Event name** → **Exactly matches** → `valentine_sample_click`.
   - **Or** → **Event name** → **Exactly matches** → `sample_box_request`.
5. **Time window:** Last 30 days (or 14 / 90 as you prefer).
6. **Save**.

### 3.4 Sending audiences to Google Ads (remarketing)

1. **GA4** → **Admin** → **Product links** → **Google Ads links** → link your GA4 property to your Google Ads account (if not already).
2. **Admin** → **Audiences** → open an audience → **Audience definition** → ensure **Publish to Google Ads** (or similar) is ON so it can be used in Ads.
3. In **Google Ads** → **Tools** → **Shared library** → **Audience manager** → **Audience sources** → **Google Analytics 4**; your GA4 audiences will appear there. Add them to campaigns or ad groups as “Remarketing” audiences.

### 3.5 Best practices for audiences

- **Size:** Aim for at least a few hundred users per audience for remarketing; GA4 shows estimated size when you build the audience.
- **Recency:** 14–30 days is common for “recent” intent; 90–180 days for “ever did X” (e.g. sample requesters).
- **Exclusions:** Exclude converters from “get a sample” ads if they already submitted the form; exclude high-intent users from generic “visit site” ads if you have a dedicated Valentine’s campaign.

---

## Part 4: Quick reference

| What                    | Where / How                                      |
|-------------------------|---------------------------------------------------|
| GA4 Measurement ID      | `G-TL18BYQ102` (only in GTM, not in site code)  |
| GTM container           | `GTM-5WRG7GNX` (in `app/layout.tsx`)             |
| Events from site        | Pushed via `dataLayer`; GTM fires GA4 Event tags |
| Mark as conversion      | GA4 → Admin → Events → toggle “Mark as conversion” |
| Create audience         | GA4 → Admin → Audiences → New audience           |
| Use in Ads              | Link GA4 to Google Ads; use audiences in Ads audience manager |

Once GA4 is set up in GTM (Part 1), mark conversions (Part 2), then build audiences (Part 3) and connect them to Google Ads for remarketing.
