// AdminTodayPanel -- "needs your attention" list on /admin.
// v2 | 2026-05-21 | Job_PM [V8 SHADOW]
//
// Rewritten to show real catalog priorities derived from actual DB data:
//   P0 — vendor GPM below 33% target (derived from mirror + box_master + pricing_constants)
//   P1 — cost data gaps (unreliable sources)
//   P2 — stamp work (Facu-reviewed costs without verification stamp)
//   P2 — admin approval queue (awaiting_facu proposals)
//   Also: rose_queue open count as an info banner.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import {
  ACTIVE_PRICING_MARKET,
  requireNumericPricingConstant,
  type PricingConstantValueRow,
} from '@/lib/pricing-constants';

// ── types ─────────────────────────────────────────────────────────────────────

interface MirrorRow {
  vendor: string | null;
  price: number | string | null;
  farm_cost: number | string | null;
  box_type: string | null;
  units_per_box: number | string | null;
  cost_source: string | null;
  tier: string | null;
}

interface BoxMasterRow {
  box_type: string;
  weight_kg: number | string | null;
}

interface ProposalRow {
  id: string;
  type: string;
  target_table: string;
  target_id: string | null;
  source_agent: string | null;
  proposed_at: string;
  payload: Record<string, unknown> | null;
}

type Priority = 'P0' | 'P1' | 'P2';

// ── constants ─────────────────────────────────────────────────────────────────

const PRIORITY_CLS: Record<Priority, string> = {
  P0: 'bg-red-100 text-red-800',
  P1: 'bg-amber-100 text-amber-800',
  P2: 'bg-slate-100 text-slate-600',
};

const UNRELIABLE_SOURCES = new Set([
  'google_sheet_benchmark',
  'PENDING_MF_PRICELIST',
  'OLD_Workshop_Future',
  'catalog_Flodecol_Nov25',
  'catalog_Nov25',
  'vendor_xls',
]);

const GPM_TARGET = 0.33;

// ── helpers ───────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function labelFor(row: ProposalRow): string {
  const payload = row.payload ?? {};
  const explicit = typeof payload.summary === 'string' ? payload.summary : null;
  if (explicit) return explicit;
  const tgt = row.target_id
    ? ` -> ${row.target_table}#${row.target_id}`
    : ` -> ${row.target_table}`;
  const by = row.source_agent ? ` (by ${row.source_agent})` : '';
  return `${row.type}${tgt}${by}`;
}

// ── vendor GPM summary ────────────────────────────────────────────────────────

interface VendorSummary {
  vendor: string;
  count: number;
  gpmSum: number;
  belowCount: number;
}

function computeVendorGpm(
  rows: MirrorRow[],
  boxWeightMap: Map<string, number>,
  fedexRate: number,
  fuelMult: number,
): Map<string, VendorSummary> {
  const map = new Map<string, VendorSummary>();
  for (const r of rows) {
    const vendor = r.vendor ?? 'Unknown';
    const price = toNum(r.price);
    const cost = toNum(r.farm_cost);
    const upb = toNum(r.units_per_box);
    if (price == null || cost == null || upb == null || upb <= 0) continue;
    const bw = r.box_type ? (boxWeightMap.get(r.box_type) ?? 0) : 0;
    const shipping = (Math.ceil(bw) * fedexRate * fuelMult) / upb;
    const gpm = (price - cost - shipping) / price;
    if (!map.has(vendor)) {
      map.set(vendor, { vendor, count: 0, gpmSum: 0, belowCount: 0 });
    }
    const s = map.get(vendor)!;
    s.count += 1;
    s.gpmSum += gpm;
    if (gpm < GPM_TARGET) s.belowCount += 1;
  }
  return map;
}

// ── cost-source gap analysis ──────────────────────────────────────────────────

interface SourceGaps {
  pendingMF: number;
  benchmarkOnly: number;
  otherStale: number;
  facuReviewed: number;
}

