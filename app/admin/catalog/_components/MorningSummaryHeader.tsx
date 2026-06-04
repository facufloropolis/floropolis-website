// Morning Summary Header — UC-D-100..103 (BRD v0.3 §Group 1)
// v2 | 2026-06-04 | Job_PM [V8 SHADOW]
//   - Tier split (UC-D-100) now reads catalog_classifications.tier (the
//     classification spine), NOT stale mirror arrival-date windows. Per
//     perfect_inventory_bar v2.2: T2/T3 = tier COMMITMENT, never arrival
//     windows. K2K live is surfaced as an honest "not connected" annotation,
//     never a zero that reads like data.
//   - Price integrity (UC-D-102) replaces the deprecated above-formula proxy
//     (hardcoded cost/0.67+$0.50, 5% tolerance, "all within tolerance" on
//     empty data). Reads v_catalog_admin.margin_status (real computed column).
//
// Renders 4 widgets above the supply-intelligence panel on /admin/catalog:
//   UC-D-100  Counts by tier (T2 / T3 / other) from the classification spine.
//             K2K live shown as a separate "not connected (S6)" annotation.
//   UC-D-101  Live going down DoD flag (depends on mirror_snapshot_daily;
//             gracefully renders "pending Rose snapshot pipeline" if missing).
//   UC-D-102  Price integrity: unpriced + below_floor counts from
//             v_catalog_admin.margin_status. Green ONLY when both are zero AND
//             priced count > 0 (never green on empty data).
//   UC-D-103  Top sellers L30D supply glance (orders + order_lines joined
//             to catalog_classifications; renders placeholder if absent).
//
// READ-ONLY server component. Same `backup` service client as the parent page.
// No prod-client imports. Tailwind, matches the existing card style on
// /admin/catalog (rounded-xl border border-slate-200 bg-white).
//
// RACI: derives display-only values from Rose-owned tables; no writes, no
// recomputation of canonical metrics. Price integrity reads margin_status,
// which is computed live in v_catalog_admin from pricing_constants — this
// widget does NO pricing arithmetic of its own.

import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Minimal row types — local, no shared lib dependency
// ---------------------------------------------------------------------------
interface MirrorPick {
  id: string;
  vendor: string | null;
  tier: string | null;
  live: boolean | null;
  active: boolean | null;
  arrival_date: string | null;
  // Postgres numeric arrives as string via supabase-js; tolerate both.
  farm_cost: number | string | null;
  price: number | string | null;
}

interface ClassificationPick {
  sku_id: string;
  status: string | null;
  // Tier COMMITMENT from the classification spine (perfect_inventory_bar v2.2),
  // NOT an arrival-date window. 'T2' | 'T3' | null (→ 'other' bucket).
  tier: string | null;
  vendor: string | null;
}

interface PriceIntegrityRow {
  margin_status: string | null;
  price: number | string | null;
}

interface TopSellerRow {
  sku_id: number;
  name: string;
  vendor: string | null;
  gmv: number;
  units: number;
  status: string | null;
}

