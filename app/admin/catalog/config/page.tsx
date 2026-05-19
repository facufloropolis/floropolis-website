// Admin Catalog Configuration -- multi-country, propose -> approve flow.
// v3 | 2026-05-19 | Job_PM Phase D [V8 SHADOW]
//
// Four sub-panels, each with Active / Proposed tabs (?panel=, ?tab=):
//   1. Box master       -- READ-ONLY per Rose contract v1.0 (Section 1).
//                          "Flag to CEO" button creates a rose_queue row.
//   2. Pricing constants -- pricing_constants rows, pricing_constants.update proposal
//                          form now carries source_artifact + urgency_tier.
//   3. Shipping config   -- shipping_config_v2 rows, shipping_config.create proposal
//   4. Visibility windows -- NEW. tier_visibility_windows rows; per-country
//                          accept-toggle gated by 5 pipeline-check booleans.
//
// All writes route through POST /api/admin/proposals (KNOWN_PROPOSAL_TYPES),
// except box flags which write to /api/admin/catalog/config/flag-rose (rose_queue).
// Proposed-tab approve/reject buttons hit POST /api/admin/proposals/[id]/{approve,reject}.
// Service-role reads via getBackupServiceClient(). Force-dynamic.
//
// Style: emerald-600 primary, Plus Jakarta Sans, ASCII-clean copy.

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';
import WiringSection from '@/components/admin/WiringSection';
import MockupLinkBanner from '@/components/admin/MockupLinkBanner';
import { getWiringForPage } from '@/lib/admin/wiring';
import {
  BoxFlagCEOForm,
  PricingConstantsProposeForm,
  ShippingConfigCreateForm,
  ProposalDecisionButtons,
  TierVisibilityAcceptCountryForm,
  TierVisibilityWindowEditForm,
} from './ProposalForms';

export const metadata = {
  title: 'Catalog Configuration | Floropolis Admin',
  robots: { index: false, follow: false },
};

// ----- row types ------------------------------------------------------------

export interface BoxMasterRow {
  box_type: string;
  weight_kg: number | string;
  description: string | null;
  validated_by: string | null;
  validated_at: string | null;
  notes: string | null;
  active: boolean;
  updated_at: string | null;
}

export interface PricingConstantRow {
  id: string;
  value_numeric: number | string | null;
  description: string;
  unit: string | null;
  updated_at: string | null;
}

export interface ShippingConfigRow {
  id: string;
  origin_country: string;
  dest_port: string;
  zone: string;
  fuel_pct: number | string;
  dim_divisor: number;
  rel_number: number | string;
  effective_from: string;
  effective_until: string | null;
}

export interface TierVisibilityWindowRow {
  id: string;
  tier: string;
  origin_country: string;
  accepted: boolean;
  earliest_delivery_days: number;
  latest_delivery_days: number;
  pipeline_checks: Record<string, unknown> | null;
  effective_from: string;
  effective_until: string | null;
  notes: string | null;
}

export interface AdminProposalRow {
  id: string;
  type: string;
  target_table: string;
  target_id: string | null;
  payload: Record<string, unknown>;
  warnings: unknown;
  status: string;
  proposed_by: string | null;
  proposed_at: string;
  notes: string | null;
}

// ----- helpers --------------------------------------------------------------

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type PanelKey = 'boxes' | 'pricing' | 'shipping' | 'visibility';
type TabKey = 'active' | 'proposed';

function parsePanel(v: string | string[] | undefined): PanelKey {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === 'pricing' || s === 'shipping' || s === 'visibility') return s;
  return 'boxes';
}
function parseTab(v: string | string[] | undefined): TabKey {
  const s = Array.isArray(v) ? v[0] : v;
  return s === 'proposed' ? 'proposed' : 'active';
}

// ----- page -----------------------------------------------------------------

interface SearchParams {
  panel?: string | string[];
  tab?: string | string[];
}

