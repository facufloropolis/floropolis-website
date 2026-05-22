// AdminCatalogHealthPanel — catalog health overview for /admin right rail.
// v2 | 2026-05-21 | Job_PM [V8 SHADOW]
//
// Right rail: tier breakdown, publication funnel, avg quality (0-100 weighted,
// same scale as catalog page), avg importance (from featured-scores seed),
// top blockers, vendor margins. Operational counters as compact footer.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getProdReadClient } from '@/lib/supabase/prod-server';
import { lookupImportanceScore } from '@/lib/admin/featured-scores-seed';

// ── types ─────────────────────────────────────────────────────────────────────

interface MirrorRow {
  name: string;
  tier: string | null;
  vendor: string | null;
  price: number | string | null;
  farm_cost: number | string | null;
  box_type: string | null;
  units_per_box: number | string | null;
  cost_source: string | null;
  live: boolean;
}

interface BoxRow {
  box_type: string;
  weight_kg: number | string | null;
}

interface ConstantRow {
  id: string;
  value_numeric: number | string | null;
}

interface WeightRow {
  gate_id: string;
  weight: number;
  evaluated: boolean;
}

interface ClassificationRow {
  status: string;
  failing_gates: unknown;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

// ── sub-components ────────────────────────────────────────────────────────────

function Bar({ value, max, colorCls }: { value: number; max: number; colorCls: string }) {
  const width = max === 0 ? 0 : Math.round(Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-1.5 rounded-full ${colorCls}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const colorCls =
    score >= 90 ? 'bg-emerald-500' :
    score >= 70 ? 'bg-amber-400' :
    'bg-red-400';
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-2 rounded-full ${colorCls}`} style={{ width: `${Math.round((score / max) * 100)}%` }} />
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

const GATE_SHORT: Record<string, string> = {
  cost_unverified: 'Cost unverified',
  formula_deviation: 'Price ≠ formula',
  missing_contents_description: 'No box description',
  open_price_alert: 'Price alert open',
  stock_live_mismatch: 'Stock/live mismatch',
  margin_unknown: 'Margin unknown',
  t3_outside_14d_window: 'T3 date too close',
  missing_arrival_date: 'No arrival date',
  missing_image: 'Missing image',
  t2_outside_5d_window: 'T2 date too close',
};

export default async function AdminCatalogHealthPanel(): Promise<ReactNode> {
  const svc = getBackupServiceClient();

  const [
    { data: mirrorRaw },
    { data: boxRaw },
    { data: constRaw },
    { data: clsRaw },
    { data: weightsRaw },
    { count: ordersOpen },
    { count: refundsPending },
    { count: clientsPending },
    { count: orphanCount },
  ] = await Promise.all([
    svc.from('floropolis_inventory_mirror')
      .select('name, tier, vendor, price, farm_cost, box_type, units_per_box, cost_source, live')
      .limit(2000),
    svc.from('box_master').select('box_type, weight_kg'),
    svc.from('pricing_constants').select('id, value_numeric'),
    svc.from('catalog_classifications').select('status, failing_gates'),
    svc.from('catalog_quality_weights').select('gate_id, weight, evaluated'),
    svc.from('orders').select('*', { count: 'exact', head: true })
      .in('status', ['payment_authorized', 'payment_captured', 'pending'])
      .then((r) => ({ count: r.count }), () => ({ count: 0 })),
    svc.from('refund_approvals').select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then((r) => ({ count: r.count }), () => ({ count: 0 })),
    svc.from('client_profiles').select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then((r) => ({ count: r.count }), () => ({ count: 0 })),
    // Orphan count from prod
    (async () => {
      const prod = getProdReadClient();
      if (!prod) return { count: null };
      const { data } = await prod.rpc('sales_cleanup_list', { p_status: 'pending', p_limit: 1, p_offset: 0 });
      const r = data as { total_pending?: number } | null;
      return { count: r?.total_pending ?? null };
    })(),
  ]);

  const mirror = (mirrorRaw ?? []) as MirrorRow[];
  const boxes = (boxRaw ?? []) as BoxRow[];
  const constants = (constRaw ?? []) as ConstantRow[];
  const classifications = (clsRaw ?? []) as ClassificationRow[];
  const weights = (weightsRaw ?? []) as WeightRow[];

  // Pre-compute weight lookup for 0-100 quality score (same as catalog page)
  const evalWeights = weights.filter((w) => w.evaluated);
  const unevalBonus = weights.filter((w) => !w.evaluated).reduce((s, w) => s + w.weight, 0);

  // Pricing constants
  const fedexRate = toNum(constants.find((c) => c.id === 'fedex_rate_per_kg')?.value_numeric) ?? 6.5;
  const fuelMult = toNum(constants.find((c) => c.id === 'fuel_surcharge_mult')?.value_numeric) ?? 1.25;
  const gpmTarget = toNum(constants.find((c) => c.id === 'gpm_target')?.value_numeric) ?? 0.33;
  const boxWeightMap = new Map(boxes.map((b) => [b.box_type, toNum(b.weight_kg) ?? 0]));

  // ── Tier breakdown ──────────────────────────────────────────────────────────
  // K2K live = cost_source matches /_k2k_/i AND live=true (same as catalog-model deriveBuckets).
  // Do NOT use tier fallback — all mirror rows have tier=T2 or T3; tier is not the K2K signal.
  let k2kCount = 0, t2Count = 0, t3Count = 0;
  for (const r of mirror) {
    if (r.tier === 'T2') t2Count++;
    if (r.tier === 'T3') t3Count++;
    if (r.cost_source && /_k2k_/i.test(r.cost_source) && r.live) k2kCount++;
  }
  const totalSkus = mirror.length;

  // ── Publication status ──────────────────────────────────────────────────────
  let perfect = 0, publishable = 0, blocked = 0;
  const gateCounts = new Map<string, number>();

  for (const c of classifications) {
    if (c.status === 'perfect') perfect++;
    else if (c.status === 'publishable') publishable++;
    else blocked++;

    const gates = Array.isArray(c.failing_gates)
      ? (c.failing_gates as string[])
      : [];
    for (const g of gates) {
      gateCounts.set(g, (gateCounts.get(g) ?? 0) + 1);
    }
  }

  const totalCls = classifications.length;

  // 0-100 weighted quality score (same formula as catalog-model.ts buildCatalog)
  let qSum = 0, qCount = 0;
  for (const c of classifications) {
    const fails = new Set<string>(
      Array.isArray(c.failing_gates)
        ? (c.failing_gates as string[]).filter((g): g is string => typeof g === 'string')
        : [],
    );
    const score = unevalBonus + evalWeights
      .filter((w) => !fails.has(w.gate_id))
      .reduce((s, w) => s + w.weight, 0);
    qSum += score;
    qCount++;
  }
  const avgScore = qCount > 0 ? Math.round(qSum / qCount) : null;

  // Importance from featured-scores seed (only scored SKUs count in avg)
  let impSum = 0, impCount = 0;
  for (const r of mirror) {
    const imp = lookupImportanceScore(r.name);
    if (imp != null) { impSum += imp; impCount++; }
  }
  const avgImportance = impCount > 0 ? Math.round(impSum / impCount) : null;

  const topGates = [...gateCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxGateCount = topGates[0]?.[1] ?? 1;

  // ── Vendor GPM ─────────────────────────────────────────────────────────────
  interface VendorStats { count: number; sumGpm: number; belowTarget: number; }
  const vendorMap = new Map<string, VendorStats>();

  for (const r of mirror) {
    const price = toNum(r.price);
    const cost = toNum(r.farm_cost);
    const units = toNum(r.units_per_box);
    const boxWt = r.box_type ? (boxWeightMap.get(r.box_type) ?? 0) : 0;
    if (price == null || cost == null || units == null || units === 0 || price === 0) continue;

    const shipping = Math.ceil(boxWt) * fedexRate * fuelMult / units;
    const realGpm = (price - cost - shipping) / price;
    const vendor = r.vendor ?? 'Unknown';

    const existing = vendorMap.get(vendor) ?? { count: 0, sumGpm: 0, belowTarget: 0 };
    existing.count++;
    existing.sumGpm += realGpm;
    if (realGpm < gpmTarget) existing.belowTarget++;
    vendorMap.set(vendor, existing);
  }

  const vendorStats = [...vendorMap.entries()]
    .map(([name, s]) => ({
      name,
      count: s.count,
      avgGpm: s.count > 0 ? s.sumGpm / s.count : 0,
      belowTarget: s.belowTarget,
    }))
    .filter((v) => v.count >= 5)
    .sort((a, b) => b.count - a.count);

  const maxGpm = 0.8; // scale bars to 80% max for readability

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">Catalog health</h2>
        <Link href="/admin/catalog" className="text-[11px] text-emerald-700 hover:underline font-medium">
          Open →
        </Link>
      </div>

      {/* Tier breakdown */}
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
          Supply tier · {totalSkus.toLocaleString()} SKUs
        </p>
        <div className="space-y-1.5">
          <TierRow label="K2K live" count={k2kCount} total={totalSkus}
            colorCls="bg-emerald-500" linkHref="/admin/catalog?source=k2k_live" />
          <TierRow label="T2 committed" count={t2Count} total={totalSkus}
            colorCls="bg-blue-400" linkHref="/admin/catalog?source=t2" />
          <TierRow label="T3 sourceable" count={t3Count} total={totalSkus}
            colorCls="bg-slate-400" linkHref="/admin/catalog?source=t3" />
        </div>
      </div>

      {/* Publication funnel */}
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
          Publication · {totalCls} classified
        </p>
        <div className="space-y-1.5">
          <TierRow label="Perfect" count={perfect} total={totalCls}
            colorCls="bg-emerald-500" linkHref="/admin/catalog?tab=perfect" />
          <TierRow label="Publishable" count={publishable} total={totalCls}
            colorCls="bg-amber-400" linkHref="/admin/catalog" />
          <TierRow label="Blocked" count={blocked} total={totalCls}
            colorCls="bg-red-400" linkHref="/admin/catalog?tab=improvement-queue" />
        </div>
      </div>

      {/* Avg quality score — 0-100 weighted (same as catalog page) */}
      {avgScore != null && (
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Avg quality score
            </p>
            <span className={`text-sm font-bold ${
              avgScore >= 90 ? 'text-emerald-700' :
              avgScore >= 75 ? 'text-amber-600' : 'text-red-600'
            }`}>
              {avgScore}<span className="text-slate-400 font-normal text-xs"> / 100</span>
            </span>
          </div>
          <ScoreBar score={avgScore} max={100} />
        </div>
      )}

      {/* Avg importance — only featured SKUs score; shows coverage */}
      {avgImportance != null && (
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Avg importance
            </p>
            <span className="text-sm font-bold text-amber-700">
              {avgImportance}
              <span className="text-slate-400 font-normal text-xs"> / 100</span>
              <span className="text-[10px] font-normal text-slate-400 ml-1">({impCount} scored)</span>
            </span>
          </div>
          <ScoreBar score={avgImportance} max={100} />
          <p className="text-[10px] text-slate-400 mt-0.5">
            Featured SKUs only · <Link href="/admin/catalog?tab=improvement-queue" className="underline">expand coverage →</Link>
          </p>
        </div>
      )}

      {/* Top blockers */}
      {topGates.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Top blockers
          </p>
          <div className="space-y-2">
            {topGates.map(([gate, count]) => (
              <div key={gate}>
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-[11px] text-slate-700 truncate max-w-[160px]">
                    {GATE_SHORT[gate] ?? gate}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 shrink-0 ml-1">
                    {count}
                  </span>
                </div>
                <Bar value={count} max={maxGateCount} colorCls="bg-red-300" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vendor margins */}
      {vendorStats.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Vendor margin vs {Math.round(gpmTarget * 100)}% target
            </p>
            <Link href="/admin/vendors" className="text-[10px] text-emerald-700 hover:underline font-medium">
              Manage →
            </Link>
          </div>
          <div className="space-y-2">
            {vendorStats.map((v) => {
              const gpmPct = Math.round(v.avgGpm * 100);
              const atTarget = v.avgGpm >= gpmTarget;
              const barCls = atTarget ? 'bg-emerald-400' : 'bg-amber-400';
              const textCls = atTarget ? 'text-emerald-700' : 'text-amber-700';
              return (
                <Link
                  key={v.name}
                  href={`/admin/catalog?vendor=${encodeURIComponent(v.name)}&tab=improvement-queue`}
                  className="block group"
                >
                  <div className="flex items-baseline justify-between mb-0.5">
                    <span className="text-[11px] text-slate-700 truncate max-w-[130px] group-hover:text-emerald-700">
                      {v.name}
                    </span>
                    <span className={`text-[11px] font-semibold shrink-0 ml-1 ${textCls}`}>
                      {gpmPct}%{!atTarget && ' ⚠'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                    {/* target line at gpmTarget% */}
                    <div
                      className="absolute top-0 bottom-0 w-px bg-slate-400 z-10"
                      style={{ left: `${Math.round((gpmTarget / maxGpm) * 100)}%` }}
                    />
                    <div
                      className={`h-1.5 rounded-full ${barCls}`}
                      style={{ width: `${Math.round((Math.max(0, v.avgGpm) / maxGpm) * 100)}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            Real GPM = (price − cost − shipping) / price
          </p>
        </div>
      )}

