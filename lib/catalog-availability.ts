// Catalog availability — the single rule for "can this SKU be bought right now?"
// v1 | 2026-10-01 | Job_PM (jj/permanent-catalog)
//
// Visibility and purchasability are separate concerns:
//   - VISIBILITY is never computed here. Every published product is shown.
//   - PURCHASABILITY is decided by this module, and the SAME function runs in
//     the storefront (grid + product page) and in the checkout API, so what the
//     UI shows as "Buy now" is exactly what the server will accept.
//
// States:
//   'buy_now'          valid price AND available_from is >= today + minimum lead
//                      days for the tier (T3: 14, everything else: 5).
//   'ask_availability' no available_from, unparseable date, date in the past,
//                      or too soon for the tier. Visible, quotable, not buyable.
//   'request_pricing'  no valid effective price (null / NaN / <= 0).
//
// The requested delivery date can NEVER re-activate an expired record:
// isPurchasableOn() first requires 'buy_now' as of TODAY, and only then checks
// that the requested delivery date is on/after available_from.
//
// Pure module: no I/O, no React, no Next imports. Safe for client, server,
// Edge and plain `node --test`.

export type Purchasability = "buy_now" | "ask_availability" | "request_pricing";

/** Minimum calendar days between today and available_from, per tier. */
export const MIN_LEAD_DAYS: Readonly<Record<string, number>> = { T3: 14 };
export const DEFAULT_MIN_LEAD_DAYS = 5;

export const PURCHASABILITY_LABEL: Readonly<Record<Purchasability, string>> = {
  buy_now: "Buy now",
  ask_availability: "Ask availability",
  request_pricing: "Request pricing",
};

/** The subset of Product / CatalogSku fields this rule needs. */
export interface AvailabilityInput {
  price?: number | null;
  deal_price?: number | null;
  is_on_deal?: boolean | null;
  available_from?: string | null;
  tier?: string | null;
}

/** Today's calendar date (YYYY-MM-DD) in the runtime's local timezone. */
export function localTodayISO(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA");
}

const DAY_MS = 86_400_000;

/** Parse a YYYY-MM-DD string anchored at UTC noon; NaN when invalid. */
function noonUtcMs(iso: string | null | undefined): number {
  if (!iso || typeof iso !== "string") return Number.NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return Number.NaN;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`).getTime();
}

/**
 * Whole calendar days from `fromISO` to `toISO` (negative when `toISO` is
 * earlier). Both dates are pinned to UTC noon so the result is stable all day
 * regardless of the viewer's timezone. NaN when either date is invalid.
 */
export function daysBetween(fromISO: string, toISO: string): number {
  const a = noonUtcMs(fromISO);
  const b = noonUtcMs(toISO);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / DAY_MS);
}

export function minLeadDays(tier: string | null | undefined): number {
  return (tier && MIN_LEAD_DAYS[tier]) || DEFAULT_MIN_LEAD_DAYS;
}

/** Deal price when on deal, otherwise base price. */
export function effectivePrice(p: AvailabilityInput): number | null {
  const onDeal = !!p.is_on_deal && p.deal_price != null;
  const raw = onDeal ? p.deal_price : p.price;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function hasValidPrice(p: AvailabilityInput): boolean {
  const n = effectivePrice(p);
  return n != null && n > 0;
}

/**
 * Purchasability as of `todayISO` (defaults to the local calendar date).
 * Pass `todayISO` explicitly in tests for deterministic results.
 */
export function getPurchasability(
  p: AvailabilityInput,
  todayISO: string = localTodayISO(),
): Purchasability {
  if (!hasValidPrice(p)) return "request_pricing";
  if (!p.available_from) return "ask_availability";
  const days = daysBetween(todayISO, p.available_from);
  if (Number.isNaN(days)) return "ask_availability";
  return days >= minLeadDays(p.tier) ? "buy_now" : "ask_availability";
}

/**
 * Server-side gate for a direct purchase with a requested delivery date.
 *   1. The SKU must be 'buy_now' as of today (the delivery date cannot
 *      re-activate an expired, missing or too-soon record).
 *   2. The requested delivery date must be on/after available_from.
 */
export function isPurchasableOn(
  p: AvailabilityInput,
  requestedDeliveryISO: string,
  todayISO: string = localTodayISO(),
): boolean {
  if (getPurchasability(p, todayISO) !== "buy_now") return false;
  const offset = daysBetween(p.available_from as string, requestedDeliveryISO);
  if (Number.isNaN(offset)) return false;
  return offset >= 0;
}

/**
 * Best state across a group of variants (one card per variety+color):
 * buy_now if any variant is buyable, else ask_availability if any variant has
 * a valid price, else request_pricing.
 */
export function groupPurchasability(
  variants: readonly AvailabilityInput[],
  todayISO: string = localTodayISO(),
): Purchasability {
  let best: Purchasability = "request_pricing";
  for (const v of variants) {
    const s = getPurchasability(v, todayISO);
    if (s === "buy_now") return "buy_now";
    if (s === "ask_availability") best = "ask_availability";
  }
  return best;
}
