// Admin Catalog -- per-SKU control plane.
// v1 | 2026-05-18 | Job_PM CAT-S4 [V8 SHADOW]
//
// Lands on /admin/catalog/[id]. Three sections:
//   1. Gate status table (16 gates, fixers inline for the failing ones)
//   2. All raw mirror fields (definition list, inline edit for the writable ones)
//   3. Admin actions (force publish/hide, forward to Rose, reset, reviewer notes)
//
// Server component. Inline editors live in Editor.tsx (client island).
//
// All writes funnel through:
//   POST /api/admin/catalog/sku/[id]/update         -- single-field mirror writes
//   POST /api/admin/catalog/sku/[id]/admin-action   -- catalog_classifications status

export const dynamic = 'force-dynamic';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';
import { GATE_LABELS } from '@/lib/catalog-gates';

import {
  AdminActions,
  AcceptDeviationButton,
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
  [k: string]: unknown;
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
  if (status === 'publishable') {
    return {
      label: 'publishable',
      cls: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    };
  }
  if (status === 'needs_data_fix') {
    return {
      label: 'needs_data_fix',
      cls: 'bg-amber-100 text-amber-800 border-amber-300',
    };
  }
  if (status === 'needs_facu_review') {
    return {
      label: 'needs_facu_review',
      cls: 'bg-red-100 text-red-800 border-red-300',
    };
  }
  if (status.startsWith('admin_overridden_')) {
    return {
      label: status,
      cls: 'bg-violet-100 text-violet-800 border-violet-300',
    };
  }
  return { label: status, cls: 'bg-slate-100 text-slate-700 border-slate-300' };
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

  const { data: classRow } = await backup
    .from('catalog_classifications')
    .select(
      'sku_id, status, gate_score, failing_gates, vendor, tier, variety, last_validated_at, last_changed_at, reviewer_action, reviewer_at, reviewer_notes, created_at',
    )
    .eq('sku_id', skuId)
    .maybeSingle();

  const { data: mirrorRow } = await backup
    .from('floropolis_inventory_mirror')
    .select('*')
    .eq('id', skuId)
    .maybeSingle();

  const cls = classRow as ClassificationRow | null;
  const mirror = mirrorRow as MirrorRow | null;
  const failingSet = new Set<string>(
    Array.isArray(cls?.failing_gates) ? (cls!.failing_gates as string[]) : [],
  );

  const isAdminOverridden =
    typeof cls?.status === 'string' && cls.status.startsWith('admin_overridden_');

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
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
                {mirror?.variety ?? '-'} . {mirror?.length ?? '-'} . vendor{' '}
                <span className="font-medium">{mirror?.vendor ?? '-'}</span>{' '}
                . tier <span className="font-mono">{mirror?.tier ?? '-'}</span>
              </p>
              {cls && (
                <p className="text-xs text-slate-500 mt-2">
                  Last validated {fmtDate(cls.last_validated_at)} . Last
                  changed {fmtDate(cls.last_changed_at)}
                </p>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
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

        {/* Section 1: Gate status table */}
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
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        {/* Section 2: Raw fields */}
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

        {/* Section 3: Admin actions */}
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

        <Link
          href="/admin/catalog"
          className="text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
        >
          Back to catalog
        </Link>
      </main>

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-gate inline fixer dispatch
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
    case 'cost_unverified':
      return (
        <FixerWrap hint="Stamp cost_verified_at = today once Rose confirms the vendor cost. Window: 30 days.">
          <VerifyCostButton skuId={skuId} />
        </FixerWrap>
      );
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
        <FixerWrap hint="Box type weight is not validated. Fix in box_master -- this page does not edit box_master.">
          <Link
            href="/admin/catalog/config"
            className="text-xs font-semibold text-emerald-700 underline"
          >
            Open /admin/catalog/config
          </Link>
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
    case 't3_outside_14d_window':
      return (
        <FixerWrap
          hint={
            gateId === 't2_outside_5d_window'
              ? 'T2 SKU has arrival_date within 5 days but no stock. Either update arrival_date or force-publish to override.'
              : 'T3 SKU has arrival_date within 14 days but no stock. Either update arrival_date or force-publish to override.'
          }
        >
          <div className="flex flex-col gap-2">
            <DateEditor
              skuId={skuId}
              field="arrival_date"
              current={mirror.arrival_date ?? null}
              label="arrival"
            />
            <AcceptDeviationButton skuId={skuId} />
          </div>
        </FixerWrap>
      );
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
  // Small server-side wrapper that renders a client toggle.
  // Defined inline so the page file stays the single source of truth for
  // which mirror flags are exposed here.
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