export default async function AdminCatalogConfigPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // admin gate -------------------------------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect('/shop');

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'admin') {
    redirect('/shop');
  }

  const sp = await searchParams;
  const panel = parsePanel(sp.panel);
  const tab = parseTab(sp.tab);

  // fetch all rows + proposals + SKU counts in parallel --------------------
  const backup = getBackupServiceClient();

  const [
    boxesRes,
    constantsRes,
    shipsRes,
    windowsRes,
    pricingPropsRes,
    shipPropsRes,
    windowPropsRes,
    skuByBoxRes,
    totalSkusRes,
  ] = await Promise.all([
    backup
      .from('box_master')
      .select('box_type, weight_kg, description, validated_by, validated_at, notes, active, updated_at')
      .order('box_type', { ascending: true }),
    backup
      .from('pricing_constants')
      .select('id, value_numeric, description, unit, updated_at')
      .order('id', { ascending: true }),
    backup
      .from('shipping_config_v2')
      .select('id, origin_country, dest_port, zone, fuel_pct, dim_divisor, rel_number, effective_from, effective_until')
      .order('origin_country', { ascending: true })
      .order('dest_port', { ascending: true })
      .order('effective_from', { ascending: false }),
    backup
      .from('tier_visibility_windows')
      .select('id, tier, origin_country, accepted, earliest_delivery_days, latest_delivery_days, pipeline_checks, effective_from, effective_until, notes')
      .order('origin_country', { ascending: true })
      .order('tier', { ascending: true }),
    backup
      .from('admin_proposals')
      .select('id, type, target_table, target_id, payload, warnings, status, proposed_by, proposed_at, notes')
      .eq('type', 'pricing_constants.update')
      .eq('status', 'awaiting_facu')
      .order('proposed_at', { ascending: false }),
    backup
      .from('admin_proposals')
      .select('id, type, target_table, target_id, payload, warnings, status, proposed_by, proposed_at, notes')
      .eq('type', 'shipping_config.create')
      .eq('status', 'awaiting_facu')
      .order('proposed_at', { ascending: false }),
    backup
      .from('admin_proposals')
      .select('id, type, target_table, target_id, payload, warnings, status, proposed_by, proposed_at, notes')
      .in('type', ['tier_visibility_window.accept_country', 'tier_visibility_window.update'])
      .eq('status', 'awaiting_facu')
      .order('proposed_at', { ascending: false }),
    backup
      .from('floropolis_inventory_mirror')
      .select('box_type')
      .not('box_type', 'is', null),
    backup
      .from('floropolis_inventory_mirror')
      .select('*', { count: 'exact', head: true }),
  ]);

  if (boxesRes.error) console.error('[admin/catalog/config] box_master:', boxesRes.error);
  if (constantsRes.error) console.error('[admin/catalog/config] pricing_constants:', constantsRes.error);
  if (shipsRes.error) console.error('[admin/catalog/config] shipping_config_v2:', shipsRes.error);
  if (windowsRes.error) console.error('[admin/catalog/config] tier_visibility_windows:', windowsRes.error);
  if (pricingPropsRes.error) console.error('[admin/catalog/config] pricing proposals:', pricingPropsRes.error);
  if (shipPropsRes.error) console.error('[admin/catalog/config] shipping proposals:', shipPropsRes.error);
  if (windowPropsRes.error) console.error('[admin/catalog/config] window proposals:', windowPropsRes.error);

  const boxes = (boxesRes.data ?? []) as BoxMasterRow[];
  const constants = (constantsRes.data ?? []) as PricingConstantRow[];
  const ships = (shipsRes.data ?? []) as ShippingConfigRow[];
  const windows = (windowsRes.data ?? []) as TierVisibilityWindowRow[];
  const pricingProps = (pricingPropsRes.data ?? []) as AdminProposalRow[];
  const shipProps = (shipPropsRes.data ?? []) as AdminProposalRow[];
  const windowProps = (windowPropsRes.data ?? []) as AdminProposalRow[];

  // Cascade-impact SKU counts ---------------------------------------------
  const skuByBoxRows = (skuByBoxRes.data ?? []) as { box_type: string | null }[];
  const skuCountByBox: Record<string, number> = {};
  for (const r of skuByBoxRows) {
    if (!r.box_type) continue;
    skuCountByBox[r.box_type] = (skuCountByBox[r.box_type] ?? 0) + 1;
  }
  const totalSkus = totalSkusRes.count ?? 0;

  // tab counts for header summary -----------------------------------------
  const proposedByPanel: Record<PanelKey, number> = {
    boxes: 0, // boxes are READ-ONLY now -- no proposal pipeline
    pricing: pricingProps.length,
    shipping: shipProps.length,
    visibility: windowProps.length,
  };
  const activeByPanel: Record<PanelKey, number> = {
    boxes: boxes.length,
    pricing: constants.length,
    shipping: ships.length,
    visibility: windows.length,
  };

  const wiringEntry = getWiringForPage('/admin/catalog/config');
  const wm = (id: string) =>
    wiringEntry?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <MockupLinkBanner mockupHref="/mockups/admin-catalog-config" pageLabel="/admin/catalog/config" />
        {/* Header */}
        <div className="mb-8">
          <nav className="text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
            <span>Admin</span>
            <span className="mx-1.5">/</span>
            <span>Catalog</span>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700 font-medium">Configuration</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900">Catalog Configuration</h1>
          <p className="text-slate-500 text-sm mt-1">
            Multi-country pricing inputs. Every edit lands in admin_proposals, then
            Facu approves and the executor writes to the source table. Cascade
            impact is computed against {totalSkus} SKUs in the inventory mirror.
          </p>
        </div>

        {/* Panel switcher --------------------------------------------------- */}
        <div className="flex gap-1 mb-6 border-b border-slate-200 flex-wrap">
          {(['boxes', 'pricing', 'shipping', 'visibility'] as const).map((p) => (
            <PanelTabLink
              key={p}
              panel={p}
              active={panel === p}
              tab={tab}
              activeCount={activeByPanel[p]}
              proposedCount={proposedByPanel[p]}
            />
          ))}
        </div>

        {/* Sub-tab: Active / Proposed -------------------------------------- */}
        <div className="flex gap-2 mb-5">
          <SubTabLink panel={panel} tab="active" current={tab} count={activeByPanel[panel]} label="Active" />
          <SubTabLink panel={panel} tab="proposed" current={tab} count={proposedByPanel[panel]} label="Proposed" />
        </div>

        {panel === 'boxes' && (
          <WiringSection level={wm('box-master').level} note={wm('box-master').note} id="box-master">
            <BoxPanel
              tab={tab}
              boxes={boxes}
              skuCountByBox={skuCountByBox}
              fmtDate={fmtDate}
            />
          </WiringSection>
        )}
        {panel === 'pricing' && (
          <WiringSection level={wm('pricing-constants').level} note={wm('pricing-constants').note} id="pricing-constants">
            <PricingPanel
              tab={tab}
              constants={constants}
              proposals={pricingProps}
              totalSkus={totalSkus}
              fmtDate={fmtDate}
            />
          </WiringSection>
        )}
        {panel === 'shipping' && (
          <WiringSection level={wm('shipping-config').level} note={wm('shipping-config').note} id="shipping-config">
            <ShippingPanel
              tab={tab}
              ships={ships}
              proposals={shipProps}
              totalSkus={totalSkus}
              fmtDate={fmtDate}
              fmtShortDate={fmtShortDate}
            />
          </WiringSection>
        )}
        {panel === 'visibility' && (
          <WiringSection level={wm('visibility-windows').level} note={wm('visibility-windows').note} id="visibility-windows">
            <VisibilityPanel
              tab={tab}
              windows={windows}
              proposals={windowProps}
              fmtDate={fmtDate}
            />
          </WiringSection>
        )}

        <p className="text-xs text-slate-400 mt-10">
          Data sources: supabase-backup public.box_master, public.pricing_constants,
          public.shipping_config_v2, public.tier_visibility_windows,
          public.admin_proposals. Writes route through POST /api/admin/proposals;
          approve/reject via /api/admin/proposals/[id]. Box flags route to
          /api/admin/catalog/config/flag-rose (rose_queue).
        </p>
      </main>

      <Footer />
    </div>
  );
}

