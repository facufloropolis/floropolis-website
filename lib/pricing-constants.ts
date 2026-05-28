export const ACTIVE_PRICING_MARKET = 'Ecuador';

export interface PricingConstantValueRow {
  id: string;
  market: string;
  value_numeric?: number | string | null;
  value_text?: string | null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function pricingConstantTargetId(id: string, market: string): string {
  return `${id}:${market}`;
}

export function parsePricingConstantTargetId(targetId: string): { id: string; market: string | null } {
  const idx = targetId.indexOf(':');
  if (idx < 0) return { id: targetId, market: null };
  return {
    id: targetId.slice(0, idx),
    market: targetId.slice(idx + 1) || null,
  };
}

export function requireNumericPricingConstant(
  rows: PricingConstantValueRow[],
  id: string,
  market: string = ACTIVE_PRICING_MARKET,
): number {
  const row = rows.find((r) => r.id === id && r.market === market);
  const value = toNumber(row?.value_numeric);
  if (value == null) {
    throw new Error(`Missing pricing_constants.${id} for market=${market}`);
  }
  return value;
}

export function requireTextPricingConstant(
  rows: PricingConstantValueRow[],
  id: string,
  market: string = ACTIVE_PRICING_MARKET,
): string {
  const row = rows.find((r) => r.id === id && r.market === market);
  const value = row?.value_text?.trim();
  if (!value) {
    throw new Error(`Missing pricing_constants.${id} text value for market=${market}`);
  }
  return value;
}
