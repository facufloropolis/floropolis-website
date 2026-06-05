// Canonical costs panel -- READ-ONLY window onto Rose's source-of-truth costs.
// v1 | 2026-06-05 | Job_PM
//
// CEO directive 2026-06-05: "canonical costs need to be in admin, in config."
// Canonical costs are ROSE's data (another agent owns them). This panel DISPLAYS
// them read-only. Corrections route to Rose as governed proposals -- never direct
// edits. The pricing law is price = farm_cost / (1 - gpm) + delivery; costs drive
// everything, so a SKU with no cost row blocks pricing.
//
// Data source: supabase-backup public.canonical_cost JOIN public.dim_sku on sku_id.
// Schema verified 2026-06-05 against project ibckhcjvyxzrhvdiazbx:
//   canonical_cost(cost_id bigint, farm_cost numeric, source_id bigint,
//     source_excerpt text, facu_approved bool, facu_approved_at date,
//     facu_approved_note text, k2k_price_valid_until date, inserted_by text,
//     inserted_at timestamptz, updated_at timestamptz, sku_id uuid,
//     cost_confidence text, cost_tier text, last_market_check_at timestamptz)
//   dim_sku(sku_id uuid, vendor_canonical_name text, variety_normalized text,
//     size_cm int, selling_unit text, quality_grade text, ...)
// farm_cost is USD per selling_unit (e.g. "stem"); there is no separate currency
// column in the schema, so unit is shown as "USD / <selling_unit>".
//
// This iteration ships HONEST PLACEHOLDER actions only. The three-way decision
// affordance ("Looks right" / "Propose correction" / "I see it differently")
// mirrors the admin's decision UX but is DISABLED here -- the proposal write-path
// to Rose is the next iteration. No write endpoints are called; nothing pretends
// to save.

import React from 'react';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

// ----- row types (cast targets for the untyped service client) --------------

interface CostJoinRow {
  cost_id: number;
  farm_cost: number | string | null;
  cost_confidence: string | null;
  cost_tier: string | null;
  facu_approved: boolean | null;
  source_excerpt: string | null;
  inserted_by: string | null;
  facu_approved_at: string | null;
  updated_at: string | null;
  sku_id: string | null;
  vendor_canonical_name: string | null;
  variety_normalized: string | null;
  selling_unit: string | null;
  size_cm: number | null;
  quality_grade: string | null;
}

interface VendorSummary {
  vendor: string;
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
}

const ROW_CAP = 100;

// ----- formatters -----------------------------------------------------------

