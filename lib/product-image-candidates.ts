// Product image candidates — ordered list of photo sources to try for a product
// before showing the brand placeholder.
// v2 | 2026-10-01 | Job_PM (jj/production-catalog-release, photo recovery)
//
// Two lists, for two different uses:
//
//   getOwnProductImages()      → the product's OWN photos: its `images[]` plus
//                                those of sibling variants (SAME variety AND
//                                colour, e.g. other stem lengths / box sizes).
//                                This is what the product page shows as the
//                                gallery. Nothing from the mapping is added.
//
//   getProductImageCandidates() → the own photos above, followed by the EXACT
//                                variety+colour entry of lib/product-images.ts
//                                as the LAST resort (never the fuzzy
//                                variety-only / category matches — those can
//                                be a *similar* flower). Used wherever a single
//                                image is rendered (cards, related, bundles)
//                                and as the fallback chain of the main image.
//
// Order inside the own photos: entries the app can serve through the image
// optimizer first (local files under /public, hosts allowed by next.config),
// then entries on other hosts (loaded directly, `unoptimized`; if the host is
// down they fail and the next candidate is tried).
//
// EXCLUDED_PRODUCT_IMAGES lists photos that are known to show a DIFFERENT
// variety than the catalogue row they are attached to; they are dropped for
// that exact identity from every source (own, siblings, mapping), so the row
// ends on the placeholder rather than on a wrong flower.
//
// Candidates are de-duplicated and the placeholder logo is never a "photo".
// Anything else (no URL, every URL failing) is Priority B: the placeholder
// rendered by components/ProductImageWithFallback.tsx.
//
// Pure module: no React, no I/O. Relative imports on purpose so it also runs
// under plain `node --test`.

import { PRODUCT_IMAGES_BASE_URL } from "./catalog-constants";
import { getExactProductImage } from "./product-images";

/** Brand isotype shown when no photo could be loaded. */
export const PRODUCT_IMAGE_FALLBACK_SRC = "/Floropolis-logo-only.png";
/** Exact caption under the isotype. */
export const PICTURE_COMING_SOON_LABEL = "Picture coming soon";

/**
 * Photos that must NEVER be shown for a given exact identity, keyed by
 * `<variety>|<colour>` (lower-case, single spaces). Values are file names
 * (matched against the last path segment of every candidate, whatever its
 * source). Confirmed by Juan Javier, 2026-10-01:
 *   - "moody blues / lavender": the catalogue row carries cool-water-lavender.png,
 *     which is the Cool Water variety. No approximate match is allowed either
 *     (there is no exact `moody-blues-lavender` mapping entry on purpose), so
 *     the row ends on the "Picture coming soon" placeholder.
 */
export const EXCLUDED_PRODUCT_IMAGES: Readonly<Record<string, readonly string[]>> = {
  "moody blues|lavender": ["cool-water-lavender.png"],
};

/**
 * Remote hosts the Next image optimizer may fetch.
 * KEEP IN SYNC with `images.remotePatterns` in next.config.ts.
 */
export const OPTIMIZED_REMOTE_HOSTS: readonly string[] = [
  "images.unsplash.com",
  "d3bgzcd3kwm78d.cloudfront.net",
];

/** The subset of Product fields this module reads. */
export interface ProductImageSource {
  images?: unknown;
  variety?: string | null;
  color?: string | null;
}

function normalizeKey(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** True when both records describe the same variety AND colour. */
export function isSameVarietyAndColor(a: ProductImageSource, b: ProductImageSource): boolean {
  const va = normalizeKey(a.variety);
  const ca = normalizeKey(a.color);
  if (!va || !ca) return false;
  return va === normalizeKey(b.variety) && ca === normalizeKey(b.color);
}

/**
 * Normalise one catalogue image entry to a src the browser can request:
 * absolute http(s) URLs and root-relative paths are kept; bare file names are
 * prefixed with PRODUCT_IMAGES_BASE_URL. Returns null for empty/invalid input.
 */
export function resolveImagePath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const p = path.trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p) || p.startsWith("/")) return p;
  const base = PRODUCT_IMAGES_BASE_URL.replace(/\/$/, "");
  return `${base}/${p.replace(/^\.?\//, "")}`;
}

/**
 * Can the Next image optimizer serve this src? Local paths always; remote
 * URLs only when their host is in OPTIMIZED_REMOTE_HOSTS. Anything else must
 * be loaded with `unoptimized` or the optimizer answers 400.
 */
export function isOptimizableImageSrc(src: string): boolean {
  if (src.startsWith("/")) return true;
  try {
    const u = new URL(src);
    return u.protocol === "https:" && OPTIMIZED_REMOTE_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

function ownImages(p: ProductImageSource): string[] {
  if (!Array.isArray(p.images)) return [];
  const out: string[] = [];
  for (const entry of p.images) {
    const src = resolveImagePath(entry);
    if (src) out.push(src);
  }
  return out;
}

/** Last path segment of a src, lower-cased (query string and hash ignored). */
function fileNameOf(src: string): string {
  const clean = src.split(/[?#]/)[0];
  return decodeURIComponent(clean.slice(clean.lastIndexOf("/") + 1)).toLowerCase();
}

/**
 * True when `src` is listed in EXCLUDED_PRODUCT_IMAGES for the exact identity
 * of `product` (it shows another variety). Exported for tests.
 */
export function isExcludedImageFor(product: ProductImageSource, src: string): boolean {
  const key = `${normalizeKey(product.variety)}|${normalizeKey(product.color)}`;
  const files = EXCLUDED_PRODUCT_IMAGES[key];
  if (!files || files.length === 0) return false;
  const name = fileNameOf(src);
  return files.some((f) => f.toLowerCase() === name);
}

function dedupe(product: ProductImageSource, ordered: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const src of ordered) {
    if (src === PRODUCT_IMAGE_FALLBACK_SRC || seen.has(src)) continue;
    if (isExcludedImageFor(product, src)) continue;
    seen.add(src);
    result.push(src);
  }
  return result;
}

/**
 * The product's OWN photos, ordered and de-duplicated: its `images[]` and
 * those of sibling variants with the SAME variety and colour (`product` itself
 * is skipped among `siblings`). Optimizer-servable entries first, then direct
 * ones. Nothing from the mapping is added — this is the visible gallery.
 */
export function getOwnProductImages(
  product: ProductImageSource,
  siblings: readonly ProductImageSource[] = [],
): string[] {
  const own = ownImages(product);
  const sib: string[] = [];
  for (const s of siblings) {
    if (s === product || !isSameVarietyAndColor(product, s)) continue;
    sib.push(...ownImages(s));
  }
  return dedupe(product, [
    ...own.filter(isOptimizableImageSrc),
    ...sib.filter(isOptimizableImageSrc),
    ...own.filter((s) => !isOptimizableImageSrc(s)),
    ...sib.filter((s) => !isOptimizableImageSrc(s)),
  ]);
}

/**
 * Ordered, de-duplicated image candidates for `product`: the own photos of
 * getOwnProductImages() followed by the EXACT variety+colour mapping entry as
 * the last resort. `siblings` may be any list of catalogue records (e.g. the
 * variants of the product page or the variety+colour group of the grid); only
 * records with the SAME variety and colour are used.
 */
export function getProductImageCandidates(
  product: ProductImageSource,
  siblings: readonly ProductImageSource[] = [],
): string[] {
  const own = getOwnProductImages(product, siblings);
  const exact =
    product.variety && product.color
      ? getExactProductImage(product.variety, product.color)
      : null;
  return dedupe(product, [...own, ...(exact ? [exact] : [])]);
}
