// Admin Catalog Config: global pricing knobs + box weights.
// v1 | 2026-05-18 | Job_PM CAT-S7 [V8 SHADOW]
//
// Replaces the visual-only mockup at /mockups/admin-catalog-config with a
// real Next.js page backed by supabase-backup tables:
//   - box_master         (per box_type, validated weight in kg)
//   - pricing_constants  (gpm_target, fedex_rate_per_kg, fuel_surcharge_mult)
//
// Edits flow through POST /api/admin/catalog/config/update which re-checks
// admin role server-side and writes via the service-role client.
//
// Access:
//   - Middleware guards /admin and restricts to admin emails.
//   - Server-side belt-and-suspenders: re-check session +
//     client_profiles.status='admin' via service-role (the user-context
//     client returns empty under our Vercel setup; see /admin/refunds note).
//   - Non-admin -> redirect("/shop").
//
// Style: emerald-600 primary, Plus Jakarta Sans (inherited), ASCII-clean copy.

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';
import { PricingConstantsEditor, BoxMasterEditor } from './Editors';

export const metadata = {
  title: 'Catalog Configuration | Floropolis Admin',
  robots: { index: false, follow: false },
};

export interface PricingConstantRow {
  id: string;
  value_numeric: number | string | null;
  description: string;
  unit: string | null;
  updated_at: string | null;
}

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

export default async function AdminCatalogConfigPage() {
  // Re-check admin server-side ----------------------------------------------
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

  // Fetch config rows -------------------------------------------------------
  const backup = getBackupServiceClient();

  const { data: constantsRaw, error: constantsErr } = await backup
    .from('pricing_constants')
    .select('id, value_numeric, description, unit, updated_at')
    .order('id', { ascending: true });
  if (constantsErr) {
    console.error('[admin/catalog/config] pricing_constants fetch:', constantsErr);
  }

  const { data: boxesRaw, error: boxesErr } = await backup
    .from('box_master')
    .select('box_type, weight_kg, description, validated_by, validated_at, notes, active, updated_at')
    .order('box_type', { ascending: true });
  if (boxesErr) {
    console.error('[admin/catalog/config] box_master fetch:', boxesErr);
  }

  const constants = (constantsRaw ?? []) as PricingConstantRow[];
  const boxes = (boxesRaw ?? []) as BoxMasterRow[];
  const activeBoxes = boxes.filter((b) => b.active).length;
  const inactiveBoxes = boxes.length - activeBoxes;

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
            <span>Catalog</span>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700 font-medium">Configuration</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900">Catalog Configuration</h1>
          <p className="text-slate-500 text-sm mt-1">
            Global pricing knobs and validated box weights. Edits write to
            supabase-backup and are picked up by Subagent A on the next
            validator run.
          </p>
          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            <div>
              <span className="font-semibold text-slate-900">{constants.length}</span>
              <span className="text-slate-500 ml-1">pricing constants</span>
            </div>
            <div>
              <span className="font-semibold text-emerald-700">{activeBoxes}</span>
              <span className="text-slate-500 ml-1">active box types</span>
            </div>
            <div>
              <span className="font-semibold text-slate-400">{inactiveBoxes}</span>
              <span className="text-slate-500 ml-1">inactive</span>
            </div>
          </div>
        </div>

        {/* Section 1: Pricing constants ------------------------------------- */}
        <section className="mb-10">
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Pricing constants</h2>
              <p className="text-sm text-slate-500">
                Feeds Subagent A formula calc. GPM target, FedEx rate per kg, fuel surcharge multiplier.
              </p>
            </div>
          </div>

          {constants.length === 0 ? (
            <div className="text-center py-10 text-slate-400 border border-dashed border-slate-200 rounded-xl">
              <p className="text-sm">No pricing constants seeded.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-2.5">Id</th>
                      <th className="px-4 py-2.5">Description</th>
                      <th className="px-4 py-2.5 text-right">Value</th>
                      <th className="px-4 py-2.5">Unit</th>
                      <th className="px-4 py-2.5">Last updated</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {constants.map((c) => (
                      <PricingConstantsEditor key={c.id} row={c} fmtDate={fmtDate} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Section 2: Box master -------------------------------------------- */}
        <section className="mb-10">
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Box master</h2>
              <p className="text-sm text-slate-500">
                Validated weight (kg) per box_type. Used to compute FedEx
                cost per stem. Inactive rows are hidden from the validator
                but kept for audit.
              </p>
            </div>
          </div>

          {boxes.length === 0 ? (
            <div className="text-center py-10 text-slate-400 border border-dashed border-slate-200 rounded-xl">
              <p className="text-sm">No box types seeded.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-2.5">Box type</th>
                      <th className="px-4 py-2.5">Description</th>
                      <th className="px-4 py-2.5 text-right">Weight (kg)</th>
                      <th className="px-4 py-2.5">Validated by</th>
                      <th className="px-4 py-2.5">Active</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxes.map((b) => (
                      <BoxMasterEditor key={b.box_type} row={b} fmtDate={fmtDate} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-900">
                <strong>Rule:</strong> Weight changes cascade across every SKU that uses this
                box_type on the next validator run. Verify with Rose before editing legacy rows.
              </div>
            </div>
          )}
        </section>

        {/* Section 3: Changelog placeholder --------------------------------- */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Changelog</h2>
          <div className="border border-dashed border-slate-200 rounded-xl p-6 text-sm text-slate-500">
            Audit log not denormalized yet. For now, last_updated columns on
            each row give a coarse signal. Job_PM to add an append-only
            catalog_config_changes table in a follow-up if needed.
          </div>
        </section>

        <p className="text-xs text-slate-400 mt-8">
          Data source: supabase-backup public.pricing_constants and
          public.box_master. Writes go through POST
          /api/admin/catalog/config/update with server-side admin re-check.
        </p>
      </main>

      <Footer />
    </div>
  );
}
