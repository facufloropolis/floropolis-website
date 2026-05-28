// Admin Catalog -- per-SKU control plane.
// v2 | 2026-05-18 | Job_PM admin-port X2 [V8 SHADOW]
//
// Lands on /admin/catalog/[id]. Sections (ported from
// app/mockups/admin-catalog/[sku]/page.tsx, mapped to real Supabase tables):
//
//   1. Header (quality_family, vendor, price, status, gate score)
//   2. Sources side-by-side (other SKUs in same quality_family_id, across vendors)
//      -- most rows have NULL quality_family_id today, so most pages render the
//         "no cross-source data yet" note
//   3. Cost breakdown (pricing_constants + box_master + farm_cost -> selling price)
//   4. Override audit timeline (override_audit where target_id = sku_id text)
//   5. Gate status (16) -- PRESERVED from v1 (Editor.tsx fixers untouched)
//   6. Raw mirror fields -- PRESERVED from v1
//   7. Admin actions -- PRESERVED from v1
//   8. Propose change cluster -- new client island wired to /api/admin/proposals
//
// All writes funnel through:
//   POST /api/admin/catalog/sku/[id]/update         -- single-field mirror writes
//   POST /api/admin/catalog/sku/[id]/admin-action   -- catalog_classifications status
//   POST /api/admin/proposals                       -- new admin_proposals row

export const dynamic = 'force-dynamic';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getBoxByLegacyType } from '@/lib/box-master';
import { getCostSourceMeta, getReliabilityCls } from '@/lib/admin/cost-source-registry';
import WiringSection from '@/components/admin/WiringSection';
import MockupLinkBanner from '@/components/admin/MockupLinkBanner';
import { getWiringForPage } from '@/lib/admin/wiring';
import { ACTIVE_PRICING_MARKET } from '@/lib/pricing-constants';
import { GATE_LABELS } from '@/lib/catalog-gates';
import { lookupImportanceScore, FEATURED_SCORE_SEED } from '@/lib/admin/featured-scores-seed';
import DetailActionPanel from '@/app/admin/_components/DetailActionPanel';
import PendingBadge from '@/app/admin/_components/PendingBadge';

import {
  AdminActions,
  AcceptDeviationButton,
  AskRoseButton,
  ClearPriceAlertButton,
  ContentsNoteEditor,
  CostSourceEditor,
  DateEditor,
  ImagesEditor,
  LiveToggleButton,
  MarginStatusEditor,
  PriceEditor,
  SchemaTodoStub,
  VendorEditor,
  VerifyCostButton,
} from './Editor';
import { FlagToggleClient as FlagToggle } from './Editor.flag';
import {
  DiscountSkuForm,
  HideSkuForm,
  PriceCorrectionForm,
  ProposeChangeCluster,
  UnsupportedProposeButton,
  ProposeMirrorFieldForm,
  FlagBoxDimToCeoButton,
} from './ProposeForms';

interface PageProps {
  params: Promise<{ id: string }>;
}

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
  reviewer_at: string | null;
  reviewer_notes: string | null;
  created_at: string | null;
  quality_family_id: string | null;
}

interface MirrorRow {
  id: number;
  name: string | null;
  variety: string | null;
  length: string | null;
  vendor: string | null;
  tier: string | null;
  price: number | string | null;
  stock: number | string | null;
  farm_cost: number | string | null;
  cost_source: string | null;
  cost_verified_at: string | null;
  margin_status: string | null;
  has_open_price_alert: boolean | null;
  arrival_date: string | null;
  live: boolean | null;
  active: boolean | null;
  box_type: string | null;
  units_per_box: number | string | null;
  total_stems: number | string | null;
  stems_per_bunch: number | string | null;
  unit: string | null;
  contents_note: string | null;
  images: unknown;
  deal_price: number | string | null;
  deal_label: string | null;
  deal_expiry: string | null;
  is_on_deal: boolean | null;
  is_best_seller: boolean | null;
  is_featured: boolean | null;
  quality_family_id: string | null;
  [k: string]: unknown;
}

interface BoxMasterRow {
  box_id: number;
  vendor_canonical_name: string;
  box_family: string;
  variant_code: string;
  fedex_chargeable_kg: number | string | null;
  stems_per_box: number | string | null;
  fedex_source_artifact: string | null;
  fedex_source_date: string | null;
  facu_approved_at: string | null;
  facu_approval_note: string | null;
  active: boolean;
  updated_at?: string | null;
}

interface PricingConstantRow {
  id: string;
  value_numeric: number | string | null;
  description: string | null;
  unit: string | null;
}

interface OverrideAuditRow {
  id: string;
  proposal_id: string | null;
  target_table: string;
  target_id: string | null;
  before_jsonb: Record<string, unknown> | null;
  after_jsonb: Record<string, unknown> | null;
  applied_at: string;
  applied_by_function: string | null;
  // Contract v1.0 P5 verification fields:
  verified_by: string | null;
  verified_at: string | null;
  verification_passed: boolean | null;
  verification_notes: string | null;
}

interface RoseQueueRow {
  id: string;
  sku_id: string;
  reason_code: string;
  reason_text: string;
  flagged_by: string;
  flagged_at: string;
  status: string;
  resolved_at: string | null;
  resolution_notes: string | null;
}

interface SiblingSkuRow {
  id: number;
  vendor: string | null;
  name: string | null;
  variety: string | null;
  color: string | null;
  length: string | null;
  price: number | string | null;
  farm_cost: number | string | null;
  cost_source: string | null;
  scrape_date: string | null;
  stock: number | string | null;
  live: boolean | null;
  tier: string | null;
  k2k_listed_price_avg: number | string | null;
}

// All 16 gate IDs the validator can emit (plus the stock_live_mismatch signal).
// Gates 14/15 are marked schema_todo: the underlying columns do not exist yet.
type GateMeta = {
  id: string;
  schemaTodo?: 'last_harvested_date' | 'vase_life_days';
};

