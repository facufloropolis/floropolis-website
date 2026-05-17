// Catalog publishability filter + tier-based availability badges.
// v1 | 2026-05-17 | Job_PM [V8 SHADOW]
//
// THE GAP THIS FIXES: floropolis_inventory has 1006 rows. Rose tracks publishability
// via `live` + `active` + `has_open_price_alert` + `margin_status` columns, but the
// website doesn't filter by ANY of them. Result: site shows ~4-13x more products than
// Rose's intended publishable set, including products with open price alerts, unknown
// margin, or marked inactive.
//
// AUTONOMY RULES (Facu 2026-05-17 + REVISED after impact audit showed strict mode
// would hide 97.9% of catalog because `live=false` means "not on K2K eShop" NOT
// "not publishable on floropolis.com" -- and per Facu: T2/T3 publish IRRESPECTIVE of K2K).
//
// Three preset filter modes (FILTER_MODE env var, default 'lenient'):
//
//   'strict'   AUTO-HIDE: price<=0, has_open_price_alert, live=false, margin=UNKNOWN
//              -> hides 979/1000 rows. DO NOT USE WITHOUT FACU.
//
//   'balanced' AUTO-HIDE: price<=0, has_open_price_alert, margin=UNKNOWN, stale-arrival-OOS
//              -> hides ~300-400 rows. Recommended when 299 price alerts are real warnings.
//
//   'lenient'  AUTO-HIDE: price<=0 ONLY, plus stale-arrival-with-no-stock
//              -> hides ~6-130 rows. Closest to current production behavior. Safe default.
//
// Tier badges (all modes):
//   - T2 with stock>0  -> "In stock this week"
//   - T2 with arrival within 7d   -> "Confirmed for [date]"
//   - T2 with arrival 8-14d       -> "Delivered by [date]"
//   - T3 with stock>0  -> "In stock"
//   - T3 with arrival within 14d  -> "Delivered by [date]" (14d sourceable)
//   - T3 with arrival beyond 14d AND stock=0 -> HIDE (too far out, no story)
//
// IRRESPECTIVE OF K2K: T2/T3 timelines come from arrival_date + stock, not K2K live state.
// K2K alignment is a separate health signal escalated via catalog_audit_daily.py cron.

export type FilterMode = "off" | "strict" | "balanced" | "lenient";

// Read mode from env or default to OFF (no filter = current production behavior).
// Set NEXT_PUBLIC_CATALOG_FILTER_MODE=lenient in Vercel env to activate.
// Safe to merge this code at any time -- no production impact until env is flipped.
export function getFilterMode(): FilterMode {
  const raw = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CATALOG_FILTER_MODE) ?? "off";
  if (raw === "off" || raw === "strict" || raw === "balanced" || raw === "lenient") return raw;
  return "off";
}

import type { FloropolisInventoryRow } from "./supabase-products";

export type AvailabilityBadge =
  | { kind: "in_stock_now"; label: string }
  | { kind: "confirmed_7d"; label: string; arrivalDate: string }
  | { kind: "sourceable_14d"; label: string; etaDate: string }
  | null;

export type FilterDecision = {
  publish: boolean;
  reason: string;   // why hidden, or "ok" if shown
  badge: AvailabilityBadge;
};

/**
 * Pure function that decides whether to publish a single inventory row + what badge to show.
 * No side effects. Unit-testable.
 *
 * `today` parameter is optional -- defaults to today. Pass an explicit date in tests / batch jobs.
 */
