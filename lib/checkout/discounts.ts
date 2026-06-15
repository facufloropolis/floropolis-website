// Discount application engine — matches active discount_rules against a
// pre-discount cart and returns per-line applications + total discount.
// v1 | 2026-05-19 | Job_PM Phase D [V8 SHADOW]
//
// BRD UC-12..14 (catalog v0.4):
//   - Rule scopes: 'category' | 'vendor' | 'sku' | 'client' | 'client_category'
//   - Non-stacking: per line, the HIGHEST-pct matching rule wins.
//   - client / client_category rules apply to the whole subtotal (not per-line)
//     as a single order-level discount; client rules can stack ON TOP of a
//     line-level rule per CEO direction (one client-wide + one line discount
//     max). For Phase D MVP we keep it simple: line-level + order-level are
//     summed but never together for the same line beyond the line-level pct.
//
// IO: pure. Caller fetches active rules and passes them in.
//
// The /api/checkout/session route then:
//   1. computeTotals(..., { discount_amount: result.totalDiscount })
//   2. After INSERT order, INSERT one row per application into discount_applications.

import type { CartLine } from './totals';

export interface DiscountRule {
  id: string;
  scope: 'category' | 'vendor' | 'sku' | 'client' | 'client_category' | string;
  scope_value: string;
  discount_pct: number;
  status: string;
  valid_from: string | null;
  valid_until: string | null;
  min_qty: number;
}

export interface DiscountApplication {
  rule_id: string;
  scope: string;
  scope_value: string;
  discount_pct: number;
  applied_amount: number;
  order_line_id: number | null; // null when order-level (client-scoped)
  /** Line ref the application was matched against (for caller to map to
   *  order_lines.id after INSERT). The cart-identity uuid string. null when
   *  order-level. */
  matched_line_sku_id: string | null;
}

export interface DiscountResult {
  totalDiscount: number;
  applications: DiscountApplication[];
}

interface MirrorLineMeta {
  /** vendor name for this sku in floropolis_inventory_mirror */
  vendor: string | null;
  /** category for this sku */
  category: string | null;
}

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function withinValidRange(rule: DiscountRule, todayIso: string): boolean {
  if (rule.valid_from && todayIso < rule.valid_from) return false;
  if (rule.valid_until && todayIso > rule.valid_until) return false;
  return true;
}

/**
 * Match active rules against a built cart.
 *
 * @param lines        - CartLine[] from computeTotals (pre-discount)
 * @param rules        - rows from discount_rules where status='active'
 * @param meta         - per-sku vendor+category from inventory mirror
 * @param userId       - the buyer's auth.users.id (for client-scoped rules)
 * @param todayIso     - today's YYYY-MM-DD for valid_from/until comparison
 */
export function computeDiscountApplications(
  lines: CartLine[],
  rules: DiscountRule[],
  meta: Map<string, MirrorLineMeta>,
  userId: string,
  todayIso: string = new Date().toISOString().slice(0, 10),
): DiscountResult {
  const activeRules = rules.filter(
    (r) => r.status === 'active' && withinValidRange(r, todayIso),
  );

  if (activeRules.length === 0) {
    return { totalDiscount: 0, applications: [] };
  }

  const applications: DiscountApplication[] = [];

  // -------- Line-level rules (sku / vendor / category) ----------------
  for (const line of lines) {
    const skuMeta = meta.get(line.sku_id) ?? { vendor: null, category: null };

    // Collect every matching line-level rule; pick highest pct.
    const candidates: DiscountRule[] = [];
    for (const rule of activeRules) {
      if (line.quantity < rule.min_qty) continue;
      if (rule.scope === 'sku' && String(line.sku_id) === rule.scope_value) {
        candidates.push(rule);
      } else if (
        rule.scope === 'vendor' &&
        skuMeta.vendor &&
        skuMeta.vendor === rule.scope_value
      ) {
        candidates.push(rule);
      } else if (
        rule.scope === 'category' &&
        skuMeta.category &&
        skuMeta.category === rule.scope_value
      ) {
        candidates.push(rule);
      }
    }

    if (candidates.length === 0) continue;

    // Non-stacking: highest pct wins.
    const winner = candidates.reduce((best, r) =>
      Number(r.discount_pct) > Number(best.discount_pct) ? r : best,
    );
    const pct = Number(winner.discount_pct);
    if (!Number.isFinite(pct) || pct <= 0) continue;

    const applied = r2(line.line_total_locked * (pct / 100));
    if (applied <= 0) continue;

    applications.push({
      rule_id: winner.id,
      scope: winner.scope,
      scope_value: winner.scope_value,
      discount_pct: pct,
      applied_amount: applied,
      order_line_id: null, // caller fills after order_lines INSERT
      matched_line_sku_id: line.sku_id,
    });
  }

  // -------- Order-level rules (client / client_category) --------------
  // Phase D MVP: pick the single highest-pct client-scoped rule, apply pct
  // against subtotal MINUS already-applied line-level discounts to avoid
  // stacking past 100%. client_category requires we know the buyer's
  // category — we keep that as a TODO (Phase E will join client_profiles).
  const subtotal = lines.reduce((s, l) => s + l.line_total_locked, 0);
  const lineDiscountSoFar = applications.reduce((s, a) => s + a.applied_amount, 0);
  const orderSubtotalForClientRule = Math.max(0, subtotal - lineDiscountSoFar);

  const clientCandidates = activeRules.filter(
    (r) => r.scope === 'client' && r.scope_value === userId,
  );
  if (clientCandidates.length > 0 && orderSubtotalForClientRule > 0) {
    const winner = clientCandidates.reduce((best, r) =>
      Number(r.discount_pct) > Number(best.discount_pct) ? r : best,
    );
    const pct = Number(winner.discount_pct);
    if (Number.isFinite(pct) && pct > 0) {
      const applied = r2(orderSubtotalForClientRule * (pct / 100));
      if (applied > 0) {
        applications.push({
          rule_id: winner.id,
          scope: winner.scope,
          scope_value: winner.scope_value,
          discount_pct: pct,
          applied_amount: applied,
          order_line_id: null,
          matched_line_sku_id: null,
        });
      }
    }
  }

  const totalDiscount = r2(applications.reduce((s, a) => s + a.applied_amount, 0));

  return { totalDiscount, applications };
}