// ---------------------------------------------------------------------------
// Date helper — YYYY-MM-DD relative to UTC today.
// ---------------------------------------------------------------------------
function addDaysISO(base: Date, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Tier bucket (from the classification spine, NOT mirror windows).
// ---------------------------------------------------------------------------
type TierBucket = 't2' | 't3' | 'other';

function tierBucket(tier: string | null): TierBucket {
  if (tier === 'T2') return 't2';
  if (tier === 'T3') return 't3';
  return 'other';
}

// ---------------------------------------------------------------------------
// Price integrity fetch — reads v_catalog_admin.margin_status (real computed
// column: 'ok' | 'below_floor' | 'unpriced'). Returns null if the view is
// unreachable, so the widget can render an honest "source unavailable" note
// instead of a fake zero.
// ---------------------------------------------------------------------------
async function fetchPriceIntegrity(
  backup: SupabaseClient,
): Promise<{ unpriced: number; belowFloor: number; priced: number } | null> {
  try {
    const { data, error } = await backup
      .from('v_catalog_admin')
      .select('margin_status, price')
      .limit(5000);
    if (error || !data) return null;
    let unpriced = 0;
    let belowFloor = 0;
    let priced = 0;
    for (const row of data as unknown as PriceIntegrityRow[]) {
      const ms = row.margin_status;
      if (ms === 'unpriced') unpriced += 1;
      else if (ms === 'below_floor') belowFloor += 1;
      if (row.price != null) priced += 1;
    }
    return { unpriced, belowFloor, priced };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Snapshot probe — checks information_schema.tables for the snapshot writer.
// Returns yesterday's k2k_live count if available, else null (placeholder
// rendered in widget B). NO error if absent — that's the v0.3 graceful path.
// ---------------------------------------------------------------------------
async function probeYesterdayLive(
  backup: SupabaseClient,
  yesterdayISO: string,
): Promise<number | null> {
  try {
    const { data, error } = await backup
      .from('mirror_snapshot_daily')
      .select('sku_id', { count: 'exact', head: false })
      .eq('snapshot_date', yesterdayISO)
      .eq('source', 'live')
      .limit(1);
    if (error) return null;
    const { count, error: cErr } = await backup
      .from('mirror_snapshot_daily')
      .select('sku_id', { count: 'exact', head: true })
      .eq('snapshot_date', yesterdayISO)
      .eq('source', 'live');
    if (cErr) return null;
    void data;
    return count ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Top sellers fetch — orders + order_lines joined to classifications.
// Graceful empty array if either table absent or query fails.
// ---------------------------------------------------------------------------
async function fetchTopSellers(
  backup: SupabaseClient,
  classifications: ClassificationPick[],
  uuidByFi: Map<string, string>,
): Promise<TopSellerRow[] | null> {
  try {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    const { data, error } = await backup
      .from('order_lines')
      .select(
        'sku_id, sku_name_snapshot, sku_vendor_snapshot, line_total_locked, quantity, orders!inner(status, created_at)',
      )
      .gte('orders.created_at', since.toISOString())
      .in('orders.status', ['paid', 'fulfilled']);
    if (error || !data) return null;
    const byId = new Map<number, TopSellerRow>();
    const classBySku = new Map<string, string | null>();
    for (const c of classifications) classBySku.set(c.sku_id, c.status);
    for (const row of data as unknown as Array<{
      sku_id: number;
      sku_name_snapshot: string | null;
      sku_vendor_snapshot: string | null;
      line_total_locked: number | string | null;
      quantity: number | null;
    }>) {
      if (row.sku_id == null) continue;
      const gmv = Number(row.line_total_locked ?? 0);
      const units = Number(row.quantity ?? 0);
      const cur = byId.get(row.sku_id);
      if (cur) {
        cur.gmv += gmv;
        cur.units += units;
      } else {
        byId.set(row.sku_id, {
          sku_id: row.sku_id,
          name: row.sku_name_snapshot ?? `#${row.sku_id}`,
          vendor: row.sku_vendor_snapshot,
          gmv,
          units,
          // order_lines.sku_id is the legacy bigint id; classifications key on
          // dim_sku uuid post-recompute. Bridge via product_chrome (uuidByFi);
          // unmatched rows degrade honestly to null status. INTERIM until S5
          // adds the uuid FK to order_lines.
          status: classBySku.get(uuidByFi.get(String(row.sku_id)) ?? '') ?? null,
        });
      }
    }
    return Array.from(byId.values())
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, 10);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default async function MorningSummaryHeader({
  backup,
  mirror,
  classifications,
}: {
  backup: SupabaseClient;
  mirror: MirrorPick[];
  classifications: ClassificationPick[];
}) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // ── UC-D-100: Counts by tier ────────────────────────────────────────────
  // UNIVERSE = the classification/publishability spine (one row per classified
  // SKU). Tier bucket comes from classifications.tier (the COMMITMENT), NOT a
  // mirror arrival-date window (deprecated semantics, perfect_inventory_bar
  // v2.2). Vendor decoration also comes from classifications.vendor — the
  // mirror is no longer consulted for this widget's split.
  type UniverseRow = {
    sku_id: string;
    status: string | null;
    bucket: TierBucket;
    vendor: string | null;
  };
  const universe: UniverseRow[] = classifications.map((c) => ({
    sku_id: c.sku_id,
    status: c.status,
    bucket: tierBucket(c.tier),
    vendor: c.vendor,
  }));

  const byTier: Record<TierBucket, { total: number; publishable: number; held: number }> = {
    t2:    { total: 0, publishable: 0, held: 0 },
    t3:    { total: 0, publishable: 0, held: 0 },
    other: { total: 0, publishable: 0, held: 0 },
  };
  const byVendor = new Map<string, { total: number; publishable: number }>();
  for (const r of universe) {
    const slot = byTier[r.bucket];
    slot.total += 1;
    const pub = r.status === 'perfect' || r.status === 'publishable';
    if (pub) slot.publishable += 1;
    else slot.held += 1;
    const v = r.vendor ?? '(unknown)';
    const vs = byVendor.get(v) ?? { total: 0, publishable: 0 };
    vs.total += 1;
    if (pub) vs.publishable += 1;
    byVendor.set(v, vs);
  }
  // Universe totals = full classification spine.
  const totalAll = universe.length;
  const pubAll = universe.filter((r) => r.status === 'perfect' || r.status === 'publishable').length;
  const topVendors = Array.from(byVendor.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([vendor, s]) => ({
      vendor,
      total: s.total,
      pubPct: s.total > 0 ? Math.round((s.publishable / s.total) * 100) : 0,
    }));

  // ── UC-D-101: Live going down DoD ──────────────────────────────────────
  // Live count is a parallel-signal decoration sourced from the mirror's live
  // flag — it never gates the universe. (S6 will replace this with a real
  // connected live-signal pipeline.)
  const yesterdayLive = await probeYesterdayLive(backup, addDaysISO(today, -1));
  const todayLive = mirror.filter((m) => m.live === true && m.active !== false).length;
  let dodBadge: 'pending' | 'down' | 'flat' = 'pending';
  let dodDelta = 0;
  let dodPct = 0;
  if (yesterdayLive != null) {
    dodDelta = todayLive - yesterdayLive;
    dodPct = yesterdayLive > 0 ? (dodDelta / yesterdayLive) * 100 : 0;
    dodBadge = (dodDelta < 0 || dodPct < -5) ? 'down' : 'flat';
  }

  // ── UC-D-102: Price integrity ──────────────────────────────────────────
  // Reads v_catalog_admin.margin_status (real computed column). Green ONLY
  // when unpriced == 0 AND below_floor == 0 AND priced > 0 — never green on
  // empty/disconnected data.
  const priceIntegrity = await fetchPriceIntegrity(backup);

  // ── uuid ↔ legacy-id bridge (for Top sellers status decoration) ─────────
  const uuidByFi = new Map<string, string>();
  try {
    const { data: bridge } = await backup.from('product_chrome').select('sku_id, fi_id');
    for (const b of (bridge ?? []) as Array<{ sku_id: string; fi_id: number | string | null }>) {
      if (b.fi_id == null) continue;
      uuidByFi.set(String(b.fi_id), b.sku_id);
    }
  } catch {
    // bridge unavailable → top-seller status degrades to null; universe unaffected
  }

  // ── UC-D-103: Top sellers L30D ─────────────────────────────────────────
  const topSellers = await fetchTopSellers(backup, classifications, uuidByFi);

  // Helper for filter deep-link URLs
  const url = (qs: Record<string, string>) => {
    const p = new URLSearchParams(qs);
    return `/admin/catalog?${p.toString()}`;
  };

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Morning summary
        </span>
        <span className="text-[10px] text-slate-400">
          universe = classification spine · tier = commitment (not arrival window)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 lg:divide-x divide-slate-100">
        {/* ── Widget A: UC-D-100 Counts by tier ── */}
        <div className="p-4">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">
            Counts by tier
          </div>
          <div className="text-2xl font-bold text-slate-900 leading-none">
            {totalAll.toLocaleString()}
            <span className="text-xs font-medium text-emerald-700 ml-2">
              {pubAll.toLocaleString()} publishable
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            <SourceRow
              label="T2"
              total={byTier.t2.total}
              pub={byTier.t2.publishable}
              held={byTier.t2.held}
              href={url({ source: 't2' })}
              tone="blue"
            />
            <SourceRow
              label="T3"
              total={byTier.t3.total}
              pub={byTier.t3.publishable}
              held={byTier.t3.held}
              href={url({ source: 't3' })}
              tone="slate"
            />
            {byTier.other.total > 0 && (
              <SourceRow
                label="Other (no tier)"
                total={byTier.other.total}
                pub={byTier.other.publishable}
                held={byTier.other.held}
                href="/admin/catalog"
                tone="slate"
              />
            )}
          </div>
          {/* K2K live: honest "not connected" annotation — never a zero that
              reads like data (Facu directive: mark clearly what is NOT wired). */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-400">K2K live signal</span>
            <span className="text-[10px] text-slate-400">
              <span className="font-semibold tabular-nums">—</span>{' '}
              not connected (S6)
            </span>
          </div>
          {topVendors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1.5">
                Top vendors
              </div>
              <div className="space-y-1">
                {topVendors.map((v) => (
                  <div key={v.vendor} className="flex items-center justify-between gap-2">
                    <Link
                      href={url({ vendor: v.vendor })}
                      className="text-[11px] text-slate-700 hover:text-emerald-700 truncate max-w-[140px]"
                      title={v.vendor}
                    >
                      {v.vendor}
                    </Link>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {v.total}{' '}
                      <span
                        className={
                          v.pubPct >= 80
                            ? 'text-emerald-700 font-semibold'
                            : v.pubPct >= 50
                              ? 'text-amber-700 font-semibold'
                              : 'text-red-600 font-semibold'
                        }
                      >
                        ({v.pubPct}%)
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Widget B: UC-D-101 Live DoD ── */}
        <div className="p-4">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">
            Live K2K · day over day
          </div>
          <div className="text-2xl font-bold text-slate-900 leading-none">
            {todayLive.toLocaleString()}
            <span className="text-[11px] font-medium text-slate-500 ml-1.5">SKUs live</span>
          </div>
          <div className="mt-3">
            {dodBadge === 'pending' && (
              <span className="inline-flex items-center text-[11px] px-2 py-1 rounded bg-slate-50 text-slate-500 border border-slate-200">
                DoD: pending Rose snapshot pipeline
              </span>
            )}
            {dodBadge === 'down' && (
              <span className="inline-flex items-center text-[11px] px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200 font-semibold">
                ↓ {Math.abs(dodDelta)} SKUs vs yesterday ({dodPct.toFixed(1)}%)
              </span>
            )}
            {dodBadge === 'flat' && (
              <span className="inline-flex items-center text-[11px] px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                {dodDelta >= 0 ? '+' : ''}
                {dodDelta} vs yesterday
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-3 leading-snug">
            Source: <code className="font-mono">mirror_snapshot_daily</code> (Rose-owned writer; missing today → placeholder).
            Threshold: ↓ &lt; 0 OR &lt; −5%.
          </p>
        </div>

        {/* ── Widget C: UC-D-102 Price integrity ── */}
        <div className="p-4">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">
            Price integrity
          </div>
          {priceIntegrity == null ? (
            <p className="text-[11px] text-slate-500 mt-1">
              Price integrity: source unavailable (v_catalog_admin query failed).
            </p>
          ) : (() => {
            const { unpriced, belowFloor, priced } = priceIntegrity;
            const clean = unpriced === 0 && belowFloor === 0 && priced > 0;
            const issues = unpriced + belowFloor;
            return (
              <>
                <div className="text-2xl font-bold leading-none">
                  {clean ? (
                    <span className="text-emerald-700">0</span>
                  ) : (
                    <span className="text-amber-700">{issues.toLocaleString()}</span>
                  )}
                  <span className="text-[11px] font-medium text-slate-500 ml-1.5">
                    {clean ? 'price issues' : 'SKUs flagged'}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5">
                  {clean ? (
                    <span className="inline-flex items-center text-[11px] px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      All {priced.toLocaleString()} priced SKUs at/above floor
                    </span>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <div
                        className={`inline-flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded border font-semibold ${
                          unpriced > 0
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-slate-50 text-slate-400 border-slate-200'
                        }`}
                      >
                        <span>Unpriced</span>
                        <span className="tabular-nums">{unpriced.toLocaleString()}</span>
                      </div>
                      <div
                        className={`inline-flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded border font-semibold ${
                          belowFloor > 0
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-50 text-slate-400 border-slate-200'
                        }`}
                      >
                        <span>Below floor</span>
                        <span className="tabular-nums">{belowFloor.toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
          <p className="text-[10px] text-slate-400 mt-3 leading-snug">
            price = farm_cost/(1−GPM)+delivery, computed live from pricing_constants; floor = (cost+delivery)/0.95 (5% GPM = rep commission)
          </p>
        </div>

        {/* ── Widget D: UC-D-103 Top sellers L30D ── */}
        <div className="p-4">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">
            Top sellers · L30D
          </div>
          {topSellers == null ? (
            <p className="text-[11px] text-slate-500 mt-1">
              L30D top sellers: pending data source (orders/order_lines query failed).
            </p>
          ) : topSellers.length === 0 ? (
            <p className="text-[11px] text-slate-500 mt-1">No paid orders in the last 30 days.</p>
          ) : (
            <div className="space-y-1.5">
              {topSellers.map((s, i) => {
                const badge =
                  s.status === 'perfect'
                    ? { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'perfect' }
                    : s.status === 'publishable'
                      ? { cls: 'bg-amber-100 text-amber-800 border-amber-200', label: 'publishable' }
                      : s.status === 'blocked'
                        ? { cls: 'bg-red-100 text-red-800 border-red-200', label: 'blocked' }
                        : { cls: 'bg-slate-100 text-slate-500 border-slate-200', label: '—' };
                return (
                  <div key={s.sku_id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/catalog/${s.sku_id}`}
                        className="text-[11px] text-slate-700 hover:text-emerald-700 truncate block"
                        title={s.name}
                      >
                        <span className="text-slate-400 font-mono mr-1">#{i + 1}</span>
                        {s.name}
                      </Link>
                    </div>
                    <span className="text-[10px] text-slate-600 shrink-0 tabular-nums">
                      ${s.gmv.toFixed(0)}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${badge.cls}`}
                      title={`catalog_classifications.status = ${s.status ?? 'null'}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                );
              })}
              <p className="text-[10px] text-slate-400 mt-2 leading-snug">
                Red rows = top seller blocked from publish. Priority queue.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small row component for Widget A
// ---------------------------------------------------------------------------
function SourceRow({
  label,
  total,
  pub,
  held,
  href,
  tone,
}: {
  label: string;
  total: number;
  pub: number;
  held: number;
  href: string;
  tone: 'emerald' | 'blue' | 'slate';
}) {
  const labelCls =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'blue'
        ? 'text-blue-700'
        : 'text-slate-600';
  const pct = total > 0 ? Math.round((pub / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between gap-2">
      <Link href={href} className={`text-[11px] font-medium ${labelCls} hover:underline truncate`}>
        {label}
      </Link>
      <div className="flex items-center gap-2 text-[10px] text-slate-500 tabular-nums">
        <span className="text-slate-700 font-semibold">{total.toLocaleString()}</span>
        <span>·</span>
        <span className="text-emerald-700">{pub.toLocaleString()} pub</span>
        <span>·</span>
        <span className="text-amber-700">{held.toLocaleString()} held</span>
        <span className="text-slate-400">({pct}%)</span>
      </div>
    </div>
  );
}
