// Admin Unified Catalog -- catalog-v5: mockup-faithful 12-column rebuild.
// v5 | 2026-05-19 | Job_PM catalog-v5 [V8 SHADOW]
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
  type BoxMasterRow,
  type CatalogV2Row,
  type ClassificationRow,
  type MirrorRow,
  type PricingConstantRow,
  type QualityThresholdRow,
  type QualityWeightRow,
} from '@/lib/admin/catalog-model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = 'improvement-queue' | 'perfect' | 'all';
type SortKey =
  | 'priority'
  | 'quality'
  | 'importance'
  | 'vendor'
  | 'name'
  | 'cost'
  | 'price'
  | 'gpm'
  | 'avail';
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
    return { key: 'vendor', dir: 'asc' };
  }
  const [keyRaw, dirRaw] = raw.split(':');
  const allowed: SortKey[] = [
    'priority', 'quality', 'importance', 'vendor', 'name',
    'cost', 'price', 'gpm', 'avail',
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
      case 'vendor': return r.vendor.toLowerCase();
      case 'name': return r.name.toLowerCase();
      case 'cost': return r.farm_cost ?? -1;
      case 'price': return r.price ?? -1;
      case 'gpm': return r.gpm ?? -1;
      case 'avail': return r.total_stems;
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
  const tab = parseTab(sp.tab);
  const search = (sp.q ?? '').trim();
  const vendorFilter = (sp.vendor ?? 'all').trim();
  const sourceFilter = (sp.source ?? 'all').trim();
  const categoryFilter = (sp.category ?? 'all').trim();
  const visibilityFilter = (sp.visibility ?? 'all').trim();
  const gpmFilter = (sp.gpm ?? 'all').trim();
  const flagFilter = (sp.flag ?? 'all').trim();
  const pageNum = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const sort = parseSort(sp.sort, tab);

  const rawFilters: Record<string, string | undefined> = {
    tab: tab !== 'improvement-queue' ? tab : undefined,
    q: search || undefined,
    vendor: vendorFilter !== 'all' ? vendorFilter : undefined,
    source: sourceFilter !== 'all' ? sourceFilter : undefined,
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    visibility: visibilityFilter !== 'all' ? visibilityFilter : undefined,
    gpm: gpmFilter !== 'all' ? gpmFilter : undefined,
    flag: flagFilter !== 'all' ? flagFilter : undefined,
    sort: sp.sort,
  };

  const backup = getBackupServiceClient();

  // Fetch mirror ---------------------------------------------------------
  let mirrorRows: MirrorRow[] = [];
  try {
    const { data, error } = await backup
      .from('floropolis_inventory_mirror')
      .select(
        'id, name, vendor, tier, category, variety, length, unit, price, farm_cost, cost_source, cost_verified_at, stock, total_stems, units_per_box, box_type, margin_status, live, active, arrival_date',
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
      .select('gate_id, display_label, category, weight, description, evaluated, updated_at, updated_by');
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
    if (tab === 'perfect') {
      return r.quality_score != null && r.quality_score >= perfect_min_score;
    }
    if (tab === 'improvement-queue') {
      return r.quality_score == null || r.quality_score < perfect_min_score;
    }
    return true;
  };
  const tabCounts = {
    'improvement-queue': universeRows.filter(
      (r) => r.quality_score == null || r.quality_score < perfect_min_score,
    ).length,
    perfect: universeRows.filter(
      (r) => r.quality_score != null && r.quality_score >= perfect_min_score,
    ).length,
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
      if (flagFilter === 'missing_cost' && r.farm_cost != null) return false;
      if (flagFilter === 'no_box_dims' && r.box_verified) return false;
      if (flagFilter === 'failed_gates' && r.failed_gates.length === 0) return false;
    }

    if (search) {
      const blob = `${r.name} ${r.vendor} ${r.variety} ${r.category} ${r.id}`.toLowerCase();
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
                Reality per Rose&apos;s layer state: gaps visible, ghost still alive
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  className="px-3 py-1 text-xs font-semibold rounded-md bg-emerald-600 text-white cursor-default"
                  aria-pressed="true"
                  title="Today: live mirror state."
                >
                  Today
                </button>
                <button
                  type="button"
                  className="px-3 py-1 text-xs font-medium rounded-md text-slate-400 cursor-not-allowed"
                  disabled
                  title="Target state -- coming soon (no diverging data path yet)."
                >
                  Target state
                </button>
              </div>
              <p className="text-[11px] text-slate-400 max-w-xs text-right">
                Importance covers {summary.importance_covered_count}/
                {summary.universe.total} SKUs (seed of 7; pipeline TBD).
              </p>
            </div>
          </div>
        </WiringSection>

        {/* Tabs */}
        <WiringSection level={wm('tabs').level} note={wm('tabs').note} id="tabs">
          <div className="flex gap-1 mb-5 border-b border-slate-200 flex-wrap">
            <TabLink
              tab="improvement-queue"
              current={tab}
              rawFilters={rawFilters}
              label="Improvement queue"
              count={tabCounts['improvement-queue']}
            />
            <TabLink
              tab="perfect"
              current={tab}
              rawFilters={rawFilters}
              label="Perfect"
              count={tabCounts.perfect}
            />
            <TabLink
              tab="all"
              current={tab}
              rawFilters={rawFilters}
              label="All"
              count={tabCounts.all}
            />
          </div>
        </WiringSection>

        {/* Filter form */}
        <WiringSection level={wm('filter-form').level} note={wm('filter-form').note} id="filter-form">
          <form
            action="/admin/catalog"
            method="get"
            className="bg-white border border-slate-200 rounded-xl p-4 mb-4"
          >
            {tab !== 'improvement-queue' && (
              <input type="hidden" name="tab" value={tab} />
            )}
            {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Search
                </label>
                <input
                  name="q"
                  defaultValue={search}
                  placeholder="SKU, name, variety, vendor..."
                  className="w-full px-2 py-1.5 text-sm rounded-md border border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
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
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mt-3">
              <SelectField
                label="Flags"
                name="flag"
                defaultValue={flagFilter}
                options={[
                  { value: 'all', label: 'All' },
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
                    <SortHeader label="SKU"            sortKey="name"       current={sort} rawFilters={rawFilters} />
                    <th className="px-3 py-2.5">Quality Family</th>
                    <SortHeader label="Vendor"         sortKey="vendor"     current={sort} rawFilters={rawFilters} />
                    <th className="px-3 py-2.5">Box</th>
                    <SortHeader label="Cost"           sortKey="cost"       current={sort} rawFilters={rawFilters} align="right" />
                    <th className="px-3 py-2.5 text-right">Delivery</th>
                    <SortHeader label="Price"          sortKey="price"      current={sort} rawFilters={rawFilters} align="right" />
                    <SortHeader label="GPM"            sortKey="gpm"        current={sort} rawFilters={rawFilters} align="right" />
                    <th className="px-3 py-2.5">Sources</th>
                    <SortHeader label="Avail"          sortKey="avail"      current={sort} rawFilters={rawFilters} align="right" />
                    <th className="px-3 py-2.5">Visibility</th>
                    <th className="px-3 py-2.5">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors align-top"
                    >
                      {/* 1. SKU */}
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/admin/catalog/${r.id}`}
                          className="font-mono text-[11px] text-emerald-700 hover:underline"
                        >
                          {r.id}
                        </Link>
                        <div
                          className="text-[11px] text-slate-700 mt-0.5 max-w-[220px] truncate"
                          title={r.name}
                        >
                          {r.name}
                        </div>
                        {r.importance_score != null && (
                          <div className="mt-1">
                            <span
                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200 font-semibold"
                              title="Importance from featured-products framework (seed of 7)."
                            >
                              <span aria-hidden="true">*</span>{r.importance_score}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 2. Quality Family */}
                      <td className="px-3 py-2.5">
                        <div className="text-slate-900">
                          {r.variety || r.category || '--'}
                          {r.length ? ` ${r.length}` : ''}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {[r.category, r.variety, r.length, r.unit]
                            .filter(Boolean)
                            .join(' . ') || '--'}
                        </div>
                      </td>

                      {/* 3. Vendor */}
                      <td className="px-3 py-2.5">
                        <div className="text-slate-700">{r.vendor}</div>
                        {r.country && (
                          <div className="text-[11px] text-slate-500">{r.country}</div>
                        )}
                      </td>

                      {/* 4. Box */}
                      <td className="px-3 py-2.5">
                        {r.box_type ? (
                          <>
                            <div className="text-slate-700">{r.box_type}</div>
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

                      {/* 10. Avail */}
                      <td className="px-3 py-2.5 text-right">
                        <div className="text-slate-700">
                          {r.total_stems.toLocaleString()}
                          <span className="text-[10px] text-slate-400 ml-1">stems</span>
                        </div>
                        {r.boxes_available != null && r.boxes_available > 0 && (
                          <div className="text-[10px] text-slate-400">
                            {r.boxes_available.toLocaleString()} boxes
                          </div>
                        )}
                      </td>

                      {/* 11. Visibility (with inline quality_score badge) */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${VISIBILITY_BADGE_CLS[r.visibility]}`}
                          >
                            {r.visibility}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${qualityBadgeCls(r.quality_score, perfect_min_score)}`}
                            title={`Quality score (0-100). Perfect threshold = ${perfect_min_score}.`}
                          >
                            {r.quality_score == null ? '--' : r.quality_score}
                          </span>
                        </div>
                      </td>

                      {/* 12. Flags */}
                      <td className="px-3 py-2.5">
                        {r.failed_gates.length === 0 &&
                        r.farm_cost != null &&
                        r.box_verified ? (
                          <span className="text-[11px] text-emerald-700">clean</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.failed_gates.slice(0, 3).map((g) => (
                              <span
                                key={g.gate_id}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-medium"
                                title={`-${g.weight} . ${g.display_label}`}
                              >
                                {g.display_label}
                              </span>
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
          Importance from featured-products framework (seed of 7 SKUs today;
          pipeline pending). GPM = (price - cost - shipping) / price. Shipping per
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
}: {
  tab: TabKey;
  current: TabKey;
  rawFilters: Record<string, string | undefined>;
  label: string;
  count: number;
}) {
  const active = tab === current;
  const cls = active
    ? 'px-4 py-2 text-sm font-semibold text-emerald-700 border-b-2 border-emerald-600 -mb-px'
    : 'px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700';
  return (
    <Link
      href={buildUrl(rawFilters, {
        tab: tab !== 'improvement-queue' ? tab : undefined,
        page: undefined,
        sort: undefined,
      })}
      className={cls}
    >
      {label}
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