// ----- panel tab links (server links) --------------------------------------

function PanelTabLink({
  panel,
  active,
  tab,
  activeCount,
  proposedCount,
}: {
  panel: PanelKey;
  active: boolean;
  tab: TabKey;
  activeCount: number;
  proposedCount: number;
}) {
  const label =
    panel === 'boxes'
      ? 'Box master'
      : panel === 'pricing'
        ? 'Pricing constants'
        : panel === 'shipping'
          ? 'Shipping (country/port)'
          : 'Visibility windows';
  const href = `/admin/catalog/config?panel=${panel}&tab=${tab}`;
  const cls = active
    ? 'px-4 py-2 text-sm font-semibold text-emerald-700 border-b-2 border-emerald-600 -mb-px'
    : 'px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700';
  return (
    <Link href={href} className={cls}>
      {label}
      <span className="ml-2 inline-flex items-center gap-1 text-[11px]">
        <span className="text-slate-400">{activeCount}</span>
        {proposedCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold">
            +{proposedCount} pending
          </span>
        )}
      </span>
    </Link>
  );
}

function SubTabLink({
  panel,
  tab,
  current,
  count,
  label,
}: {
  panel: PanelKey;
  tab: TabKey;
  current: TabKey;
  count: number;
  label: string;
}) {
  const active = tab === current;
  const cls = active
    ? 'text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200'
    : 'text-xs font-medium px-3 py-1.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100';
  return (
    <Link href={`/admin/catalog/config?panel=${panel}&tab=${tab}`} className={cls}>
      {label}
      <span className="ml-1.5 text-[11px] opacity-75">{count}</span>
    </Link>
  );
}