export function decidePublishability(
  row: FloropolisInventoryRow & {
    tier?: string | null;
    live?: boolean | null;
    active?: boolean | null;
    has_open_price_alert?: boolean | null;
    margin_status?: string | null;
    arrival_date?: string | null;
    first_oos_date?: string | null;
  },
  today: Date = new Date(),
  mode: FilterMode = "off",
): FilterDecision {
  // OFF mode = no filter, show everything (matches current production behavior).
  if (mode === "off") {
    return { publish: true, reason: "ok_filter_off", badge: null };
  }

  // === Hard gate (all non-off modes): no price means we can't sell ===
  if (row.price == null || row.price <= 0) {
    return { publish: false, reason: "price_missing_or_zero", badge: null };
  }

  // === Mode-specific gates ===
  if (mode === "strict") {
    // Strict mode adds the K2K-state filters (DO NOT USE without Facu signoff)
    if (row.has_open_price_alert === true) {
      return { publish: false, reason: "open_price_alert", badge: null };
    }
    if (row.live === false) {
      return { publish: false, reason: "live_false_k2k_specific", badge: null };
    }
    if (row.margin_status === "UNKNOWN") {
      return { publish: false, reason: "margin_unknown", badge: null };
    }
  } else if (mode === "balanced") {
    // Balanced: hide price alerts + unknown margin, but NOT live=false (K2K-specific)
    if (row.has_open_price_alert === true) {
      return { publish: false, reason: "open_price_alert", badge: null };
    }
    if (row.margin_status === "UNKNOWN") {
      return { publish: false, reason: "margin_unknown", badge: null };
    }
  }
  // lenient: only price gate, no other auto-hide (relies on tier-window logic below)

  // Stale arrival_date: if arrival_date is in the past AND stock is 0, the row is stale.
  // (If arrival_date is past but stock > 0, it's currently in stock -- show it.)
  const arrivalDate = row.arrival_date ? new Date(row.arrival_date + "T00:00:00Z") : null;
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const stock = row.stock ?? 0;

  if (arrivalDate && arrivalDate < todayUTC && stock <= 0) {
    return { publish: false, reason: "stale_past_arrival_and_oos", badge: null };
  }

  // Tier-based badge
  const tier = (row.tier || "").trim().toUpperCase();
  let badge: AvailabilityBadge = null;

  if (tier === "T2") {
    if (stock > 0) {
      // T2 with stock now = available immediately
      badge = { kind: "in_stock_now", label: "In stock this week" };
    } else if (arrivalDate) {
      const daysUntilArrival = Math.ceil(
        (arrivalDate.getTime() - todayUTC.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilArrival >= 0 && daysUntilArrival <= 7) {
        badge = {
          kind: "confirmed_7d",
          label: `Confirmed for ${formatShortDate(arrivalDate)}`,
          arrivalDate: row.arrival_date!,
        };
      } else if (daysUntilArrival > 7 && daysUntilArrival <= 14) {
        // Show but as 14-day sourceable
        badge = {
          kind: "sourceable_14d",
          label: `Delivered by ${formatShortDate(arrivalDate)}`,
          etaDate: row.arrival_date!,
        };
      } else {
        // T2 outside the 14d window with no current stock = stale data, don't show
        return { publish: false, reason: "t2_outside_window_no_stock", badge: null };
      }
    } else {
      // T2 with no arrival_date AND no stock = data gap, hide
      return { publish: false, reason: "t2_missing_arrival_date_and_no_stock", badge: null };
    }
  } else if (tier === "T3") {
    if (stock > 0) {
      // T3 with stock = in stock (rare but possible)
      badge = { kind: "in_stock_now", label: "In stock" };
    } else if (arrivalDate) {
      const daysUntilArrival = Math.ceil(
        (arrivalDate.getTime() - todayUTC.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilArrival >= 0 && daysUntilArrival <= 14) {
        badge = {
          kind: "sourceable_14d",
          label: `Delivered by ${formatShortDate(arrivalDate)}`,
          etaDate: row.arrival_date!,
        };
      } else {
        // T3 beyond 14d = doesn't qualify for "14-day sourceable", hide
        return { publish: false, reason: "t3_beyond_14d_window", badge: null };
      }
    } else {
      // T3 with no arrival_date AND no stock = data gap
      return { publish: false, reason: "t3_missing_arrival_date_and_no_stock", badge: null };
    }
  } else {
    // T1 / T4 / unknown tier -- pass through with no badge, let row.stock speak
    if (stock > 0) {
      badge = { kind: "in_stock_now", label: "In stock" };
    }
  }

  return { publish: true, reason: "ok", badge };
}

/**
 * Format a date as "May 24" or "Jun 3" (short month + day, no year).
 */
function formatShortDate(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * Batch helper: filter an array of rows + attach badges. Used by fetchCatalogProducts.
 */
export function filterPublishable<T extends FloropolisInventoryRow>(
  rows: T[],
  today: Date = new Date(),
  mode: FilterMode = "lenient",
): Array<T & { _availability: AvailabilityBadge }> {
  return rows
    .map((row) => {
      const decision = decidePublishability(row as Parameters<typeof decidePublishability>[0], today, mode);
      return decision.publish ? { ...row, _availability: decision.badge } : null;
    })
    .filter((x): x is T & { _availability: AvailabilityBadge } => x !== null);
}

/**
 * Stats helper: count what would be filtered out + why. For Facu's comparison report.
 */
export function publishabilityStats(
  rows: Array<FloropolisInventoryRow & { tier?: string | null; live?: boolean | null; active?: boolean | null; has_open_price_alert?: boolean | null; margin_status?: string | null; arrival_date?: string | null }>,
  today: Date = new Date(),
  mode: FilterMode = "lenient",
): {
  total: number;
  published: number;
  hidden: number;
  hiddenByReason: Record<string, number>;
  badgesByKind: Record<string, number>;
} {
  const hiddenByReason: Record<string, number> = {};
  const badgesByKind: Record<string, number> = {};
  let published = 0;

  for (const row of rows) {
    const d = decidePublishability(row, today, mode);
    if (d.publish) {
      published++;
      const kind = d.badge?.kind ?? "no_badge";
      badgesByKind[kind] = (badgesByKind[kind] ?? 0) + 1;
    } else {
      hiddenByReason[d.reason] = (hiddenByReason[d.reason] ?? 0) + 1;
    }
  }

  return {
    total: rows.length,
    published,
    hidden: rows.length - published,
    hiddenByReason,
    badgesByKind,
  };
}
