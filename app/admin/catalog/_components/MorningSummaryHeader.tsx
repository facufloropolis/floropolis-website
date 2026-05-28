// Morning Summary Header — UC-D-100..103 (BRD v0.3 §Group 1)
// v1 | 2026-05-27 | Job_PM Sub-Agent B [V8 SHADOW]
//
// Renders 4 widgets above the supply-intelligence panel on /admin/catalog:
//   UC-D-100  Counts by source × vendor (publishable universe per Perfect
//             Inventory Bar v2.1 — k2k_live OR T2[+5..+180] OR T3[+14..+180],
//             farm_cost required. Magic Flowers excluded ONLY from k2k_live
//             branch (ghost vendor); INCLUDED in T2/T3 catalog.
//   UC-D-101  Live going down DoD flag (depends on mirror_snapshot_daily;
//             gracefully renders "pending Rose snapshot pipeline" if missing).
//   UC-D-102  Above-formula vendor flag (count of SKUs where price exceeds
//             (farm_cost/0.67)+$0.50 by >5%).
//   UC-D-103  Top sellers L30D supply glance (orders + order_lines joined
//             to catalog_classifications; renders placeholder if absent).
//
// READ-ONLY server component. Same `backup` service client as the parent page.
// No prod-client imports. Tailwind, matches the existing card style on
// /admin/catalog (rounded-xl border border-slate-200 bg-white).
//
// RACI: derives display-only values from Rose-owned tables; no writes, no
// recomputation of canonical metrics. Above-formula is a quick *flag count*,
// not a precise margin number — fine arithmetic for catalog_model.ts.

