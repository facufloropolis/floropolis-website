// Admin catalog -- discount rules editor.
// v1 | 2026-05-18 | Job_PM CAT-S10 [V8 SHADOW]
//
// Admin sets per-SKU deals on floropolis_inventory_mirror (is_on_deal,
// deal_label, deal_price, deal_expiry). Today these columns exist but only
// SQL can edit them -- this page is the UI.
//
// Sections:
//   1. Active deals -- SKUs where is_on_deal=true. Edit / End now.
//   2. Browse + add deal -- searchable/filterable SKU list, paginate 50/page.
//   3. Bulk apply -- modal form: filter (vendor/variety/tier), set
//      fixed $X or % off + label + expiry. Preview-then-confirm.
//
// Access:
//   - Middleware guards /admin and restricts to ADMIN_EMAILS or
//     client_profiles.status='admin'.
//   - Server-side belt-and-suspenders: re-check session + admin status.
//   - Non-admin -> redirect("/").
//
// Style: emerald-600 primary, Plus Jakarta Sans (inherited), ASCII-clean copy.

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';
import EditDealForm from './EditDealForm';
import BulkApplyForm from './BulkApplyForm';
import EndDealButton from './EndDealButton';

interface MirrorRow {
  id: number;
  name: string;
  variety: string | null;
  length: string | null;
  unit: string | null;
  price: number | string | null;
  vendor: string | null;
  category: string | null;
  tier: string | null;
  stock: number | null;
  is_on_deal: boolean | null;
  deal_label: string | null;
  deal_price: number | string | null;
  deal_expiry: string | null;
}

