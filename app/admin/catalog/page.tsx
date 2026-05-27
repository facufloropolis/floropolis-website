// Admin Unified Catalog -- catalog-v5: mockup-faithful 12-column rebuild.
// v5.1 | 2026-05-20 | Job_PM catalog-v5 [V8 SHADOW] — 10 changes batch
//
// What changed (vs v4 / commit ae662dc9):
//   v4 shipped a 7-column "Improvement queue" surface (SKU / Tier+Vendor /
//   Importance / Quality / Priority / What's needed / Action). Facu rated the
//   /mockups/admin-catalog version "100 veces mejor" -- 12 mockup columns,
//   summary banner, filter row, bulk-actions row, tabs. v5 rebuilds the page to
//   match the mockup visually while preserving the v4 model (universe + weighted
//   quality_score + importance_score from the featured framework).
//
// Visual source-of-truth: app/mockups/admin-catalog/page.tsx
// Spec: catalog_BRD_v0.3_section_discovery_2026-05-19.md UC-104 (14 cols
//   collapsed to 12 because mockup merged Margin $/% into a single GPM column).
//
// Universe + model: lib/admin/catalog-model.ts (buildCatalog).
// Importance seed: lib/admin/featured-scores-seed.ts.
//
// Columns (left-to-right, mockup parity):
//   1.  SKU              -- mono id link + name + IMPORTANCE STAR badge below (7 seeded)
//   2.  Quality Family   -- variety + length + unit
//   3.  Vendor           -- vendor name + country (when present)
//   4.  Box              -- box_type + verified|needs-verify
//   5.  Cost             -- farm_cost ($X.XX, right-aligned)
//   6.  Delivery         -- per-stem shipping cost (NOT arrival date; mockup
//                           col 6 shows a $ value, confirmed by reading the
//                           mockup's cell rendering at line 302:
//                           `formatPrice(sku.delivery_per_stem)`)
//   7.  Price            -- actual_price ($X.XX, bold)
//   8.  GPM              -- computed (price - cost - shipping)/price, colored
//   9.  Sources          -- K2K live | T2 | T3 badges
//   10. Avail            -- total_stems + boxes_available (when units_per_box)
//   11. Visibility       -- live|hidden|draft pill + QUALITY SCORE numeric badge inline
//   12. Flags            -- up to 3 failing gates as small pills + "+N more"
//
// Tabs above the table: Improvement queue (default) | Perfect | All.
// Bulk-action buttons render disabled (UI intent only -- executors don't exist
// yet for override-price / change-vendor / add-to-campaign).

// ============================================================================
// RACI ENFORCEMENT — READ BEFORE EDITING THIS FILE
// ============================================================================
//
// This file is DISPLAY + FILTER only. It has ZERO business arithmetic authority.
//
// PERMITTED in this file:
//   - Reading fields from CatalogV2Row (all values pre-computed by buildCatalog)
//   - Formatting helpers (fmtUsd, fmtGpm) — string conversion only, no business logic
//   - Filter/sort logic that compares CatalogV2Row fields (no raw arithmetic)
//   - UI decisions: color classes from gpm_band / status_band / visibility
//   - Fetching DB tables and passing them to buildCatalog — no post-processing
//
// PROHIBITED in this file:
//   - Any arithmetic (*,/,+,-) on Rose's raw inputs: price, farm_cost, box_weight_kg,
//     shipping_per_stem, fedex_rate, fuel_surcharge, stems_per_box
//   - Recalculating any value that buildCatalog already produces
//   - Hardcoding business constants (rates, weights, thresholds, tier windows)
//
// If a computed display value is missing → add it to CatalogV2Row in catalog-model.ts.
// If a config value is missing → add it to the relevant DB table (Rose owns those tables).
//
// RACI: Rose (raw data) → catalog-model.ts (derives CatalogV2Row) → this file (renders)
//       Facu approves config changes; Rose validates before they go live in the DB.
//
// ============================================================================

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import WiringSection from '@/components/admin/WiringSection';
import MockupLinkBanner from '@/components/admin/MockupLinkBanner';
import { getWiringForPage } from '@/lib/admin/wiring';
import {
  buildCatalog,
  GPM_BAND_CLS,
  VISIBILITY_BADGE_CLS,
  PUBLICATION_STATUS_CLS,
  PUBLICATION_STATUS_LABEL,
  type BoxMasterRow,
  type CatalogV2Row,
  type ClassificationRow,
  type MirrorRow,
  type PricingConstantRow,
  type PublicationStatus,
  type QualityThresholdRow,
  type QualityWeightRow,
} from '@/lib/admin/catalog-model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Tier visibility window from DB — accepted config drives the Avail cell indicator.
// tier values: 'T2' | 'T3' | 'live' (K2K live). Key in map: `${tier}|${origin_country}`.
interface TierWindowRow {
  tier: string;
  origin_country: string;
  earliest_delivery_days: number;
  latest_delivery_days: number;
}

type TabKey = 'improvement-queue' | 'perfect' | 'all';
type SortKey =
  | 'priority'
  | 'quality'
  | 'importance'
  | 'family'
  | 'vendor'
  | 'name'
  | 'box'
  | 'cost'
  | 'delivery'
  | 'price'
  | 'gpm'
  | 'margin'
  | 'sources'
  | 'avail'
  | 'visibility';
type SortDir = 'asc' | 'desc';

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    vendor?: string;
    source?: string;
    category?: string;
    visibility?: string;
    gpm?: string;
    flag?: string;
    sort?: string;
    page?: string;
    view?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 100;

const SOURCE_BADGE_CLS = {
  k2k_live: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  t2: 'bg-blue-50 text-blue-700 border-blue-200',
  t3: 'bg-slate-50 text-slate-600 border-slate-200',
} as const;

const SOURCE_LABELS = {
  k2k_live: 'K2K live',
  t2: 'T2',
  t3: 'T3',
} as const;

// Quality score badge color thresholds (green/amber/red embedded inline with
// Visibility pill, per the spec's "embed quality_score inline" rule).
function qualityBadgeCls(score: number | null, perfectMin: number): string {
  if (score == null)
    return 'bg-slate-100 text-slate-500 border border-slate-200';
  if (score >= perfectMin)
    return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  if (score >= 75)
    return 'bg-amber-100 text-amber-800 border border-amber-200';
  return 'bg-red-100 text-red-800 border border-red-200';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTab(v: string | undefined): TabKey {
  if (v === 'perfect' || v === 'all') return v;
  return 'improvement-queue';
}

function parseSort(raw: string | undefined, tab: TabKey): { key: SortKey; dir: SortDir } {
  if (!raw) {
    if (tab === 'improvement-queue') return { key: 'priority', dir: 'desc' };
    if (tab === 'perfect') return { key: 'importance', dir: 'desc' };
    return { key: 'vendor', dir: 'asc' };
  }
  const [keyRaw, dirRaw] = raw.split(':');
  const allowed: SortKey[] = [
    'priority', 'quality', 'importance', 'family', 'vendor', 'name',
    'box', 'cost', 'delivery', 'price', 'gpm', 'margin', 'sources', 'avail', 'visibility',
  ];
  const key: SortKey = (allowed as string[]).includes(keyRaw)
    ? (keyRaw as SortKey)
    : 'priority';
  const dir: SortDir = dirRaw === 'asc' ? 'asc' : 'desc';
  return { key, dir };
}

function fmtUsd(n: number | null): string {
  if (n == null) return '--';
  return `$${n.toFixed(2)}`;
}

function fmtGpm(n: number | null): string {
  if (n == null) return '--';
  return `${(n * 100).toFixed(0)}%`;
}

function buildUrl(
  base: Record<string, string | undefined>,
  override: Record<string, string | undefined>,
): string {
  const merged: Record<string, string | undefined> = { ...base, ...override };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v && v !== '' && v !== 'all') params.set(k, v);
  }
  const q = params.toString();
  return q ? `/admin/catalog?${q}` : '/admin/catalog';
}

