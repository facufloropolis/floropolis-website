/**
 * Catalog display constants.
 * Set NEXT_PUBLIC_PRODUCT_IMAGES_BASE_URL in .env.local to override (e.g. CDN URL).
 */
const envBase =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_PRODUCT_IMAGES_BASE_URL
    : undefined;

export const PRODUCT_IMAGES_BASE_URL = envBase ?? "/product-photos";

// WhatsApp number for wa.me links across /quote, /shop, /shop/[slug], /quote/confirmation.
// v2 | 2026-05-17 -- swapped from incorrect 17864603229 (was a never-valid typo causing
// "+17864603229 isn't on WhatsApp" errors for users) to canonical 16452405203.
// Call/text routes to 786-930-8463 via tel: links separately (see BRAND.phone in mockups).
export const WHATSAPP_NUMBER = "16452405203";
