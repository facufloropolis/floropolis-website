// Admin Unified Catalog -- catalog-v2 model (weighted quality + importance + priority).
// v4 | 2026-05-19 | Job_PM catalog-v2 [V8 SHADOW]
//
// What changed (vs v3):
//   - REPLACED the W2-era "publishable filter" model that dropped the catalog
//     from 707 to 110 SKUs. Facu called that DESASTRE. The 16-gate threshold
//     is a per-SKU DATA QUALITY signal, not a per-SKU publish filter. This
//     rewrite shows the FULL UNIVERSE (T2 + T3 + K2K live, de-duped) with a
//     weighted 0-100 quality_score per SKU and an importance_score from the
//     featured-products framework.
//
// Universe (per feedback_admin_design_principles section 1):
//   tier='T2'                 -> T2 commitments
//   tier='T3'                 -> T3 sourceable
//   cost_source ILIKE '%_k2k_%' AND live=true -> K2K live
//   De-dupe by SKU id; the same row can satisfy multiple buckets.
//
// Tabs (no chip row; single table):
//   improvement-queue (default, priority_to_fix DESC) -- excludes Perfect
//   perfect           (quality_score >= perfect_min_score)
//   all               (universe)
//
// Quality compute / importance / priority: lib/admin/catalog-model.ts.
// Featured-score seed (7 SKUs): lib/admin/featured-scores-seed.ts.
//
// Each fetch stage is wrapped in try/catch so a single failing table cannot 500
// the page (same defensive pattern as v3, kept).

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
  recommendAction,
  STATUS_BAND_CLS,
  STATUS_BAND_LABEL,
  type CatalogV2Row,
  type ClassificationRow,
  type MirrorRow,
  type QualityThresholdRow,
  type QualityWeightRow,
} from '@/lib/admin/catalog-model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = 'improvement-queue' | 'perfect' | 'all';
type SortKey = 'priority' | 'quality' | 'importance' | 'vendor' | 'name';
type SortDir = 'asc' | 'desc';

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    vendor?: string;
    tier?: string;
    sort?: string;
    page?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTab(v: string | undefined): TabKey {
  if (v === 'perfect' || v === 'all') return v;
  return 'improvement-queue';
}

function parseSort(raw: string | undefined, tab: TabKey): { key: SortKey; dir: SortDir } {
  if (!raw) {
    // Default sort depends on tab.
    if (tab === 'improvement-queue') return { key: 'priority', dir: 'desc' };
    return { key: 'vendor', dir: 'asc' };
  }
  const [keyRaw, dirRaw] = raw.split(':');
  const key: SortKey = (
    ['priority', 'quality', 'importance', 'vendor', 'name'] as const
  ).includes(keyRaw as SortKey)
    ? (keyRaw as SortKey)
    : 'priority';
  const dir: SortDir = dirRaw === 'asc' ? 'asc' : 'desc';
  return { key, dir };
}

