// Admin Order detail -- Financial Structure panel
// v1 | 2026-05-27 | Job_PM admin-port [V8 SHADOW] -- BRD UC-O-169
//
// Per-line cost breakdown so Facu can approve orders seeing the margin /
// GPM / cost structure inline. Server-rendered. Reads
// floropolis_inventory_mirror (farm_cost, box_type, units_per_box, vendor)
// and box_master (weight_kg) via the supabase-backup service client.
//
// Formula (canonical -- Rose_BI/pricing_formula.md):
//   delivery_per_stem = ceil(weight_kg) * FEDEX_RATE * FUEL_SURCHARGE / units_per_box
//                     = ceil(box_master.weight_kg) * 6.50 * 1.25 / inventory.units_per_box
//   margin_per_stem   = unit_price - farm_cost - delivery_per_stem
//   GPM%              = margin_per_stem / unit_price * 100
//   line_margin       = margin_per_stem * quantity
//   order_GPM%        = sum(line_margin) / order.subtotal * 100
//
// Margin handling (per perfect_inventory_bar.md v2 + Facu directive 2026-05-27):
//   Negative or <5% margin is ALLOWED -- surfaced as an informational badge.
//   It NEVER blocks render and NEVER blocks the order.
//
// Missing-data handling:
//   - Missing farm_cost OR box_type OR units_per_box on the inventory_mirror
//     row -> render the line with the dependent fields blank + a quiet
//     "data missing" label. Order totals exclude that line's cost.

import { getBackupServiceClient } from '@/lib/supabase/backup-server';

// ---------------------------------------------------------------------------
// Constants -- pricing formula (Rose_BI/pricing_formula.md §1)
// ---------------------------------------------------------------------------

const FEDEX_RATE_PER_KG = 6.5;   // $/kg, Ecuador origin
const FUEL_SURCHARGE = 1.25;     // 25% multiplier

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrderLineInput {
  id: number;
  sku_id: number;
  sku_name_snapshot: string;
  sku_variety_snapshot: string | null;
  sku_length_snapshot: string | null;
  quantity: number;
  unit_price_locked: number | string;
  currency: string;
}

interface Props {
  lines: OrderLineInput[];
  orderSubtotal: number | string;
  orderCurrency: string;
}

interface InventoryMirrorRow {
  id: number;
  farm_cost: number | string | null;
  box_type: string | null;
  units_per_box: number | string | null;
  vendor: string | null;
}

interface BoxMasterRow {
  box_type: string;
  weight_kg: number | string | null;
}

interface ComputedLine {
  line: OrderLineInput;
  farmCost: number | null;
  boxType: string | null;
  unitsPerBox: number | null;
  weightKg: number | null;
  deliveryPerStem: number | null;
  marginPerStem: number | null;
  gpmPct: number | null;
  lineMargin: number | null;
  dataMissing: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

function fmtCurrency(value: number | null, currency = 'USD'): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}

function fmtCurrencyPrecise(value: number | null, currency = 'USD'): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
}

