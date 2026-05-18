// Admin Unified Catalog -- multi-vendor SKU table backed by real data.
// v2 | 2026-05-18 | Job_PM admin-port X1 [V8 SHADOW]
//
// Replaces the X1 "Operational truth" view. Now mirrors the unified-catalog
// mockup at /mockups/admin-catalog: header + state toggle, counter summary,
// filter bar, table with source / GPM / visibility / awaiting-Facu signals.
//
// Data sources (all from supabase-backup, service-role reads):
//   - public.floropolis_inventory_mirror  (1000 rows; SKU truth)
//   - public.catalog_classifications      (currently empty; overlays gate
//                                          status / publishable when populated)
//   - public.admin_proposals              (awaiting_facu badges grouped by
//                                          target_id where target_table =
//                                          'floropolis_inventory_mirror')
//
// Filter model: pure server component, all state lives in URL search params so
// the page is bookmarkable and refresh-safe. Form submits via GET. No client
// JS required for filtering. Bulk-action buttons are placeholders.
//
// Source tiers:
//   - 'k2k_live' is derived when cost_source matches /_k2k_/ (e.g. Megaflor_k2k_2026-05-13)
//   - 't2' / 't3' come straight from mirror.tier
//
// Visibility:
//   - 'live'   = mirror.live = true
//   - 'hidden' = mirror.live = false AND mirror.active = true
//   - 'draft'  = mirror.active = false
//   Classification.status (when present) overrides into 'awaiting' label.
//
// Note on quality_family_id: the column exists on both tables but is null for
// all rows. We group / display by vendor + name as a fallback. TODO when
// quality_family_id is backfilled: surface family aggregation + cross-vendor
// merge in this view.
//
// Access: admin-only via session + client_profiles.status='admin', mirrored
// from /admin/refunds. Non-admin -> redirect('/').

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';

// -- Types ------------------------------------------------------------------

interface MirrorRow {
  id: number;
  name: string;
  vendor: string | null;
  tier: string | null;
  category: string | null;
  variety: string | null;
  length: string | null;
  unit: string | null;
  price: number | string | null;
  farm_cost: number | string | null;
  cost_source: string | null;
  cost_verified_at: string | null;
  stock: number | string | null;
  total_stems: number | null;
  units_per_box: number | string | null;
  box_type: string | null;
  margin_status: string | null;
  k2k_alignment_status: string | null;
  live: boolean;
  active: boolean;
  quality_family_id: string | null;
  is_on_deal: boolean | null;
  price_override: boolean | null;
}

interface ClassificationRow {
  sku_id: number;
  status: string;
  gate_score: number;
  failing_gates: string[] | null;
  vendor: string | null;
  tier: string | null;
}

type StateMode = 'today' | 'target';
type SourceTier = 't2' | 't3' | 'k2k_live';
type Visibility = 'live' | 'hidden' | 'draft';
type GpmBand = 'green' | 'yellow' | 'red' | 'no_gpm';

interface ComputedRow {
  id: number;
  name: string;
  vendor: string;
  tier: string;             // raw tier label ('T2' / 'T3')
  category: string;
  variety: string;
  length: string;
  unit: string;
  box_type: string;
  units_per_box: number | null;
  availability_total: number;
  vendor_cost_usd: number | null;
  target_price_usd: number | null;
  gpm_actual_pct: number | null;     // 0-1
  gpm_band: GpmBand;
  sources: SourceTier[];
  visibility: Visibility;
  classification_status: string | null;
  classification_score: number | null;
  proposal_count: number;
  is_on_deal: boolean;
  has_override: boolean;
  cost_source: string | null;
}

interface PageProps {
  searchParams: Promise<{
    state?: string;       // 'today' | 'target'
    q?: string;
    vendor?: string;      // exact vendor name
    source?: string;      // 'all' | 'k2k_live' | 't2' | 't3'
    category?: string;    // exact category name
    visibility?: string;  // 'all' | 'live' | 'hidden' | 'draft'
    gpm?: string;         // 'all' | 'green' | 'yellow' | 'red' | 'no_gpm'
    flags?: string;       // 'all' | 'no_cost' | 'no_box_dims' | 'awaiting_facu'
    page?: string;
  }>;
}

