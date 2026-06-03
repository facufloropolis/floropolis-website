// /admin/vendors — vendor profiles: stats from mirror + editable admin notes.
// v1 | 2026-05-21 | Job_PM [V8 SHADOW]
//
// Shows every vendor (from vendor_profiles + mirror) with:
//   - SKU counts by tier, live count
//   - Publication breakdown (perfect / blocked) + avg quality 0-100
//   - Editable admin notes (saved to vendor_profiles via PATCH API)
// Olimpo and any other vendor added to vendor_profiles appear even
// before they have mirror rows (onboarding pipeline not yet active).

export const dynamic = 'force-dynamic';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import VendorNotesEditor from './_components/VendorNotesEditor';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

// ── types ─────────────────────────────────────────────────────────────────────

interface WeightRow { gate_id: string; weight: number; evaluated: boolean; }
interface ClsRow { sku_id: string; vendor: string | null; tier: string | null; status: string; failing_gates: unknown; }
interface ProfileRow { vendor_name: string; admin_notes: string | null; updated_at: string | null; updated_by: string | null; }

interface VendorStat {
  vendor: string;
  total: number;
  t2: number;
  t3: number;
  live: number;
  perfect: number;
  blocked: number;
  avgQuality: number | null;
  notes: string;
  updatedAt: string | null;
  updatedBy: string | null;
  inMirror: boolean;
}

// ── quality helpers ───────────────────────────────────────────────────────────

function computeQuality(failingGates: unknown, evalWeights: WeightRow[], unevalBonus: number): number {
  const fails = new Set<string>(
    Array.isArray(failingGates)
      ? (failingGates as string[]).filter((g): g is string => typeof g === 'string')
      : [],
  );
  return unevalBonus + evalWeights
    .filter((w) => !fails.has(w.gate_id))
    .reduce((s, w) => s + w.weight, 0);
}

// ── page ──────────────────────────────────────────────────────────────────────

