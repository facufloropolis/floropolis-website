'use client';

// Deal Calculator client component — UC-P-156 primary use ONLY.
// v1 | 2026-05-27 | Job_PM Sub-Agent C [V8 SHADOW]
//
// State is purely local (useState). NO persistence, NO API calls, NO
// localStorage. This is a calculator — close the tab, the deal is gone.
// That's intentional: UC-P-157 (save as quote) is a later iteration.
//
// Formula (mirrors Rose's pricing_formula.md — single source of truth):
//   delivery_per_stem  = ceil(box_weight_kg) * fedex_rate * fuel_surcharge / units_per_box
//   formula_price      = farm_cost / (1 - GPM) + delivery_per_stem
//   margin_per_stem    = entered_price - farm_cost - delivery_per_stem
//   gpm_pct            = margin_per_stem / entered_price * 100
//
// The values exposed to this component are CONSTANTS owned by Rose. Per the
// project's RACI rule we don't hardcode them in arithmetic — they arrive as
// `constants` props and are used by name.

import { useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Types (also imported by the server page)
// ---------------------------------------------------------------------------

export interface DealSku {
  id: number;
  name: string;
  vendor: string;
  tier: string;
  variety: string;
  length: string;
  unit: string;
  category: string;
  farm_cost: number;       // dollars per stem (always present — filtered by server)
  list_price: number | null;
  box_type: string | null;
  units_per_box: number | null;
  total_stems: number | null;
}

export interface DealBox {
  box_type: string;
  weight_kg: number;       // FedEx dim weight per box (Rose-pre-computed)
}

export interface DealConstants {
  gpm: number;             // e.g. 0.33
  fedex_rate_per_kg: number; // e.g. 6.50
  fuel_surcharge: number;  // e.g. 1.25
}

interface DealLine {
  // skuId is unique per line — Add-line on the same SKU twice is blocked.
  skuId: number;
  qty: number;
  // null = use formula_price; number = explicit override (can be < cost).
  enteredPrice: number | null;
}

interface DealCalculatorClientProps {
  skus: DealSku[];
  boxes: DealBox[];
  constants: DealConstants;
}

// ---------------------------------------------------------------------------
// Formula helpers — kept tiny + colocated so they're trivially auditable.
// ---------------------------------------------------------------------------

function deliveryPerStem(
  boxWeightKg: number | null,
  unitsPerBox: number | null,
  fedexRate: number,
  fuelSurcharge: number,
): number | null {
  if (boxWeightKg == null || unitsPerBox == null || unitsPerBox <= 0) return null;
  // ceil(weight_kg) * rate * fuel / units_per_box  -- pricing_formula.md §1
  return (Math.ceil(boxWeightKg) * fedexRate * fuelSurcharge) / unitsPerBox;
}

function formulaPrice(
  farmCost: number,
  deliveryPS: number | null,
  gpm: number,
): number | null {
  if (deliveryPS == null) return null;
  // farm_cost / (1 - GPM) + delivery_per_stem  -- pricing_formula.md §1
  return farmCost / (1 - gpm) + deliveryPS;
}

function fmtUsd(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return '--';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(dp)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '--';
  return `${n.toFixed(1)}%`;
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '--';
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DealCalculatorClient({
  skus,
  boxes,
  constants,
}: DealCalculatorClientProps) {
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<DealLine[]>([]);

  // Box-by-type lookup (small map, computed once) -----------------------
  const boxByType = useMemo(() => {
    const m = new Map<string, DealBox>();
    for (const b of boxes) m.set(b.box_type, b);
    return m;
  }, [boxes]);

  // SKU-by-id lookup (used by every line) -------------------------------
  const skuById = useMemo(() => {
    const m = new Map<number, DealSku>();
    for (const s of skus) m.set(s.id, s);
    return m;
  }, [skus]);

  // Client-side search (matches the BRD spec — name/variety/length/vendor).
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as DealSku[];
    const inLine = new Set(lines.map((l) => l.skuId));
    return skus
      .filter((s) => {
        if (inLine.has(s.id)) return false;
        const blob = `${s.name} ${s.variety} ${s.length} ${s.vendor} ${s.category}`.toLowerCase();
        return blob.includes(q);
      })
      .slice(0, 12); // keep the dropdown short
  }, [search, skus, lines]);

  function addLine(skuId: number) {
    setLines((cur) => {
      if (cur.some((l) => l.skuId === skuId)) return cur;
      return [...cur, { skuId, qty: 1, enteredPrice: null }];
    });
    setSearch('');
  }

  function removeLine(skuId: number) {
    setLines((cur) => cur.filter((l) => l.skuId !== skuId));
  }

  function setQty(skuId: number, qty: number) {
    setLines((cur) =>
      cur.map((l) =>
        l.skuId === skuId
          ? { ...l, qty: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1 }
          : l,
      ),
    );
  }

  function setEntered(skuId: number, raw: string) {
    setLines((cur) =>
      cur.map((l) => {
        if (l.skuId !== skuId) return l;
        const trimmed = raw.trim();
        if (trimmed === '') return { ...l, enteredPrice: null };
        const n = Number(trimmed);
        return { ...l, enteredPrice: Number.isFinite(n) ? n : l.enteredPrice };
      }),
    );
  }

  // Derive computed rows once per render --------------------------------
  type ComputedLine = {
    sku: DealSku;
    qty: number;
    box: DealBox | null;
    delivery_per_stem: number | null;
    formula_price: number | null;
    entered_price: number | null;   // the value used for revenue/margin math
    entered_is_override: boolean;
    margin_per_stem: number | null;
    gpm_pct: number | null;
    line_total_cost: number | null;
    line_total_revenue: number | null;
    line_total_margin: number | null;
  };

  const computed: ComputedLine[] = lines.map((l) => {
    const sku = skuById.get(l.skuId);
    if (!sku) {
      // Defensive — should never happen since we add from the same list.
      return {
        sku: {
          id: l.skuId, name: `#${l.skuId} (missing)`, vendor: '', tier: '',
          variety: '', length: '', unit: 'stem', category: '',
          farm_cost: 0, list_price: null, box_type: null, units_per_box: null,
          total_stems: null,
        },
        qty: l.qty, box: null,
        delivery_per_stem: null, formula_price: null, entered_price: null,
        entered_is_override: false, margin_per_stem: null, gpm_pct: null,
        line_total_cost: null, line_total_revenue: null, line_total_margin: null,
      };
    }
    const box = sku.box_type ? boxByType.get(sku.box_type) ?? null : null;
    const deliv = deliveryPerStem(
      box?.weight_kg ?? null,
      sku.units_per_box,
      constants.fedex_rate_per_kg,
      constants.fuel_surcharge,
    );
    const formula = formulaPrice(sku.farm_cost, deliv, constants.gpm);
    const entered = l.enteredPrice ?? formula;
    const isOverride = l.enteredPrice != null && formula != null && l.enteredPrice !== formula;
    const margin =
      entered != null && deliv != null ? entered - sku.farm_cost - deliv : null;
    const gpmPct =
      margin != null && entered != null && entered > 0 ? (margin / entered) * 100 : null;
    const cost =
      deliv != null ? (sku.farm_cost + deliv) * l.qty : null;
    const rev = entered != null ? entered * l.qty : null;
    const lineMargin = margin != null ? margin * l.qty : null;
    return {
      sku,
      qty: l.qty,
      box,
      delivery_per_stem: deliv,
      formula_price: formula,
      entered_price: entered,
      entered_is_override: isOverride,
      margin_per_stem: margin,
      gpm_pct: gpmPct,
      line_total_cost: cost,
      line_total_revenue: rev,
      line_total_margin: lineMargin,
    };
  });

  // Deal-level totals ---------------------------------------------------
  const totals = computed.reduce(
    (acc, c) => {
      if (c.line_total_cost != null) acc.cost += c.line_total_cost;
      if (c.line_total_revenue != null) acc.revenue += c.line_total_revenue;
      if (c.line_total_margin != null) acc.margin += c.line_total_margin;
      acc.stems += c.qty;
      return acc;
    },
    { cost: 0, revenue: 0, margin: 0, stems: 0 },
  );
  const blendedGpm = totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : null;

  // Box-fit per line (count of full boxes needed) -----------------------
  function boxFit(c: ComputedLine): {
    boxes_needed: number | null;
    capacity: number | null;
    overflow: number;
    remaining: number;
  } {
    const ups = c.sku.units_per_box;
    if (ups == null || ups <= 0) {
      return { boxes_needed: null, capacity: null, overflow: 0, remaining: 0 };
    }
    const needed = Math.ceil(c.qty / ups);
    const capacity = needed * ups;
    return {
      boxes_needed: needed,
      capacity,
      overflow: 0, // by definition: ceil() never leaves overflow
      remaining: capacity - c.qty,
    };
  }

  return (
    <div className="space-y-5">
      {/* Sticky totals bar -------------------------------------------- */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-white/95 backdrop-blur border-y border-slate-200">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <Totalcell label="Lines" value={`${lines.length} SKU${lines.length === 1 ? '' : 's'}`} />
          <Totalcell label="Stems" value={fmtInt(totals.stems)} />
          <Totalcell label="Total cost" value={fmtUsd(totals.cost)} />
          <Totalcell label="Total revenue" value={fmtUsd(totals.revenue)} />
          <Totalcell
            label="Margin"
            value={`${fmtUsd(totals.margin)} (${blendedGpm == null ? '--' : fmtPct(blendedGpm)})`}
            tone={
              blendedGpm == null
                ? 'neutral'
                : blendedGpm < 5
                  ? 'red'
                  : blendedGpm < 25
                    ? 'amber'
                    : 'green'
            }
          />
        </div>
      </div>

      {/* SKU search --------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <label htmlFor="dc-search" className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
          Add SKU
        </label>
        <div className="relative">
          <input
            id="dc-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, variety, length, vendor..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-emerald-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {matches.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
              {matches.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => addLine(s.id)}
                  className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-slate-100 last:border-b-0 text-sm"
                >
                  <div className="font-medium text-slate-900">{s.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {[s.vendor, s.tier, s.variety, s.length, s.box_type, s.units_per_box ? `${s.units_per_box}/box` : null]
                      .filter(Boolean)
                      .join(' · ')}
                    {' · '}
                    cost {fmtUsd(s.farm_cost)}
                    {s.list_price != null ? ` · list ${fmtUsd(s.list_price)}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          {skus.length.toLocaleString()} active SKUs loaded. Type a few characters to filter.
        </p>
      </div>

      {/* Lines table -------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5">Vendor / Box</th>
                <th className="px-3 py-2.5 text-right">Qty</th>
                <th className="px-3 py-2.5 text-right">Farm cost</th>
                <th className="px-3 py-2.5 text-right">Delivery</th>
                <th className="px-3 py-2.5 text-right">Formula $</th>
                <th className="px-3 py-2.5 text-right">Entered $</th>
                <th className="px-3 py-2.5 text-right">Margin /stem</th>
                <th className="px-3 py-2.5 text-right">GPM</th>
                <th className="px-3 py-2.5 text-right">Line total $</th>
                <th className="px-3 py-2.5">Box fit</th>
                <th className="px-3 py-2.5"> </th>
              </tr>
            </thead>
            <tbody>
              {computed.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-10 text-center text-sm text-slate-400">
                    No lines yet — search above and click a SKU to add it.
                  </td>
                </tr>
              ) : (
                computed.map((c) => {
                  const fit = boxFit(c);
                  const gpmTone =
                    c.gpm_pct == null
                      ? 'text-slate-400'
                      : c.gpm_pct < 0
                        ? 'text-red-600'
                        : c.gpm_pct < 5
                          ? 'text-red-500'
                          : c.gpm_pct < 25
                            ? 'text-amber-600'
                            : 'text-emerald-700';
                  return (
                    <tr
                      key={c.sku.id}
                      className="border-b border-slate-100 last:border-b-0 align-top hover:bg-slate-50"
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900 max-w-[220px] truncate" title={c.sku.name}>
                          {c.sku.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          #{c.sku.id} · {c.sku.variety || c.sku.category || ''} {c.sku.length}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-slate-700">{c.sku.vendor || '--'}</div>
                        <div className="text-[11px] text-slate-500">
                          {c.sku.box_type ?? 'no box'}
                          {c.box ? ` · ${c.box.weight_kg.toFixed(1)}kg dim` : c.sku.box_type ? ' · no dim' : ''}
                          {c.sku.units_per_box != null ? ` · ${c.sku.units_per_box}/box` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          min={1}
                          value={c.qty}
                          onChange={(e) => setQty(c.sku.id, Number(e.target.value))}
                          className="w-20 px-2 py-1 text-right text-sm rounded border border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700 font-mono text-[12px]">
                        {fmtUsd(c.sku.farm_cost, 3)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700 font-mono text-[12px]">
                        {fmtUsd(c.delivery_per_stem, 3)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700 font-mono text-[12px]">
                        {fmtUsd(c.formula_price, 3)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={
                            c.entered_price == null
                              ? ''
                              : c.entered_is_override
                                ? c.entered_price
                                : c.entered_price.toFixed(3)
                          }
                          onChange={(e) => setEntered(c.sku.id, e.target.value)}
                          placeholder={c.formula_price != null ? c.formula_price.toFixed(3) : '--'}
                          className={`w-24 px-2 py-1 text-right text-sm rounded border focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                            c.entered_is_override
                              ? 'border-emerald-400 bg-emerald-50 focus:border-emerald-500'
                              : 'border-slate-200 focus:border-emerald-500'
                          }`}
                        />
                        {c.entered_is_override && (
                          <div className="text-[10px] text-emerald-700 mt-0.5">override</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[12px]">
                        <span className={c.margin_per_stem != null && c.margin_per_stem < 0 ? 'text-red-600' : 'text-slate-700'}>
                          {fmtUsd(c.margin_per_stem, 3)}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono text-[12px] font-semibold ${gpmTone}`}>
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {c.gpm_pct != null && c.gpm_pct < 5 && (
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full ${c.gpm_pct < 0 ? 'bg-red-500' : 'bg-amber-500'}`}
                              title={c.gpm_pct < 0 ? 'Negative margin' : 'Margin under 5%'}
                            />
                          )}
                          {fmtPct(c.gpm_pct)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="text-slate-700 font-mono text-[12px]">
                          {fmtUsd(c.line_total_revenue)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          cost {fmtUsd(c.line_total_cost)} · mrg {fmtUsd(c.line_total_margin)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {fit.boxes_needed == null ? (
                          <span className="text-[11px] text-slate-400">no box dims</span>
                        ) : (
                          <div className="text-[11px] text-slate-600">
                            {c.qty} stems → {fit.boxes_needed} × {c.sku.box_type}
                            {fit.capacity != null ? ` (cap ${fit.capacity})` : ''}
                            <div className="text-[10px] text-slate-400">
                              {fit.remaining > 0 ? `${fit.remaining} stems headroom` : 'exact fit'}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(c.sku.id)}
                          className="text-[11px] text-slate-400 hover:text-red-600"
                          title="Remove line"
                          aria-label="Remove line"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formula footer — visible spec so Facu / Rose can sanity-check */}
      <div className="text-[11px] text-slate-400 leading-relaxed">
        <span className="font-semibold text-slate-500">Formula (Rose, pricing_formula.md):</span>{' '}
        delivery/stem = ceil(box_weight_kg) × ${constants.fedex_rate_per_kg.toFixed(2)}/kg ×{' '}
        {constants.fuel_surcharge.toFixed(2)} ÷ units_per_box · formula_price = farm_cost ÷{' '}
        (1 - {constants.gpm.toFixed(2)}) + delivery/stem · margin = entered - farm_cost - delivery.
        Entered price defaults to formula but you can override per line. No data is saved.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helper for the sticky totals bar.
// ---------------------------------------------------------------------------

function Totalcell({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'green' | 'amber' | 'red';
}) {
  const valueCls =
    tone === 'green'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'red'
          ? 'text-red-600'
          : 'text-slate-900';
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${valueCls}`}>{value}</div>
    </div>
  );
}