import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config (Perfect Inventory Bar v2 — kept in one place so it's obvious what
// rules this widget encodes; pulled from kb/projects/perfect_inventory_bar.md
// §6 tier windows. Per v2.1: Magic Flowers excluded ONLY from live source. The
// 0.67 number is the *legacy* default GPM used here ONLY for a rough flag —
// real pricing is computed in catalog-model.ts from country-scoped config.)
// ---------------------------------------------------------------------------
const T2_MIN_DAYS = 5;
const T2_MAX_DAYS = 180;
const T3_MIN_DAYS = 14;
const T3_MAX_DAYS = 180;
const MAGIC_FLOWERS_PATTERN = /magic\s*flower/i;
const FLAG_GPM_DENOM = 0.67;          // legacy default — rough flag only
const FLAG_DELIVERY_PER_STEM = 0.5;   // inline placeholder for the flag count
const FLAG_TOLERANCE = 1.05;          // >5% above formula

// ---------------------------------------------------------------------------
// Minimal row types — local, no shared lib dependency
// ---------------------------------------------------------------------------
interface MirrorPick {
  id: number;
  vendor: string | null;
  tier: string | null;
  live: boolean | null;
  active: boolean | null;
  arrival_date: string | null;
  // Postgres numeric arrives as string via supabase-js; tolerate both.
  farm_cost: number | string | null;
  price: number | string | null;
}

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

interface ClassificationPick {
  sku_id: number;
  status: string | null;
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
// Date helper — YYYY-MM-DD relative to UTC today (Rose stores arrival_date
// as a date type, so a naive YYYY-MM-DD compare is the right shape).
// ---------------------------------------------------------------------------
function addDaysISO(base: Date, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayISO(base: Date): string {
  return base.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Publishable-universe filter — replicates ops.publishable_inventory rules
// inline. (The view does not exist in supabase-backup today; verified via
// information_schema.tables 2026-05-27. When it ships, swap this filter for
// a direct SELECT * FROM ops.publishable_inventory.)
// ---------------------------------------------------------------------------
type Bucket = 'k2k_live' | 't2_catalog' | 't3_catalog';

function bucketize(r: MirrorPick, today: Date): Bucket | null {
  if (toNum(r.farm_cost) == null) return null;
  // Per perfect_inventory_bar v2.1 (Facu 2026-05-28): Magic Flowers is excluded
  // ONLY from the live-source determination (ghost vendor — circular K2K signal,
  // we ghost-upload on their behalf). They ARE included in T2/T3 publishable
  // when basics are present (cost + image + unit + tier window).
  const isMagicFlowers = r.vendor != null && MAGIC_FLOWERS_PATTERN.test(r.vendor);
  if (r.live === true && r.active !== false && !isMagicFlowers) return 'k2k_live';
  if (r.arrival_date) {
    const arr = new Date(r.arrival_date + 'T00:00:00Z').getTime();
    const t = today.getTime();
    const days = Math.round((arr - t) / (1000 * 60 * 60 * 24));
    if (r.tier === 'T2' && days >= T2_MIN_DAYS && days <= T2_MAX_DAYS) return 't2_catalog';
    if (r.tier === 'T3' && days >= T3_MIN_DAYS && days <= T3_MAX_DAYS) return 't3_catalog';
  }
  return null;
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
  // RPC-less existence check via attempting the query and swallowing the
  // "relation does not exist" error path. Cheaper than a separate
  // information_schema round-trip.
  try {
    const { data, error } = await backup
      .from('mirror_snapshot_daily')
      .select('sku_id', { count: 'exact', head: false })
      .eq('snapshot_date', yesterdayISO)
      .eq('source', 'live')
      .limit(1);
    if (error) return null;
    // We need a real count; use a HEAD/exact query.
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
    const classBySku = new Map<number, string | null>();
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
          status: classBySku.get(row.sku_id) ?? null,
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

  // ── UC-D-100: Counts by source × vendor ────────────────────────────────
  const classStatusBySku = new Map<number, string | null>();
  for (const c of classifications) classStatusBySku.set(c.sku_id, c.status);

  type Bucketed = MirrorPick & { __bucket: Bucket };
  const universe: Bucketed[] = [];
  for (const r of mirror) {
    const b = bucketize(r, today);
    if (b) universe.push({ ...r, __bucket: b });
  }

  const bySource: Record<Bucket, { total: number; publishable: number; held: number }> = {
    k2k_live:    { total: 0, publishable: 0, held: 0 },
    t2_catalog:  { total: 0, publishable: 0, held: 0 },
    t3_catalog:  { total: 0, publishable: 0, held: 0 },
  };
  const byVendor = new Map<string, { total: number; publishable: number }>();
  for (const r of universe) {
    const slot = bySource[r.__bucket];
    slot.total += 1;
    const status = classStatusBySku.get(r.id);
    if (status === 'perfect' || status === 'publishable') slot.publishable += 1;
    else slot.held += 1;
    const v = r.vendor ?? '(unknown)';
    const vs = byVendor.get(v) ?? { total: 0, publishable: 0 };
    vs.total += 1;
    if (status === 'perfect' || status === 'publishable') vs.publishable += 1;
    byVendor.set(v, vs);
  }
  const totalAll = bySource.k2k_live.total + bySource.t2_catalog.total + bySource.t3_catalog.total;
  const pubAll = bySource.k2k_live.publishable + bySource.t2_catalog.publishable + bySource.t3_catalog.publishable;
  const topVendors = Array.from(byVendor.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([vendor, s]) => ({
      vendor,
      total: s.total,
      pubPct: s.total > 0 ? Math.round((s.publishable / s.total) * 100) : 0,
    }));

  // ── UC-D-101: Live going down DoD ──────────────────────────────────────
  const yesterdayLive = await probeYesterdayLive(backup, addDaysISO(today, -1));
  const todayLive = bySource.k2k_live.total;
  let dodBadge: 'pending' | 'down' | 'flat' = 'pending';
  let dodDelta = 0;
  let dodPct = 0;
  if (yesterdayLive != null) {
    dodDelta = todayLive - yesterdayLive;
    dodPct = yesterdayLive > 0 ? (dodDelta / yesterdayLive) * 100 : 0;
    dodBadge = (dodDelta < 0 || dodPct < -5) ? 'down' : 'flat';
  }

  // ── UC-D-102: Above-formula vendor flag ────────────────────────────────
  // Rough flag, not canonical pricing. Skip rows where farm_cost is null.
  let aboveFormulaCount = 0;
  for (const r of universe) {
    const cost = toNum(r.farm_cost);
    const px = toNum(r.price);
    if (cost == null || px == null) continue;
    const expected = (cost / FLAG_GPM_DENOM) + FLAG_DELIVERY_PER_STEM;
    if (px > expected * FLAG_TOLERANCE) aboveFormulaCount += 1;
  }

  // ── UC-D-103: Top sellers L30D ─────────────────────────────────────────
  const topSellers = await fetchTopSellers(backup, classifications);

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
          publishable universe (Perfect Inventory Bar v2.1 · Magic Flowers in T2/T3 only)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 lg:divide-x divide-slate-100">
        {/* ── Widget A: UC-D-100 Counts by source ── */}
        <div className="p-4">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">
            Counts by source
          </div>
          <div className="text-2xl font-bold text-slate-900 leading-none">
            {totalAll.toLocaleString()}
            <span className="text-xs font-medium text-emerald-700 ml-2">
              {pubAll.toLocaleString()} publishable
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            <SourceRow
              label="K2K live"
              total={bySource.k2k_live.total}
              pub={bySource.k2k_live.publishable}
              held={bySource.k2k_live.held}
              href={url({ source: 'k2k_live' })}
              tone="emerald"
            />
            <SourceRow
              label="T2 (+5–180d)"
              total={bySource.t2_catalog.total}
              pub={bySource.t2_catalog.publishable}
              held={bySource.t2_catalog.held}
              href={url({ source: 't2' })}
              tone="blue"
            />
            <SourceRow
              label="T3 (+14–180d)"
              total={bySource.t3_catalog.total}
              pub={bySource.t3_catalog.publishable}
              held={bySource.t3_catalog.held}
              href={url({ source: 't3' })}
              tone="slate"
            />
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

        {/* ── Widget C: UC-D-102 Above-formula ── */}
        <div className="p-4">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">
            Above-formula price
          </div>
          <div className="text-2xl font-bold leading-none">
            {aboveFormulaCount > 0 ? (
              <span className="text-amber-700">{aboveFormulaCount.toLocaleString()}</span>
            ) : (
              <span className="text-emerald-700">0</span>
            )}
            <span className="text-[11px] font-medium text-slate-500 ml-1.5">SKUs flagged</span>
          </div>
          <div className="mt-3">
            {aboveFormulaCount > 0 ? (
              <Link
                href={url({ flag: 'above-formula' })}
                className="inline-flex items-center text-[11px] px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold hover:bg-amber-100"
              >
                {aboveFormulaCount} priced above formula → deep dive
              </Link>
            ) : (
              <span className="inline-flex items-center text-[11px] px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                All within tolerance
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-3 leading-snug">
            Quick flag only. Formula proxy = (farm_cost / 0.67) + $0.50/stem; canonical pricing lives in catalog-model.ts.
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