export default async function AdminVendorsPage(): Promise<ReactNode> {
  const supabase = await createBackupServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/auth/login?next=/admin/vendors');

  let isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
  if (!isAdmin) {
    const svc = getBackupServiceClient();
    const { data: p } = await svc.from('client_profiles').select('status').eq('user_id', user.id).maybeSingle();
    if (p?.status === 'admin') isAdmin = true;
  }
  if (!isAdmin) redirect('/');

  const svc = getBackupServiceClient();

  const [
    { data: clsRaw },
    { data: mirrorRaw },
    { data: weightsRaw },
    { data: profilesRaw },
  ] = await Promise.all([
    svc.from('catalog_classifications').select('sku_id, vendor, tier, status, failing_gates'),
    svc.from('v_catalog_admin').select('sku_id, vendor, tier, live').limit(2000),
    svc.from('catalog_quality_weights').select('gate_id, weight, evaluated'),
    svc.from('vendor_profiles').select('vendor_name, admin_notes, updated_at, updated_by'),
  ]);

  const weights = (weightsRaw ?? []) as WeightRow[];
  const evalWeights = weights.filter((w) => w.evaluated);
  const unevalBonus = weights.filter((w) => !w.evaluated).reduce((s, w) => s + w.weight, 0);

  const classifications = (clsRaw ?? []) as ClsRow[];
  const mirror = (mirrorRaw ?? []) as { sku_id: string; vendor: string | null; tier: string | null; live: boolean }[];
  const profiles = (profilesRaw ?? []) as ProfileRow[];

  // Build live count per vendor from mirror
  const liveByVendor = new Map<string, number>();
  for (const r of mirror) {
    if (r.live && r.vendor) {
      liveByVendor.set(r.vendor, (liveByVendor.get(r.vendor) ?? 0) + 1);
    }
  }

  // Aggregate quality + publication per vendor from classifications
  const vendorAgg = new Map<string, {
    total: number; t2: number; t3: number; perfect: number; blocked: number;
    qSum: number; qCount: number;
  }>();

  for (const c of classifications) {
    const v = c.vendor ?? 'Unknown';
    const existing = vendorAgg.get(v) ?? { total: 0, t2: 0, t3: 0, perfect: 0, blocked: 0, qSum: 0, qCount: 0 };
    existing.total++;
    if (c.tier === 'T2') existing.t2++;
    if (c.tier === 'T3') existing.t3++;
    if (c.status === 'perfect') existing.perfect++;
    else existing.blocked++;
    const q = computeQuality(c.failing_gates, evalWeights, unevalBonus);
    existing.qSum += q;
    existing.qCount++;
    vendorAgg.set(v, existing);
  }

  // Merge with vendor_profiles (vendor_profiles is the authoritative vendor list)
  const allVendorNames = new Set([
    ...profiles.map((p) => p.vendor_name),
    ...vendorAgg.keys(),
  ]);

  const vendorStats: VendorStat[] = [...allVendorNames]
    .map((vendor) => {
      const agg = vendorAgg.get(vendor);
      const profile = profiles.find((p) => p.vendor_name === vendor);
      return {
        vendor,
        total: agg?.total ?? 0,
        t2: agg?.t2 ?? 0,
        t3: agg?.t3 ?? 0,
        live: liveByVendor.get(vendor) ?? 0,
        perfect: agg?.perfect ?? 0,
        blocked: agg?.blocked ?? 0,
        avgQuality: agg && agg.qCount > 0 ? Math.round(agg.qSum / agg.qCount) : null,
        notes: profile?.admin_notes ?? '',
        updatedAt: profile?.updated_at ?? null,
        updatedBy: profile?.updated_by ?? null,
        inMirror: (agg?.total ?? 0) > 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="p-5">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Vendors</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {vendorStats.filter((v) => v.inMirror).length} active · {vendorStats.filter((v) => !v.inMirror).length} pending onboarding
            </p>
          </div>
          <Link href="/admin/catalog" className="text-[12px] text-emerald-700 hover:underline font-medium">
            ← Catalog
          </Link>
        </div>

        <div className="space-y-4">
          {vendorStats.map((v) => (
            <VendorCard key={v.vendor} stat={v} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── VendorCard ────────────────────────────────────────────────────────────────

function QBar({ value, total, colorCls }: { value: number; total: number; colorCls: string }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-1.5 rounded-full ${colorCls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-slate-600 w-8 text-right shrink-0">{value}</span>
      <span className="text-[10px] text-slate-400 w-7 shrink-0">{pct}%</span>
    </div>
  );
}

function VendorCard({ stat }: { stat: VendorStat }) {
  const qualityColor =
    stat.avgQuality == null ? 'text-slate-400' :
    stat.avgQuality >= 90 ? 'text-emerald-700' :
    stat.avgQuality >= 75 ? 'text-amber-700' : 'text-red-700';

  const tierLabel = stat.t2 > 0 && stat.t3 > 0 ? 'T2 + T3'
    : stat.t2 > 0 ? 'T2 only'
    : stat.t3 > 0 ? 'T3 only'
    : null;

  return (
    <div className={`bg-white rounded-2xl border p-5 ${stat.inMirror ? 'border-slate-200' : 'border-dashed border-slate-300'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-900">{stat.vendor}</h2>
          {!stat.inMirror && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
              not in mirror
            </span>
          )}
          {tierLabel && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
              {tierLabel}
            </span>
          )}
        </div>
        {stat.inMirror && (
          <Link
            href={`/admin/catalog?vendor=${encodeURIComponent(stat.vendor)}`}
            className="text-[11px] text-emerald-700 hover:underline font-medium shrink-0"
          >
            View in catalog →
          </Link>
        )}
      </div>

      {stat.inMirror ? (
        <div className="grid grid-cols-2 gap-6">
          {/* Left: SKU counts */}
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-[12px]">
              <span className="text-slate-500">
                <span className="font-bold text-slate-800">{stat.total}</span> SKUs
              </span>
              {stat.t2 > 0 && (
                <span className="text-blue-600 font-medium">{stat.t2} T2</span>
              )}
              {stat.t3 > 0 && (
                <span className="text-slate-500">{stat.t3} T3</span>
              )}
              {stat.live > 0 && (
                <span className="text-emerald-700 font-semibold">{stat.live} live</span>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Publication</p>
              <QBar value={stat.perfect} total={stat.total} colorCls="bg-emerald-500" />
              <div className="flex items-center gap-2 ml-0">
                <span className="text-[10px] text-slate-400 ml-0">perfect / blocked</span>
              </div>
              <QBar value={stat.blocked} total={stat.total} colorCls="bg-red-400" />
            </div>
          </div>

          {/* Right: Quality */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Avg quality (0-100)</p>
            {stat.avgQuality != null ? (
              <>
                <div className={`text-3xl font-bold ${qualityColor}`}>
                  {stat.avgQuality}
                  <span className="text-base font-normal text-slate-400"> / 100</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-2 rounded-full ${
                      stat.avgQuality >= 90 ? 'bg-emerald-500' :
                      stat.avgQuality >= 75 ? 'bg-amber-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${stat.avgQuality}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Weighted: price · cost · image · vendor · unit · box · description
                </p>
              </>
            ) : (
              <p className="text-[12px] text-slate-400">No classifications yet</p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-slate-400 mb-2">
          No inventory in mirror yet — add notes to track onboarding progress.
        </p>
      )}

      {/* Notes */}
      <div className="mt-4 pt-4 border-t border-slate-100">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Admin notes</p>
        <VendorNotesEditor
          vendorName={stat.vendor}
          initialNotes={stat.notes}
          updatedAt={stat.updatedAt}
          updatedBy={stat.updatedBy}
        />
      </div>
    </div>
  );
}