interface PageProps {
  searchParams: Promise<{
    q?: string;
    vendor?: string;
    variety?: string;
    tier?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 50;

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
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t < Date.now();
}

function skuLabel(r: MirrorRow): string {
  const bits = [r.name, r.variety, r.length].filter(Boolean);
  return bits.join(' / ') || `SKU #${r.id}`;
}

export const metadata = {
  title: 'Catalog discounts | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function AdminCatalogDiscountsPage({
  searchParams,
}: PageProps) {
  // Auth gate ------------------------------------------------------------
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

  // Filters --------------------------------------------------------------
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const vendor = (sp.vendor ?? '').trim();
  const variety = (sp.variety ?? '').trim();
  const tier = (sp.tier ?? '').trim().toUpperCase();
  const pageNum = Math.max(1, Number(sp.page ?? '1') || 1);
  const from = (pageNum - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const backup = getBackupServiceClient();
  const SELECT_COLS =
    'id,name,variety,length,unit,price,vendor,category,tier,stock,is_on_deal,deal_label,deal_price,deal_expiry';

  // Section 1: active deals (no pagination -- usually small).
  const { data: activeRaw, error: activeErr } = await backup
    .from('floropolis_inventory_mirror')
    .select(SELECT_COLS)
    .eq('is_on_deal', true)
    .order('deal_expiry', { ascending: true, nullsFirst: false })
    .limit(500);
  if (activeErr) {
    console.error('[admin/catalog/discounts] active fetch:', activeErr);
  }
  const active = (activeRaw ?? []) as unknown as MirrorRow[];

  // Filter-facets for the bulk modal + browse filters -- distinct vendors
  // and tiers. We pull a slim slice so the dropdowns don't balloon.
  const { data: facetRaw } = await backup
    .from('floropolis_inventory_mirror')
    .select('vendor,tier')
    .limit(5000);
  const vendors = Array.from(
    new Set(
      (facetRaw ?? [])
        .map((r) => (r as { vendor?: string | null }).vendor ?? '')
        .filter((v) => !!v),
    ),
  ).sort();
  const tiers = Array.from(
    new Set(
      (facetRaw ?? [])
        .map((r) => (r as { tier?: string | null }).tier ?? '')
        .filter((v) => !!v)
        .map((v) => v.toUpperCase()),
    ),
  ).sort();

  // Section 2: browse + add deal. Filter + paginate.
  let browseQuery = backup
    .from('floropolis_inventory_mirror')
    .select(SELECT_COLS, { count: 'exact' });
  if (q) {
    // ilike on name OR variety
    browseQuery = browseQuery.or(
      `name.ilike.%${q}%,variety.ilike.%${q}%`,
    );
  }
  if (vendor) browseQuery = browseQuery.eq('vendor', vendor);
  if (variety) browseQuery = browseQuery.ilike('variety', `%${variety}%`);
  if (tier) browseQuery = browseQuery.eq('tier', tier);

  const { data: browseRaw, count: browseCount, error: browseErr } =
    await browseQuery.order('name', { ascending: true }).range(from, to);
  if (browseErr) {
    console.error('[admin/catalog/discounts] browse fetch:', browseErr);
  }
  const browse = (browseRaw ?? []) as unknown as MirrorRow[];
  const total = browseCount ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Helpers for pager links ----------------------------------------------
  function buildHref(p: number): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (vendor) params.set('vendor', vendor);
    if (variety) params.set('variety', variety);
    if (tier) params.set('tier', tier);
    params.set('page', String(p));
    return `/admin/catalog/discounts?${params.toString()}`;
  }

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Discount rules
            </h1>
            <p className="text-slate-500 text-sm mt-1 max-w-2xl">
              Per-SKU deals on floropolis_inventory_mirror. Set a deal_price,
              label, and expiry. Active deals show on the shop with the label
              and a strikethrough on the original price.
            </p>
          </div>
          <BulkApplyForm vendors={vendors} tiers={tiers} />
        </div>

        {/* Section 1: Active deals --------------------------------------- */}
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-emerald-900 uppercase tracking-wide">
              Active deals
            </h2>
            <span className="text-xs text-slate-500">
              {active.length} live
            </span>
          </div>

          {active.length === 0 ? (
            <div className="text-center py-10 text-slate-400 border border-dashed border-slate-200 rounded-xl">
              <p className="font-semibold text-slate-600">No active deals</p>
              <p className="text-sm mt-1">
                Add one below or use bulk apply.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">SKU</th>
                    <th className="px-4 py-2 font-semibold">Vendor</th>
                    <th className="px-4 py-2 font-semibold text-right">Was</th>
                    <th className="px-4 py-2 font-semibold text-right">Deal</th>
                    <th className="px-4 py-2 font-semibold">Label</th>
                    <th className="px-4 py-2 font-semibold">Expiry</th>
                    <th className="px-4 py-2 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {active.map((r) => {
                    const expired = isExpired(r.deal_expiry);
                    return (
                      <tr key={r.id} className={expired ? 'bg-red-50' : ''}>
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-slate-900">
                            {skuLabel(r)}
                          </div>
                          <div className="text-xs text-slate-400 font-mono">
                            #{r.id}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          {r.vendor ?? '-'}
                        </td>
                        <td className="px-4 py-3 align-top text-right text-slate-500 line-through">
                          {fmtUsd(r.price)}
                        </td>
                        <td className="px-4 py-3 align-top text-right font-semibold text-emerald-700">
                          {fmtUsd(r.deal_price)}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          {r.deal_label ?? '-'}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          {fmtDate(r.deal_expiry)}
                          {expired && (
                            <span className="ml-1 text-[10px] font-semibold text-red-700 uppercase">
                              expired
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <div className="flex items-center justify-end gap-2">
                            <EditDealForm
                              skuId={r.id}
                              skuLabel={skuLabel(r)}
                              originalPrice={Number(r.price ?? 0)}
                              initialDealPrice={
                                r.deal_price != null
                                  ? Number(r.deal_price)
                                  : null
                              }
                              initialLabel={r.deal_label ?? ''}
                              initialExpiry={r.deal_expiry ?? ''}
                              initialIsOnDeal={!!r.is_on_deal}
                            />
                            <EndDealButton skuId={r.id} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Section 2: Browse + add deal ---------------------------------- */}
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
              Browse + add deal
            </h2>
            <span className="text-xs text-slate-500">
              {total} SKUs match
            </span>
          </div>

          <form
            method="get"
            action="/admin/catalog/discounts"
            className="mb-4 flex flex-wrap gap-2 items-end"
          >
            <div className="flex flex-col">
              <label className="text-[10px] uppercase text-slate-500 tracking-wide mb-1">
                Search name / variety
              </label>
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="e.g. antonia"
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-56"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] uppercase text-slate-500 tracking-wide mb-1">
                Vendor
              </label>
              <select
                name="vendor"
                defaultValue={vendor}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-44"
              >
                <option value="">All</option>
                {vendors.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] uppercase text-slate-500 tracking-wide mb-1">
                Tier
              </label>
              <select
                name="tier"
                defaultValue={tier}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm w-28"
              >
                <option value="">All</option>
                {tiers.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] uppercase text-slate-500 tracking-wide mb-1">
                Variety contains
              </label>
              <input
                type="text"
                name="variety"
                defaultValue={variety}
                placeholder="e.g. rose"
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-44"
              />
            </div>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-1.5 rounded-md"
            >
              Filter
            </button>
            <a
              href="/admin/catalog/discounts"
              className="text-sm text-slate-500 hover:text-slate-700 px-2 py-1.5"
            >
              Reset
            </a>
          </form>

          {browse.length === 0 ? (
            <div className="text-center py-10 text-slate-400 border border-dashed border-slate-200 rounded-xl">
              <p className="font-semibold text-slate-600">No SKUs match</p>
              <p className="text-sm mt-1">Adjust filters above.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">SKU</th>
                    <th className="px-4 py-2 font-semibold">Vendor</th>
                    <th className="px-4 py-2 font-semibold">Tier</th>
                    <th className="px-4 py-2 font-semibold text-right">Price</th>
                    <th className="px-4 py-2 font-semibold">On deal?</th>
                    <th className="px-4 py-2 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {browse.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-slate-900">
                          {skuLabel(r)}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          #{r.id}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-700">
                        {r.vendor ?? '-'}
                      </td>
                      <td className="px-4 py-3 align-top text-slate-700">
                        {(r.tier ?? '').toString().toUpperCase() || '-'}
                      </td>
                      <td className="px-4 py-3 align-top text-right text-slate-900">
                        {fmtUsd(r.price)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {r.is_on_deal ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold">
                            Yes
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <EditDealForm
                          skuId={r.id}
                          skuLabel={skuLabel(r)}
                          originalPrice={Number(r.price ?? 0)}
                          initialDealPrice={
                            r.deal_price != null
                              ? Number(r.deal_price)
                              : null
                          }
                          initialLabel={r.deal_label ?? ''}
                          initialExpiry={r.deal_expiry ?? ''}
                          initialIsOnDeal={!!r.is_on_deal}
                          ctaLabel={r.is_on_deal ? 'Edit' : 'Add to deal'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-500">
                Page {pageNum} of {pages}
              </span>
              <div className="flex gap-2">
                {pageNum > 1 && (
                  <a
                    href={buildHref(pageNum - 1)}
                    className="px-3 py-1 rounded border border-slate-200 hover:border-slate-300 text-slate-700"
                  >
                    Previous
                  </a>
                )}
                {pageNum < pages && (
                  <a
                    href={buildHref(pageNum + 1)}
                    className="px-3 py-1 rounded border border-slate-200 hover:border-slate-300 text-slate-700"
                  >
                    Next
                  </a>
                )}
              </div>
            </div>
          )}
        </section>

        <p className="text-xs text-slate-400 mt-8">
          Data source: supabase-backup floropolis_inventory_mirror. Edits write
          directly via service-role; the shop reads these columns on the next
          page render. Bulk apply requires explicit confirm after preview.
        </p>
      </main>

      <Footer />
    </div>
  );
}