const ALL_GATES: GateMeta[] = [
  { id: 'price_zero' },
  { id: 'margin_unknown' },
  { id: 'formula_deviation' },
  { id: 'missing_cost_source' },
  { id: 'cost_unverified' },
  { id: 'open_price_alert' },
  { id: 'missing_box_dims' },
  { id: 'missing_units_or_bunch' },
  { id: 'missing_unit' },
  { id: 'missing_image' },
  { id: 'missing_contents_description' },
  { id: 'missing_arrival_date' },
  { id: 't2_outside_5d_window' },
  { id: 't3_outside_14d_window' },
  { id: 'missing_vendor_name' },
  { id: 'stock_live_mismatch' },
  { id: 'missing_last_harvested', schemaTodo: 'last_harvested_date' },
  { id: 'missing_vase_life', schemaTodo: 'vase_life_days' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtUsd(v: unknown): string {
  const n = toNumOrNull(v);
  if (n == null) return '-';
  return `$${n.toFixed(2)}`;
}

function fmtPct(v: unknown): string {
  const n = toNumOrNull(v);
  if (n == null) return '-';
  return `${(n * 100).toFixed(1)}%`;
}

function imagesArr(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

function renderRaw(v: unknown): string {
  if (v == null) return '-';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function statusBadge(status: string): { label: string; cls: string } {
  if (status === 'perfect') {
    return { label: '✓ perfect', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  }
  if (status === 'publishable') {
    return { label: 'publishable', cls: 'bg-amber-100 text-amber-800 border-amber-300' };
  }
  if (status === 'blocked') {
    return { label: 'blocked', cls: 'bg-red-100 text-red-800 border-red-300' };
  }
  if (status.startsWith('admin_overridden_')) {
    return { label: status, cls: 'bg-violet-100 text-violet-800 border-violet-300' };
  }
  return { label: status, cls: 'bg-slate-100 text-slate-700 border-slate-300' };
}

// ---------------------------------------------------------------------------
// Cost breakdown computation. Mirrors Rose's pricing formula:
//   delivery_per_box  = ceil(box_weight_kg) * fedex_rate_per_kg * fuel_surcharge_mult
//   delivery_per_stem = delivery_per_box / units_per_box
//   target_ex_delivery = farm_cost / (1 - gpm_target)
//   target_price      = target_ex_delivery + delivery_per_stem
//
// Note: box_master in supabase-backup currently has only weight_kg (no L/W/H
// dims), so dim weight is taken directly from weight_kg. When the dim-weight
// columns ship, swap weight_kg -> max(weight_kg, dim_weight_kg) at the ceil
// step.
// ---------------------------------------------------------------------------

interface CostBreakdown {
  farmCost: number | null;
  gpmTarget: number | null;
  fedexRate: number | null;
  fuelMult: number | null;
  boxWeight: number | null;
  ceilBoxWeight: number | null;
  unitsPerBox: number | null;
  deliveryPerBox: number | null;
  deliveryPerStem: number | null;
  targetExDelivery: number | null;
  targetPrice: number | null;
  currentPrice: number | null;
  realizedGpm: number | null;
  origin: string;
}

function computeBreakdown(
  mirror: MirrorRow,
  box: BoxMasterRow | null,
  constants: Map<string, number>,
): CostBreakdown {
  const farmCost = toNumOrNull(mirror.farm_cost);
  const gpmTarget = constants.get('gpm_target') ?? null;
  const fedexRate = constants.get('fedex_rate_per_kg') ?? null;
  const fuelMult = constants.get('fuel_surcharge_mult') ?? null;
  const boxWeight = box ? toNumOrNull(box.fedex_chargeable_kg) : null;
  const ceilBoxWeight = boxWeight != null ? Math.ceil(boxWeight) : null;
  const unitsPerBox = toNumOrNull(mirror.units_per_box);
  const currentPrice = toNumOrNull(mirror.price);

  const deliveryPerBox =
    ceilBoxWeight != null && fedexRate != null && fuelMult != null
      ? ceilBoxWeight * fedexRate * fuelMult
      : null;
  const deliveryPerStem =
    deliveryPerBox != null && unitsPerBox && unitsPerBox > 0
      ? deliveryPerBox / unitsPerBox
      : null;
  const targetExDelivery =
    farmCost != null && gpmTarget != null && gpmTarget < 1
      ? farmCost / (1 - gpmTarget)
      : null;
  const targetPrice =
    targetExDelivery != null && deliveryPerStem != null
      ? targetExDelivery + deliveryPerStem
      : null;
  const realizedGpm =
    currentPrice != null && currentPrice > 0 && farmCost != null
      ? 1 - farmCost / currentPrice
      : null;

  return {
    farmCost,
    gpmTarget,
    fedexRate,
    fuelMult,
    boxWeight,
    ceilBoxWeight,
    unitsPerBox,
    deliveryPerBox,
    deliveryPerStem,
    targetExDelivery,
    targetPrice,
    currentPrice,
    realizedGpm,
    origin: 'Ecuador -> Miami', // hardcoded until shipping_config_v2 has rows
  };
}

export const metadata = {
  title: 'SKU detail | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function AdminCatalogDetailPage({ params }: PageProps) {
  // Admin gate ----------------------------------------------------------
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

  const { id } = await params;
  const skuId = Number.parseInt(id, 10);
  if (!Number.isFinite(skuId)) notFound();

  const backup = getBackupServiceClient();

  const [classRes, mirrorRes, constantsRes] = await Promise.all([
    backup
      .from('catalog_classifications')
      .select(
        'sku_id, status, gate_score, failing_gates, vendor, tier, variety, last_validated_at, last_changed_at, reviewer_action, reviewer_at, reviewer_notes, created_at, quality_family_id',
      )
      .eq('sku_id', skuId)
      .maybeSingle(),
    backup.from('floropolis_inventory_mirror').select('*').eq('id', skuId).maybeSingle(),
    backup
      .from('pricing_constants')
      .select('id, value_numeric, description, unit')
      .eq('market', ACTIVE_PRICING_MARKET),
  ]);

  const cls = classRes.data as ClassificationRow | null;
  const mirror = mirrorRes.data as MirrorRow | null;
  const constantsRows = (constantsRes.data ?? []) as PricingConstantRow[];

  const constants = new Map<string, number>();
  for (const c of constantsRows) {
    const n = toNumOrNull(c.value_numeric);
    if (n != null) constants.set(c.id, n);
  }

  // Box master row for this SKU's vendor + legacy box_type.
  let box: BoxMasterRow | null = null;
  if (mirror?.vendor && mirror?.box_type) {
    try {
      box = (await getBoxByLegacyType(backup, {
        vendor: mirror.vendor,
        boxType: mirror.box_type,
      })) as BoxMasterRow;
    } catch (err) {
      console.error('[admin/catalog/[id]] box_master_mirror lookup failed:', err);
      box = null;
    }
  }

  // Sibling SKUs: prefer quality_family_id when set; fall back to variety+length.
  // variety+length is the practical primary since quality_family_id is NULL on ~98% of rows.
  const qfid = mirror?.quality_family_id ?? cls?.quality_family_id ?? null;
  let siblings: SiblingSkuRow[] = [];
  const siblingSelect = 'id, vendor, name, variety, color, length, price, farm_cost, cost_source, scrape_date, stock, live, tier, k2k_listed_price_avg';
  if (qfid) {
    const { data: siblingRows } = await backup
      .from('floropolis_inventory_mirror')
      .select(siblingSelect)
      .eq('quality_family_id', qfid)
      .neq('id', skuId)
      .limit(30);
    siblings = (siblingRows ?? []) as SiblingSkuRow[];
  }
  // Variety+length comparison — always fetch regardless of quality_family_id.
  let varietyComps: SiblingSkuRow[] = [];
  if (mirror?.variety && mirror?.length) {
    const { data: vcRows } = await backup
      .from('floropolis_inventory_mirror')
      .select(siblingSelect)
      .eq('variety', mirror.variety)
      .eq('length', mirror.length)
      .neq('id', skuId)
      .limit(40);
    varietyComps = ((vcRows ?? []) as SiblingSkuRow[]).sort(
      (a, b) => (toNumOrNull(a.farm_cost) ?? 999) - (toNumOrNull(b.farm_cost) ?? 999),
    );
  }

  // Override audit timeline -- target_id is stored as text, so coerce.
  const { data: auditRows } = await backup
    .from('override_audit')
    .select(
      'id, proposal_id, target_table, target_id, before_jsonb, after_jsonb, applied_at, applied_by_function, verified_by, verified_at, verification_passed, verification_notes',
    )
    .eq('target_id', String(skuId))
    .order('applied_at', { ascending: true })
    .limit(50);
  const audit = (auditRows ?? []) as OverrideAuditRow[];

  // Rose escalation queue for this SKU
  const { data: roseQueueRows } = await backup
    .from('rose_queue')
    .select('id, sku_id, reason_code, reason_text, flagged_by, flagged_at, status, resolved_at, resolution_notes')
    .eq('sku_id', String(skuId))
    .order('flagged_at', { ascending: false })
    .limit(20);
  const roseQueue = (roseQueueRows ?? []) as RoseQueueRow[];

  const failingSet = new Set<string>(
    Array.isArray(cls?.failing_gates) ? (cls!.failing_gates as string[]) : [],
  );
  const isAdminOverridden =
    typeof cls?.status === 'string' && cls.status.startsWith('admin_overridden_');

  const breakdown = mirror
    ? computeBreakdown(mirror, box, constants)
    : null;

  const importanceScore = mirror ? lookupImportanceScore(mirror.name) : null;
  const importanceSeedEntry = importanceScore != null
    ? FEATURED_SCORE_SEED.find((e) => e.match_terms.every((t) => (mirror?.name ?? '').toLowerCase().includes(t)))
    : null;

  const wiringEntry = getWiringForPage('/admin/catalog/[id]');
  const wm = (id: string) =>
    wiringEntry?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-10">
        <MockupLinkBanner mockupHref="/mockups/admin-catalog" pageLabel={`/admin/catalog/${skuId}`} />
        {/* Header */}
        <WiringSection level={wm('header').level} note={wm('header').note} id="header">
        <div className="mb-8">
          <nav className="text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
            <Link href="/admin/catalog" className="hover:underline">
              Admin
            </Link>
            <span className="mx-1.5">/</span>
            <Link href="/admin/catalog" className="hover:underline">
              Catalog
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700 font-medium font-mono">{skuId}</span>
          </nav>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                SKU {skuId}
                {mirror?.name && (
                  <span className="text-slate-500 font-normal">
                    {' '}-- {mirror.name}
                  </span>
                )}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {[mirror?.variety, (mirror as Record<string, unknown>)?.color as string | null, mirror?.length].filter(Boolean).join(' · ')} . vendor{' '}
                <span className="font-medium">{mirror?.vendor ?? '-'}</span>{' '}
                . tier <span className="font-mono">{mirror?.tier ?? '-'}</span>
              </p>
              <p className="text-[11px] text-slate-400 font-mono mt-1">
                box: {mirror?.box_type ?? '-'} . quality_family_id:{' '}
                {qfid ?? '(null)'} . units_per_box:{' '}
                {mirror?.units_per_box ?? '-'}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <PendingBadge label="box dims: vendor-scoped pending" />
                <PendingBadge label="live API feed pending — using stale flag" />
              </div>
              {cls && (
                <p className="text-xs text-slate-500 mt-2">
                  Last validated {fmtDate(cls.last_validated_at)} . Last
                  changed {fmtDate(cls.last_changed_at)}
                </p>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="text-2xl font-bold text-slate-900">
                {fmtUsd(mirror?.price)}
              </div>
              <div className="text-[11px] text-slate-500">
                per {mirror?.unit ?? 'unit'}
              </div>
              {cls && (
                <>
                  <span
                    className={`text-xs font-semibold border rounded-full px-2.5 py-1 ${statusBadge(cls.status).cls}`}
                  >
                    {statusBadge(cls.status).label}
                  </span>
                  <span className="text-xs font-mono text-slate-600 border border-slate-200 rounded-full px-2.5 py-1 bg-slate-50">
                    gate score {cls.gate_score}/16
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        </WiringSection>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-0 min-w-0">

        {/* Section: Variety cost comparison — same variety + length, all vendors */}
        <WiringSection level={wm('sources-side-by-side').level} note={wm('sources-side-by-side').note} id="sources-side-by-side">
        <SectionCard
          title={`${mirror?.variety ?? 'Variety'} · ${mirror?.length ?? '?'} — all vendors`}
          subtitle="Same variety + length across every vendor in the mirror. Sorted cheapest first. Outliers >25% above median are flagged."
        >
          {(() => {
            // Build full list: this SKU + comps
            const allRows = mirror
              ? [
                  {
                    id: mirror.id,
                    vendor: mirror.vendor,
                    color: (mirror as Record<string, unknown>).color as string | null,
                    farm_cost: mirror.farm_cost,
                    cost_source: mirror.cost_source,
                    scrape_date: (mirror as Record<string, unknown>).scrape_date as string | null,
                    price: mirror.price,
                    live: mirror.live,
                    tier: mirror.tier,
                    k2k_listed_price_avg: (mirror as Record<string, unknown>).k2k_listed_price_avg as number | null,
                    isThis: true,
                  },
                  ...varietyComps.map((s) => ({ ...s, isThis: false })),
                ]
              : varietyComps.map((s) => ({ ...s, isThis: false }));

            const allCosts = allRows.map((r) => toNumOrNull(r.farm_cost)).filter((n): n is number => n != null);
            const median = allCosts.length > 0
              ? allCosts.slice().sort((a, b) => a - b)[Math.floor(allCosts.length / 2)]
              : null;

            if (allRows.length === 0 && !mirror?.variety) {
              return (
                <p className="text-xs text-slate-500 italic">No variety set on this SKU — comparison unavailable.</p>
              );
            }
            if (varietyComps.length === 0 && mirror) {
              return (
                <p className="text-xs text-slate-500 italic">
                  No other SKUs found for {mirror.variety} {mirror.length}. This may be the only vendor offering this spec.
                </p>
              );
            }

            return (
              <div className="overflow-x-auto">
                <div className="text-[11px] text-slate-500 mb-2">
                  Median cost across {allCosts.length} SKUs: <span className="font-semibold text-slate-700">{median != null ? fmtUsd(median) : '—'}</span>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Vendor</th>
                      <th className="px-2 py-1.5 font-semibold">Color</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Cost</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Price</th>
                      <th className="px-2 py-1.5 font-semibold text-right">GPM</th>
                      <th className="px-2 py-1.5 font-semibold">Source</th>
                      <th className="px-2 py-1.5 font-semibold">Data date</th>
                      <th className="px-2 py-1.5 font-semibold">Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allRows.map((s) => {
                      const cost = toNumOrNull(s.farm_cost);
                      const price = toNumOrNull(s.price);
                      const gpm = cost != null && price != null && price > 0 ? 1 - cost / price : null;
                      const isOutlier = cost != null && median != null && cost > median * 1.25;
                      const meta = getCostSourceMeta(s.cost_source ?? null);
                      return (
                        <tr key={s.id} className={`border-t ${s.isThis ? 'border-slate-200 bg-emerald-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                          <td className="px-2 py-1.5">
                            {s.isThis ? (
                              <span className="font-semibold text-emerald-800">{s.vendor ?? '-'} <span className="text-[10px] font-normal">(this SKU)</span></span>
                            ) : (
                              <Link href={`/admin/catalog/${s.id}`} className="text-emerald-700 hover:underline">{s.vendor ?? '-'}</Link>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-slate-600">{s.color ?? '—'}</td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            <span className={isOutlier ? 'text-red-700 font-semibold' : ''}>
                              {fmtUsd(s.farm_cost)}
                            </span>
                            {isOutlier && (
                              <span className="ml-1 text-[10px] text-red-600">↑ outlier</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">{fmtUsd(s.price)}</td>
                          <td className={`px-2 py-1.5 text-right font-mono ${gpm != null ? (gpm >= 0.33 ? 'text-emerald-700' : gpm >= 0.25 ? 'text-amber-700' : 'text-red-700') : 'text-slate-400'}`}>
                            {fmtPct(gpm)}
                          </td>
                          <td className="px-2 py-1.5">
                            {meta ? (
                              <span className={`text-[11px] ${getReliabilityCls(meta.reliability)}`} title={meta.description}>
                                {meta.url ? (
                                  <a href={meta.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted">
                                    {meta.label}
                                  </a>
                                ) : meta.label}
                              </span>
                            ) : (
                              <span className="font-mono text-[10px] text-slate-400">{s.cost_source ?? '—'}</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-slate-500 text-[11px]">{s.scrape_date ?? '—'}</td>
                          <td className="px-2 py-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.tier === 'T2' ? 'bg-blue-50 text-blue-700' : s.tier === 'T3' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>
                              {s.tier ?? '?'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </SectionCard>

        </WiringSection>

        {/* Section: Cost breakdown */}
        <WiringSection level={wm('cost-breakdown').level} note={wm('cost-breakdown').note} id="cost-breakdown">
        <SectionCard
          title="Cost breakdown"
          subtitle={`Rose's formula -- transparent calc per stem (origin: ${breakdown?.origin ?? 'unknown'})`}
        >
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <PendingBadge label="country pricing pending" title="GPM / FedEx / fuel constants are global today — country-scoped split pending Rose schema migration" />
            <PendingBadge label="vendor-scoped box dims pending" title="box_master is global per box_type today — per-vendor box dims pending Rose schema migration" />
          </div>
          {!mirror ? (
            <p className="text-xs text-slate-500 italic">
              No mirror row to compute against.
            </p>
          ) : breakdown && breakdown.farmCost == null ? (
            <p className="text-xs text-amber-700 italic">
              farm_cost is missing on this SKU -- selling price cannot be
              derived. Fix the cost first or escalate to Rose.
            </p>
          ) : breakdown ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Formula */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] text-slate-700 leading-relaxed">
                <div className="font-sans font-semibold text-slate-900 text-xs mb-2">
                  Pricing formula (Rose, verified)
                </div>
                <div>price_ex_delivery = farm_cost / (1 - gpm_target)</div>
                <div>delivery_per_box  = ceil(box_kg) * fedex_rate * fuel_mult</div>
                <div>delivery_per_stem = delivery_per_box / units_per_box</div>
                <div>target_price      = price_ex_delivery + delivery_per_stem</div>
                <div className="font-sans text-[10px] text-slate-400 mt-3">
                  Delivery passed through at cost -- no margin on delivery.
                  Box dims default to weight_kg until L/W/H ship in box_master.
                </div>
              </div>
              {/* Filled values */}
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs space-y-1.5">
                <KvRow label="farm_cost" value={fmtUsd(breakdown.farmCost)} />
                <KvRow
                  label="gpm_target"
                  value={fmtPct(breakdown.gpmTarget)}
                  hint="pricing_constants.gpm_target"
                />
                <KvRow
                  label="price_ex_delivery"
                  value={fmtUsd(breakdown.targetExDelivery)}
                />
                <Divider />
                <KvRow
                  label={`box (${mirror.box_type ?? '?'})`}
                  value={
                    breakdown.boxWeight != null
                      ? `${breakdown.boxWeight.toFixed(2)} kg`
                      : '-'
                  }
                  hint="box_master.weight_kg"
                />
                <KvRow
                  label="ceil(box_kg)"
                  value={breakdown.ceilBoxWeight?.toString() ?? '-'}
                />
                <KvRow
                  label="fedex_rate"
                  value={
                    breakdown.fedexRate != null
                      ? `$${breakdown.fedexRate.toFixed(2)}/kg`
                      : '-'
                  }
                  hint="pricing_constants.fedex_rate_per_kg"
                />
                <KvRow
                  label="fuel_mult"
                  value={
                    breakdown.fuelMult != null
                      ? `x ${breakdown.fuelMult.toFixed(2)}`
                      : '-'
                  }
                  hint="pricing_constants.fuel_surcharge_mult"
                />
                <KvRow
                  label="delivery_per_box"
                  value={fmtUsd(breakdown.deliveryPerBox)}
                />
                <KvRow
                  label="units_per_box"
                  value={breakdown.unitsPerBox?.toString() ?? '-'}
                />
                <KvRow
                  label="delivery_per_stem"
                  value={fmtUsd(breakdown.deliveryPerStem)}
                />
                <Divider />
                <div className="flex justify-between text-sm pt-1">
                  <span className="font-semibold text-slate-900">target_price</span>
                  <span className="font-bold text-slate-900">
                    {fmtUsd(breakdown.targetPrice)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">current price</span>
                  <span className="font-mono text-slate-700">
                    {fmtUsd(breakdown.currentPrice)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">realized GPM</span>
                  <span
                    className={`font-semibold ${
                      breakdown.realizedGpm != null && breakdown.gpmTarget != null
                        ? breakdown.realizedGpm >= breakdown.gpmTarget
                          ? 'text-emerald-700'
                          : breakdown.realizedGpm >= breakdown.gpmTarget - 0.05
                            ? 'text-amber-700'
                            : 'text-red-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {fmtPct(breakdown.realizedGpm)}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </SectionCard>

        </WiringSection>

        {/* Section: Override audit timeline */}
        <WiringSection level={wm('audit-timeline').level} note={wm('audit-timeline').note} id="audit-timeline">
        <SectionCard
          title="Override audit timeline"
          subtitle="Every approved proposal that touched this SKU (oldest -> newest)"
        >
          {audit.length === 0 ? (
            <p className="text-xs text-slate-500 italic">
              No override_audit entries for SKU {skuId}. Nothing has flowed
              through admin_proposals -&gt; executor for this row yet.
            </p>
          ) : (
            <ol className="space-y-2">
              {audit.map((a) => {
                const verifyTone =
                  a.verification_passed === true
                    ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
                    : a.verification_passed === false
                      ? 'text-red-700 border-red-200 bg-red-50'
                      : 'text-slate-500 border-slate-200 bg-slate-50';
                const verifyLabel =
                  a.verification_passed === true
                    ? 'verified'
                    : a.verification_passed === false
                      ? 'verification_failed'
                      : 'pending_verification';
                return (
                  <li
                    key={a.id}
                    className="border border-slate-200 rounded-lg p-3 bg-white"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-mono text-slate-500">
                        {fmtDate(a.applied_at)} . {a.applied_by_function ?? '-'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 ${verifyTone}`}
                          title={a.verification_notes ?? undefined}
                        >
                          {verifyLabel}
                        </span>
                        {a.proposal_id && (
                          <Link
                            href={`/admin/catalog/approval-queue#${a.proposal_id}`}
                            className="text-[11px] text-emerald-700 font-mono hover:underline"
                          >
                            proposal #{a.proposal_id.slice(0, 8)}
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-slate-600 mb-1">
                      target: <span className="font-mono">{a.target_table}</span>{' '}
                      / <span className="font-mono">{a.target_id ?? '-'}</span>
                    </div>
                    {(a.verified_by || a.verified_at || a.verification_notes) && (
                      <div className="text-[11px] text-slate-600 mb-2 bg-slate-50 border border-slate-200 rounded p-2">
                        <span className="font-semibold text-slate-700">Verifier:</span>{' '}
                        <span className="font-mono">{a.verified_by ?? '(unknown)'}</span>
                        {a.verified_at && (
                          <>
                            {' '}at{' '}
                            <span className="font-mono">{fmtDate(a.verified_at)}</span>
                          </>
                        )}
                        {a.verification_notes && (
                          <div className="mt-1 text-slate-500 italic">
                            {a.verification_notes}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                      <JsonBlock label="before" value={a.before_jsonb} />
                      <JsonBlock label="after" value={a.after_jsonb} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </SectionCard>

        </WiringSection>

        {/* Importance score */}
        <SectionCard
          title="Importance score"
          subtitle="Strategic priority — how much this SKU moves the needle vs competitors"
        >
          {importanceScore != null ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {importanceScore >= 72 ? (
                  <span className="text-amber-500 font-bold text-2xl">★</span>
                ) : (
                  <span className="text-violet-600 font-bold text-2xl">{importanceScore}</span>
                )}
                <div>
                  <div className="text-lg font-bold text-slate-900">{importanceScore}/100</div>
                  {importanceScore >= 72 && (
                    <div className="text-xs text-amber-700 font-semibold">Top seller — featured priority</div>
                  )}
                </div>
              </div>
              {importanceSeedEntry?.notes && (
                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
                  {importanceSeedEntry.notes}
                </div>
              )}
              <div className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 rounded p-2">
                <strong>Source:</strong> Manual seed — Talin_Marketing analysis 2026-05-12 (featured_by_variety). Based on: competitive price gap vs PetalJet/FiftyFlowers, variety demand signal, bridal/event trend 2026.
                <br />
                <strong>Pipeline:</strong> Not yet automated. To update this score, edit <code className="font-mono text-[10px]">lib/admin/featured-scores-seed.ts</code> and re-deploy.
              </div>
              <div className="text-[11px] text-slate-500">
                Match criteria: {importanceSeedEntry?.match_terms.join(' + ')}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">No importance score for this SKU.</p>
              <p className="text-[11px] text-slate-400">
                The featured-score seed covers 7 SKUs today (Quicksand, Cool Water, Sky Waltz, Serene Lavender, Orange Crush). This SKU is not in the seed. Once the scoring pipeline is built (TAM × competitive advantage × seasonal demand), all SKUs will get a score automatically.
              </p>
            </div>
          )}
        </SectionCard>

        {/* Section: Rose escalation queue ---------------------------- */}
        <SectionCard
          title="Rose escalation queue"
          subtitle="Issues admin flagged on this SKU that need Rose / CEO attention."
        >
          {roseQueue.length === 0 ? (
            <p className="text-xs text-slate-500 italic">
              No rose_queue entries for SKU {skuId}.
            </p>
          ) : (
            <ul className="space-y-2">
              {roseQueue.map((q) => (
                <li
                  key={q.id}
                  className={`border rounded-lg p-3 ${
                    q.status === 'resolved'
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : q.status === 'wont_fix'
                        ? 'border-slate-200 bg-slate-50'
                        : 'border-amber-200 bg-amber-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-mono text-slate-600">
                      {q.reason_code} . flagged {fmtDate(q.flagged_at)} by{' '}
                      <span className="font-semibold">{q.flagged_by}</span>
                    </span>
                    <span
                      className={
                        q.status === 'open'
                          ? 'text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded font-semibold'
                          : q.status === 'rose_working'
                            ? 'text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded font-semibold'
                            : q.status === 'resolved'
                              ? 'text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded font-semibold'
                              : 'text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded font-semibold'
                      }
                    >
                      {q.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700">{q.reason_text}</div>
                  {q.resolution_notes && (
                    <div className="text-[11px] text-slate-500 mt-1 italic">
                      resolution: {q.resolution_notes}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Section 1: Gate status table -- PRESERVED from v1 */}
        <WiringSection level={wm('gate-status').level} note={wm('gate-status').note} id="gate-status">
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">
            Gate status (16)
          </h2>

          {!cls && (
            <p className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg p-4 mb-4">
              No row in catalog_classifications yet. Validator has not run on
              this SKU. Edits below will create the row on first save.
            </p>
          )}

          <div className="space-y-2">
            {ALL_GATES.map((gate) => {
              const failing = failingSet.has(gate.id);
              const todoCol = gate.schemaTodo;
              const label = GATE_LABELS[gate.id] ?? gate.id;
              if (todoCol) {
                return (
                  <details
                    key={gate.id}
                    className="border border-slate-200 bg-slate-50 rounded-lg"
                  >
                    <summary className="cursor-pointer px-3 py-2 text-sm flex items-center gap-2">
                      <span className="text-slate-400">~</span>
                      <span className="font-mono text-xs text-slate-500">{gate.id}</span>
                      <span className="text-slate-600">{label}</span>
                      <span className="ml-auto text-[11px] text-slate-500 italic">
                        schema TODO
                      </span>
                    </summary>
                    <div className="px-3 pb-3">
                      <SchemaTodoStub column={todoCol} />
                    </div>
                  </details>
                );
              }
              if (!failing) {
                return (
                  <div
                    key={gate.id}
                    className="border border-emerald-200 bg-emerald-50/50 rounded-lg px-3 py-2 text-sm flex items-center gap-2"
                  >
                    <span className="text-emerald-600">OK</span>
                    <span className="font-mono text-xs text-emerald-700">{gate.id}</span>
                    <span className="text-slate-600">{label}</span>
                  </div>
                );
              }
              return (
                <details
                  key={gate.id}
                  open
                  className="border border-red-200 bg-red-50 rounded-lg"
                >
                  <summary className="cursor-pointer px-3 py-2 text-sm flex items-center gap-2">
                    <span className="text-red-600 font-semibold">FAIL</span>
                    <span className="font-mono text-xs text-red-700">{gate.id}</span>
                    <span className="text-slate-800">{label}</span>
                  </summary>
                  <div className="px-3 pb-3 pt-1">
                    <GateFixer gateId={gate.id} skuId={skuId} mirror={mirror} />
                    <AskRoseButton skuId={skuId} gateId={gate.id} gateLabel={label} />
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        </WiringSection>

        {/* Section 2: Raw fields -- PRESERVED from v1 */}
        <WiringSection level={wm('raw-mirror').level} note={wm('raw-mirror').note} id="raw-mirror">
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">
            Raw fields (floropolis_inventory_mirror)
          </h2>
          {mirror ? (
            <>
              {/* Quick deal toggles */}
              <div className="mb-4 border border-slate-200 rounded-xl p-4 bg-white">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Deal & merchandising flags
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <FlagRow
                    label="is_on_deal"
                    skuId={skuId}
                    field="is_on_deal"
                    value={mirror.is_on_deal === true}
                  />
                  <FlagRow
                    label="is_best_seller"
                    skuId={skuId}
                    field="is_best_seller"
                    value={mirror.is_best_seller === true}
                  />
                  <FlagRow
                    label="is_featured"
                    skuId={skuId}
                    field="is_featured"
                    value={mirror.is_featured === true}
                  />
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">
                      deal_expiry
                    </div>
                    <DateEditor
                      skuId={skuId}
                      field="deal_expiry"
                      current={mirror.deal_expiry ?? null}
                      label="deal_expiry"
                    />
                  </div>
                </div>
              </div>

              {/* All other mirror columns */}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm border border-slate-200 rounded-xl p-4 bg-white">
                {Object.entries(mirror as Record<string, unknown>).map(([k, v]) => (
                  <DefRow
                    key={k}
                    label={k}
                    value={renderRaw(v)}
                    mono={k === 'id' || k === 'sku_id' || k === 'slug'}
                  />
                ))}
              </dl>
            </>
          ) : (
            <p className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg p-4">
              No row in floropolis_inventory_mirror for id {skuId}. The mirror
              truncates daily -- check the next reload cycle.
            </p>
          )}
        </section>

        </WiringSection>

        {/* Section 3: Admin actions -- PRESERVED from v1 */}
        <WiringSection level={wm('admin-actions').level} note={wm('admin-actions').note} id="admin-actions">
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">
            Admin actions
          </h2>
          <div className="border border-slate-200 rounded-xl p-4 bg-white">
            {isAdminOverridden && (
              <p className="mb-3 text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-md px-3 py-2">
                This SKU is currently <b>{cls?.status}</b>. Use &quot;Reset to
                validator decision&quot; to clear the override.
              </p>
            )}
            <AdminActions
              skuId={skuId}
              currentReviewerNotes={cls?.reviewer_notes ?? null}
            />
            {cls?.reviewer_at && (
              <p className="text-[11px] text-slate-500 mt-3">
                Last reviewer action: <b>{cls.reviewer_action ?? '-'}</b> at{' '}
                {fmtDate(cls.reviewer_at)}
              </p>
            )}
          </div>
        </section>

        </WiringSection>

          </div>

          {/* Right column: sticky action panel (propose cluster) */}
          <WiringSection level={wm('propose-cluster').level} note={wm('propose-cluster').note} id="propose-cluster">
            <DetailActionPanel
              title="Propose change"
              subtitle={cls ? `Status: ${cls.status}` : 'No classification row yet'}
            >
              <p className="text-[11px] text-slate-500 -mt-1">
                Each form inserts an admin_proposals row with source_rationale + source_artifact. Facu must approve in{' '}
                <Link href="/admin/catalog/approval-queue" className="underline text-emerald-700 hover:text-emerald-900">
                  approval-queue
                </Link>.
              </p>
              <ProposeChangeCluster>
                <HideSkuForm skuId={skuId} />
                <DiscountSkuForm
                  skuId={skuId}
                  currentPrice={toNumOrNull(mirror?.price)}
                />
                <ProposeMirrorFieldForm
                  skuId={skuId}
                  field="description"
                  label="description"
                  current={null}
                  helpText="Customer-facing PDP description. Only Job-controlled mirror column."
                />
                <ProposeMirrorFieldForm
                  skuId={skuId}
                  field="image_url"
                  label="image_url"
                  current={null}
                  helpText="Hero image URL. Source artifact (where image came from) is required."
                  requireArtifact
                />
                <ProposeMirrorFieldForm
                  skuId={skuId}
                  field="category"
                  label="category"
                  current={mirror?.category as string | null}
                  helpText="Taxonomy category. Must match catalog taxonomy."
                />
                <UnsupportedProposeButton
                  label="change vendor cost"
                  reason="JOB_LOCKED per Rose contract v1.0. floropolis_inventory.farm_cost is supply truth -- propose via canonical_cost.update which Rose owns, not via this UI."
                />
                <PriceCorrectionForm
                  skuId={skuId}
                  currentPrice={toNumOrNull(mirror?.price)}
                  farmCost={toNumOrNull(mirror?.farm_cost)}
                  shippingPerStem={breakdown?.deliveryPerStem ?? null}
                />
              </ProposeChangeCluster>
            </DetailActionPanel>
          </WiringSection>
        </div>

        <div className="mt-6">
          <Link
            href="/admin/catalog"
            className="text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            Back to catalog
          </Link>
        </div>
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Generic section wrapper used by the mockup-ported panels.
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function KvRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-slate-500">
        {label}
        {hint && (
          <span className="block text-[10px] text-slate-400 font-mono">{hint}</span>
        )}
      </span>
      <span className="text-slate-900 font-medium font-mono">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-slate-100 my-2" />;
}

function JsonBlock({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown> | null;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2 overflow-hidden">
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">
        {label}
      </div>
      <pre className="text-[10px] font-mono text-slate-700 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
        {value == null ? '(null)' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CostSourcePanel -- "where did this cost come from?" attribution view.
// Renders cost_source + cost_verified_at, classifies into K2K live / email /
// whatsapp / manual / unknown so CEO can trace provenance per Rose contract P3.
// ---------------------------------------------------------------------------

function CostSourcePanel({
  mirror,
  skuId,
}: {
  mirror: MirrorRow | null;
  skuId: number;
}) {
  if (!mirror) {
    return (
      <p className="text-xs text-slate-500 italic">
        No mirror row -- cannot resolve cost source.
      </p>
    );
  }
  const cs = (mirror.cost_source as string | null) ?? null;
  const verified = (mirror.cost_verified_at as string | null) ?? null;

  let bucket: 'k2k_live' | 'email' | 'whatsapp' | 'manual' | 'unknown';
  let bucketLabel: string;
  let toneCls: string;
  if (!cs) {
    bucket = 'unknown';
    bucketLabel = 'No cost_source recorded';
    toneCls = 'border-red-200 bg-red-50 text-red-800';
  } else if (/_k2k_/i.test(cs)) {
    bucket = 'k2k_live';
    bucketLabel = 'K2K live (vendor ghost upload)';
    toneCls = 'border-emerald-200 bg-emerald-50 text-emerald-800';
  } else if (/(email|gmail|outlook)/i.test(cs)) {
    bucket = 'email';
    bucketLabel = 'Email injection';
    toneCls = 'border-blue-200 bg-blue-50 text-blue-800';
  } else if (/(whatsapp|wa)/i.test(cs)) {
    bucket = 'whatsapp';
    bucketLabel = 'WhatsApp injection';
    toneCls = 'border-violet-200 bg-violet-50 text-violet-800';
  } else if (/(manual|paste|csv)/i.test(cs)) {
    bucket = 'manual';
    bucketLabel = 'Manual entry / CSV paste';
    toneCls = 'border-amber-200 bg-amber-50 text-amber-800';
  } else {
    bucket = 'unknown';
    bucketLabel = 'Unclassified source';
    toneCls = 'border-slate-200 bg-slate-50 text-slate-700';
  }

  const meta = getCostSourceMeta(cs);
  const k2kAvg = toNumOrNull((mirror as Record<string, unknown>).k2k_listed_price_avg);
  const k2kStatus = (mirror as Record<string, unknown>).k2k_alignment_status as string | null;
  const k2kVerified = (mirror as Record<string, unknown>).k2k_last_verified_at as string | null;
  const scrapeDate = (mirror as Record<string, unknown>).scrape_date as string | null;
  const priceN = toNumOrNull(mirror.price);

  return (
    <div className="space-y-3 text-xs">
      {/* Source identity row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={`rounded-md border p-3 ${toneCls}`}>
          <div className="text-[10px] uppercase tracking-wide font-semibold opacity-70 mb-1">Source type</div>
          <div className="text-sm font-semibold">{bucketLabel}</div>
          <div className="text-[11px] mt-1 font-mono opacity-80">{cs ?? '(null)'}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Registry</div>
          {meta ? (
            <>
              <div className={`text-sm font-semibold ${getReliabilityCls(meta.reliability)}`}>{meta.label}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{meta.description}</div>
              {meta.url ? (
                <a
                  href={meta.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1.5 text-[11px] text-emerald-700 underline decoration-dotted hover:text-emerald-900"
                >
                  Open source file →
                </a>
              ) : (
                <span className="inline-block mt-1.5 text-[11px] text-slate-400 italic">
                  No link yet — add URL to <code className="font-mono">lib/admin/cost-source-registry.ts</code>
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-500 italic">Not in registry — new source key</span>
          )}
        </div>
      </div>

      {/* Verification + data freshness */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Cost verified</div>
          {verified ? (
            <span className="font-mono text-slate-800">{fmtDate(verified)}</span>
          ) : (
            <span className="text-red-700">Not verified</span>
          )}
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Data date (scrape)</div>
          <span className="font-mono text-slate-700">{scrapeDate ?? '—'}</span>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Reliability</div>
          <span className={`font-semibold capitalize ${meta ? getReliabilityCls(meta.reliability) : 'text-slate-400'}`}>
            {meta?.reliability ?? 'unknown'}
          </span>
        </div>
      </div>

      {/* K2K market alignment */}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-2">K2K market alignment</div>
        {k2kAvg != null ? (
          <div className="flex flex-wrap gap-4">
            <div>
              <div className="text-[10px] text-slate-500">K2K avg listed</div>
              <div className="font-mono text-slate-900">{fmtUsd(k2kAvg)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Our price</div>
              <div className="font-mono text-slate-900">{fmtUsd(priceN)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">vs K2K</div>
              <div className={`font-semibold font-mono ${priceN != null && k2kAvg > 0 ? (priceN / k2kAvg - 1 > 0.05 ? 'text-red-700' : priceN / k2kAvg - 1 < -0.05 ? 'text-emerald-700' : 'text-slate-700') : 'text-slate-400'}`}>
                {priceN != null && k2kAvg > 0 ? `${((priceN / k2kAvg - 1) * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">K2K verified</div>
              <div className="text-slate-700">{k2kVerified ? fmtDate(k2kVerified) : '—'}</div>
            </div>
          </div>
        ) : (
          <p className="text-slate-500 italic">
            k2k_listed_price_avg is null — K2K price not verified for this SKU.
            Status: <span className="font-mono">{k2kStatus ?? 'UNVERIFIED'}</span>
          </p>
        )}
      </div>

      <p className="text-[11px] text-slate-500 italic">
        SKU {skuId}. farm_cost is JOB_LOCKED — to change cost, file canonical_cost.update via Rose. To add a source URL, update <code className="font-mono">lib/admin/cost-source-registry.ts</code>.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-gate inline fixer dispatch -- PRESERVED from v1
// ---------------------------------------------------------------------------

function GateFixer({
  gateId,
  skuId,
  mirror,
}: {
  gateId: string;
  skuId: number;
  mirror: MirrorRow | null;
}) {
  if (!mirror) {
    return (
      <p className="text-xs text-slate-500 italic">
        Cannot edit -- mirror row missing. Wait for next reload cycle.
      </p>
    );
  }
  switch (gateId) {
    case 'price_zero':
      return (
        <FixerWrap hint="Set a non-zero price for this SKU.">
          <PriceEditor skuId={skuId} current={toNumOrNull(mirror.price)} />
        </FixerWrap>
      );
    case 'margin_unknown':
      return (
        <FixerWrap hint="Move margin_status off UNKNOWN once cost is confirmed.">
          <MarginStatusEditor skuId={skuId} current={mirror.margin_status ?? null} />
        </FixerWrap>
      );
    case 'cost_unverified': {
      const costN = toNumOrNull(mirror.farm_cost);
      const costSource = (mirror.cost_source as string | null) ?? null;
      const costVerified = (mirror.cost_verified_at as string | null) ?? null;
      const daysSinceVerified = costVerified
        ? Math.round((Date.now() - new Date(costVerified).getTime()) / 86400000)
        : null;
      const inRecentReview = costSource ? /facu|may|2026-05/i.test(costSource) : false;
      return (
        <FixerWrap hint="Cost is set but verification stamp is missing or expired (30-day window). Confirm with Rose before stamping.">
          <div className="space-y-2 mb-3 text-xs">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-slate-50 border border-slate-200 rounded p-2">
              <span className="text-slate-500">farm_cost</span>
              <span className="font-mono font-semibold text-slate-900">{costN != null ? `$${costN.toFixed(4)}` : '—'}</span>
              <span className="text-slate-500">cost_source</span>
              {(() => {
                const meta = getCostSourceMeta(costSource);
                if (!meta) return <span className="font-mono text-slate-700 break-all">{costSource ?? '—'}</span>;
                if (meta.url) {
                  return (
                    <a href={meta.url} target="_blank" rel="noopener noreferrer"
                       className={`font-mono underline break-all hover:opacity-80 ${getReliabilityCls(meta.reliability)}`}>
                      {costSource}
                    </a>
                  );
                }
                return (
                  <span className={`font-mono break-all ${getReliabilityCls(meta.reliability)}`}
                        title={meta.description}>
                    {costSource} · {meta.reliability}
                  </span>
                );
              })()}
              <span className="text-slate-500">last verified</span>
              <span className={costVerified ? 'font-mono text-slate-700' : 'text-red-700 font-semibold'}>
                {costVerified ? `${costVerified.slice(0, 10)} (${daysSinceVerified}d ago)` : 'never'}
              </span>
            </div>
            {!inRecentReview && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">
                Source looks like FOB pricelist — this SKU may NOT have been in the Facu_May12_2026_matrix review. Ask Rose to confirm the cost before stamping.
              </div>
            )}
            {inRecentReview && !costVerified && (
              <div className="bg-blue-50 border border-blue-200 rounded p-2 text-blue-800">
                Source matches a recent review — safe to stamp verified today if you confirmed the cost.
              </div>
            )}
          </div>
          <VerifyCostButton skuId={skuId} />
        </FixerWrap>
      );
    }
    case 'missing_cost_source':
      return (
        <FixerWrap hint="Record where this cost came from (vendor name, K2K snapshot, manual quote, etc).">
          <CostSourceEditor skuId={skuId} current={mirror.cost_source ?? null} />
        </FixerWrap>
      );
    case 'open_price_alert':
      return (
        <FixerWrap hint="Rose flagged this price as suspect. Clear the alert after Facu reviews.">
          <ClearPriceAlertButton skuId={skuId} />
        </FixerWrap>
      );
    case 'missing_arrival_date':
      return (
        <FixerWrap hint="T2/T3 rows need an arrival_date to satisfy lead-time gates.">
          <DateEditor
            skuId={skuId}
            field="arrival_date"
            current={mirror.arrival_date ?? null}
            label="arrival"
          />
        </FixerWrap>
      );
    case 'missing_image':
      return (
        <FixerWrap hint="Add one or more image URLs. First image is the hero on /shop.">
          <ImagesEditor skuId={skuId} current={imagesArr(mirror.images)} />
        </FixerWrap>
      );
    case 'missing_contents_description':
      return (
        <FixerWrap hint="Plain-English description of what is in the box -- units, stems per bunch, variety. Schema column: contents_note.">
          <ContentsNoteEditor skuId={skuId} current={mirror.contents_note ?? null} />
        </FixerWrap>
      );
    case 'formula_deviation':
      return (
        <FixerWrap hint="Price diverges from formula (cost / (1 - gpm) + delivery). Either fix the price/cost above OR accept the deviation as an admin override.">
          <AcceptDeviationButton skuId={skuId} />
        </FixerWrap>
      );
    case 'stock_live_mismatch':
      return (
        <FixerWrap hint="Stock > 0 but live = false. Toggle live so customers can see it -- or fix the stock.">
          <LiveToggleButton skuId={skuId} current={mirror.live ?? null} />
        </FixerWrap>
      );
    case 'missing_box_dims':
      return (
        <FixerWrap hint="box_master is READ-ONLY for Job per Rose contract v1.0 PB-1. If the box weight here looks wrong, escalate to CEO directly -- do NOT submit a proposal.">
          <div className="flex flex-col gap-2">
            <Link
              href="/admin/catalog/config"
              className="text-xs font-semibold text-emerald-700 underline w-fit"
            >
              View box_master in /admin/catalog/config (read-only)
            </Link>
            <FlagBoxDimToCeoButton skuId={skuId} boxType={mirror.box_type ?? null} />
          </div>
        </FixerWrap>
      );
    case 'missing_vendor_name':
      return (
        <FixerWrap hint="Vendor field is null. Set it so customers see the source farm on the PDP.">
          <VendorEditor skuId={skuId} current={mirror.vendor ?? null} />
        </FixerWrap>
      );
    case 'missing_unit':
    case 'missing_units_or_bunch':
      return (
        <FixerWrap hint="Unit / units_per_box / stems_per_bunch are vendor-supplied at ingest. Fix at the K2K source or escalate to Rose.">
          <p className="text-xs text-slate-500">
            No inline editor -- forward to Rose via the admin actions panel
            below.
          </p>
        </FixerWrap>
      );
    case 't2_outside_5d_window':
    case 't3_outside_14d_window': {
      const minDays = gateId === 't2_outside_5d_window' ? 5 : 14;
      const tierLabel = gateId === 't2_outside_5d_window' ? 'T2' : 'T3';
      const currentArrival = mirror.arrival_date ?? null;
      const arrDaysOut = currentArrival
        ? Math.round((new Date(currentArrival + 'T00:00:00').getTime() - Date.now()) / 86400000)
        : null;
      const isExpired = arrDaysOut != null && arrDaysOut < 0;
      return (
        <FixerWrap
          hint={`${tierLabel} products are available on Stripe checkout when arrival_date is ${minDays}–180 days from today. Arrival date must be updated to unblock.`}
        >
          <div className="space-y-2 mb-3 text-xs">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-slate-50 border border-slate-200 rounded p-2">
              <span className="text-slate-500">current arrival_date</span>
              <span className="font-mono font-semibold text-slate-900">{currentArrival ?? '(none)'}</span>
              {arrDaysOut != null && (
                <>
                  <span className="text-slate-500">days from today</span>
                  <span className={`font-mono font-semibold ${isExpired ? 'text-red-700' : arrDaysOut < minDays ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {arrDaysOut >= 0 ? `+${arrDaysOut}d` : `${arrDaysOut}d (EXPIRED)`}
                  </span>
                </>
              )}
            </div>
            {isExpired && (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-red-800">
                Arrival date is in the past. Ask vendor for the next batch date and update arrival_date below — or ask Rose to update from K2K.
              </div>
            )}
            {!isExpired && arrDaysOut != null && arrDaysOut < minDays && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">
                Arrival is within {minDays}d — too close to publish. Update to a date at least {minDays} days out.
              </div>
            )}
          </div>
          <DateEditor
            skuId={skuId}
            field="arrival_date"
            current={currentArrival}
            label="arrival"
          />
        </FixerWrap>
      );
    }
    default:
      return (
        <p className="text-xs text-slate-500 italic">
          No inline fixer yet for <span className="font-mono">{gateId}</span>.
          Edit raw mirror fields below or use admin actions.
        </p>
      );
  }
}

function FixerWrap({ children, hint }: { children: ReactNode; hint: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-600">{hint}</p>
      {children}
    </div>
  );
}

function FlagRow({
  label,
  skuId,
  field,
  value,
}: {
  label: string;
  skuId: number;
  field: 'is_on_deal' | 'is_best_seller' | 'is_featured';
  value: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
        {label}
      </span>
      <FlagToggle skuId={skuId} field={field} value={value} />
    </div>
  );
}

function DefRow({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
        {label}
      </dt>
      <dd
        className={
          mono
            ? 'text-slate-900 font-mono text-xs break-all'
            : 'text-slate-900 break-words'
        }
      >
        {value}
      </dd>
    </div>
  );
}