// ----- BOX MASTER panel (READ-ONLY -- Rose contract v1.0) -----------------

function BoxPanel({
  tab,
  boxes,
  skuCountByBox,
  fmtDate,
}: {
  tab: TabKey;
  boxes: BoxMasterRow[];
  skuCountByBox: Record<string, number>;
  fmtDate: (iso: string | null) => string;
}) {
  if (tab === 'proposed') {
    return (
      <div className="text-center py-12 border border-dashed border-amber-200 bg-amber-50/40 rounded-xl">
        <p className="text-sm font-semibold text-slate-700">No box_master proposals possible</p>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Per Rose contract v1.0 (Section 1), box_master is read-only for Job.
          Use the &quot;Flag to CEO&quot; button on the Active tab to escalate a
          discrepancy via rose_queue.
        </p>
      </div>
    );
  }

  // Active tab
  if (boxes.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
        <p className="text-sm">No box_master rows seeded.</p>
      </div>
    );
  }
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-2.5">Box type</th>
              <th className="px-4 py-2.5">Description</th>
              <th className="px-4 py-2.5 text-right">Weight (kg)</th>
              <th className="px-4 py-2.5 text-right">SKUs using</th>
              <th className="px-4 py-2.5">Validated</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {boxes.map((b) => {
              const cascade = skuCountByBox[b.box_type] ?? 0;
              return (
                <tr
                  key={b.box_type}
                  className={'border-b border-slate-100 last:border-b-0 ' + (b.active ? '' : 'opacity-60')}
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-900">{b.box_type}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 max-w-md">
                    <div>{b.description ?? '-'}</div>
                    {b.notes && (
                      <div className="text-[11px] text-slate-400 mt-0.5">{b.notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm text-slate-900">
                    {String(b.weight_kg)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    {cascade > 0 ? (
                      <span className="text-orange-700 font-semibold">{cascade}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    <div>{b.validated_by ?? '-'}</div>
                    {b.validated_at && (
                      <div className="text-[10px] text-slate-400">{fmtDate(b.validated_at)}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {b.active ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-100 text-emerald-800 border-emerald-200">
                        Active
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-slate-100 text-slate-600 border-slate-200">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <BoxFlagCEOForm row={b} cascadeSkus={cascade} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-900">
        <strong>READ-ONLY:</strong> box_master is Rose-owned (contract v1.0,
        Section 1). Job has no independent source for box dim corrections.
        Use &quot;Flag to CEO&quot; to escalate via rose_queue.
      </div>
    </div>
  );
}

// ----- PRICING CONSTANTS panel --------------------------------------------

function PricingPanel({
  tab,
  constants,
  proposals,
  totalSkus,
  fmtDate,
}: {
  tab: TabKey;
  constants: PricingConstantRow[];
  proposals: AdminProposalRow[];
  totalSkus: number;
  fmtDate: (iso: string | null) => string;
}) {
  if (tab === 'proposed') {
    if (proposals.length === 0) {
      return (
        <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <p className="text-sm">No pending pricing_constants proposals.</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {proposals.map((p) => (
          <div key={p.id} className="border border-orange-200 bg-orange-50 rounded-xl p-4">
            <div className="flex justify-between items-start gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  pricing_constants.update{' '}
                  <span className="font-mono ml-1 text-slate-600">{p.target_id ?? '(none)'}</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Proposed {fmtDate(p.proposed_at)} - cascade impact:{' '}
                  <span className="font-semibold text-orange-800">all {totalSkus} SKUs</span>
                </p>
              </div>
              <ProposalDecisionButtons id={p.id} />
            </div>
            <pre className="text-[11px] font-mono bg-white border border-slate-200 rounded-md p-3 mt-3 overflow-x-auto">
{JSON.stringify(p.payload ?? {}, null, 2)}
            </pre>
            {p.notes && (
              <p className="text-xs text-slate-700 mt-2">
                <span className="font-semibold">Reason:</span> {p.notes}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Active tab
  if (constants.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
        <p className="text-sm">No pricing_constants rows seeded.</p>
      </div>
    );
  }
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-2.5">Id</th>
              <th className="px-4 py-2.5">Description</th>
              <th className="px-4 py-2.5 text-right">Value</th>
              <th className="px-4 py-2.5">Unit</th>
              <th className="px-4 py-2.5">Updated</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {constants.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-900">{c.id}</td>
                <td className="px-4 py-2.5 text-xs text-slate-600">{c.description}</td>
                <td className="px-4 py-2.5 text-right font-mono text-sm text-slate-900">
                  {c.value_numeric == null ? '-' : String(c.value_numeric)}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{c.unit ?? '-'}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(c.updated_at)}</td>
                <td className="px-4 py-2.5 text-right">
                  <PricingConstantsProposeForm row={c} totalSkus={totalSkus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-900">
        <strong>Cascade:</strong> Global config - applies to all {totalSkus} SKUs once Facu approves.
      </div>
    </div>
  );
}

// ----- SHIPPING CONFIG panel ----------------------------------------------

function ShippingPanel({
  tab,
  ships,
  proposals,
  totalSkus,
  fmtDate,
  fmtShortDate,
}: {
  tab: TabKey;
  ships: ShippingConfigRow[];
  proposals: AdminProposalRow[];
  totalSkus: number;
  fmtDate: (iso: string | null) => string;
  fmtShortDate: (iso: string | null) => string;
}) {
  if (tab === 'proposed') {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <ShippingConfigCreateForm totalSkus={totalSkus} />
        </div>
        {proposals.length === 0 ? (
          <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <p className="text-sm">No pending shipping_config proposals.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {proposals.map((p) => {
              const payload = (p.payload ?? {}) as Record<string, unknown>;
              const origin = typeof payload.origin_country === 'string' ? payload.origin_country : '(unknown)';
              return (
                <div key={p.id} className="border border-orange-200 bg-orange-50 rounded-xl p-4">
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        shipping_config.create{' '}
                        <span className="font-mono ml-1 text-slate-600">
                          {String(payload.origin_country ?? '?')} -&gt; {String(payload.dest_port ?? '?')}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Proposed {fmtDate(p.proposed_at)} - applies to SKUs from{' '}
                        <span className="font-semibold text-orange-800">{origin}</span>
                      </p>
                    </div>
                    <ProposalDecisionButtons id={p.id} />
                  </div>
                  <pre className="text-[11px] font-mono bg-white border border-slate-200 rounded-md p-3 mt-3 overflow-x-auto">
{JSON.stringify(payload, null, 2)}
                  </pre>
                  {p.notes && (
                    <p className="text-xs text-slate-700 mt-2">
                      <span className="font-semibold">Reason:</span> {p.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Active tab
  if (ships.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-emerald-200 bg-emerald-50/40 rounded-xl">
        <p className="text-base font-semibold text-slate-700">No shipping configs yet</p>
        <p className="text-sm text-slate-500 mt-1 mb-5 max-w-md mx-auto">
          Configure origin country (Ecuador, Colombia, Holland) and destination port
          before pricing can route real freight cost.
        </p>
        <ShippingConfigCreateForm totalSkus={totalSkus} ctaLabel="Create first config" />
      </div>
    );
  }

  // group by origin_country
  const byOrigin: Record<string, ShippingConfigRow[]> = {};
  for (const s of ships) {
    if (!byOrigin[s.origin_country]) byOrigin[s.origin_country] = [];
    byOrigin[s.origin_country].push(s);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ShippingConfigCreateForm totalSkus={totalSkus} />
      </div>
      {Object.keys(byOrigin)
        .sort()
        .map((origin) => (
          <div key={origin} className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Origin: {origin}
              </p>
              <p className="text-[11px] text-slate-500">{byOrigin[origin].length} configs</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white border-b border-slate-200">
                  <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-2">Dest port</th>
                    <th className="px-4 py-2">Zone</th>
                    <th className="px-4 py-2 text-right">Fuel %</th>
                    <th className="px-4 py-2 text-right">Dim divisor</th>
                    <th className="px-4 py-2 text-right">REL #</th>
                    <th className="px-4 py-2">Effective from</th>
                    <th className="px-4 py-2">Effective until</th>
                  </tr>
                </thead>
                <tbody>
                  {byOrigin[origin].map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-2 font-mono text-xs text-slate-900">{s.dest_port}</td>
                      <td className="px-4 py-2 text-xs text-slate-700">{s.zone}</td>
                      <td className="px-4 py-2 text-right text-xs font-mono text-slate-900">
                        {Number(s.fuel_pct).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-mono text-slate-700">{s.dim_divisor}</td>
                      <td className="px-4 py-2 text-right text-xs font-mono text-slate-700">
                        {Number(s.rel_number).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">{fmtShortDate(s.effective_from)}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{fmtShortDate(s.effective_until)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        <strong>Multi-country lock:</strong> Each origin -&gt; dest_port has its own row.
        New configs are created via proposal -&gt; approve. Updates to existing rows are
        not yet wired (use a new effective_from row to supersede).
      </p>
    </div>
  );
}

// ----- VISIBILITY WINDOWS panel -------------------------------------------

function VisibilityPanel({
  tab,
  windows,
  proposals,
  fmtDate,
}: {
  tab: TabKey;
  windows: TierVisibilityWindowRow[];
  proposals: AdminProposalRow[];
  fmtDate: (iso: string | null) => string;
}) {
  if (tab === 'proposed') {
    if (proposals.length === 0) {
      return (
        <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <p className="text-sm">No pending tier_visibility_window proposals.</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {proposals.map((p) => {
          const payload = (p.payload ?? {}) as Record<string, unknown>;
          return (
            <div key={p.id} className="border border-orange-200 bg-orange-50 rounded-xl p-4">
              <div className="flex justify-between items-start gap-3 flex-wrap">
                <div>
                  <p className="text-xs font-semibold text-slate-900">
                    {p.type}{' '}
                    <span className="font-mono ml-1 text-slate-600">
                      {String(payload.origin_country ?? p.target_id ?? '?')}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Proposed {fmtDate(p.proposed_at)}
                  </p>
                </div>
                <ProposalDecisionButtons id={p.id} />
              </div>
              <pre className="text-[11px] font-mono bg-white border border-slate-200 rounded-md p-3 mt-3 overflow-x-auto">
{JSON.stringify(payload, null, 2)}
              </pre>
              {p.notes && (
                <p className="text-xs text-slate-700 mt-2">
                  <span className="font-semibold">Reason:</span> {p.notes}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (windows.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
        <p className="text-sm">No tier_visibility_window rows seeded.</p>
      </div>
    );
  }

  // Group by origin_country.
  const byOrigin: Record<string, TierVisibilityWindowRow[]> = {};
  for (const w of windows) {
    if (!byOrigin[w.origin_country]) byOrigin[w.origin_country] = [];
    byOrigin[w.origin_country].push(w);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-900">
        BRD UC-V-1..7 surface. Visibility windows gate which tiers a customer
        sees on /shop based on their requested delivery date. accepted=false
        means the origin is OFF -- /shop hides those SKUs, vendor inventory
        lands in rose_queue.
      </div>
      {Object.keys(byOrigin)
        .sort()
        .map((origin) => {
          const rows = byOrigin[origin];
          const anyAccepted = rows.some((r) => r.accepted);
          const allAccepted = rows.every((r) => r.accepted);
          return (
            <div key={origin} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center flex-wrap gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Origin: {origin}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {allAccepted
                      ? `All ${rows.length} tier rows ACCEPTED`
                      : anyAccepted
                        ? `${rows.filter((r) => r.accepted).length}/${rows.length} ACCEPTED`
                        : `OFF -- ${rows.length} tier row(s) pending pipeline`}
                  </p>
                </div>
                {!allAccepted && (
                  <TierVisibilityAcceptCountryForm origin={origin} rows={rows} />
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white border-b border-slate-200">
                    <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-2">Tier</th>
                      <th className="px-4 py-2">Accepted</th>
                      <th className="px-4 py-2 text-right">Earliest (days)</th>
                      <th className="px-4 py-2 text-right">Latest (days)</th>
                      <th className="px-4 py-2">Notes</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((w) => (
                      <tr key={w.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-2 font-mono text-xs text-slate-900">{w.tier}</td>
                        <td className="px-4 py-2">
                          {w.accepted ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-100 text-emerald-800 border-emerald-200">
                              accepted
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-slate-100 text-slate-600 border-slate-200">
                              off
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-sm text-slate-900">
                          {w.earliest_delivery_days}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-sm text-slate-900">
                          {w.latest_delivery_days}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500 max-w-md truncate">
                          {w.notes ?? '-'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <TierVisibilityWindowEditForm row={w} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
    </div>
  );
}