function fmtUsd(n: number | null): string {
  if (n == null) return '--';
  return `$${n.toFixed(2)}`;
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
      case 'priority':
        return r.priority_to_fix;
      case 'quality':
        return r.quality_score ?? -1;
      case 'importance':
        return r.importance_score ?? -1;
      case 'vendor':
        return r.vendor.toLowerCase();
      case 'name':
        return r.name.toLowerCase();
      default:
        return 0;
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
  const tierFilter = (sp.tier ?? 'all').trim();
  const pageNum = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const sort = parseSort(sp.sort, tab);

  const rawFilters: Record<string, string | undefined> = {
    tab: tab !== 'improvement-queue' ? tab : undefined,
    q: search || undefined,
    vendor: vendorFilter !== 'all' ? vendorFilter : undefined,
    tier: tierFilter !== 'all' ? tierFilter : undefined,
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
  let classifications: ClassificationRow[] = [];
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

  // Build catalog rows ---------------------------------------------------
  const built = buildCatalog({
    mirror: mirrorRows,
    classifications,
    weights,
    thresholds,
  });
  const { rows: universeRows, summary, perfect_min_score } = built;

  // Vendor + tier facets (computed from universe so they reflect the truth) -
  const vendorSet = new Set<string>();
  const tierSet = new Set<string>();
  for (const r of universeRows) {
    if (r.vendor) vendorSet.add(r.vendor);
    if (r.tier) tierSet.add(r.tier);
  }
  const allVendors = Array.from(vendorSet).sort();
  const allTiers = Array.from(tierSet).sort();

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
    if (tierFilter !== 'all' && r.tier !== tierFilter) return false;
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

  // Importance seed gap copy --------------------------------------------
  const importanceGap = summary.universe.total - summary.importance_covered_count;

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

        <WiringSection level={wm('summary-tiles').level} note={wm('summary-tiles').note} id="summary-tiles">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-slate-900">Unified Catalog</h1>
            <p className="text-sm text-slate-500 mt-1">
              Universe{' '}
              <span className="font-semibold text-slate-900">
                {summary.universe.total.toLocaleString()}
              </span>{' '}
              SKUs (
              <span className="text-blue-700 font-medium">{summary.universe.t2} T2</span>
              {' . '}
              <span className="text-slate-600 font-medium">{summary.universe.t3} T3</span>
              {' . '}
              <span className="text-emerald-700 font-medium">
                {summary.universe.k2k_live} K2K live
              </span>
              ). Perfect{' '}
              <span className="font-semibold text-emerald-700">
                {summary.perfect_count}
              </span>{' '}
              / {summary.universe.total} ({summary.perfect_pct}%). Improvement queue{' '}
              <span className="font-semibold text-orange-700">
                {tabCounts['improvement-queue'].toLocaleString()}
              </span>
              .
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Quality threshold = {perfect_min_score}/100. Importance score covers{' '}
              {summary.importance_covered_count}/{summary.universe.total} SKUs (seed of
              7; pipeline TBD; {importanceGap} ungraded).{' '}
              <Link href="/admin/catalog/config?panel=quality" className="text-emerald-700 hover:underline">
                Edit weights / threshold
              </Link>
            </p>
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Search
                </label>
                <input
                  name="q"
                  defaultValue={search}
                  placeholder="SKU id, name, variety, vendor..."
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
                label="Tier"
                name="tier"
                defaultValue={tierFilter}
                options={[
                  { value: 'all', label: 'All tiers' },
                  ...allTiers.map((t) => ({ value: t, label: t })),
                ]}
              />
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                Showing{' '}
                <span className="font-semibold text-slate-900">{pageRows.length}</span>{' '}
                on this page .{' '}
                <span className="font-semibold text-slate-900">{filteredTotal}</span>{' '}
                match filters .{' '}
                <span className="text-slate-400">{summary.universe.total} universe</span>
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
              </div>
            </div>
          </form>
        </WiringSection>

        {/* Table */}
        <WiringSection level={wm('catalog-table').level} note={wm('catalog-table').note} id="catalog-table">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-3 py-2.5">SKU</th>
                    <th className="px-3 py-2.5">Tier / Vendor</th>
                    <SortHeader
                      label="Importance"
                      sortKey="importance"
                      current={sort}
                      rawFilters={rawFilters}
                      align="right"
                    />
                    <SortHeader
                      label="Quality"
                      sortKey="quality"
                      current={sort}
                      rawFilters={rawFilters}
                      align="right"
                    />
                    {tab === 'improvement-queue' && (
                      <SortHeader
                        label="Priority"
                        sortKey="priority"
                        current={sort}
                        rawFilters={rawFilters}
                        align="right"
                      />
                    )}
                    <th className="px-3 py-2.5">What&apos;s needed</th>
                    <th className="px-3 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const action = recommendAction(r);
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-3 py-2.5 align-top">
                          <Link
                            href={`/admin/catalog/${r.id}`}
                            className="font-mono text-[11px] text-emerald-700 hover:underline"
                          >
                            {r.id}
                          </Link>
                          <div
                            className="text-[11px] text-slate-700 mt-0.5 max-w-[240px] truncate"
                            title={r.name}
                          >
                            {r.name}
                          </div>
                          {r.variety && (
                            <div className="text-[10px] text-slate-400">
                              {r.variety}
                              {r.length ? ` . ${r.length}` : ''}
                              {r.unit ? ` . ${r.unit}` : ''}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {fmtUsd(r.price)} . stock {r.stock}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] font-mono text-slate-600">
                              {r.tier || '--'}
                            </span>
                            <span className="text-slate-700 text-[12px]">{r.vendor}</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {r.buckets.map((b) => (
                                <span
                                  key={b}
                                  className={
                                    b === 'k2k_live'
                                      ? 'text-[9px] px-1 py-0.5 rounded border font-medium bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : b === 't2'
                                        ? 'text-[9px] px-1 py-0.5 rounded border font-medium bg-blue-50 text-blue-700 border-blue-200'
                                        : 'text-[9px] px-1 py-0.5 rounded border font-medium bg-slate-50 text-slate-600 border-slate-200'
                                  }
                                >
                                  {b === 'k2k_live' ? 'K2K live' : b.toUpperCase()}
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-top text-right">
                          {r.importance_score == null ? (
                            <span
                              className="text-slate-300 text-base"
                              title="No featured-score seed match. Pipeline TBD."
                            >
                              --
                            </span>
                          ) : (
                            <span className="font-semibold text-slate-900">
                              {r.importance_score}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top text-right">
                          {r.quality_score == null ? (
                            <span className="text-slate-300 text-base">--</span>
                          ) : (
                            <div className="flex flex-col items-end">
                              <span className="font-semibold text-slate-900">
                                {r.quality_score}
                              </span>
                              <span
                                className={`mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${STATUS_BAND_CLS[r.status_band]}`}
                              >
                                {STATUS_BAND_LABEL[r.status_band]}
                              </span>
                            </div>
                          )}
                        </td>
                        {tab === 'improvement-queue' && (
                          <td className="px-3 py-2.5 align-top text-right">
                            <span className="font-semibold text-orange-700">
                              {Math.round(r.priority_to_fix).toLocaleString()}
                            </span>
                          </td>
                        )}
                        <td className="px-3 py-2.5 align-top">
                          {r.failed_gates.length === 0 ? (
                            <span className="text-[11px] text-emerald-700">
                              All gates clean
                            </span>
                          ) : (
                            <ul className="text-[11px] text-slate-600 space-y-0.5">
                              {r.failed_gates.slice(0, 3).map((g) => (
                                <li key={g.gate_id}>
                                  <span className="font-mono text-[10px] text-red-700">
                                    -{g.weight}
                                  </span>{' '}
                                  {g.display_label}
                                </li>
                              ))}
                              {r.failed_gates.length > 3 && (
                                <li className="text-slate-400">
                                  +{r.failed_gates.length - 3} more
                                </li>
                              )}
                            </ul>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          {action.href ? (
                            <Link
                              href={action.href}
                              className={
                                action.escalate
                                  ? 'inline-flex items-center text-[11px] px-2 py-1 rounded-md bg-orange-50 text-orange-800 border border-orange-200 hover:bg-orange-100 font-medium'
                                  : 'inline-flex items-center text-[11px] px-2 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 font-medium'
                              }
                              title={action.hint}
                            >
                              {action.label}
                            </Link>
                          ) : (
                            <span className="text-[11px] text-slate-400">--</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
          <span>Quality bands:</span>
          <span className="inline-flex items-center gap-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${STATUS_BAND_CLS.perfect}`}>
              Perfect
            </span>{' '}
            {perfect_min_score}+
          </span>
          <span className="inline-flex items-center gap-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${STATUS_BAND_CLS.almost_perfect}`}>
              Almost perfect
            </span>{' '}
            90-99
          </span>
          <span className="inline-flex items-center gap-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${STATUS_BAND_CLS.needs_minor_fix}`}>
              Needs minor fix
            </span>{' '}
            75-89
          </span>
          <span className="inline-flex items-center gap-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${STATUS_BAND_CLS.has_issues}`}>
              Has issues
            </span>{' '}
            50-74
          </span>
          <span className="inline-flex items-center gap-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${STATUS_BAND_CLS.broken}`}>
              Broken
            </span>{' '}
            &lt;50
          </span>
        </div>

        <p className="text-xs text-slate-400 mt-6">
          Catalog-v2 model: quality_score = weighted sum (0-100) of passing gates
          from catalog_quality_weights. Importance from featured-products framework
          (seed of 7 SKUs today; full pipeline pending TAM x seasonal x trend x
          quotes x competitor data). priority_to_fix = importance x (100 - quality).
          Data sources: supabase-backup public.floropolis_inventory_mirror,
          public.catalog_classifications, public.catalog_quality_weights,
          public.catalog_quality_thresholds.
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
      href={buildUrl(rawFilters, { tab: tab !== 'improvement-queue' ? tab : undefined, page: undefined, sort: undefined })}
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
