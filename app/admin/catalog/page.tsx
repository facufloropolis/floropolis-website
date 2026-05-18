// Admin Catalog -- Operational truth view (X1).
// v1 | 2026-05-18 | Job_PM CAT-S3 [V8 SHADOW]
//
// Reads catalog_classifications joined with floropolis_inventory_mirror to
// answer: "what are we publishing, what needs cleaning, who's worst?"
//
// Layout:
//   A. Rollup cards row (overall %, by vendor, by tier, by source)
//   B. Failure mode breakdown (counts per failing gate)
//   C. Filter bar (search + vendor/tier/status multi-select, score range)
//   D. Row table (50/page, worst-first by gate_score asc)
//
// Filters propagate via query params so cards are clickable + state is
// bookmarkable. Detail button links to /admin/catalog/[id] (stub page).
//
// Access:
//   - Middleware guards /admin and restricts to admin emails.
//   - Server-side belt-and-suspenders: re-check session +
//     client_profiles.status='admin' via service-role.
//   - Non-admin -> redirect("/").
//
// Style: emerald-600 primary, Plus Jakarta Sans (inherited), ASCII clean.
// NOTE: CAT-S2 populates the source table. Empty table -> empty state copy.

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';

// -- Types ------------------------------------------------------------------

interface ClassificationRow {
  sku_id: number;
  status: string;
  gate_score: number;
  failing_gates: string[] | null;
  vendor: string | null;
  tier: string | null;
  variety: string | null;
  last_validated_at: string | null;
  last_changed_at: string | null;
  reviewer_action: string | null;
}

interface MirrorRow {
  id: number;
  name: string | null;
  variety: string | null;
  price: number | string | null;
  vendor: string | null;
  tier: string | null;
  cost_source: string | null;
}

interface JoinedRow extends ClassificationRow {
  name: string | null;
  price: number | string | null;
  cost_source: string | null;
}