      {/* Operational footer */}
      <div className="pt-3 border-t border-slate-100 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
        <span>Orders <span className="font-semibold text-slate-700">{ordersOpen ?? 0}</span></span>
        <span className="text-slate-200">·</span>
        <span>Refunds <span className="font-semibold text-slate-700">{refundsPending ?? 0}</span></span>
        <span className="text-slate-200">·</span>
        <span>Clients pending <span className="font-semibold text-slate-700">{clientsPending ?? 0}</span></span>
        {orphanCount != null && orphanCount > 0 && (
          <>
            <span className="text-slate-200">·</span>
            <Link href="/admin/sales-cleanup" className="text-amber-700 font-semibold hover:underline">
              {orphanCount} orphan{orphanCount === 1 ? '' : 's'}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

// ── TierRow ───────────────────────────────────────────────────────────────────

function TierRow({
  label, count, total, colorCls, linkHref,
}: {
  label: string;
  count: number;
  total: number;
  colorCls: string;
  linkHref: string;
}) {
  const p = pct(count, total);
  return (
    <Link href={linkHref} className="block group">
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-[11px] text-slate-600 group-hover:text-emerald-700">{label}</span>
        <span className="text-[11px] font-semibold text-slate-700">
          {count.toLocaleString()}
          <span className="text-slate-400 font-normal ml-1">{p}%</span>
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-1.5 rounded-full ${colorCls}`} style={{ width: `${p}%` }} />
      </div>
    </Link>
  );
}