// -- Constants --------------------------------------------------------------

const PAGE_SIZE = 100;
const GPM_GREEN_FLOOR = 0.33;
const GPM_YELLOW_FLOOR = 0.28;

const SOURCE_LABELS: Record<SourceTier, string> = {
  t2: 'T2',
  t3: 'T3',
  k2k_live: 'K2K live',
};

const SOURCE_BADGE_CLS: Record<SourceTier, string> = {
  t2: 'bg-blue-50 text-blue-700 border-blue-200',
  t3: 'bg-slate-50 text-slate-600 border-slate-200',
  k2k_live: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const GPM_BAND_CLS: Record<Exclude<GpmBand, 'no_gpm'>, string> = {
  green: 'text-emerald-700',
  yellow: 'text-amber-700',
  red: 'text-red-700',
};

const VISIBILITY_BADGE_CLS: Record<Visibility, string> = {
  live: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  hidden: 'bg-slate-100 text-slate-600 border border-slate-200',
  draft: 'bg-amber-100 text-amber-800 border border-amber-200',
};

// -- Helpers ----------------------------------------------------------------

function asNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function fmtUsd(n: number | null): string {
  if (n == null) return '--';
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number | null): string {
  if (n == null) return '--';
  return `${(n * 100).toFixed(1)}%`;
}

function gpmBandFor(g: number | null): GpmBand {
  if (g == null) return 'no_gpm';
  if (g >= GPM_GREEN_FLOOR) return 'green';
  if (g >= GPM_YELLOW_FLOOR) return 'yellow';
  return 'red';
}

function deriveSources(row: MirrorRow): SourceTier[] {
  const out: SourceTier[] = [];
  if (row.tier === 'T2') out.push('t2');
  if (row.tier === 'T3') out.push('t3');
  // K2K live signal: cost_source contains '_k2k_' (e.g. Megaflor_k2k_2026-05-13)
  if (row.cost_source && /_k2k_/i.test(row.cost_source)) {
    out.push('k2k_live');
  }
  return out;
}

function deriveVisibility(row: MirrorRow): Visibility {
  if (row.live) return 'live';
  if (row.active) return 'hidden';
  return 'draft';
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

// -- Metadata ---------------------------------------------------------------

export const metadata = {
  title: 'Catalog | Floropolis Admin',
  robots: { index: false, follow: false },
};

// -- Page -------------------------------------------------------------------

export default async function AdminCatalogPage({ searchParams }: PageProps) {
  // Admin gate ------------------------------------------------------------
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

  // Parse filters ----------------------------------------------------------
  const sp = await searchParams;
  const stateMode: StateMode = sp.state === 'target' ? 'target' : 'today';
  const search = (sp.q ?? '').trim();
  const vendorFilter = (sp.vendor ?? 'all').trim();
  const sourceFilter = (sp.source ?? 'all').trim();
  const categoryFilter = (sp.category ?? 'all').trim();
  const visibilityFilter = (sp.visibility ?? 'all').trim();
  const gpmFilter = (sp.gpm ?? 'all').trim();
  const flagsFilter = (sp.flags ?? 'all').trim();
  const pageNum = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const rawFilters: Record<string, string | undefined> = {
    state: stateMode === 'target' ? 'target' : undefined,
    q: search || undefined,
    vendor: vendorFilter !== 'all' ? vendorFilter : undefined,
    source: sourceFilter !== 'all' ? sourceFilter : undefined,
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    visibility: visibilityFilter !== 'all' ? visibilityFilter : undefined,
    gpm: gpmFilter !== 'all' ? gpmFilter : undefined,
    flags: flagsFilter !== 'all' ? flagsFilter : undefined,
  };

  const backup = getBackupServiceClient();

  // Fetch mirror rows (filtered server-side where possible) --------------
  // We pull all rows for the filtered slice; with 1000 rows total this is
  // cheap. Post-filter for the derived fields (sources, gpm, flags) happens
  // in JS to keep the query simple.
  let mq = backup
    .from('floropolis_inventory_mirror')
    .select(
      'id, name, vendor, tier, category, variety, length, unit, price, farm_cost, cost_source, cost_verified_at, stock, total_stems, units_per_box, box_type, margin_status, k2k_alignment_status, live, active, quality_family_id, is_on_deal, price_override',
    );

  if (vendorFilter !== 'all') mq = mq.eq('vendor', vendorFilter);
  if (categoryFilter !== 'all') mq = mq.eq('category', categoryFilter);
  // tier is per-row enum; we map sourceFilter to server-side when possible
  if (sourceFilter === 't2') mq = mq.eq('tier', 'T2');
  if (sourceFilter === 't3') mq = mq.eq('tier', 'T3');
  if (sourceFilter === 'k2k_live') mq = mq.ilike('cost_source', '%_k2k_%');
  if (visibilityFilter === 'live') mq = mq.eq('live', true);
  if (visibilityFilter === 'hidden') mq = mq.eq('live', false).eq('active', true);
  if (visibilityFilter === 'draft') mq = mq.eq('active', false);

  // Hard cap so a runaway dataset doesn't blow the page (we expect ~1k).
  mq = mq.order('vendor', { ascending: true }).order('name', { ascending: true }).limit(5000);

  const { data: mirrorRowsRaw, error: mirrorErr } = await mq;
  if (mirrorErr) {
    console.error('[admin/catalog] mirror fetch error:', mirrorErr);
  }
  const mirrorRows = (mirrorRowsRaw ?? []) as unknown as MirrorRow[];

  // Fetch classifications overlay (currently empty in BACKUP) ------------
  const classificationsBySku = new Map<number, ClassificationRow>();
  if (mirrorRows.length > 0) {
    const ids = mirrorRows.map((r) => r.id);
    // chunk in case > 500
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
    for (const chunk of chunks) {
      const { data: cRows } = await backup
        .from('catalog_classifications')
        .select('sku_id, status, gate_score, failing_gates, vendor, tier')
        .in('sku_id', chunk);
      (cRows ?? []).forEach((c) => {
        classificationsBySku.set(c.sku_id as number, c as unknown as ClassificationRow);
      });
    }
  }

  // Fetch awaiting-Facu proposals grouped by target_id -------------------
  const proposalCountsBySku = new Map<number, number>();
  let totalAwaiting = 0;
  {
    const { data: propsRaw } = await backup
      .from('admin_proposals')
      .select('id, target_id')
      .eq('status', 'awaiting_facu')
      .eq('target_table', 'floropolis_inventory_mirror');
    (propsRaw ?? []).forEach((p) => {
      totalAwaiting += 1;
      const tid = (p.target_id as string | null) ?? '';
      const n = parseInt(tid, 10);
      if (!Number.isFinite(n)) return;
      proposalCountsBySku.set(n, (proposalCountsBySku.get(n) ?? 0) + 1);
    });
  }

  // Compute per-row derived fields ---------------------------------------
  const computed: ComputedRow[] = mirrorRows.map((r) => {
    const farm = asNum(r.farm_cost);
    const price = asNum(r.price);
    const gpm =
      farm != null && price != null && price > 0
        ? (price - farm) / price
        : null;
    const stock = asNum(r.stock);
    const totalStems = r.total_stems ?? null;
    const availability =
      totalStems != null
        ? totalStems
        : stock != null
          ? Math.round(stock)
          : 0;
    const sources = deriveSources(r);
    const visibility = deriveVisibility(r);
    const cls = classificationsBySku.get(r.id) ?? null;
    return {
      id: r.id,
      name: r.name,
      vendor: r.vendor ?? 'Unknown',
      tier: r.tier ?? '',
      category: r.category ?? '',
      variety: r.variety ?? '',
      length: r.length ?? '',
      unit: r.unit ?? '',
      box_type: r.box_type ?? '',
      units_per_box: asNum(r.units_per_box),
      availability_total: availability,
      vendor_cost_usd: farm,
      target_price_usd: price,
      gpm_actual_pct: gpm,
      gpm_band: gpmBandFor(gpm),
      sources,
      visibility,
      classification_status: cls?.status ?? null,
      classification_score: cls?.gate_score ?? null,
      proposal_count: proposalCountsBySku.get(r.id) ?? 0,
      is_on_deal: r.is_on_deal === true,
      has_override: r.price_override === true,
      cost_source: r.cost_source,
    };
  });

  // Apply derived-field filters (gpm / flags / search) -------------------
  let filtered = computed.filter((r) => {
    if (gpmFilter !== 'all' && r.gpm_band !== gpmFilter) return false;
    if (flagsFilter === 'no_cost' && r.vendor_cost_usd != null) return false;
    if (flagsFilter === 'no_box_dims' && r.box_type && r.box_type !== '') return false;
    if (flagsFilter === 'awaiting_facu' && r.proposal_count === 0) return false;
    if (search) {
      const q = search.toLowerCase();
      const blob = `${r.name} ${r.vendor} ${r.variety} ${r.category} ${r.id}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  // Pagination -----------------------------------------------------------
  const filteredTotal = filtered.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const page = Math.min(pageNum, totalPages);
  const sliceStart = (page - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(sliceStart, sliceStart + PAGE_SIZE);

  // Aggregated counters (across the FULL mirror, not the filter slice, so
  // the summary reflects reality not the current view) -------------------
  let allRows: MirrorRow[] = mirrorRows;
  let allVendors: string[] = [];
  let allCategories: string[] = [];
  {
    // If filters were applied, pull a second slim query for global counts.
    // This keeps the summary line stable across filter changes.
    if (
      vendorFilter !== 'all' ||
      categoryFilter !== 'all' ||
      sourceFilter !== 'all' ||
      visibilityFilter !== 'all'
    ) {
      const { data: globalRowsRaw } = await backup
        .from('floropolis_inventory_mirror')
        .select(
          'id, name, vendor, tier, category, variety, length, unit, price, farm_cost, cost_source, cost_verified_at, stock, total_stems, units_per_box, box_type, margin_status, k2k_alignment_status, live, active, quality_family_id, is_on_deal, price_override',
        )
        .limit(5000);
      allRows = (globalRowsRaw ?? []) as unknown as MirrorRow[];
    }
    const vSet = new Set<string>();
    const cSet = new Set<string>();
    for (const r of allRows) {
      if (r.vendor) vSet.add(r.vendor);
      if (r.category) cSet.add(r.category);
    }
    allVendors = Array.from(vSet).sort();
    allCategories = Array.from(cSet).sort();
  }

  const counts = (() => {
    let liveK2K = 0;
    let t2 = 0;
    let t3 = 0;
    let live = 0;
    let hidden = 0;
    let draft = 0;
    for (const r of allRows) {
      const tiers = deriveSources(r);
      if (tiers.includes('k2k_live')) liveK2K += 1;
      if (tiers.includes('t2')) t2 += 1;
      if (tiers.includes('t3')) t3 += 1;
      const vis = deriveVisibility(r);
      if (vis === 'live') live += 1;
      else if (vis === 'hidden') hidden += 1;
      else draft += 1;
    }
    return { liveK2K, t2, t3, live, hidden, draft };
  })();

  const totalAll = allRows.length;
  const vendorsCount = allVendors.length;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        {/* Breadcrumb */}
        <nav className="text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
          <span>Admin</span>
          <span className="mx-1.5">/</span>
          <span className="text-slate-700 font-medium">Catalog</span>
        </nav>

        {/* Header row -------------------------------------------------- */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Unified Catalog</h1>
            <p className="text-sm text-slate-500 mt-1">
              {totalAll.toLocaleString()} SKUs across {vendorsCount} vendors.{' '}
              <span className="text-emerald-700 font-medium">{counts.liveK2K} K2K live</span>{' / '}
              <span className="text-blue-700 font-medium">{counts.t2} T2</span>{' / '}
              <span className="text-slate-600 font-medium">{counts.t3} T3</span>{' . '}
              <span className="text-emerald-700">{counts.live} live</span>{' / '}
              <span className="text-slate-500">{counts.hidden} hidden</span>{' / '}
              <span className="text-amber-700">{counts.draft} draft</span>
              {totalAwaiting > 0 && (
                <>
                  {' . '}
                  <span className="text-orange-700">{totalAwaiting} awaiting Facu</span>
                </>
              )}
            </p>
          </div>

          {/* State mode toggle */}
          <div className="flex flex-col items-end gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              <Link
                href={buildUrl(rawFilters, { state: undefined, page: undefined })}
                className={
                  stateMode === 'today'
                    ? 'px-3 py-1 text-xs font-semibold rounded-md bg-emerald-600 text-white'
                    : 'px-3 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-50'
                }
              >
                Today
              </Link>
              <Link
                href={buildUrl(rawFilters, { state: 'target', page: undefined })}
                className={
                  stateMode === 'target'
                    ? 'px-3 py-1 text-xs font-semibold rounded-md bg-emerald-600 text-white'
                    : 'px-3 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-50'
                }
              >
                Target state
              </Link>
            </div>
            <p className="text-[11px] text-slate-400 max-w-xs text-right">
              {stateMode === 'today'
                ? "Today: reality from Rose's mirror -- gaps visible, ghost still alive."
                : 'Target: post-ghost K2K live + DB T2/T3 only. (Currently same data as Today; will diverge when classifications populate.)'}
            </p>
          </div>
        </div>

        {/* Target-state banner ---------------------------------------- */}
        {stateMode === 'target' && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl px-4 py-3 mb-4 text-xs text-amber-900">
            <span className="font-semibold">Target state is a stub.</span>{' '}
            catalog_classifications has 0 rows; until Subagent A populates it, Target shows
            the same data as Today.
          </div>
        )}

        {/* Filter bar --------------------------------------------------- */}
        <form action="/admin/catalog" method="get" className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          {/* Preserve state mode across submits */}
          {stateMode === 'target' && <input type="hidden" name="state" value="target" />}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Search</label>
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
              label="Source"
              name="source"
              defaultValue={sourceFilter}
              options={[
                { value: 'all', label: 'All sources' },
                { value: 'k2k_live', label: 'K2K live' },
                { value: 't2', label: 'T2 (commitments)' },
                { value: 't3', label: 'T3 (sourceable)' },
              ]}
            />
            <SelectField
              label="Category"
              name="category"
              defaultValue={categoryFilter}
              options={[
                { value: 'all', label: 'All' },
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
                { value: 'green', label: 'Green (>= 33%)' },
                { value: 'yellow', label: 'Yellow (28-33%)' },
                { value: 'red', label: 'Red (< 28%)' },
                { value: 'no_gpm', label: 'No GPM (missing cost)' },
              ]}
            />
            <SelectField
              label="Flags"
              name="flags"
              defaultValue={flagsFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'no_cost', label: 'Missing cost' },
                { value: 'no_box_dims', label: 'No box dims' },
                { value: 'awaiting_facu', label: 'Awaiting Facu' },
              ]}
            />
          </div>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Showing{' '}
              <span className="font-semibold text-slate-900">{pageRows.length}</span> on this page
              {' . '}
              <span className="font-semibold text-slate-900">{filteredTotal}</span> match filters
              {' . '}
              <span className="text-slate-400">{totalAll} total</span>
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
              <button
                type="button"
                disabled
                title="Coming soon"
                className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-400 cursor-not-allowed"
              >
                Bulk: override price
              </button>
              <button
                type="button"
                disabled
                title="Coming soon"
                className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-400 cursor-not-allowed"
              >
                Bulk: change vendor
              </button>
              <button
                type="button"
                disabled
                title="Coming soon"
                className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-400 cursor-not-allowed"
              >
                Bulk: add to campaign
              </button>
            </div>
          </div>
        </form>

        {/* Table ------------------------------------------------------- */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2.5">SKU</th>
                  <th className="px-3 py-2.5">Vendor</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Sources</th>
                  <th className="px-3 py-2.5 text-right">Avail</th>
                  <th className="px-3 py-2.5 text-right">Cost</th>
                  <th className="px-3 py-2.5 text-right">Price</th>
                  <th className="px-3 py-2.5 text-right">GPM</th>
                  <th className="px-3 py-2.5">Visibility</th>
                  <th className="px-3 py-2.5">Flags</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const gpmCls =
                    r.gpm_band === 'no_gpm' ? '' : GPM_BAND_CLS[r.gpm_band];
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
                          className="text-[11px] text-slate-700 mt-0.5 max-w-[220px] truncate"
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
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="text-slate-700">{r.vendor}</div>
                        {r.tier && (
                          <div className="text-[11px] text-slate-500">{r.tier}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="text-slate-700">{r.category || '-'}</div>
                        {r.box_type && (
                          <div className="text-[11px] text-slate-500">
                            box {r.box_type}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex flex-wrap gap-1">
                          {r.sources.length === 0 ? (
                            <span className="text-[10px] text-slate-400">none</span>
                          ) : (
                            r.sources.map((s) => (
                              <span
                                key={s}
                                className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${SOURCE_BADGE_CLS[s]}`}
                              >
                                {SOURCE_LABELS[s]}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top text-right text-slate-700">
                        {r.availability_total.toLocaleString()}
                        <div className="text-[10px] text-slate-400">stems</div>
                      </td>
                      <td className="px-3 py-2.5 align-top text-right">
                        {r.vendor_cost_usd == null ? (
                          <span className="text-amber-700 text-xs">missing</span>
                        ) : (
                          <span className="text-slate-900">{fmtUsd(r.vendor_cost_usd)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top text-right">
                        <span className="text-slate-900 font-semibold">
                          {fmtUsd(r.target_price_usd)}
                        </span>
                        {r.has_override && (
                          <div className="text-[10px] text-violet-700 mt-0.5">override</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top text-right">
                        {r.gpm_actual_pct == null ? (
                          <span className="text-slate-400 text-xs">--</span>
                        ) : (
                          <span className={`font-semibold ${gpmCls}`}>
                            {fmtPct(r.gpm_actual_pct)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${VISIBILITY_BADGE_CLS[r.visibility]}`}
                        >
                          {r.visibility}
                        </span>
                        {r.classification_status && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            cls: {r.classification_status}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex flex-col gap-1">
                          {r.proposal_count > 0 && (
                            <Link
                              href="/admin/catalog/approval-queue"
                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold w-fit hover:bg-orange-200"
                            >
                              {r.proposal_count} awaiting Facu
                            </Link>
                          )}
                          {r.vendor_cost_usd == null && (
                            <span className="text-[10px] text-amber-700">no cost</span>
                          )}
                          {!r.box_type && (
                            <span className="text-[10px] text-amber-700">no box dims</span>
                          )}
                          {r.is_on_deal && (
                            <span className="text-[10px] text-rose-700">on deal</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {pageRows.length === 0 && (
              <div className="px-3 py-12 text-center text-sm text-slate-500">
                No SKUs match the current filters.{' '}
                <Link href="/admin/catalog" className="text-emerald-700 hover:underline">
                  Reset filters
                </Link>{' '}
                to see all {totalAll} rows.
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

        {/* Legend ----------------------------------------------------- */}
        <div className="mt-4 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
          <span>Sources:</span>
          <span className="inline-flex items-center gap-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-emerald-50 text-emerald-700 border-emerald-200">
              K2K live
            </span>{' '}
            vendor uploaded (cost_source contains _k2k_)
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
            <span className="text-emerald-700 font-semibold">green &gt;= 33%</span>{' . '}
            <span className="text-amber-700 font-semibold">yellow 28-33%</span>{' . '}
            <span className="text-red-700 font-semibold">red &lt; 28%</span>
          </span>
        </div>

        <p className="text-xs text-slate-400 mt-6">
          Data source: supabase-backup public.floropolis_inventory_mirror (mirror of Rose&apos;s
          layer plan) overlaid with public.catalog_classifications (currently empty) and
          public.admin_proposals for awaiting-Facu badges. quality_family_id is null across
          all rows today; cross-vendor merge will activate when backfilled.
        </p>
      </main>

      <Footer />
    </div>
  );
}

// -- Subcomponents ----------------------------------------------------------

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
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{label}</label>
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