interface PageProps {
  searchParams: Promise<{
    q?: string;
    vendor?: string;       // comma-separated
    tier?: string;         // comma-separated
    status?: string;       // comma-separated
    gate?: string;         // single gate id (failure-mode filter)
    min_score?: string;
    max_score?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  'publishable',
  'needs_data_fix',
  'needs_facu_review',
  'admin_overridden_publish',
  'admin_overridden_hide',
];

const STATUS_LABEL: Record<string, string> = {
  publishable: 'Publishable',
  needs_data_fix: 'Needs data fix',
  needs_facu_review: 'Needs Facu review',
  admin_overridden_publish: 'Override: publish',
  admin_overridden_hide: 'Override: hide',
};

const STATUS_BADGE: Record<string, string> = {
  publishable: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  needs_data_fix: 'bg-amber-100 text-amber-800 border-amber-200',
  needs_facu_review: 'bg-orange-100 text-orange-800 border-orange-200',
  admin_overridden_publish: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  admin_overridden_hide: 'bg-slate-100 text-slate-600 border-slate-200',
};

// -- Helpers ----------------------------------------------------------------

function parseCsv(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function clampInt(v: string | undefined, lo: number, hi: number, fallback: number): number {
  if (v == null) return fallback;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function fmtPct(num: number, den: number): string {
  if (den === 0) return '-';
  return `${Math.round((num / den) * 100)}%`;
}

function fmtUsd(amount: number | string | null): string {
  if (amount == null) return '-';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '-';
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function gateScoreBadge(score: number): string {
  if (score <= 8) return 'bg-red-100 text-red-800 border-red-200';
  if (score <= 12) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-emerald-100 text-emerald-800 border-emerald-200';
}

function statusBadgeCls(status: string): string {
  return STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-700 border-slate-200';
}

// Build a URL with the current filters, toggling/overriding selected keys.
function buildUrl(
  base: Record<string, string | undefined>,
  override: Record<string, string | undefined>,
): string {
  const merged: Record<string, string | undefined> = { ...base, ...override };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v && v !== '') params.set(k, v);
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

  // Parse filters from query params --------------------------------------
  const sp = await searchParams;
  const search = (sp.q ?? '').trim();
  const vendorFilter = parseCsv(sp.vendor);
  const tierFilter = parseCsv(sp.tier);
  const statusFilter = parseCsv(sp.status);
  const gateFilter = (sp.gate ?? '').trim();
  const minScore = clampInt(sp.min_score, 0, 16, 0);
  const maxScore = clampInt(sp.max_score, 0, 16, 16);
  const page = clampInt(sp.page, 1, 9999, 1);

  const rawFilters: Record<string, string | undefined> = {
    q: search || undefined,
    vendor: vendorFilter.length ? vendorFilter.join(',') : undefined,
    tier: tierFilter.length ? tierFilter.join(',') : undefined,
    status: statusFilter.length ? statusFilter.join(',') : undefined,
    gate: gateFilter || undefined,
    min_score: minScore !== 0 ? String(minScore) : undefined,
    max_score: maxScore !== 16 ? String(maxScore) : undefined,
  };

  const backup = getBackupServiceClient();

  // Quick existence check: is the table populated at all? ----------------
  const { count: totalCount } = await backup
    .from('catalog_classifications')
    .select('sku_id', { count: 'exact', head: true });
  const tableEmpty = (totalCount ?? 0) === 0;

  // ------------------------------------------------------------------------
  // Rollup queries (parallel) -- aggregated in JS for portability across
  // PostgREST. These are 3 light queries, each pulling small projections.
  // ------------------------------------------------------------------------
  let overallByStatus: Record<string, number> = {};
  let vendorAgg: { vendor: string; total: number; publishable: number }[] = [];
  let tierAgg: { tier: string; total: number; publishable: number }[] = [];
  let sourceAgg: { source: string; total: number; publishable: number }[] = [];
  let failureModes: { gate: string; count: number }[] = [];
  let allVendors: string[] = [];
  let allTiers: string[] = [];

  if (!tableEmpty) {
    // Status rollup ------------------------------------------------------
    const { data: statusRows } = await backup
      .from('catalog_classifications')
      .select('status');
    const byStatus: Record<string, number> = {};
    (statusRows ?? []).forEach((r) => {
      const s = r.status as string;
      byStatus[s] = (byStatus[s] ?? 0) + 1;
    });
    overallByStatus = byStatus;

    // Vendor + tier rollup (denormalized on classifications) ------------
    const { data: vtRows } = await backup
      .from('catalog_classifications')
      .select('vendor, tier, status');
    const vMap = new Map<string, { total: number; publishable: number }>();
    const tMap = new Map<string, { total: number; publishable: number }>();
    (vtRows ?? []).forEach((r) => {
      const v = (r.vendor as string | null) ?? 'unknown';
      const t = (r.tier as string | null) ?? 'unknown';
      const isPub = r.status === 'publishable' || r.status === 'admin_overridden_publish';
      const vi = vMap.get(v) ?? { total: 0, publishable: 0 };
      vi.total += 1;
      if (isPub) vi.publishable += 1;
      vMap.set(v, vi);
      const ti = tMap.get(t) ?? { total: 0, publishable: 0 };
      ti.total += 1;
      if (isPub) ti.publishable += 1;
      tMap.set(t, ti);
    });
    vendorAgg = Array.from(vMap.entries())
      .map(([vendor, x]) => ({ vendor, ...x }))
      .sort((a, b) => a.publishable / Math.max(a.total, 1) - b.publishable / Math.max(b.total, 1));
    tierAgg = Array.from(tMap.entries())
      .map(([tier, x]) => ({ tier, ...x }))
      .sort((a, b) => a.tier.localeCompare(b.tier));
    allVendors = Array.from(vMap.keys()).sort();
    allTiers = Array.from(tMap.keys()).sort();

    // Source rollup -- cost_source lives on the mirror. We pull mirror
    // (sku_id, cost_source) once and bucket against classification status.
    // Join keyed on sku_id.
    const skuIds = (vtRows ?? []).map((r) => (r as unknown as ClassificationRow).sku_id);
    // We need the sku_id and status pair too -- re-pull or zip from vtRows.
    // vtRows only has vendor/tier/status, not sku_id. Re-pull a flat list.
    const { data: idStatusRows } = await backup
      .from('catalog_classifications')
      .select('sku_id, status');
    const statusBySku = new Map<number, string>();
    (idStatusRows ?? []).forEach((r) => {
      statusBySku.set(r.sku_id as number, r.status as string);
    });
    const allSkuIds = Array.from(statusBySku.keys());
    if (allSkuIds.length > 0) {
      // Chunk the IN(...) in case there are thousands of ids
      const chunks: number[][] = [];
      for (let i = 0; i < allSkuIds.length; i += 500) {
        chunks.push(allSkuIds.slice(i, i + 500));
      }
      const sMap = new Map<string, { total: number; publishable: number }>();
      for (const chunk of chunks) {
        const { data: mirrorRows } = await backup
          .from('floropolis_inventory_mirror')
          .select('id, cost_source')
          .in('id', chunk);
        (mirrorRows ?? []).forEach((m) => {
          const src = (m.cost_source as string | null) ?? 'unknown';
          const status = statusBySku.get(m.id as number);
          if (!status) return;
          const isPub = status === 'publishable' || status === 'admin_overridden_publish';
          const si = sMap.get(src) ?? { total: 0, publishable: 0 };
          si.total += 1;
          if (isPub) si.publishable += 1;
          sMap.set(src, si);
        });
      }
      sourceAgg = Array.from(sMap.entries())
        .map(([source, x]) => ({ source, ...x }))
        .sort((a, b) => b.total - a.total);
    }

    // Failure modes -----------------------------------------------------
    const { data: gateRows } = await backup
      .from('catalog_classifications')
      .select('failing_gates');
    const gMap = new Map<string, number>();
    (gateRows ?? []).forEach((r) => {
      const arr = (r.failing_gates as string[] | null) ?? [];
      arr.forEach((g) => {
        gMap.set(g, (gMap.get(g) ?? 0) + 1);
      });
    });
    failureModes = Array.from(gMap.entries())
      .map(([gate, count]) => ({ gate, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
    // silence unused warning for skuIds (was a transitional var)
    void skuIds;
  }

  const overallTotal = Object.values(overallByStatus).reduce((s, n) => s + n, 0);
  const overallPub =
    (overallByStatus['publishable'] ?? 0) +
    (overallByStatus['admin_overridden_publish'] ?? 0);

  // ------------------------------------------------------------------------
  // Row fetch (paginated) -- apply filters server-side.
  // ------------------------------------------------------------------------
  let rows: JoinedRow[] = [];
  let filteredCount = 0;

  if (!tableEmpty) {
    // Apply server-side filters on classifications. We can't easily filter
    // by mirror.name in PostgREST without a foreign-table embed; instead
    // we filter by classification fields server-side, then post-filter by
    // search after the mirror join.
    let cq = backup.from('catalog_classifications').select(
      'sku_id, status, gate_score, failing_gates, vendor, tier, variety, last_validated_at, last_changed_at, reviewer_action',
      { count: 'exact' },
    );

    if (vendorFilter.length > 0) cq = cq.in('vendor', vendorFilter);
    if (tierFilter.length > 0) cq = cq.in('tier', tierFilter);
    if (statusFilter.length > 0) cq = cq.in('status', statusFilter);
    cq = cq.gte('gate_score', minScore).lte('gate_score', maxScore);
    if (gateFilter) {
      // jsonb contains: ["gate_id"] -- supabase-js .contains
      cq = cq.contains('failing_gates', [gateFilter]);
    }
    cq = cq.order('gate_score', { ascending: true }).order('last_validated_at', { ascending: false });

    // We over-fetch a little when search is on so we can post-filter by
    // name/variety from the mirror without paging through everything.
    const fetchLimit = search ? 500 : PAGE_SIZE;
    const fetchOffset = search ? 0 : (page - 1) * PAGE_SIZE;
    const { data: classRows, count: cCount } = await cq.range(
      fetchOffset,
      fetchOffset + fetchLimit - 1,
    );

    const classifications = (classRows ?? []) as unknown as ClassificationRow[];
    filteredCount = cCount ?? classifications.length;

    // Join with mirror to pick up name + price + cost_source.
    const ids = classifications.map((c) => c.sku_id);
    const mirrorMap = new Map<number, MirrorRow>();
    if (ids.length > 0) {
      const chunks: number[][] = [];
      for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
      for (const chunk of chunks) {
        const { data: mRows } = await backup
          .from('floropolis_inventory_mirror')
          .select('id, name, variety, price, vendor, tier, cost_source')
          .in('id', chunk);
        (mRows ?? []).forEach((m) => {
          mirrorMap.set(m.id as number, m as unknown as MirrorRow);
        });
      }
    }

    let joined: JoinedRow[] = classifications.map((c) => {
      const m = mirrorMap.get(c.sku_id);
      return {
        ...c,
        name: m?.name ?? null,
        price: m?.price ?? null,
        cost_source: m?.cost_source ?? null,
      };
    });

    if (search) {
      const q = search.toLowerCase();
      joined = joined.filter((r) => {
        const blob = `${r.name ?? ''} ${r.variety ?? ''} ${r.sku_id}`.toLowerCase();
        return blob.includes(q);
      });
      filteredCount = joined.length;
      // Re-page after post-filter
      const start = (page - 1) * PAGE_SIZE;
      joined = joined.slice(start, start + PAGE_SIZE);
    }

    rows = joined;
  }

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <nav className="text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
            <span>Admin</span>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700 font-medium">Catalog</span>
          </nav>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Catalog</h1>
              <p className="text-slate-500 text-sm mt-1">
                Operational truth: what we publish, what needs cleaning, who is worst.
                Worst-first sort by gate score (0-16). Click a card or failure mode to filter.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/admin/catalog/config"
                className="text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
              >
                Configuration
              </Link>
              <Link
                href="/admin/catalog/discounts"
                className="text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
              >
                Discounts
              </Link>
            </div>
          </div>
        </div>

        {/* Empty state ----------------------------------------------------*/}
        {tableEmpty ? (
          <div className="text-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <p className="font-semibold text-slate-700">No classifications yet</p>
            <p className="text-sm mt-2 max-w-md mx-auto">
              The catalog validator has not populated <code className="font-mono text-xs">catalog_classifications</code> yet.
              Check <code className="font-mono text-xs">/api/cron/validator-trigger</code> or wait for the daily 14:00 UTC run.
            </p>
          </div>
        ) : (
          <>
            {/* A. Rollup cards row --------------------------------------*/}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* Card 1: overall publishable % */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  Overall publishable
                </div>
                <div className="flex items-end gap-2 mt-2">
                  <span className="text-3xl font-bold text-emerald-700">
                    {fmtPct(overallPub, overallTotal)}
                  </span>
                  <span className="text-xs text-slate-500 mb-1">
                    {overallPub.toLocaleString()} / {overallTotal.toLocaleString()}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  {STATUS_OPTIONS.map((s) => {
                    const c = overallByStatus[s] ?? 0;
                    if (c === 0) return null;
                    return (
                      <Link
                        key={s}
                        href={buildUrl(rawFilters, { status: s, page: undefined })}
                        className="flex justify-between hover:text-slate-900 text-slate-600"
                      >
                        <span>{STATUS_LABEL[s]}</span>
                        <span className="font-mono">{c}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Card 2: by vendor (worst 5) */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  Publishable by vendor (worst 5)
                </div>
                <div className="mt-2 space-y-2">
                  {vendorAgg.slice(0, 5).map((v) => {
                    const pct = v.publishable / Math.max(v.total, 1);
                    return (
                      <Link
                        key={v.vendor}
                        href={buildUrl(rawFilters, { vendor: v.vendor, page: undefined })}
                        className="block group"
                      >
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-700 group-hover:text-slate-900 truncate max-w-[60%]">
                            {v.vendor}
                          </span>
                          <span className="font-mono text-slate-600">
                            {Math.round(pct * 100)}% ({v.publishable}/{v.total})
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 bg-slate-100 rounded overflow-hidden">
                          <div
                            className={
                              pct >= 0.8
                                ? 'h-full bg-emerald-500'
                                : pct >= 0.5
                                  ? 'h-full bg-amber-500'
                                  : 'h-full bg-red-500'
                            }
                            style={{ width: `${Math.round(pct * 100)}%` }}
                          />
                        </div>
                      </Link>
                    );
                  })}
                  {vendorAgg.length === 0 && (
                    <p className="text-xs text-slate-400">No vendor data.</p>
                  )}
                </div>
              </div>

              {/* Card 3: by tier */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  Publishable by tier
                </div>
                <div className="mt-2 space-y-2">
                  {tierAgg.map((t) => {
                    const pct = t.publishable / Math.max(t.total, 1);
                    return (
                      <Link
                        key={t.tier}
                        href={buildUrl(rawFilters, { tier: t.tier, page: undefined })}
                        className="block group"
                      >
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-700 group-hover:text-slate-900 font-medium">
                            {t.tier}
                          </span>
                          <span className="font-mono text-slate-600">
                            {Math.round(pct * 100)}% ({t.publishable}/{t.total})
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 bg-slate-100 rounded overflow-hidden">
                          <div
                            className={
                              pct >= 0.8
                                ? 'h-full bg-emerald-500'
                                : pct >= 0.5
                                  ? 'h-full bg-amber-500'
                                  : 'h-full bg-red-500'
                            }
                            style={{ width: `${Math.round(pct * 100)}%` }}
                          />
                        </div>
                      </Link>
                    );
                  })}
                  {tierAgg.length === 0 && (
                    <p className="text-xs text-slate-400">No tier data.</p>
                  )}
                </div>
              </div>

              {/* Card 4: by source */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  Publishable by cost source
                </div>
                <table className="w-full mt-2 text-xs">
                  <thead className="text-[10px] text-slate-500 uppercase">
                    <tr>
                      <th className="text-left py-1">Source</th>
                      <th className="text-right py-1">Pub %</th>
                      <th className="text-right py-1">N</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceAgg.slice(0, 6).map((s) => {
                      const pct = s.publishable / Math.max(s.total, 1);
                      const cls =
                        pct >= 0.8
                          ? 'text-emerald-700'
                          : pct >= 0.5
                            ? 'text-amber-700'
                            : 'text-red-700';
                      return (
                        <tr key={s.source} className="border-t border-slate-100">
                          <td className="py-1.5 text-slate-700 truncate max-w-[100px]">
                            {s.source}
                          </td>
                          <td className={`py-1.5 text-right font-mono font-semibold ${cls}`}>
                            {Math.round(pct * 100)}%
                          </td>
                          <td className="py-1.5 text-right text-slate-500 font-mono">
                            {s.total}
                          </td>
                        </tr>
                      );
                    })}
                    {sourceAgg.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-3 text-slate-400 text-center">
                          No source data.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* B. Failure mode breakdown -------------------------------*/}
            <section className="mb-8">
              <div className="flex items-end justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Failure modes</h2>
                  <p className="text-sm text-slate-500">
                    Count of SKUs failing each gate. Click a bar to filter the row table below.
                  </p>
                </div>
                {gateFilter && (
                  <Link
                    href={buildUrl(rawFilters, { gate: undefined, page: undefined })}
                    className="text-xs px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                  >
                    Clear gate: {gateFilter}
                  </Link>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-5 bg-white">
                {failureModes.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">
                    No failing gates -- every SKU passes.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {failureModes.map((f) => {
                      const max = failureModes[0].count;
                      const widthPct = Math.round((f.count / max) * 100);
                      const active = f.gate === gateFilter;
                      return (
                        <Link
                          key={f.gate}
                          href={buildUrl(rawFilters, {
                            gate: active ? undefined : f.gate,
                            page: undefined,
                          })}
                          className="block group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-44 text-xs text-slate-700 font-mono truncate group-hover:text-slate-900">
                              {f.gate}
                            </div>
                            <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                              <div
                                className={
                                  active
                                    ? 'h-full bg-emerald-600'
                                    : 'h-full bg-emerald-400 group-hover:bg-emerald-500'
                                }
                                style={{ width: `${widthPct}%` }}
                              />
                            </div>
                            <div className="w-16 text-right text-xs font-mono text-slate-700">
                              {f.count}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* C. Filter bar -------------------------------------------*/}
            <form
              action="/admin/catalog"
              method="get"
              className="bg-white border border-slate-200 rounded-xl p-4 mb-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                {/* Search */}
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Search
                  </label>
                  <input
                    name="q"
                    defaultValue={search}
                    placeholder="SKU id, name, variety..."
                    className="w-full px-2 py-1.5 text-sm rounded-md border border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* Vendor multi-select */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Vendor (ctrl-click)
                  </label>
                  <select
                    name="vendor"
                    multiple
                    defaultValue={vendorFilter}
                    size={3}
                    className="w-full px-2 py-1 text-sm rounded-md border border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {allVendors.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tier multi-select */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Tier
                  </label>
                  <select
                    name="tier"
                    multiple
                    defaultValue={tierFilter}
                    size={3}
                    className="w-full px-2 py-1 text-sm rounded-md border border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {allTiers.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status multi-select */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Status
                  </label>
                  <select
                    name="status"
                    multiple
                    defaultValue={statusFilter}
                    size={3}
                    className="w-full px-2 py-1 text-sm rounded-md border border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Score range */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Gate score range
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      name="min_score"
                      defaultValue={minScore}
                      min={0}
                      max={16}
                      className="w-16 px-2 py-1.5 text-sm rounded-md border border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <input
                      type="number"
                      name="max_score"
                      defaultValue={maxScore}
                      min={0}
                      max={16}
                      className="w-16 px-2 py-1.5 text-sm rounded-md border border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Preserve gate filter on form submit */}
              {gateFilter && <input type="hidden" name="gate" value={gateFilter} />}

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  Showing{' '}
                  <span className="font-semibold text-slate-900">{rows.length}</span> on this page
                  {' . '}
                  <span className="font-semibold text-slate-900">{filteredCount}</span> match filters
                  {' . '}
                  <span className="text-slate-400">{overallTotal} total classified</span>
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

            {/* D. Row table --------------------------------------------*/}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="px-3 py-2.5">SKU</th>
                      <th className="px-3 py-2.5">Name / variety</th>
                      <th className="px-3 py-2.5">Vendor</th>
                      <th className="px-3 py-2.5">Tier</th>
                      <th className="px-3 py-2.5 text-right">Price</th>
                      <th className="px-3 py-2.5 text-right">Gate</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Failing gates</th>
                      <th className="px-3 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const fg = r.failing_gates ?? [];
                      const fgTop = fg.slice(0, 3);
                      const fgExtra = fg.length - fgTop.length;
                      return (
                        <tr
                          key={r.sku_id}
                          className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-3 py-2.5 align-top">
                            <Link
                              href={`/admin/catalog/${r.sku_id}`}
                              className="font-mono text-[11px] text-emerald-700 hover:underline"
                            >
                              {r.sku_id}
                            </Link>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {fmtDate(r.last_validated_at)}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            <div className="text-slate-900 font-medium max-w-[220px] truncate">
                              {r.name ?? <span className="text-slate-400">(no name)</span>}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {r.variety ?? '-'}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-top text-slate-700">
                            {r.vendor ?? '-'}
                          </td>
                          <td className="px-3 py-2.5 align-top text-slate-700">
                            {r.tier ?? '-'}
                          </td>
                          <td className="px-3 py-2.5 align-top text-right text-slate-900">
                            {fmtUsd(r.price)}
                          </td>
                          <td className="px-3 py-2.5 align-top text-right">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border font-mono ${gateScoreBadge(
                                r.gate_score,
                              )}`}
                            >
                              {r.gate_score}/16
                            </span>
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadgeCls(
                                r.status,
                              )}`}
                            >
                              {STATUS_LABEL[r.status] ?? r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            <div className="flex flex-wrap gap-1">
                              {fgTop.map((g) => (
                                <span
                                  key={g}
                                  className="text-[10px] px-1.5 py-0.5 rounded border font-mono bg-red-50 text-red-700 border-red-200"
                                >
                                  {g}
                                </span>
                              ))}
                              {fgExtra > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                                  +{fgExtra}
                                </span>
                              )}
                              {fg.length === 0 && (
                                <span className="text-[10px] text-slate-400">none</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-top text-right">
                            <Link
                              href={`/admin/catalog/${r.sku_id}`}
                              className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 inline-block"
                            >
                              Detail
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length === 0 && (
                  <div className="px-3 py-12 text-center text-sm text-slate-500">
                    No rows match the current filters.
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

            <p className="text-xs text-slate-400 mt-8">
              Data source: supabase-backup public.catalog_classifications joined to
              public.floropolis_inventory_mirror. Worst-first sort by gate_score asc.
              Validator (Subagent A) writes one row per SKU per run.
            </p>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
