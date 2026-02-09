# GTM Preview Mode – Testing Checklist

Use this when you run GTM Preview and navigate the site to verify tags and variables.

---

## 1. Open GTM Preview Mode

1. Go to [tagmanager.google.com](https://tagmanager.google.com) → your container **GTM-5WRG7GNX**.
2. Click **Preview**.
3. Enter your site URL (e.g. `http://localhost:3000` or your staging URL) → **Connect**.
4. A new tab opens with the site; keep the **Tag Assistant** tab open to see which tags fire.

---

## 2. Pages to Navigate (full site coverage)

| Order | Page | URL | What to do |
|-------|------|-----|------------|
| 1 | Home | `/` | Load page, scroll, click hero "Shop Flowers", "Get Free Sample Box", Magic Flowers banner "Shop Now", promo "Shop Flowers", green banner CTAs. |
| 2 | Shop | `/shop` | Load, scroll sections (Roses, Summer, Tropicals, Greens), click product links, footer Instagram/TikTok, "Shop Now" / "Sample Box" / WhatsApp. |
| 3 | Sample Box | `/sample-box` | Load, fill form (test data), **submit form** (fires `sample_box_request`), then click "Shop Now" on success. |
| 4 | Contact | `/contact` | Load, click email, WhatsApp, phone, "Sample Box", "Shop Now". |
| 5 | How It Works | `/how-it-works` | Load, click "Sample Box" and "Shop Now". |
| 6 | About | `/about` | Load, click "Sample Box" and "Shop Now". |

---

## 3. Tags to Verify Fire

### 3.1 Google Analytics 4 Config

- **When:** On every page load (or on first load if you use a single GA4 Config with All Pages).
- **In Preview:** Summary → "Tags Fired" should include the GA4 Config tag on each navigation.
- **Note:** GA4 ID is **G-TL18BYQ102** (from layout comment); confirm it matches your GA4 property.

### 3.2 Event Tags (dataLayer Custom Events)

These events are pushed from the app (see `lib/gtm.ts` and usage in `app/`). In GTM you should have **GA4 Event** tags (or equivalent) with **Custom Event** triggers for each.

| Event name | Where it fires | Trigger in GTM |
|------------|----------------|----------------|
| `valentine_shop_click` | Home hero "Shop Flowers", promo "Shop Flowers"; Shop nav/link to shop | Custom Event = `valentine_shop_click` |
| `sample_box_click` | Home hero "Get Free Sample Box", green banner; Shop/Sample Box/Contact/How It Works/About "Sample Box" CTAs | Custom Event = `sample_box_click` |
| **`sample_box_request`** | **Sample Box form submit (conversion)** | Custom Event = `sample_box_request` |
| `shop_now_click` | Magic Flowers banner, green banner, Shop/Contact/How It Works/About "Shop Now", outbound Komet links | Custom Event = `shop_now_click` |
| `footer_instagram_click` | Shop footer Instagram link | Custom Event = `footer_instagram_click` |
| `footer_tiktok_click` | Shop footer TikTok link | Custom Event = `footer_tiktok_click` |
| `footer_whatsapp_click` | Shop footer WhatsApp link | Custom Event = `footer_whatsapp_click` |
| `contact_email_click` | Contact page email link | Custom Event = `contact_email_click` |
| `contact_whatsapp_click` | Contact page WhatsApp links | Custom Event = `contact_whatsapp_click` |
| `contact_call_click` | Contact page phone link | Custom Event = `contact_call_click` |

**Params often sent:** `cta_location` (e.g. `hero`, `magic_flowers_banner`, `green_banner`, `shop_page`, `contact_page`, `sample_box_success`, etc.). Use these in GA4 as event parameters if you want.

### 3.3 Conversion pixels

- If you have conversion pixels (e.g. Meta, TikTok, other) in GTM, they should be triggered by the same Custom Events above (e.g. `sample_box_request` for main conversion).
- In Preview, confirm each pixel tag fires when you perform the matching action (form submit, key CTA, etc.).

---

## 4. Variables to Check

- **dataLayer Variable:** If you use `cta_location` or other params in tags, create Data Layer Variables in GTM for the keys (e.g. `cta_location`) and confirm in Preview → "Variables" that they resolve when the event fires (e.g. `hero`, `magic_flowers_banner`).
- **GA4 Configuration Variable:** Should point to your GA4 Measurement ID (G-TL18BYQ102).
- **Built-in Variables:** If you use Click URL, Page URL, etc., confirm they populate on the right events.

---

## 5. No tag errors in console

1. Open **browser DevTools** (F12) → **Console** tab.
2. Navigate and click through the site as in section 2.
3. **Check for:**
   - Red errors mentioning `dataLayer`, `gtag`, `GTM`, or your pixel names.
   - 404s or blocked requests to `googletagmanager.com` or `google-analytics.com`.
4. **Expected:** No errors. `dataLayer` is pushed by `lib/gtm.ts`; GTM script loads from layout; no direct `gtag` in app code.

---

## 6. Quick reference – Event sources in code

- **Home:** `app/page.tsx` – magic_flowers_banner, hero, promo_section, green_banner.
- **Shop:** `app/shop/page.tsx` – shop_page, shop_final_cta (footer + CTAs).
- **Sample box:** `app/sample-box/page.tsx` – `sample_box_request` on submit; sample_box_success "Shop Now".
- **Contact:** `app/contact/page.tsx` – contact_email_click, contact_whatsapp_click, contact_call_click, sample_box_click, shop_now_click.
- **How It Works / About:** `app/how-it-works/page.tsx`, `app/about/page.tsx` – sample_box_click, shop_now_click.

---

**Result:** After the full run you should see GA4 Config and all relevant Event (and pixel) tags firing on the right actions, variables resolving, and no tag-related errors in the console.