function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default async function FinancialStructurePanel({
  lines,
  orderSubtotal,
  orderCurrency,
}: Props) {
  const skuIds = Array.from(new Set(lines.map((l) => l.sku_id).filter((n) => Number.isFinite(n))));

  let inventoryRows: InventoryMirrorRow[] = [];
  let boxRows: BoxMasterRow[] = [];

  if (skuIds.length > 0) {
    const svc = getBackupServiceClient();
    const { data: invData, error: invErr } = await svc
      .from('floropolis_inventory_mirror')
      .select('id, farm_cost, box_type, units_per_box, vendor')
      .in('id', skuIds);
    if (invErr) {
      console.error('[FinancialStructurePanel] inventory_mirror fetch failed:', invErr);
    }
    inventoryRows = (invData ?? []) as InventoryMirrorRow[];

    const boxTypes = Array.from(
      new Set(
        inventoryRows
          .map((r) => r.box_type)
          .filter((b): b is string => typeof b === 'string' && b.length > 0),
      ),
    );
    if (boxTypes.length > 0) {
      const { data: boxData, error: boxErr } = await svc
        .from('box_master')
        .select('box_type, weight_kg')
        .in('box_type', boxTypes);
      if (boxErr) {
        console.error('[FinancialStructurePanel] box_master fetch failed:', boxErr);
      }
      boxRows = (boxData ?? []) as BoxMasterRow[];
    }
  }

  const invBySku = new Map<number, InventoryMirrorRow>();
  for (const r of inventoryRows) invBySku.set(r.id, r);
  const boxWeightByType = new Map<string, number>();
  for (const r of boxRows) {
    const w = toNum(r.weight_kg);
    if (w !== null) boxWeightByType.set(r.box_type, w);
  }

  // Per-line compute -------------------------------------------------------
  const computed: ComputedLine[] = lines.map((line) => {
    const unitPrice = toNum(line.unit_price_locked);
    const inv = invBySku.get(line.sku_id) ?? null;
    const farmCost = inv ? toNum(inv.farm_cost) : null;
    const boxType = inv?.box_type ?? null;
    const unitsPerBox = inv ? toNum(inv.units_per_box) : null;
    const weightKg = boxType ? boxWeightByType.get(boxType) ?? null : null;

    let deliveryPerStem: number | null = null;
    if (weightKg !== null && unitsPerBox !== null && unitsPerBox > 0) {
      // ceil(weight_kg) * $6.50 * 1.25 / units_per_box
      deliveryPerStem =
        (Math.ceil(weightKg) * FEDEX_RATE_PER_KG * FUEL_SURCHARGE) / unitsPerBox;
    }

    let marginPerStem: number | null = null;
    let gpmPct: number | null = null;
    let lineMargin: number | null = null;
    if (unitPrice !== null && farmCost !== null && deliveryPerStem !== null) {
      marginPerStem = unitPrice - farmCost - deliveryPerStem;
      gpmPct = unitPrice > 0 ? (marginPerStem / unitPrice) * 100 : null;
      lineMargin = marginPerStem * line.quantity;
    }

    const dataMissing =
      farmCost === null || boxType === null || weightKg === null || unitsPerBox === null;

    return {
      line,
      farmCost,
      boxType,
      unitsPerBox,
      weightKg,
      deliveryPerStem,
      marginPerStem,
      gpmPct,
      lineMargin,
      dataMissing,
    };
  });

  // Order totals -----------------------------------------------------------
  const orderRevenue = toNum(orderSubtotal) ?? 0;
  let totalCost = 0;
  let costCovered = true;
  for (const c of computed) {
    if (c.farmCost !== null && c.deliveryPerStem !== null) {
      totalCost += (c.farmCost + c.deliveryPerStem) * c.line.quantity;
    } else {
      costCovered = false;
    }
  }
  const totalMargin = costCovered ? orderRevenue - totalCost : null;
  const orderGpmPct =
    totalMargin !== null && orderRevenue > 0 ? (totalMargin / orderRevenue) * 100 : null;

  // ----------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------

  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Financial structure</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Per-stem cost + margin. Formula:{' '}
            <span className="font-mono">
              margin = unit_price &minus; farm_cost &minus; delivery_per_stem
            </span>
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
            Order GPM
          </div>
          <div className="text-sm font-bold text-slate-900">
            {fmtPct(orderGpmPct)}
            {orderGpmPct !== null && <MarginBadge gpmPct={orderGpmPct} marginUsd={totalMargin} />}
          </div>
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400 text-center">
          No line items on this order.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                SKU
              </th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Qty
              </th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Unit price
              </th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Farm cost
              </th>
              <th
                className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide"
                title="ceil(box weight kg) * $6.50 * 1.25 / units_per_box"
              >
                Delivery / stem
              </th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Margin / stem
              </th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                GPM %
              </th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Line margin
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {computed.map((c) => {
              const l = c.line;
              const sub = [l.sku_variety_snapshot, l.sku_length_snapshot]
                .filter(Boolean)
                .join(' -- ');
              const currency = l.currency || orderCurrency;
              return (
                <tr key={l.id}>
                  <td className="px-5 py-3">
                    <div className="text-sm text-slate-900 font-medium">{l.sku_name_snapshot}</div>
                    {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
                    <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                      sku #{l.sku_id}
                      {c.boxType && <span className="ml-2">box {c.boxType}</span>}
                      {c.unitsPerBox !== null && (
                        <span className="ml-2">{c.unitsPerBox}/box</span>
                      )}
                    </div>
                    {c.dataMissing && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" aria-hidden="true" />
                        data missing
                        {c.farmCost === null && <span className="ml-1">(farm cost)</span>}
                        {c.boxType === null && <span className="ml-1">(box type)</span>}
                        {c.unitsPerBox === null && <span className="ml-1">(units/box)</span>}
                        {c.boxType !== null && c.weightKg === null && (
                          <span className="ml-1">(box weight)</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700 tabular-nums">{l.quantity}</td>
                  <td className="px-3 py-3 text-right text-slate-700 tabular-nums">
                    {fmtCurrencyPrecise(toNum(l.unit_price_locked), currency)}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700 tabular-nums">
                    {c.farmCost !== null ? fmtCurrencyPrecise(c.farmCost, currency) : (
                      <span className="text-slate-300">--</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700 tabular-nums">
                    {c.deliveryPerStem !== null ? (
                      fmtCurrencyPrecise(c.deliveryPerStem, currency)
                    ) : (
                      <span className="text-slate-300">--</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {c.marginPerStem !== null ? (
                      <span className={c.marginPerStem < 0 ? 'text-red-700 font-semibold' : 'text-slate-900'}>
                        {fmtCurrencyPrecise(c.marginPerStem, currency)}
                      </span>
                    ) : (
                      <span className="text-slate-300">--</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {c.gpmPct !== null ? (
                      <span className="inline-flex items-center gap-1.5 justify-end">
                        <span className={c.gpmPct < 0 ? 'text-red-700 font-semibold' : 'text-slate-700'}>
                          {fmtPct(c.gpmPct)}
                        </span>
                        <MarginBadge gpmPct={c.gpmPct} marginUsd={c.marginPerStem} />
                      </span>
                    ) : (
                      <span className="text-slate-300">--</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums">
                    {c.lineMargin !== null ? (
                      <span className={c.lineMargin < 0 ? 'text-red-700' : 'text-slate-900'}>
                        {fmtCurrency(c.lineMargin, currency)}
                      </span>
                    ) : (
                      <span className="text-slate-300">--</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {/* Order totals row */}
            <tr className="bg-slate-50">
              <td className="px-5 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Order totals
              </td>
              <td colSpan={2} className="px-3 py-3 text-right text-xs text-slate-500">
                Revenue {fmtCurrency(orderRevenue, orderCurrency)}
              </td>
              <td colSpan={2} className="px-3 py-3 text-right text-xs text-slate-500">
                Cost{' '}
                {costCovered ? (
                  fmtCurrency(totalCost, orderCurrency)
                ) : (
                  <span className="text-amber-700 italic">partial (data missing)</span>
                )}
              </td>
              <td className="px-3 py-3" />
              <td className="px-3 py-3 text-right text-xs font-semibold text-slate-700 tabular-nums">
                {orderGpmPct !== null ? (
                  <span className={orderGpmPct < 0 ? 'text-red-700' : 'text-slate-900'}>
                    {fmtPct(orderGpmPct)}
                  </span>
                ) : (
                  <span className="text-slate-300">--</span>
                )}
              </td>
              <td className="px-5 py-3 text-right text-sm font-bold tabular-nums">
                {totalMargin !== null ? (
                  <span className={totalMargin < 0 ? 'text-red-700' : 'text-slate-900'}>
                    {fmtCurrency(totalMargin, orderCurrency)}
                  </span>
                ) : (
                  <span className="text-slate-300">--</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <p className="px-5 py-3 text-[11px] text-slate-400 border-t border-slate-100">
        Source: floropolis_inventory_mirror (farm_cost, box_type, units_per_box) +
        box_master (weight_kg). Formula: Rose_BI/pricing_formula.md. Margin
        badges are informational only -- thin or negative margin does not block
        the order (Facu directive 2026-05-27).
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Margin badge (informational only -- never blocks)
// ---------------------------------------------------------------------------

function MarginBadge({
  gpmPct,
  marginUsd,
}: {
  gpmPct: number | null;
  marginUsd: number | null;
}) {
  if (gpmPct === null) return null;
  // Negative margin -> red dot. Positive but <5% -> amber dot. >=5% -> nothing.
  const isNegative = (marginUsd !== null && marginUsd < 0) || gpmPct < 0;
  const isThin = !isNegative && gpmPct < 5;
  if (!isNegative && !isThin) return null;
  const cls = isNegative
    ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';
  const dotCls = isNegative ? 'bg-red-500' : 'bg-amber-500';
  const label = isNegative ? 'negative' : 'thin';
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold border px-1.5 py-0.5 rounded-full ${cls}`}
      title={`Margin ${label} (GPM ${gpmPct.toFixed(1)}%). Informational only -- does not block.`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} aria-hidden="true" />
      {label}
    </span>
  );
}
