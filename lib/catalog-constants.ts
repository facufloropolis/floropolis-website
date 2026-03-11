/**
 * Catalog display constants.
 * Set NEXT_PUBLIC_PRODUCT_IMAGES_BASE_URL in .env.local to override (e.g. CDN URL).
 */
const envBase =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_PRODUCT_IMAGES_BASE_URL
    : undefined;

export const PRODUCT_IMAGES_BASE_URL = envBase ?? "/product-photos";

export const WHATSAPP_NUMBER = "17864603229";
