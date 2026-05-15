// Admin Catalog -- SKU Detail
// v0.1 | 2026-05-15 | Job_PM [V8 SHADOW]
//
// Four sections per SKU: Sources, Cost Breakdown (with shipping transparency),
// Overrides + audit, History + verifier health. "Propose change from here" buttons.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminCatalogNav from '../../_components/AdminCatalogNav';
import {
  SKUS, getVendor, getQualityFamily, getBoxType,
  getShippingForVendor, sumAvailability, formatPrice, formatGpm, GPM_DEFAULT,
} from '../../_constants/catalogMock';
import { PROPOSALS, VERIFIER_STATUSES } from '../../_constants/catalogQueue';

// Static params so Next pre-builds known SKUs (others 404)
export function generateStaticParams() {
  return SKUS.map(s => ({ sku: s.id }));
}

export default async function AdminCatalogDetail({ params }: { params: Promise<{ sku: string }> }) {
  const { sku: skuId } = await params;
  const sku = SKUS.find(s => s.id === skuId);
  if (!sku) notFound();

  const vendor = getVendor(sku.vendor_id);
  const qf = getQualityFamily(sku.quality_family_id);
  const box = getBoxType(sku.box_type_id);
  const shipping = getShippingForVendor(sku.vendor_id);
  if (!vendor || !qf || !box) notFound();

  // proposals that mention this SKU's vendor_sku_name in their cascade examples
  const skuProposals = PROPOSALS.filter(p =>
    p.status === 'awaiting_facu' &&
    p.cascade_top_examples.some(ex => ex.sku.includes(sku.vendor_sku_name.split(' (')[0]))
  );

  // Cross-vendor offers for the same quality family
  const crossVendorOffers = SKUS.filter(s => s.quality_family_id === sku.quality_family_id && s.id !== sku.id);

  // Cost breakdown values
  const dimKg = box.dim_weight_kg;
  const ceilDimKg = Math.ceil(dimKg);
  const boxDeliveryUsd = shipping ? ceilDimKg * shipping.base_rate_per_kg * shipping.fuel_surcharge_mult : null;
  const deliveryPerStem = sku.delivery_per_stem;
  const priceExDelivery = sku.vendor_cost_usd !== null ? sku.vendor_cost_usd / (1 - GPM_DEFAULT) : null;

  return (
    <div>
      <AdminCatalogNav active="list" />

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Breadcrumb */}
        <div className="mb-3 text-xs text-slate-500">
          <Link href="/mockups/admin-catalog" className="hover:underline">Catalog</Link>
          {' / '}
          <span className="font-mono">{sku.id}</span>
        </div>

        {/* Header */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{qf.name}</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {sku.vendor_sku_name} . {vendor.name} ({vendor.country}/{vendor.origin_port})
              </p>
              <p className="text-[11px] text-slate-400 font-mono mt-1">
                {sku.id} . quality_family_id: {sku.quality_family_id} . box: {box.code}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="text-2xl font-bold text-slate-900">{formatPrice(sku.calculated_price_per_stem)}</div>
              <div className="text-xs text-slate-500">per {qf.unit}</div>
              {sku.gpm_band && (
                <span className={
                  'text-[11px] px-2 py-0.5 rounded-full font-semibold ' +
                  (sku.gpm_band === 'green'  ? 'bg-emerald-100 text-emerald-800'
                  : sku.gpm_band === 'yellow' ? 'bg-amber-100 text-amber-800'
                                              : 'bg-red-100 text-red-800')
                }>
                  GPM {formatGpm(sku.gpm)}
                </span>
              )}
            </div>
          </div>

          {/* Quick metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <Metric label="Cost / stem"      value={formatPrice(sku.vendor_cost_usd)}     hint={sku.cost_status} />
            <Metric label="Delivery / stem"  value={formatPrice(deliveryPerStem)}         hint={shipping ? `${vendor.origin_port} -> US` : 'no shipping config'} />
            <Metric label="Available stems"  value={sumAvailability(sku).toLocaleString()} hint={`${sku.availability.length} delivery weeks`} />
            <Metric label="Visibility"       value={sku.visibility}                         hint={sku.visibility_rule} />
          </div>

          {/* Proposals affecting this SKU */}
          {skuProposals.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-orange-50 border border-orange-200">
              <div className="text-xs font-semibold text-orange-900 mb-1">
                {skuProposals.length} active proposal{skuProposals.length === 1 ? '' : 's'} affecting this SKU
              </div>
              <div className="space-y-1">
                {skuProposals.map(p => (
                  <Link
                    key={p.id}
                    href={'/mockups/admin-catalog-approval-queue#' + p.id}
                    className="block text-xs text-orange-800 hover:underline"
                  >
                    {p.id}: {p.type} -- {p.scope}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* SECTION 1: Sources */}
        <Section title="1. Sources" subtitle="K2K live + T2 commitments + T3 sourceable -- side by side">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['k2k_live', 't2', 't3'] as const).map(tier => {
              const has = sku.sources.find(s => s.tier === tier && s.valid);
              const availForTier = sku.availability.filter(a => a.source === tier);
              const total = availForTier.reduce((acc, a) => acc + a.stems, 0);
              return (
                <div key={tier} className={
                  'rounded-lg border p-3 ' +
                  (has ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60')
                }>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-700">
                      {tier === 'k2k_live' ? 'K2K live (vendor)' : tier === 't2' ? 'T2 (DB commitment)' : 'T3 (DB sourceable)'}
                    </span>
                    <span className={
                      has ? 'text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold'
                          : 'text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-500'
                    }>
                      {has ? 'present' : 'absent'}
                    </span>
                  </div>
                  {has && (
                    <>
                      <div className="text-lg font-bold text-slate-900">{total.toLocaleString()} <span className="text-xs font-normal text-slate-500">stems</span></div>
                      <div className="space-y-1 mt-2">
                        {availForTier.map(a => (
                          <div key={a.delivery_week} className="text-xs text-slate-600 flex justify-between">
                            <span>{a.delivery_week}</span>
                            <span className="font-medium">{a.stems.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      {has.note && (
                        <p className="text-[11px] text-slate-500 mt-2 italic">{has.note}</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Cross-vendor matches */}
          {crossVendorOffers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-700 mb-2">
                Cross-vendor offers for the same quality family ({crossVendorOffers.length})
              </p>
              <div className="space-y-1.5">
                {crossVendorOffers.map(o => {
                  const ov = getVendor(o.vendor_id);
                  if (!ov) return null;
                  return (
                    <Link key={o.id} href={'/mockups/admin-catalog/' + o.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-md bg-slate-50 hover:bg-slate-100">
                      <span>
                        <span className="text-slate-700 font-medium">{ov.name}</span>
                        <span className="text-slate-400 ml-2">. {o.vendor_sku_name}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-slate-700">{formatPrice(o.calculated_price_per_stem)}</span>
                        {o.gpm_band && <span className={
                          o.gpm_band === 'green'  ? 'text-emerald-700'
                        : o.gpm_band === 'yellow' ? 'text-amber-700'
                                                  : 'text-red-700'
                        }>{formatGpm(o.gpm)}</span>}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

        {/* SECTION 2: Cost breakdown */}
        <Section title="2. Cost breakdown" subtitle={`Rose's formula -- transparent calc per ${qf.unit}`}>
          {sku.vendor_cost_usd === null ? (
            <div className="text-sm text-amber-700 italic">
              Cost missing -- pricing cannot be calculated. {sku.cost_status === 'awaiting_vendor_confirm' ? 'Awaiting vendor confirmation.' : 'No cost data ingested yet.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Formula */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] text-slate-700 leading-relaxed">
                <div className="font-sans font-semibold text-slate-900 text-xs mb-2">Pricing formula (Rose, verified)</div>
                <div>price_ex_delivery = farm_cost / (1 - GPM)</div>
                <div>delivery_per_box  = ceil(dim_kg) * rate * fuel_mult</div>
                <div>delivery_per_stem = delivery_per_box / stems_per_box</div>
                <div>selling_price     = price_ex_delivery + delivery_per_stem</div>
                <div className="font-sans text-[10px] text-slate-400 mt-3">
                  Delivery passed through at cost -- no margin on delivery
                </div>
              </div>
              {/* Filled values */}
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs space-y-1.5">
                <div className="flex justify-between"><span className="text-slate-500">farm_cost</span><span className="text-slate-900 font-medium">{formatPrice(sku.vendor_cost_usd)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">GPM target</span><span className="text-slate-900 font-medium">{(GPM_DEFAULT * 100).toFixed(0)}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">price_ex_delivery</span><span className="text-slate-900 font-medium">{formatPrice(priceExDelivery)}</span></div>
                <div className="border-t border-slate-100 my-2"></div>
                <div className="flex justify-between"><span className="text-slate-500">box dim_kg ({box.code})</span><span className="text-slate-900 font-medium">{dimKg.toFixed(2)} kg</span></div>
                <div className="flex justify-between"><span className="text-slate-500">ceil(dim_kg)</span><span className="text-slate-900 font-medium">{ceilDimKg}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">rate</span><span className="text-slate-900 font-medium">${shipping?.base_rate_per_kg ?? '--'}/kg</span></div>
                <div className="flex justify-between"><span className="text-slate-500">fuel surcharge</span><span className="text-slate-900 font-medium">x {shipping?.fuel_surcharge_mult ?? '--'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">delivery_per_box</span><span className="text-slate-900 font-medium">{formatPrice(boxDeliveryUsd)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">stems_per_box</span><span className="text-slate-900 font-medium">{sku.stems_per_box}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">delivery_per_stem</span><span className="text-slate-900 font-medium">{formatPrice(deliveryPerStem)}</span></div>
                <div className="border-t border-slate-100 my-2"></div>
                <div className="flex justify-between text-sm pt-1">
                  <span className="font-semibold text-slate-900">selling_price</span>
                  <span className="font-bold text-slate-900">{formatPrice(sku.calculated_price_per_stem)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">realized GPM</span>
                  <span className={
                    'font-semibold ' +
                    (sku.gpm_band === 'green'  ? 'text-emerald-700'
                    : sku.gpm_band === 'yellow' ? 'text-amber-700'
                                                : 'text-red-700')
                  }>{formatGpm(sku.gpm)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button className="text-xs px-3 py-1.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">
              Propose: edit box dims
            </button>
            <button className="text-xs px-3 py-1.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">
              Propose: edit shipping config
            </button>
            <button className="text-xs px-3 py-1.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">
              Propose: discount
            </button>
          </div>
        </Section>

        {/* SECTION 3: Overrides + audit */}
        <Section title="3. Overrides + audit" subtitle="Source tables NEVER mutated -- overrides are a separate layer">
          {sku.active_override_id ? (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
              <div className="text-xs font-semibold text-violet-900 mb-1">Active override: {sku.active_override_id}</div>
              <p className="text-xs text-violet-800">
                Visibility forced to {sku.visibility} via rule: {sku.visibility_rule}
              </p>
              <button className="mt-2 text-xs px-2.5 py-1 rounded bg-white border border-violet-200 text-violet-700 hover:bg-violet-100">
                Propose: lift override
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No active overrides. SKU follows automatic rules.</p>
          )}

          <div className="mt-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700 mb-1">Visibility rule</p>
            <p className="font-mono text-[11px] bg-slate-50 px-2 py-1 rounded border border-slate-200">{sku.visibility_rule}</p>
          </div>
        </Section>

        {/* SECTION 4: History + verifier health */}
        <Section title="4. History + verifier health" subtitle="Last edits + pipeline verifier status (Pita owns)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Recent edits</p>
              <div className="space-y-1.5">
                <HistoryRow date={sku.last_edit_at} actor={sku.last_edit_by} action={`Updated -- ${sku.cost_source}`} />
                <HistoryRow date={sku.cost_updated_at} actor="Rose (auto)" action={`Cost stamped: ${formatPrice(sku.vendor_cost_usd)}`} />
                <HistoryRow date="2026-05-01" actor="System" action="SKU first observed in unified inventory" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Verifier health (layers touching this SKU)</p>
              <div className="space-y-1.5">
                {VERIFIER_STATUSES.slice(1, 6).map(v => (
                  <div key={v.layer} className="flex items-start justify-between text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-700">{v.layer}</div>
                      <div className="text-[10px] text-slate-500 truncate" title={v.message}>{v.message}</div>
                    </div>
                    <VerifierBadge status={v.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-base font-bold text-slate-900 mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5 truncate" title={hint}>{hint}</div>}
    </div>
  );
}

function HistoryRow({ date, actor, action }: { date: string; actor: string; action: string }) {
  return (
    <div className="text-xs flex items-start gap-2">
      <span className="font-mono text-[10px] text-slate-400 w-20 shrink-0">{date}</span>
      <span className="text-slate-500 w-24 shrink-0 truncate">{actor}</span>
      <span className="text-slate-700">{action}</span>
    </div>
  );
}

function VerifierBadge({ status }: { status: 'PASS' | 'WARN' | 'FAIL' | 'MISSING' }) {
  const cls =
    status === 'PASS'    ? 'bg-emerald-100 text-emerald-800'
  : status === 'WARN'    ? 'bg-amber-100 text-amber-800'
  : status === 'FAIL'    ? 'bg-red-100 text-red-800'
                         : 'bg-slate-200 text-slate-600';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${cls} shrink-0`}>{status}</span>
  );
}