function dash(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function fmtCost(v: number | string | null): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function fmtMoney(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

function varietyLabel(r: CostJoinRow): string {
  const parts: string[] = [];
  if (r.variety_normalized) parts.push(r.variety_normalized);
  if (r.size_cm != null) parts.push(`${r.size_cm}cm`);
  if (parts.length === 0) return '—';
  return parts.join(' · ');
}

function unitLabel(r: CostJoinRow): string {
  // No currency column in schema; farm_cost is USD per selling_unit.
  return r.selling_unit ? `USD / ${r.selling_unit}` : 'USD';
}

// ----- panel ----------------------------------------------------------------

export default async function CanonicalCostsPanel({
  vendor,
}: {
  vendor?: string | null;
}) {
  const backup = getBackupServiceClient();
  const activeVendor = vendor && vendor.trim() !== '' ? vendor.trim() : null;

  // Fetch joined cost rows (vendor + variety live on dim_sku), all rows for the
  // summary band, plus a separate SKU-without-cost signal. The summary needs the
  // full set, so we fetch all and slice client-side; ~1000 rows is cheap.
  const costSelect =
    'cost_id, farm_cost, cost_confidence, cost_tier, facu_approved, source_excerpt, inserted_by, facu_approved_at, updated_at, sku_id, dim_sku!inner(vendor_canonical_name, variety_normalized, selling_unit, size_cm, quality_grade)';

  const costsRes = await backup
    .from('canonical_cost')
    .select(costSelect)
    .not('sku_id', 'is', null);

  type NestedRow = Omit<CostJoinRow, 'vendor_canonical_name' | 'variety_normalized' | 'selling_unit' | 'size_cm' | 'quality_grade'> & {
    dim_sku:
      | {
          vendor_canonical_name: string | null;
          variety_normalized: string | null;
          selling_unit: string | null;
          size_cm: number | null;
          quality_grade: string | null;
        }
      | {
          vendor_canonical_name: string | null;
          variety_normalized: string | null;
          selling_unit: string | null;
          size_cm: number | null;
          quality_grade: string | null;
        }[]
      | null;
  };

  const rawRows = (costsRes.data ?? []) as unknown as NestedRow[];
  const allRows: CostJoinRow[] = rawRows.map((r) => {
    const sku = Array.isArray(r.dim_sku) ? r.dim_sku[0] ?? null : r.dim_sku;
    return {
      cost_id: r.cost_id,
      farm_cost: r.farm_cost,
      cost_confidence: r.cost_confidence,
      cost_tier: r.cost_tier,
      facu_approved: r.facu_approved,
      source_excerpt: r.source_excerpt,
      inserted_by: r.inserted_by,
      facu_approved_at: r.facu_approved_at,
      updated_at: r.updated_at,
      sku_id: r.sku_id,
      vendor_canonical_name: sku?.vendor_canonical_name ?? null,
      variety_normalized: sku?.variety_normalized ?? null,
      selling_unit: sku?.selling_unit ?? null,
      size_cm: sku?.size_cm ?? null,
      quality_grade: sku?.quality_grade ?? null,
    };
  });

  // SKUs without any cost row -- the known repair signal. Total dim_sku count
  // via a scalar head query; distinct SKUs-with-cost from the joined set we
  // already have. A SKU can have many cost rows, so we dedupe on sku_id.
  const { count: totalSkuCount } = await backup
    .from('dim_sku')
    .select('sku_id', { count: 'exact', head: true });

  const skuIdsWithCost = new Set(allRows.map((r) => r.sku_id).filter(Boolean));
  const totalSku = totalSkuCount ?? 0;
  const skusWithoutCost = Math.max(0, totalSku - skuIdsWithCost.size);

  // ----- summary band: per-vendor count + min/max/avg ----------------------
  const byVendor = new Map<string, CostJoinRow[]>();
  for (const r of allRows) {
    const v = r.vendor_canonical_name ?? '(no vendor)';
    if (!byVendor.has(v)) byVendor.set(v, []);
    byVendor.get(v)!.push(r);
  }
  const vendorSummaries: VendorSummary[] = Array.from(byVendor.entries())
    .map(([vendorName, rows]) => {
      const nums = rows
        .map((r) => (typeof r.farm_cost === 'number' ? r.farm_cost : Number(r.farm_cost)))
        .filter((n) => Number.isFinite(n)) as number[];
      const sum = nums.reduce((a, b) => a + b, 0);
      return {
        vendor: vendorName,
        count: rows.length,
        min: nums.length ? Math.min(...nums) : null,
        max: nums.length ? Math.max(...nums) : null,
        avg: nums.length ? sum / nums.length : null,
      };
    })
    .sort((a, b) => b.count - a.count);

  const vendorOptions = vendorSummaries.map((v) => v.vendor).sort((a, b) => a.localeCompare(b));

  // ----- table rows: filter -> sort -> cap ---------------------------------
  const filtered = activeVendor
    ? allRows.filter((r) => (r.vendor_canonical_name ?? '(no vendor)') === activeVendor)
    : allRows;
  const sorted = [...filtered].sort((a, b) => {
    const va = (a.vendor_canonical_name ?? '').localeCompare(b.vendor_canonical_name ?? '');
    if (va !== 0) return va;
    return (a.variety_normalized ?? '').localeCompare(b.variety_normalized ?? '');
  });
  const shown = sorted.slice(0, ROW_CAP);

  const totalCostRows = allRows.length;

  return (
    <div className="space-y-5">
      {/* Section header ---------------------------------------------------- */}
      <div>
        <h2 className="text-lg font-bold text-slate-900">
          Canonical costs <span className="text-slate-400 font-medium">(Rose — source of truth)</span>
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Read-only. Corrections route to Rose as proposals — this panel is a
          window, not an editor.
        </p>
      </div>

      {/* Source provenance bar -------------------------------------------- */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
        <span>
          Source: <code className="font-mono">public.canonical_cost</code> ⨝{' '}
          <code className="font-mono">public.dim_sku</code>
        </span>
        <span>
          Write path:{' '}
          <span className="font-medium text-emerald-800">proposal → Rose</span>{' '}
          (next iteration)
        </span>
        <span>{totalCostRows} cost rows (with SKU link)</span>
        <span>
          Pricing law:{' '}
          <code className="font-mono">price = farm_cost / (1 - gpm) + delivery</code>
        </span>
      </div>

      {/* Summary band ----------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-3 border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
            <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Costs by vendor
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-slate-200">
                <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-2">Vendor</th>
                  <th className="px-4 py-2 text-right">Cost rows</th>
                  <th className="px-4 py-2 text-right">Min</th>
                  <th className="px-4 py-2 text-right">Max</th>
                  <th className="px-4 py-2 text-right">Avg</th>
                </tr>
              </thead>
              <tbody>
                {vendorSummaries.map((v) => (
                  <tr key={v.vendor} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-2 text-xs font-medium text-slate-900">{v.vendor}</td>
                    <td className="px-4 py-2 text-right text-xs font-mono text-slate-700">{v.count}</td>
                    <td className="px-4 py-2 text-right text-xs font-mono text-slate-700">{fmtMoney(v.min)}</td>
                    <td className="px-4 py-2 text-right text-xs font-mono text-slate-700">{fmtMoney(v.max)}</td>
                    <td className="px-4 py-2 text-right text-xs font-mono text-slate-900">{fmtMoney(v.avg)}</td>
                  </tr>
                ))}
                {vendorSummaries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-400">
                      No canonical cost rows found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SKUs without cost -- repair signal -------------------------- */}
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 flex flex-col justify-center">
          <p className="text-3xl font-bold text-amber-900 font-mono">{skusWithoutCost}</p>
          <p className="text-xs font-semibold text-amber-900 mt-1">
            SKUs without cost (blocks pricing)
          </p>
          <p className="text-[11px] text-amber-800/80 mt-1">
            Of {totalSku} dim_sku rows. Each one cannot be priced until Rose lands
            a canonical cost.
          </p>
        </div>
      </div>

      {/* Vendor filter ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-slate-500 mr-1">Filter vendor:</span>
        <VendorFilterLink label="All" vendor={null} active={activeVendor === null} />
        {vendorOptions.map((v) => (
          <VendorFilterLink key={v} label={v} vendor={v} active={activeVendor === v} />
        ))}
      </div>

      {/* Cost table ------------------------------------------------------- */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center flex-wrap gap-2">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            {activeVendor ? `Vendor: ${activeVendor}` : 'All vendors'}
          </p>
          <p className="text-[11px] text-slate-500">
            Showing {shown.length} of {filtered.length} matching
            {filtered.length > ROW_CAP ? ` (capped at ${ROW_CAP})` : ''}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2">Vendor</th>
                <th className="px-4 py-2">SKU / variety</th>
                <th className="px-4 py-2 text-right">Cost</th>
                <th className="px-4 py-2">Unit</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2">Confidence</th>
                <th className="px-4 py-2 text-right">cost_id</th>
                <th className="px-4 py-2">Provenance</th>
                <th className="px-4 py-2">Approved</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2 text-right">Decision</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.cost_id} className="border-b border-slate-100 last:border-b-0 align-top">
                  <td className="px-4 py-2 text-xs font-medium text-slate-900">
                    {dash(r.vendor_canonical_name)}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-700">{varietyLabel(r)}</td>
                  <td className="px-4 py-2 text-right text-xs font-mono text-slate-900">
                    {fmtCost(r.farm_cost)}
                  </td>
                  <td className="px-4 py-2 text-[11px] text-slate-500">{unitLabel(r)}</td>
                  <td className="px-4 py-2 text-[11px] text-slate-600">{dash(r.cost_tier)}</td>
                  <td className="px-4 py-2 text-[11px] text-slate-600">{dash(r.cost_confidence)}</td>
                  <td className="px-4 py-2 text-right text-[11px] font-mono text-slate-400">{r.cost_id}</td>
                  <td className="px-4 py-2 text-[11px] text-slate-500 max-w-[220px]">
                    <div className="truncate" title={r.source_excerpt ?? undefined}>
                      {dash(r.source_excerpt)}
                    </div>
                    <div className="text-slate-400">{dash(r.inserted_by)}</div>
                  </td>
                  <td className="px-4 py-2 text-[11px]">
                    {r.facu_approved ? (
                      <span className="text-emerald-700 font-medium">
                        ✓ {fmtShortDate(r.facu_approved_at)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-[11px] text-slate-500">{fmtShortDate(r.updated_at)}</td>
                  <td className="px-4 py-2">
                    <CostDecisionAffordance costId={r.cost_id} />
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-xs text-slate-400">
                    No canonical cost rows for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        <strong>Read-only window.</strong> Canonical costs are owned by Rose. The
        three decision buttons below are honest placeholders — the proposal
        write-path to Rose ships next iteration. Nothing here writes to the
        database; corrections never edit Rose&apos;s data directly.
      </p>
    </div>
  );
}

// ----- vendor filter link (server link via searchParams) --------------------

function VendorFilterLink({
  label,
  vendor,
  active,
}: {
  label: string;
  vendor: string | null;
  active: boolean;
}) {
  const params = new URLSearchParams();
  params.set('panel', 'costs');
  if (vendor) params.set('costVendor', vendor);
  const href = `/admin/catalog/config?${params.toString()}#canonical-costs`;
  const cls = active
    ? 'px-2.5 py-1 rounded-md bg-emerald-600 text-white font-medium'
    : 'px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200';
  return (
    <a href={href} className={cls}>
      {label}
    </a>
  );
}

// ----- three-way decision affordance (DISABLED placeholders) ----------------
// Mirrors the admin's Approve / Reject / "I see it differently" decision UX, but
// every button is disabled this iteration. The proposal-to-Rose write-path is
// next. No write endpoints exist yet; we do not fake a save.

function CostDecisionAffordance({ costId }: { costId: number }) {
  return (
    <div className="flex flex-col gap-1 items-end" data-cost-id={costId}>
      <button
        type="button"
        disabled
        title="Acknowledge this cost looks correct. Visual ack only — wired next iteration."
        className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-400 cursor-not-allowed"
      >
        Looks right
      </button>
      <button
        type="button"
        disabled
        title="Propose a correction → routes to Rose as a governed proposal. Write-path ships next iteration; no edits to Rose's data from here."
        className="text-[11px] px-2 py-0.5 rounded border border-emerald-200 text-emerald-400 cursor-not-allowed"
      >
        Propose correction → Rose
      </button>
      <button
        type="button"
        disabled
        title="Disagree with the premise — capture why the cost is wrong. Routes to Rose with rationale. Wired next iteration."
        className="text-[11px] px-2 py-0.5 rounded border border-amber-200 text-amber-500 cursor-not-allowed"
      >
        I see it differently
      </button>
    </div>
  );
}
