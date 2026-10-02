// Product image candidates — ordered list of photo sources to try for a product
// before showing the brand placeholder.
// v1 | 2026-10-01 | Job_PM (jj/permanent-catalog, photo recovery)
//
// Rules (Priority A — recover a CORRECT photo from sources the project owns):
//   1. The product's own `images[]` entries that the app can serve safely:
//      local files under /public or hosts allowed by next.config images.
//   2. Photos of sibling variants (SAME variety AND colour, e.g. other stem
//      lengths / box sizes) that are safe to serve.
//   3. The EXACT variety+colour entry of lib/product-images.ts (never the fuzzy
//      variety-only / category matches — those can be a *similar* flower).
//   4. The product's own entries on hosts next.config does NOT allow. The image
//      optimizer would answer 400 for them, so the UI loads them directly
//      (unoptimized); if the host is down they fail and the next candidate is
//      tried.
//   5. The same for sibling variants.
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

/**
 * Ordered, de-duplicated image candidates for `product`.
 * `siblings` may be any list of catalogue records (e.g. the variants of the
 * product page or the variety+colour group of the grid); only records with the
 * SAME variety and colour are used, and `product` itself is skipped.
 */
export function getProductImageCandidates(
  product: ProductImageSource,
  siblings: readonly ProductImageSource[] = [],
): string[] {
  const own = ownImages(product);
  const sib: string[] = [];
  for (const s of siblings) {
    if (s === product || !isSameVarietyAndColor(product, s)) continue;
    sib.push(...ownImages(s));
  }
  const exact =
    product.variety && product.color
      ? getExactProductImage(product.variety, product.color)
      : null;

  const ordered = [
    ...own.filter(isOptimizableImageSrc),
    ...sib.filter(isOptimizableImageSrc),
    ...(exact ? [exact] : []),
    ...own.filter((s) => !isOptimizableImageSrc(s)),
    ...sib.filter((s) => !isOptimizableImageSrc(s)),
  ];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const src of ordered) {
    if (src === PRODUCT_IMAGE_FALLBACK_SRC || seen.has(src)) continue;
    seen.add(src);
    result.push(src);
  }
  return result;
}