function computeSourceGaps(rows: MirrorRow[]): SourceGaps {
  let pendingMF = 0;
  let benchmarkOnly = 0;
  let otherStale = 0;
  let facuReviewed = 0;
  for (const r of rows) {
    const src = r.cost_source ?? null;
    if (!src) continue;
    if (src === 'PENDING_MF_PRICELIST') {
      pendingMF += 1;
    } else if (src === 'google_sheet_benchmark') {
      benchmarkOnly += 1;
    } else if (
      UNRELIABLE_SOURCES.has(src) &&
      src !== 'PENDING_MF_PRICELIST' &&
      src !== 'google_sheet_benchmark'
    ) {
      otherStale += 1;
    }
    if (src.startsWith('Facu_')) {
      facuReviewed += 1;
    }
  }
  return { pendingMF, benchmarkOnly, otherStale, facuReviewed };
}

// ── component ─────────────────────────────────────────────────────────────────

export default async function AdminTodayPanel(): Promise<ReactNode> {
  const svc = getBackupServiceClient();

  const [mirrorRes, boxRes, constantsRes, queueRes, proposalsRes] = await Promise.all([
    svc
      .from('floropolis_inventory_mirror')
      .select('vendor, price, farm_cost, box_type, units_per_box, cost_source, tier')
      .limit(2000),
    svc.from('box_master').select('box_type, weight_kg'),
    svc
      .from('pricing_constants')
      .select('id, market, value_numeric')
      .eq('market', ACTIVE_PRICING_MARKET),
    svc
      .from('rose_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
    svc
      .from('admin_proposals')
      .select('id, type, target_table, target_id, source_agent, proposed_at, payload')
      .eq('status', 'awaiting_facu')
      .order('proposed_at', { ascending: false })
      .limit(5),
  ]);

  if (mirrorRes.error) {
    return (
      <section className="bg-white rounded-2xl border border-red-200 p-5">
        <h2 className="text-sm font-bold text-red-900 mb-1">Today</h2>
        <p className="text-xs text-red-700">
          Failed to load catalog data: {mirrorRes.error.message}
        </p>
      </section>
    );
  }

  // ── parse constants ──
  const constants = (constantsRes.data ?? []) as PricingConstantValueRow[];
  const fedexRate = requireNumericPricingConstant(constants, 'fedex_rate_per_kg');
  const fuelMult = requireNumericPricingConstant(constants, 'fuel_surcharge_mult');

  // ── box weight map ──
  const boxWeightMap = new Map<string, number>();
  for (const b of (boxRes.data ?? []) as BoxMasterRow[]) {
    const w = toNum(b.weight_kg);
    if (w != null) boxWeightMap.set(b.box_type, w);
  }

  const mirrorRows = (mirrorRes.data ?? []) as MirrorRow[];

  // ── vendor GPM ──
  const vendorMap = computeVendorGpm(mirrorRows, boxWeightMap, fedexRate, fuelMult);
  const vendorsBelow = Array.from(vendorMap.values()).filter((v) => v.belowCount > 0);
  vendorsBelow.sort((a, b) => b.belowCount - a.belowCount);

  // ── source gaps ──
  const gaps = computeSourceGaps(mirrorRows);

  // ── rose queue count ──
  const roseOpenCount = queueRes.count ?? 0;

  // ── proposals ──
  const proposals = (proposalsRes.data ?? []) as ProposalRow[];

  // ── total item count for header ──
  const p0Count = vendorsBelow.length;
  const p1Count =
    (gaps.pendingMF > 0 ? 1 : 0) +
    (gaps.benchmarkOnly > 0 ? 1 : 0) +
    (gaps.otherStale > 0 ? 1 : 0);
  const p2StampCount = gaps.facuReviewed > 0 ? 1 : 0;
  const p2QueueCount = proposals.length;
  const totalItems = p0Count + p1Count + p2StampCount + (p2QueueCount > 0 ? 1 : 0);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-900">Needs your attention</h2>
        <span className="text-xs text-slate-500">{totalItems} items</span>
      </div>

      {/* Rose queue banner */}
      {roseOpenCount > 0 && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-slate-100 text-xs text-slate-600 flex items-center justify-between">
          <span>
            Rose queue: <span className="font-semibold text-slate-800">{roseOpenCount.toLocaleString()}</span> open
            {' · '}flag gate cards to route to Rose →
          </span>
          <Link
            href="/admin/catalog"
            className="text-xs px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium shrink-0 ml-3"
          >
            Catalog
          </Link>
        </div>
      )}

      {/* ── PRICING — P0 ── */}
      {vendorsBelow.length > 0 && (
        <>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
            Pricing (P0)
          </div>
          <div className="space-y-1.5 mb-2">
            {vendorsBelow.map((v) => {
              const avgGpm = (v.gpmSum / v.count) * 100;
              return (
                <div
                  key={v.vendor}
                  className="flex items-start gap-3 p-3 rounded-lg border-l-2 border-red-400 bg-red-50/40"
                >
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${PRIORITY_CLS.P0}`}
                  >
                    P0
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-900">
                      {v.vendor} —{' '}
                      <span className="font-medium">{v.belowCount} SKUs</span> below target
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      avg margin {avgGpm.toFixed(1)}% · target 33%
                    </div>
                  </div>
                  <Link
                    href={`/admin/catalog?vendor=${encodeURIComponent(v.vendor)}&tab=improvement-queue`}
                    className="text-xs px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium shrink-0"
                  >
                    Review
                  </Link>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── DATA GAPS — P1 ── */}
      {p1Count > 0 && (
        <>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 mt-4">
            Data gaps (P1)
          </div>
          <div className="space-y-1.5 mb-2">
            {gaps.pendingMF > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg border-l-2 border-amber-400 bg-amber-50/40">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${PRIORITY_CLS.P1}`}
                >
                  P1
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-900">
                    {gaps.pendingMF} SKUs — Magic Flowers costs pending
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    get MF pricelist · unblock these margins
                  </div>
                </div>
                <Link
                  href="/admin/catalog?vendor=Magic+Flowers"
                  className="text-xs px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium shrink-0"
                >
                  View
                </Link>
              </div>
            )}
            {gaps.benchmarkOnly > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg border-l-2 border-amber-400 bg-amber-50/40">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${PRIORITY_CLS.P1}`}
                >
                  P1
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-900">
                    {gaps.benchmarkOnly} SKUs — benchmark costs only
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    not confirmed vendor quotes
                  </div>
                </div>
                <Link
                  href="/admin/catalog"
                  className="text-xs px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium shrink-0"
                >
                  View
                </Link>
              </div>
            )}
            {gaps.otherStale > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg border-l-2 border-amber-400 bg-amber-50/40">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${PRIORITY_CLS.P1}`}
                >
                  P1
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-900">
                    {gaps.otherStale} SKUs — costs from stale catalogs
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    catalog data from Nov 2025 or older
                  </div>
                </div>
                <Link
                  href="/admin/catalog"
                  className="text-xs px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium shrink-0"
                >
                  View
                </Link>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── STAMP WORK — P2 ── */}
      {gaps.facuReviewed > 0 && (
        <>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 mt-4">
            Stamp work (P2)
          </div>
          <div className="space-y-1.5 mb-2">
            <div className="flex items-start gap-3 p-3 rounded-lg border-l-2 border-slate-200 bg-slate-50/40">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${PRIORITY_CLS.P2}`}
              >
                P2
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-900">
                  ~{gaps.facuReviewed} SKUs — Facu-reviewed costs ready to stamp
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  verified source, just needs the stamp
                </div>
              </div>
              <Link
                href="/admin/catalog"
                className="text-xs px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium shrink-0"
              >
                Stamp
              </Link>
            </div>
          </div>
        </>
      )}

      {/* ── ADMIN QUEUE — P2 ── */}
      {proposals.length > 0 && (
        <>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 mt-4">
            Admin queue (P2)
          </div>
          <div className="space-y-1.5">
            {proposals.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-3 p-3 rounded-lg border-l-2 border-slate-200 bg-slate-50/40"
              >
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${PRIORITY_CLS.P2}`}
                >
                  P2
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-900 truncate">{labelFor(r)}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {relTime(r.proposed_at)} · type: {r.type}
                  </div>
                </div>
                <Link
                  href={`/admin/catalog/approval-queue?status=awaiting_facu#${r.id}`}
                  className="text-xs px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium shrink-0"
                >
                  Open
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {totalItems === 0 && (
        <div className="px-3 py-8 text-center text-xs text-slate-400">
          Inbox zero. Nothing awaiting your attention right now.
        </div>
      )}
    </section>
  );
}