function sortRows(rows: CatalogV2Row[], key: SortKey, dir: SortDir): CatalogV2Row[] {
  const sign = dir === 'asc' ? 1 : -1;
  const accessor = (r: CatalogV2Row): number | string => {
    switch (key) {
      case 'priority': return r.priority_to_fix;
      case 'quality': return r.quality_score ?? -1;
      case 'importance': return r.importance_score ?? -1;
      case 'family': return (r.variety || r.category || '').toLowerCase();
      case 'vendor': return r.vendor.toLowerCase();
      case 'name': return r.name.toLowerCase();
      case 'box': return (r.box_type ?? '').toLowerCase();
      case 'cost': return r.farm_cost ?? -1;
      case 'delivery': return r.shipping_per_stem ?? -1;
      case 'price': return r.price ?? -1;
      case 'gpm': return r.gpm ?? -1;
      case 'margin': return r.margin_per_stem ?? -999;
      case 'sources': return r.buckets.includes('k2k_live') ? 3 : r.buckets.includes('t2') ? 2 : r.buckets.includes('t3') ? 1 : 0;
      case 'avail': return r.total_stems;
      case 'visibility': return r.visibility;
      default: return 0;
    }
  };
  return [...rows].sort((a, b) => {
    const aa = accessor(a);
    const bb = accessor(b);
    if (typeof aa === 'number' && typeof bb === 'number') return (aa - bb) * sign;
    return String(aa).localeCompare(String(bb)) * sign;
  });
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata = {
  title: 'Catalog | Floropolis Admin',
  robots: { index: false, follow: false },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminCatalogPage({ searchParams }: PageProps) {
  // Admin gate -----------------------------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect('/');

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'admin') {
    redirect('/');
  }

  // Parse search params --------------------------------------------------
  const sp = await searchParams;
  const viewMode: 'today' | 'target' = (sp.view === 'target') ? 'target' : 'today';
  const tab = parseTab(sp.tab);
  // In target mode, default tab is 'all' instead of 'improvement-queue'
  const effectiveTab: TabKey = (!sp.tab && viewMode === 'target') ? 'all' : tab;
  const search = (sp.q ?? '').trim();
  const vendorFilter = (sp.vendor ?? 'all').trim();
  const sourceFilter = (sp.source ?? 'all').trim();
  const categoryFilter = (sp.category ?? 'all').trim();
  const visibilityFilter = (sp.visibility ?? 'all').trim();
  const gpmFilter = (sp.gpm ?? 'all').trim();
  const flagFilter = (sp.flag ?? 'all').trim();
  const pageNum = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const sort = parseSort(sp.sort, effectiveTab);
  // Tier window compliance: compute once per request, used in Avail cell.
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Change 10: count active (non-default) filters
  const activeFilterCount = [
    search ? 1 : 0,
    effectiveTab !== 'improvement-queue' ? 1 : 0,
    vendorFilter !== 'all' ? 1 : 0,
    sourceFilter !== 'all' ? 1 : 0,
    categoryFilter !== 'all' ? 1 : 0,
    visibilityFilter !== 'all' ? 1 : 0,
    gpmFilter !== 'all' ? 1 : 0,
    flagFilter !== 'all' ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const rawFilters: Record<string, string | undefined> = {
    tab: effectiveTab !== 'improvement-queue' ? effectiveTab : undefined,
    q: search || undefined,
    vendor: vendorFilter !== 'all' ? vendorFilter : undefined,
    source: sourceFilter !== 'all' ? sourceFilter : undefined,
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    visibility: visibilityFilter !== 'all' ? visibilityFilter : undefined,
    gpm: gpmFilter !== 'all' ? gpmFilter : undefined,
    flag: flagFilter !== 'all' ? flagFilter : undefined,
    sort: sp.sort,
    view: viewMode === 'target' ? 'target' : undefined,
  };

  const backup = getBackupServiceClient();

  // Fetch mirror ---------------------------------------------------------
  let mirrorRows: MirrorRow[] = [];
  try {
    const { data, error } = await backup
      .from('floropolis_inventory_mirror')
      .select(
        'id, name, vendor, tier, category, variety, color, length, unit, price, farm_cost, cost_source, cost_verified_at, stock, total_stems, units_per_box, box_type, margin_status, has_open_price_alert, live, active, arrival_date',
      )
      .limit(5000);
    if (error) console.error('[admin/catalog] mirror fetch error:', error);
    mirrorRows = (data ?? []) as unknown as MirrorRow[];
  } catch (err) {
    console.error('[admin/catalog] mirror threw:', err);
  }

  // Fetch classifications ------------------------------------------------
  const classifications: ClassificationRow[] = [];
  try {
    if (mirrorRows.length > 0) {
      const ids = mirrorRows.map((r) => r.id).filter((id) => Number.isFinite(id));
      const chunks: number[][] = [];
      for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
      for (const chunk of chunks) {
        const { data, error } = await backup
          .from('catalog_classifications')
          .select('sku_id, status, gate_score, failing_gates, vendor, tier, variety')
          .in('sku_id', chunk);
        if (error) {
          console.error('[admin/catalog] classifications error:', error);
          continue;
        }
        classifications.push(...((data ?? []) as unknown as ClassificationRow[]));
      }
    }
  } catch (err) {
    console.error('[admin/catalog] classifications threw:', err);
  }

  // Fetch weights + thresholds ------------------------------------------
  let weights: QualityWeightRow[] = [];
  let thresholds: QualityThresholdRow[] = [];
  try {
    const { data, error } = await backup
      .from('catalog_quality_weights')
      .select('gate_id, display_label, category, weight, tier, description, evaluated, updated_at, updated_by');
    if (error) console.error('[admin/catalog] weights error:', error);
    weights = (data ?? []) as unknown as QualityWeightRow[];
  } catch (err) {
    console.error('[admin/catalog] weights threw:', err);
  }
  try {
    const { data, error } = await backup
      .from('catalog_quality_thresholds')
      .select('threshold_id, value, description, updated_at, updated_by');
    if (error) console.error('[admin/catalog] thresholds error:', error);
    thresholds = (data ?? []) as unknown as QualityThresholdRow[];
  } catch (err) {
    console.error('[admin/catalog] thresholds threw:', err);
  }

  // Fetch box_master + pricing_constants (for GPM compute) --------------
  let boxMaster: BoxMasterRow[] = [];
  try {
    const { data, error } = await backup
      .from('box_master')
      .select('box_type, weight_kg, description, validated_by, validated_at, active');
    if (error) console.error('[admin/catalog] box_master error:', error);
    boxMaster = (data ?? []) as unknown as BoxMasterRow[];
  } catch (err) {
    console.error('[admin/catalog] box_master threw:', err);
  }
  let pricingConstants: PricingConstantRow[] = [];
  try {
    const { data, error } = await backup
      .from('pricing_constants')
      .select('id, value_numeric');
    if (error) console.error('[admin/catalog] pricing_constants error:', error);
    pricingConstants = (data ?? []) as unknown as PricingConstantRow[];
  } catch (err) {
    console.error('[admin/catalog] pricing_constants threw:', err);
  }

  // Fetch tier visibility windows (accepted=true only — source of truth for Avail cell) -----
  // Key: `${tier}|${origin_country}` → { min, max }. tier values: 'T2'|'T3'|'live' (K2K).
  const tierWindowMap = new Map<string, { min: number; max: number }>();
  try {
    const { data, error } = await backup
      .from('tier_visibility_windows')
      .select('tier, origin_country, earliest_delivery_days, latest_delivery_days')
      .eq('accepted', true);
    if (error) {
      console.error('[admin/catalog] tier_visibility_windows error:', error);
    } else {
      for (const w of (data ?? []) as unknown as TierWindowRow[]) {
        tierWindowMap.set(`${w.tier}|${w.origin_country}`, {
          min: w.earliest_delivery_days,
          max: w.latest_delivery_days,
        });
      }
    }
  } catch (err) {
    console.error('[admin/catalog] tier_visibility_windows threw:', err);
  }

  // Build catalog rows ---------------------------------------------------
  const built = buildCatalog({
    mirror: mirrorRows,
    classifications,
    weights,
    thresholds,
    boxMaster,
    pricingConstants,
  });
  const { rows: universeRows, summary, perfect_min_score } = built;

  // Facets ---------------------------------------------------------------
  const vendorSet = new Set<string>();
  const categorySet = new Set<string>();
  for (const r of universeRows) {
    if (r.vendor) vendorSet.add(r.vendor);
    if (r.category) categorySet.add(r.category);
  }
  const allVendors = Array.from(vendorSet).sort();
  const allCategories = Array.from(categorySet).sort();

  // Distinct countries (best-effort -- mirror schema doesn't carry country
  // today; the count surfaces vendor count instead).
  const countryCount = 0; // TODO: when mirror.country exists, count distinct.

  // Tab filter -----------------------------------------------------------
  const inTab = (r: CatalogV2Row): boolean => {
    if (effectiveTab === 'perfect') return r.publication_status === 'perfect';
    if (effectiveTab === 'improvement-queue') return r.publication_status !== 'perfect';
    return true;
  };
  const tabCounts = {
    'improvement-queue': universeRows.filter((r) => r.publication_status !== 'perfect').length,
    perfect: universeRows.filter((r) => r.publication_status === 'perfect').length,
    all: universeRows.length,
  };

  // Apply facets + search ------------------------------------------------
  let filtered = universeRows.filter((r) => {
    if (!inTab(r)) return false;
    if (vendorFilter !== 'all' && r.vendor !== vendorFilter) return false;
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    if (visibilityFilter !== 'all' && r.visibility !== visibilityFilter) return false;

    if (sourceFilter !== 'all') {
      const hasSource = r.buckets.includes(sourceFilter as 'k2k_live' | 't2' | 't3');
      if (!hasSource) return false;
    }

    if (gpmFilter !== 'all') {
      if (gpmFilter === 'green' && r.gpm_band !== 'green') return false;
      if (gpmFilter === 'amber' && r.gpm_band !== 'amber') return false;
      if (gpmFilter === 'red' && r.gpm_band !== 'red') return false;
      if (gpmFilter === 'none' && r.gpm_band !== null) return false;
    }

    if (flagFilter !== 'all') {
      if (flagFilter === 'price_alert' && !r.has_open_price_alert) return false;
      if (flagFilter === 'missing_cost' && r.farm_cost != null) return false;
      if (flagFilter === 'no_box_dims' && r.box_verified) return false;
      if (flagFilter === 'failed_gates' && r.failed_gates.length === 0) return false;
    }

    if (search) {
      const blob = `${r.name} ${r.vendor} ${r.variety} ${r.color ?? ''} ${r.category} ${r.id}`.toLowerCase();
      if (!blob.includes(search.toLowerCase())) return false;
    }
    return true;
  });
  filtered = sortRows(filtered, sort.key, sort.dir);

  // Paginate -------------------------------------------------------------
  const filteredTotal = filtered.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const page = Math.min(pageNum, totalPages);
  const sliceStart = (page - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(sliceStart, sliceStart + PAGE_SIZE);

  // Wiring ---------------------------------------------------------------
  const wiringEntry = getWiringForPage('/admin/catalog');
  const wm = (id: string) =>
    wiringEntry?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-10">
        <MockupLinkBanner mockupHref="/mockups/admin-catalog" pageLabel="/admin/catalog" />
        {/* Breadcrumb */}
        <nav className="text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
          <span>Admin</span>
          <span className="mx-1.5">/</span>
          <span className="text-slate-700 font-medium">Catalog</span>
        </nav>

        {/* Header + state toggle */}
        <WiringSection level={wm('summary-tiles').level} note={wm('summary-tiles').note} id="summary-tiles">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Unified Catalog</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {summary.universe.total.toLocaleString()} SKUs across {allVendors.length}{' '}
                vendors{countryCount > 0 ? ` / ${countryCount} countries` : ''}.{' '}
                <span className="text-emerald-700 font-medium">
                  {summary.universe.k2k_live} K2K live
                </span>{' / '}
                <span className="text-blue-700 font-medium">
                  {summary.universe.t2} T2
                </span>{' / '}
                <span className="text-slate-600 font-medium">
                  {summary.universe.t3} T3
                </span>{' . '}
                <span className="text-emerald-700">
                  {universeRows.filter((r) => r.visibility === 'live').length} live
                </span>{' / '}
                <span className="text-slate-500">
                  {universeRows.filter((r) => r.visibility === 'hidden').length} hidden
                </span>{' / '}
                <span className="text-amber-700">
                  {universeRows.filter((r) => r.visibility === 'draft').length} draft
                </span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {viewMode === 'target'
                  ? `Projected state: assumes all improvement-queue items resolved.`
                  : `Reality per Rose's layer state: gaps visible, ghost still alive`}
              </p>
              {viewMode === 'target' && (() => {
                const todayPublishable = universeRows.filter((r) => r.publication_status !== 'blocked').length;
                const targetPublishable = universeRows.length;
                const todayPct = universeRows.length > 0 ? Math.round((todayPublishable / universeRows.length) * 100) : 0;
                return (
                  <div className="mt-2 flex items-center gap-4 text-xs">
                    <span className="text-slate-500">Today:</span>
                    <span className="font-semibold text-slate-700">{todayPublishable}/{universeRows.length} publishable ({todayPct}%)</span>
                    <span className="text-slate-400">→</span>
                    <span className="text-slate-500">Target:</span>
                    <span className="font-semibold text-emerald-700">{targetPublishable}/{universeRows.length} publishable (100%)</span>
                    <span className="text-[11px] text-slate-400">if all improvement-queue items resolved</span>
                  </div>
                );
              })()}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                <Link
                  href={buildUrl(rawFilters, { view: undefined })}
                  className={viewMode === 'today'
                    ? 'px-3 py-1 text-xs font-semibold rounded-md bg-emerald-600 text-white'
                    : 'px-3 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-50'}
                >
                  Today
                </Link>
                <Link
                  href={buildUrl(rawFilters, { view: 'target' })}
                  className={viewMode === 'target'
                    ? 'px-3 py-1 text-xs font-semibold rounded-md bg-emerald-600 text-white'
                    : 'px-3 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-50'}
                >
                  Target state
                </Link>
              </div>
              <p className="text-[11px] text-slate-400 max-w-xs text-right">
                {summary.importance_covered_count} named varieties scored (research-backed);{' '}
                {summary.universe.total - summary.importance_covered_count} at commodity default.
              </p>
            </div>
          </div>
          {/* Change 1: Publication status distribution bar */}
          {(() => {
            const order: PublicationStatus[] = ['perfect', 'publishable', 'blocked'];
            const cls: Record<PublicationStatus, string> = {
              perfect:     'text-emerald-700',
              publishable: 'text-amber-600',
              blocked:     'text-red-700',
            };
            const labels: Record<PublicationStatus, string> = {
              perfect:     'perfect',
              publishable: 'publishable',
              blocked:     'blocked',
            };
            const counts: Record<PublicationStatus, number> = { perfect: 0, publishable: 0, blocked: 0 };
            for (const r of universeRows) counts[r.publication_status]++;
            const parts = order
              .filter((s) => counts[s] > 0)
              .map((s) => (
                <span key={s} className={`font-medium ${cls[s]}`}>
                  {counts[s]} {labels[s]}
                </span>
              ));
            return parts.length > 0 ? (
              <div className="mt-2 text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {parts.map((el, i) => (
                  <span key={i} className="inline-flex items-center gap-x-2">
                    {el}
                    {i < parts.length - 1 && <span className="text-slate-300">·</span>}
                  </span>
                ))}
              </div>
            ) : null;
          })()}
        </WiringSection>

        {/* Supply Intelligence */}
        {(() => {
          // Compute vendor coverage
          const vendorMap = new Map<string, { total: number; perfect: number; stems: number }>();
          for (const r of universeRows) {
            const s = vendorMap.get(r.vendor) ?? { total: 0, perfect: 0, stems: 0 };
            s.total++;
            if (r.publication_status === 'perfect') s.perfect++;
            s.stems += r.total_stems;
            vendorMap.set(r.vendor, s);
          }
          // Vendors sorted by % perfect ascending (worst first)
          const vendorList = Array.from(vendorMap.entries())
            .map(([vendor, s]) => ({ vendor, ...s, pct: s.total > 0 ? Math.round((s.perfect / s.total) * 100) : 0 }))
            .sort((a, b) => a.pct - b.pct || b.total - a.total);

          // Category coverage
          const catMap = new Map<string, { total: number; perfect: number }>();
          for (const r of universeRows) {
            const cat = r.category || 'Unknown';
            const s = catMap.get(cat) ?? { total: 0, perfect: 0 };
            s.total++;
            if (r.publication_status === 'perfect') s.perfect++;
            catMap.set(cat, s);
          }
          const darkCategories = Array.from(catMap.entries())
            .filter(([, s]) => s.perfect === 0 && s.total > 0)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 5);

          // Quick wins: exactly 1 gate away from perfect
          const quickWins = universeRows
            .filter((r) => r.publication_status !== 'perfect' && r.failed_gates.length === 1)
            .sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0))
            .slice(0, 5);

          // Most common blocker gates across non-perfect SKUs
          const gateCount = new Map<string, number>();
          for (const r of universeRows) {
            if (r.publication_status === 'perfect') continue;
            for (const g of r.failed_gates) {
              gateCount.set(g.gate_id, (gateCount.get(g.gate_id) ?? 0) + 1);
            }
          }
          const topGates = Array.from(gateCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);

          const darkVendors = vendorList.filter((v) => v.perfect === 0 && v.total > 3);

          return (
            <div className="mb-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Supply intelligence</span>
                <span className="text-[10px] text-slate-400">{universeRows.length} SKUs analyzed</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-100">

                {/* Vendor coverage */}
                <div className="p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">Vendor coverage</div>
                  <div className="space-y-1">
                    {vendorList.slice(0, 5).map(({ vendor, total, perfect, pct }) => (
                      <div key={vendor} className="flex items-center justify-between gap-2">
                        <Link
                          href={buildUrl(rawFilters, { vendor, tab: undefined })}
                          className="text-[11px] text-slate-700 hover:text-emerald-700 truncate max-w-[110px]"
                          title={vendor}
                        >
                          {vendor}
                        </Link>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full ${pct === 0 ? 'bg-red-400' : pct < 30 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-semibold ${pct === 0 ? 'text-red-600' : pct < 30 ? 'text-amber-600' : 'text-emerald-700'}`}>
                            {perfect}/{total}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dark categories */}
                <div className="p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">Zero perfect</div>
                  {darkCategories.length === 0 ? (
                    <p className="text-[11px] text-emerald-700 font-medium">All categories have coverage</p>
                  ) : (
                    <div className="space-y-1">
                      {darkCategories.map(([cat, s]) => (
                        <div key={cat} className="flex items-center justify-between gap-2">
                          <Link
                            href={buildUrl(rawFilters, { category: cat, tab: undefined })}
                            className="text-[11px] text-red-700 hover:underline truncate max-w-[120px]"
                            title={cat}
                          >
                            {cat}
                          </Link>
                          <span className="text-[10px] text-slate-500 shrink-0">{s.total} SKUs</span>
                        </div>
                      ))}
                      {darkVendors.length > 0 && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                          <span className="text-[10px] text-slate-500">{darkVendors.length} vendors also at 0%: </span>
                          <span className="text-[10px] text-red-600 font-medium">{darkVendors.slice(0, 3).map((v) => v.vendor).join(', ')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Quick wins */}
                <div className="p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">
                    Quick wins{' '}
                    <span className="text-slate-400 font-normal normal-case">(1 gate away)</span>
                  </div>
                  {quickWins.length === 0 ? (
                    <p className="text-[11px] text-slate-500">None right now</p>
                  ) : (
                    <div className="space-y-1">
                      {quickWins.map((r) => (
                        <div key={r.id} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] text-slate-700 truncate">{r.name}</p>
                            <p className="text-[10px] text-red-600 font-mono">{r.failed_gates[0]?.display_label ?? r.failed_gates[0]?.gate_id}</p>
                          </div>
                          <Link
                            href={buildUrl(rawFilters, { q: String(r.id), tab: undefined })}
                            className="text-[10px] text-emerald-700 hover:underline shrink-0"
                          >
                            view
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top blockers */}
                <div className="p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">Top blockers</div>
                  {topGates.length === 0 ? (
                    <p className="text-[11px] text-emerald-700 font-medium">No blocking gates</p>
                  ) : (
                    <div className="space-y-1.5">
                      {topGates.map(([gate, count]) => (
                        <div key={gate} className="flex items-center justify-between gap-2">
                          <Link
                            href={buildUrl(rawFilters, { flag: 'failed_gates', q: gate, tab: undefined })}
                            className="text-[11px] font-mono text-slate-700 hover:text-emerald-700 truncate"
                          >
                            {gate}
                          </Link>
                          <span className="text-[10px] font-semibold text-red-600 shrink-0">{count} SKUs</span>
                        </div>
                      ))}
                      <div className="pt-1 border-t border-slate-100">
                        <Link
                          href="/admin/catalog/config"
                          className="text-[10px] text-emerald-700 hover:underline"
                        >
                          Adjust weights in Config →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          );
        })()}

        {/* Vendor health table */}
        {(() => {
          type VHealth = {
            vendor: string;
            total: number;
            live: number;
            avgGpm: number | null;
            missingCost: number;
            openAlerts: number;
            avgQuality: number | null;
          };
          const vhMap = new Map<string, VHealth>();
          for (const r of universeRows) {
            const v = vhMap.get(r.vendor) ?? { vendor: r.vendor, total: 0, live: 0, avgGpm: null, missingCost: 0, openAlerts: 0, avgQuality: null };
            v.total++;
            if (r.visibility === 'live') v.live++;
            if (r.farm_cost == null) v.missingCost++;
            if (r.has_open_price_alert) v.openAlerts++;
            vhMap.set(r.vendor, v);
          }
          // Compute averages
          const gpmSum = new Map<string, { sum: number; n: number }>();
          const qSum = new Map<string, { sum: number; n: number }>();
          for (const r of universeRows) {
            if (r.gpm != null) {
              const g = gpmSum.get(r.vendor) ?? { sum: 0, n: 0 };
              g.sum += r.gpm; g.n++;
              gpmSum.set(r.vendor, g);
            }
            if (r.quality_score != null) {
              const q = qSum.get(r.vendor) ?? { sum: 0, n: 0 };
              q.sum += r.quality_score; q.n++;
              qSum.set(r.vendor, q);
            }
          }
          const vhList: VHealth[] = Array.from(vhMap.values()).map((v) => {
            const g = gpmSum.get(v.vendor);
            const q = qSum.get(v.vendor);
            return {
              ...v,
              avgGpm: g && g.n > 0 ? g.sum / g.n : null,
              avgQuality: q && q.n > 0 ? q.sum / q.n : null,
            };
          }).sort((a, b) => b.total - a.total);

          const totalAlerts = vhList.reduce((s, v) => s + v.openAlerts, 0);

          return (
            <div className="mb-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Vendor health</span>
                {totalAlerts > 0 && (
                  <Link href={buildUrl(rawFilters, { flag: 'price_alert', tab: undefined })} className="text-[11px] font-semibold text-orange-700 hover:underline">
                    {totalAlerts} open price alerts across all vendors →
                  </Link>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white border-b border-slate-100">
                    <tr className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                      <th className="px-4 py-2">Vendor</th>
                      <th className="px-4 py-2 text-right">SKUs</th>
                      <th className="px-4 py-2 text-right">Live</th>
                      <th className="px-4 py-2 text-right">Avg quality</th>
                      <th className="px-4 py-2 text-right">Avg GPM</th>
                      <th className="px-4 py-2 text-right">Missing cost</th>
                      <th className="px-4 py-2 text-right">Price alerts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vhList.map((v) => (
                      <tr key={v.vendor} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-900">
                          <Link href={buildUrl(rawFilters, { vendor: v.vendor, tab: undefined })} className="hover:text-emerald-700 hover:underline">
                            {v.vendor}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-right text-slate-700">{v.total}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={v.live > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>{v.live}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {v.avgQuality != null ? (
                            <span className={v.avgQuality >= 90 ? 'text-emerald-700' : v.avgQuality >= 70 ? 'text-amber-700' : 'text-red-600'}>
                              {v.avgQuality.toFixed(1)}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {v.avgGpm != null ? (
                            <span className={v.avgGpm >= 0.33 ? 'text-emerald-700' : v.avgGpm >= 0.25 ? 'text-amber-700' : 'text-red-600'}>
                              {(v.avgGpm * 100).toFixed(1)}%
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {v.missingCost > 0 ? (
                            <Link href={buildUrl(rawFilters, { vendor: v.vendor, flag: 'missing_cost', tab: undefined })} className="text-amber-700 font-semibold hover:underline">
                              {v.missingCost}
                            </Link>
                          ) : <span className="text-emerald-700">✓</span>}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {v.openAlerts > 0 ? (
                            <Link href={buildUrl(rawFilters, { vendor: v.vendor, flag: 'price_alert', tab: undefined })} className="text-orange-700 font-semibold hover:underline">
                              ⚠ {v.openAlerts}
                            </Link>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Tabs */}
        <WiringSection level={wm('tabs').level} note={wm('tabs').note} id="tabs">
          <div className="flex gap-1 mb-5 border-b border-slate-200 flex-wrap">
            <TabLink
              tab="improvement-queue"
              current={effectiveTab}
              rawFilters={rawFilters}
              label="Improvement queue"
              count={tabCounts['improvement-queue']}
            />
            <TabLink
              tab="perfect"
              current={effectiveTab}
              rawFilters={rawFilters}
              label="Perfect"
              count={tabCounts.perfect}
              perfectMinScore={perfect_min_score}
            />
            <TabLink
              tab="all"
              current={effectiveTab}
              rawFilters={rawFilters}
              label="All"
              count={tabCounts.all}
            />
          </div>
        </WiringSection>

        {/* Filter form */}
        <WiringSection level={wm('filter-form').level} note={wm('filter-form').note} id="filter-form">
          <form
            id="catalog-filter"
            action="/admin/catalog"
            method="get"
            className="bg-white border border-slate-200 rounded-xl p-4 mb-4"
          >
            {effectiveTab !== 'improvement-queue' && (
              <input type="hidden" name="tab" value={effectiveTab} />
            )}
            {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}

            {/* Change 9: standalone full-width search bar above filter grid */}
            <div className="relative mb-4">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <svg
                  className="h-4 w-4 text-slate-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                  />
                </svg>
              </div>
              <input
                name="q"
                defaultValue={search}
                placeholder="SKU, name, variety, vendor..."
                className="w-full pl-9 pr-9 py-2 text-sm rounded-xl border border-emerald-300 bg-white shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {search && (
                <div className="absolute inset-y-0 right-3 flex items-center">
                  <Link
                    href={buildUrl({ ...rawFilters, q: undefined }, {})}
                    className="text-slate-400 hover:text-slate-600"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    ✕
                  </Link>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <SelectField
                label="Vendor"
                name="vendor"
                defaultValue={vendorFilter}
                options={[
                  { value: 'all', label: 'All vendors' },
                  ...allVendors.map((v) => ({ value: v, label: v })),
                ]}
              />
              <SelectField
                label="Source"
                name="source"
                defaultValue={sourceFilter}
                options={[
                  { value: 'all', label: 'All sources' },
                  { value: 'k2k_live', label: 'K2K live' },
                  { value: 't2', label: 'T2' },
                  { value: 't3', label: 'T3' },
                ]}
              />
              <SelectField
                label="Category"
                name="category"
                defaultValue={categoryFilter}
                options={[
                  { value: 'all', label: 'All categories' },
                  ...allCategories.map((c) => ({ value: c, label: c })),
                ]}
              />
              <SelectField
                label="Visibility"
                name="visibility"
                defaultValue={visibilityFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'live', label: 'Live' },
                  { value: 'hidden', label: 'Hidden' },
                  { value: 'draft', label: 'Draft' },
                ]}
              />
              <SelectField
                label="GPM band"
                name="gpm"
                defaultValue={gpmFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'green', label: 'Green (>=33%)' },
                  { value: 'amber', label: 'Amber (25-33%)' },
                  { value: 'red', label: 'Red (<25%)' },
                  { value: 'none', label: 'No GPM (missing data)' },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
              <SelectField
                label="Flags"
                name="flag"
                defaultValue={flagFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'price_alert', label: '⚠ Price alerts (Rose)' },
                  { value: 'missing_cost', label: 'Missing cost' },
                  { value: 'no_box_dims', label: 'Box not verified' },
                  { value: 'failed_gates', label: 'Has failing gates' },
                ]}
              />
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                Showing{' '}
                <span className="font-semibold text-slate-900">{pageRows.length}</span>{' '}
                of{' '}
                <span className="font-semibold text-slate-900">{filteredTotal}</span>{' '}
                SKUs (universe {summary.universe.total.toLocaleString()})
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 font-medium"
                >
                  Apply filters
                </button>
                <Link
                  href="/admin/catalog"
                  className="text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
                >
                  Reset
                </Link>
                {/* Change 10: clear N filters link */}
                {activeFilterCount > 0 && (
                  <Link
                    href="/admin/catalog"
                    className="text-xs px-3 py-1.5 rounded-md text-red-500 hover:text-red-700 hover:underline"
                  >
                    Clear {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
                  </Link>
                )}
                <a
                  href="/api/admin/catalog/export"
                  className="text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
                >
                  Export CSV
                </a>
              </div>
            </div>
          </form>
        </WiringSection>

        {/* Bulk-actions row -- UI intent surfaced, executors not yet built */}
        <WiringSection level={wm('bulk-actions').level} note={wm('bulk-actions').note} id="bulk-actions">
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-xs text-slate-500">
              Bulk actions (selection UI deferred -- coming with Context-based island)
            </p>
            <div className="flex gap-2">
              {/*
                TODO: when per-row checkboxes ship, wrap the table in a Context
                provider client island and enable these. Right now the buttons
                render disabled to surface intent.
              */}
              <button
                type="button"
                disabled
                title="Coming Round 5 -- override-price executor not yet wired"
                className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-400 cursor-not-allowed"
              >
                Bulk: override price
              </button>
              <button
                type="button"
                disabled
                title="Coming Round 5 -- change-vendor executor not yet wired"
                className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-400 cursor-not-allowed"
              >
                Bulk: change vendor
              </button>
              <button
                type="button"
                disabled
                title="Coming Round 5 -- campaigns table does not exist yet"
                className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-400 cursor-not-allowed"
              >
                Bulk: add to campaign
              </button>
            </div>
          </div>
        </WiringSection>

        {/* Table */}
        <WiringSection level={wm('catalog-table').level} note={wm('catalog-table').note} id="catalog-table">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <SortHeader label="Family"         sortKey="family"     current={sort} rawFilters={rawFilters} />
                    <SortHeader label="SKU"            sortKey="name"       current={sort} rawFilters={rawFilters} />
                    <SortHeader label="Importance"     sortKey="importance" current={sort} rawFilters={rawFilters} align="right" />
                    <SortHeader label="Vendor"         sortKey="vendor"     current={sort} rawFilters={rawFilters} />
                    <SortHeader label="Box"            sortKey="box"        current={sort} rawFilters={rawFilters} />
                    <SortHeader label="Cost"           sortKey="cost"       current={sort} rawFilters={rawFilters} align="right" />
                    <SortHeader label="Delivery"       sortKey="delivery"   current={sort} rawFilters={rawFilters} align="right" />
                    <SortHeader label="Price"          sortKey="price"      current={sort} rawFilters={rawFilters} align="right" />
                    <SortHeader label="GPM"            sortKey="gpm"        current={sort} rawFilters={rawFilters} align="right" />
                    <SortHeader label="Margin $"       sortKey="margin"     current={sort} rawFilters={rawFilters} align="right" />
                    <SortHeader label="Sources"        sortKey="sources"    current={sort} rawFilters={rawFilters} />
                    <SortHeader label="Avail"          sortKey="avail"      current={sort} rawFilters={rawFilters} align="right" />
                    <SortHeader label="Visibility"     sortKey="visibility" current={sort} rawFilters={rawFilters} />
                    {effectiveTab === 'improvement-queue' && (
                      <SortHeader label="Gap" sortKey="quality" current={sort} rawFilters={rawFilters} align="right" />
                    )}
                    <th className="px-3 py-2.5">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors align-top"
                    >
                      {/* 1. Family */}
                      <td className="px-3 py-2.5">
                        <div className="text-slate-900 font-medium max-w-[180px] truncate" title={r.name}>
                          {r.variety || r.category || r.name || '--'}
                          {r.color ? ` · ${r.color}` : ''}
                          {r.length ? ` ${r.length}` : ''}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {[r.category, r.unit]
                            .filter(Boolean)
                            .join(' · ') || '--'}
                        </div>
                      </td>

                      {/* 2. SKU — #ID only; name is in Family column */}
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/admin/catalog/${r.id}`}
                          className="font-mono text-[11px] text-emerald-700 hover:underline"
                          title={r.name}
                        >
                          #{r.id}
                        </Link>
                      </td>

                      {/* 3. Importance */}
                      <td className="px-3 py-2.5 text-right">
                        {r.importance_score >= 72 ? (
                          <span
                            className="text-amber-500 font-bold text-sm"
                            title={`Importance score: ${r.importance_score} — high-demand named variety`}
                          >
                            ★ {r.importance_score}
                          </span>
                        ) : r.importance_score > 25 ? (
                          <span
                            className="text-[11px] text-violet-700 font-semibold"
                            title={`Importance score: ${r.importance_score} — research-scored variety`}
                          >
                            {r.importance_score}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400" title="Commodity default (25) — no market research data for this variety">
                            ~{r.importance_score}
                          </span>
                        )}
                      </td>

                      {/* 3. Vendor */}
                      <td className="px-3 py-2.5">
                        <div className="text-slate-700">{r.vendor}</div>
                        {r.country && (
                          <div className="text-[11px] text-slate-500">{r.country}</div>
                        )}
                      </td>

                      {/* 4. Box — type + weight from Rose box_master + delivery/stem from buildCatalog.
                            No recalculation here. Weight is vendor-specific (QB-MF≠QB≠QB-OLI).
                            Tooltip shows what Rose computed, not a re-derivation. */}
                      <td className="px-3 py-2.5">
                        {r.box_type ? (
                          <>
                            <div
                              className="text-slate-700 font-mono text-xs"
                              title={[
                                r.box_weight_kg != null ? `${r.box_weight_kg}kg` : null,
                                r.shipping_per_stem != null ? `$${r.shipping_per_stem.toFixed(3)}/stem delivery` : null,
                              ].filter(Boolean).join(' · ')}
                            >
                              {r.box_type}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {r.box_weight_kg != null ? `${r.box_weight_kg}kg` : 'wt unknown'}
                            </div>
                            <div className="text-[11px]">
                              {r.box_verified ? (
                                <span className="text-emerald-700">verified</span>
                              ) : (
                                <span className="text-amber-700">needs verify</span>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-400 text-xs">--</span>
                        )}
                      </td>

                      {/* 5. Cost */}
                      <td className="px-3 py-2.5 text-right">
                        {r.farm_cost == null ? (
                          <span className="text-amber-700 text-xs">missing</span>
                        ) : (
                          <span className="text-slate-900">{fmtUsd(r.farm_cost)}</span>
                        )}
                      </td>

                      {/* 6. Delivery (per-stem shipping cost) */}
                      <td className="px-3 py-2.5 text-right text-slate-700">
                        {fmtUsd(r.shipping_per_stem)}
                      </td>

                      {/* 7. Price */}
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-slate-900 font-semibold">
                          {fmtUsd(r.price)}
                        </span>
                      </td>

                      {/* 8. GPM */}
                      <td className="px-3 py-2.5 text-right">
                        {r.gpm_band ? (
                          <span className={`font-semibold ${GPM_BAND_CLS[r.gpm_band]}`}>
                            {fmtGpm(r.gpm)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">--</span>
                        )}
                      </td>

                      {/* 8b. Margin $ — reads r.margin_per_stem from buildCatalog; no arithmetic here */}
                      <td className="px-3 py-2.5 text-right">
                        {(() => {
                          if (r.margin_per_stem == null) {
                            return <span className="text-slate-400 text-xs">—</span>;
                          }
                          const cls =
                            r.gpm_band === 'green'
                              ? 'text-emerald-700 font-semibold'
                              : r.gpm_band === 'amber'
                              ? 'text-amber-600 font-semibold'
                              : 'text-red-600 font-semibold';
                          return <span className={cls}>${r.margin_per_stem.toFixed(2)}</span>;
                        })()}
                        <div className="text-[10px] text-slate-400">per stem</div>
                      </td>

                      {/* 9. Sources */}
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {r.buckets.map((b) => (
                            <span
                              key={b}
                              className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${SOURCE_BADGE_CLS[b]}`}
                            >
                              {SOURCE_LABELS[b]}
                            </span>
                          ))}
                          {r.buckets.length === 0 && (
                            <span className="text-slate-400 text-xs">--</span>
                          )}
                        </div>
                      </td>

                      {/* 10. Avail — "live" label for k2k stems; "next batch" for arrival_date */}
                      <td className="px-3 py-2.5 text-right">
                        {r.buckets.includes('k2k_live') ? (
                          // K2K live: show boxes or stems
                          r.boxes_available != null && r.boxes_available > 0 ? (
                            <div>
                              <div className="text-slate-700">{r.boxes_available.toLocaleString()} boxes</div>
                              <div className="text-[10px] text-emerald-600 font-medium">live</div>
                            </div>
                          ) : r.total_stems > 0 ? (
                            <div>
                              <div className="text-slate-700">{r.total_stems.toLocaleString()} stems</div>
                              <div className="text-[10px] text-amber-600 font-medium">⚠ data</div>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400">0 boxes</div>
                          )
                        ) : r.buckets.includes('t2') ? (
                          // T2: farm commitment — show date as context only, no alarming
                          (() => {
                            if (!r.arrival_date) {
                              return <div className="text-[10px] text-blue-600">T2 · date TBD</div>;
                            }
                            const arrDate = new Date(r.arrival_date + 'T00:00:00');
                            const dateStr = arrDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            const isPast = arrDate < today;
                            return (
                              <div>
                                <div className="text-[10px] text-blue-600 font-medium">T2 · {dateStr}</div>
                                {isPast && <div className="text-[10px] text-slate-400">date stale</div>}
                              </div>
                            );
                          })()
                        ) : r.buckets.includes('t3') ? (
                          // T3: farm commitment — show date as context only, no alarming
                          (() => {
                            if (!r.arrival_date) {
                              return <div className="text-[10px] text-slate-500">T3 · date TBD</div>;
                            }
                            const arrDate = new Date(r.arrival_date + 'T00:00:00');
                            const dateStr = arrDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            const isPast = arrDate < today;
                            return (
                              <div>
                                <div className="text-[10px] text-slate-500 font-medium">T3 · {dateStr}</div>
                                {isPast && <div className="text-[10px] text-slate-400">date stale</div>}
                              </div>
                            );
                          })()
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </td>

                      {/* 11. Visibility + publication_status chip */}
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold w-fit ${VISIBILITY_BADGE_CLS[r.visibility]}`}
                            title={
                              r.visibility === 'live'
                                ? 'Live: mirror.live = true AND mirror.active = true (K2K uploaded this SKU as active)'
                                : r.visibility === 'hidden'
                                ? 'Hidden: mirror.live = false or mirror.active = false'
                                : 'Draft: not yet in K2K live feed'
                            }
                          >
                            {r.visibility}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold w-fit ${PUBLICATION_STATUS_CLS[r.publication_status]}`}
                            title={
                              r.publication_status === 'perfect'
                                ? `Perfect: all ${r.failed_gates.length === 0 ? 'gates' : 'evaluated gates'} pass (quality score: ${r.quality_score ?? '?'}/100). Source: catalog_classifications.`
                                : r.publication_status === 'publishable'
                                ? `Publishable: blocking gates pass but quality gaps remain (score: ${r.quality_score ?? '?'}/100). See flags column.`
                                : `Blocked: one or more blocking gates fail (score: ${r.quality_score ?? '?'}/100). Cannot publish until fixed. See flags column.`
                            }
                          >
                            {r.publication_status === 'perfect' ? '✓ ' : ''}{PUBLICATION_STATUS_LABEL[r.publication_status]}
                          </span>
                          {viewMode === 'target' && (
                            <div className="text-[10px] text-emerald-600 font-medium mt-0.5">→ 100 target</div>
                          )}
                        </div>
                      </td>

                      {/* 11b. Gap column (improvement-queue only) — reads r.gap_to_perfect from buildCatalog */}
                      {effectiveTab === 'improvement-queue' && (
                        <td className="px-3 py-2.5 text-right">
                          {r.gap_to_perfect != null ? (
                            <span className={r.gap_to_perfect >= 30 ? 'text-red-600 font-semibold' : 'text-amber-600 font-semibold'}>
                              −{r.gap_to_perfect}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                      )}

                      {/* 12. Flags */}
                      <td className="px-3 py-2.5">
                        {r.failed_gates.length === 0 &&
                        r.farm_cost != null &&
                        r.box_verified &&
                        !r.has_open_price_alert ? (
                          <span className="text-[11px] text-emerald-700">clean</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.has_open_price_alert && (
                              <Link
                                href={`/admin/catalog/${r.id}`}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200 font-semibold hover:bg-orange-100 transition-colors"
                                title="Rose flagged this price for review"
                              >
                                ⚠ price alert
                              </Link>
                            )}
                            {r.failed_gates.slice(0, 3).map((g) => (
                              <Link
                                key={g.gate_id}
                                href={`/admin/catalog/${r.id}?focus=${g.gate_id}`}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-medium hover:bg-red-100 transition-colors"
                                title={`-${g.weight} . ${g.display_label}`}
                              >
                                {g.display_label} (−{g.weight})
                              </Link>
                            ))}
                            {r.failed_gates.length > 3 && (
                              <Link
                                href={`/admin/catalog/${r.id}`}
                                className="text-[10px] text-slate-500 hover:text-slate-700 underline"
                              >
                                +{r.failed_gates.length - 3} more
                              </Link>
                            )}
                            {r.farm_cost == null && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                no cost
                              </span>
                            )}
                            {!r.box_verified && r.box_type && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                box unverified
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {pageRows.length === 0 && (
                <div className="px-3 py-12 text-center text-sm text-slate-500">
                  No SKUs match the current filters.{' '}
                  <Link
                    href="/admin/catalog"
                    className="text-emerald-700 hover:underline"
                  >
                    Reset filters
                  </Link>{' '}
                  to see all {summary.universe.total} rows.
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs">
                <span className="text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link
                      href={buildUrl(rawFilters, { page: String(page - 1) })}
                      className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-slate-700"
                    >
                      Previous
                    </Link>
                  )}
                  {page < totalPages && (
                    <Link
                      href={buildUrl(rawFilters, { page: String(page + 1) })}
                      className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-slate-700"
                    >
                      Next
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </WiringSection>

        {/* Legend */}
        <div className="mt-4 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
          <span>Sources:</span>
          <span className="inline-flex items-center gap-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-emerald-50 text-emerald-700 border-emerald-200">
              K2K live
            </span>{' '}
            vendor uploaded
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-blue-50 text-blue-700 border-blue-200">
              T2
            </span>{' '}
            commitment
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-50 text-slate-600 border-slate-200">
              T3
            </span>{' '}
            sourceable
          </span>
          <span className="ml-2">
            GPM:{' '}
            <span className="text-emerald-700 font-semibold">green &gt;=33%</span> .{' '}
            <span className="text-amber-700 font-semibold">amber 25-33%</span> .{' '}
            <span className="text-red-700 font-semibold">red &lt;25%</span>
          </span>
        </div>

        <p className="text-xs text-slate-400 mt-6">
          Catalog-v5 model: universe = T2 + T3 + K2K live (de-duped). quality_score
          = weighted sum (0-100) of passing gates from catalog_quality_weights.
          Importance = P(conversion | perfect listing): demand tier × price vs market × 2026 trend.
          Research-backed for named varieties (LVFM, Florists&apos; Review, The Knot, Whole Blossoms).
          Commodity default (25) for unknowns. Recalibrate monthly vs realized add-to-cart rate per variety. GPM = (price - cost - shipping) / price. Shipping per
          stem = ceil(box_weight_kg) * fedex_rate_per_kg * fuel_surcharge_mult /
          units_per_box. Sources: supabase-backup
          public.floropolis_inventory_mirror, public.catalog_classifications,
          public.catalog_quality_weights, public.catalog_quality_thresholds,
          public.box_master, public.pricing_constants.
        </p>
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function TabLink({
  tab,
  current,
  rawFilters,
  label,
  count,
  perfectMinScore,
}: {
  tab: TabKey;
  current: TabKey;
  rawFilters: Record<string, string | undefined>;
  label: string;
  count: number;
  perfectMinScore?: number;
}) {
  const active = tab === current;
  const cls = active
    ? 'px-4 py-2 text-sm font-semibold text-emerald-700 border-b-2 border-emerald-600 -mb-px'
    : 'px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700';
  // Change 2: show threshold in Perfect tab label
  const displayLabel =
    tab === 'perfect' && perfectMinScore != null
      ? `Perfect ≥${perfectMinScore}`
      : label;
  return (
    <Link
      href={buildUrl(rawFilters, {
        tab: tab !== 'improvement-queue' ? tab : undefined,
        page: undefined,
        sort: undefined,
      })}
      className={cls}
    >
      {displayLabel}
      <span className="ml-2 text-[11px] text-slate-400">{count.toLocaleString()}</span>
    </Link>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-1">
        {label}
      </label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full px-2 py-1.5 text-sm rounded-md border border-slate-200 bg-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  rawFilters,
  align,
}: {
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: SortDir };
  rawFilters: Record<string, string | undefined>;
  align?: 'right';
}) {
  const isActive = current.key === sortKey;
  const nextDir: SortDir = isActive && current.dir === 'desc' ? 'asc' : 'desc';
  const arrow = isActive ? (current.dir === 'asc' ? ' ^' : ' v') : '';
  const newSort = `${sortKey}:${nextDir}`;
  const cls = `px-3 py-2.5 ${align === 'right' ? 'text-right' : ''}`;
  return (
    <th className={cls}>
      <Link
        href={buildUrl(rawFilters, { sort: newSort, page: undefined })}
        className={
          isActive
            ? 'text-emerald-700 hover:underline'
            : 'text-slate-500 hover:text-slate-700'
        }
      >
        {label}
        <span className="font-mono">{arrow}</span>
      </Link>
    </th>
  );
}
