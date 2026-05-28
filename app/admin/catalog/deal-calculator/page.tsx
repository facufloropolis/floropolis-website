// Admin Deal Calculator (server) — UC-P-156 primary use ONLY.
// v1 | 2026-05-27 | Job_PM Sub-Agent C [V8 SHADOW]
//
// SCOPE (strict — UC-P-156 ONLY):
//   - SKU search + add lines + per-line qty + per-line entered price override
//   - Live cost / delivery / margin / GPM / box-fit + deal totals
//   - NO save / NO submit / NO API writes / NO localStorage
//   - DOES NOT implement UC-P-157 (save as quote), UC-P-158 (convert to order),
//     UC-P-159 (lock custom price), or UC-P-160 (standalone box-fit tab)
//
// Page route: /admin/catalog/deal-calculator
// Spec: catalog_BRD_v0.3_section_pricing_2026-05-19.md §UC-P-156 + wireframe.
// Formula source of truth: ~/Claude_MA_v8/Rose_BI/pricing_formula.md
//   selling_price = farm_cost / (1 - GPM) + delivery_per_stem
//   delivery_per_stem = ceil(L*W*H/6000) * FedEx_rate * fuel_surcharge / units_per_box
//   For this MVP, box_master.weight_kg is already the FedEx dim weight (Rose
//   pre-computes from L*W*H/6000 per vendor box; see pricing_formula.md §3).
//
// Constants per pricing_formula.md (Rose owns these — DO NOT hardcode in
// arithmetic; expose them at the top so they're visible and editable in one
// place if Rose ever changes them):
//   GPM            = 0.33   (a variable — write `(1 - GPM)`, never `0.67` alone)
//   FedEx rate     = 6.50   USD/kg, Ecuador origin
//   Fuel surcharge = 1.25   (25% multiplier)
//
// Magic Flowers IS included in the SKU universe (per perfect_inventory_bar v2.1
// 2026-05-28 — their exclusion applies only to live-source determination, not
// to T2/T3 publishable). Their products are sellable from this tool when basics
// are present (cost source + farm_cost + active).
//
// ============================================================================
// Data fetch
// ============================================================================
// Server-side, one round-trip via getBackupServiceClient (supabase-backup
// service role). Two queries in parallel:
//   1. floropolis_inventory_mirror — limited to first 1000 rows (this is a
//      phone-tool; Facu searches by a few chars and the list narrows. The full
//      universe is ~5000 rows but the wire payload + client-side filter cost is
//      not worth it for an MVP. If the limit becomes a problem in practice,
//      raise it or add server-side search.)
//   2. box_master — small table (~20 rows), all fetched.
//
// RACI: this page is DISPLAY + CALCULATOR. The formula constants below are
// declared once and passed to the client component. Per
// catalog_BRD_v0.3_section_pricing the calculator MVP does not write data, so
// there is no executor / proposal / mutation here.

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import {
  ACTIVE_PRICING_MARKET,
  requireNumericPricingConstant,
  type PricingConstantValueRow,
} from '@/lib/pricing-constants';
import DealCalculatorClient from './DealCalculatorClient';
import type { DealSku, DealBox, DealConstants } from './DealCalculatorClient';

const ROW_LIMIT = 1000;

export const metadata = {
  title: 'Deal Calculator | Floropolis Admin',
  robots: { index: false, follow: false },
};

interface MirrorRowRaw {
  id: number;
  name: string | null;
  vendor: string | null;
  tier: string | null;
  variety: string | null;
  length: string | null;
  unit: string | null;
  category: string | null;
  farm_cost: number | string | null;
  price: number | string | null;
  box_type: string | null;
  units_per_box: number | string | null;
  total_stems: number | null;
}

interface BoxMasterRowRaw {
  box_type: string;
  weight_kg: number | string | null;
}

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export default async function AdminDealCalculatorPage() {
  // Admin gate (same pattern as /admin/catalog) ------------------------
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
  if (!profile || (profile as { status?: string }).status !== 'admin') {
    redirect('/');
  }

  // Data fetch ---------------------------------------------------------
  const backup = getBackupServiceClient();

  const [mirrorRes, boxesRes, constantsRes] = await Promise.all([
    backup
      .from('floropolis_inventory_mirror')
      .select(
        'id, name, vendor, tier, variety, length, unit, category, farm_cost, price, box_type, units_per_box, total_stems',
      )
      .eq('active', true)
      .not('farm_cost', 'is', null)
      .not('cost_source', 'is', null) // v2.1: "1 source verified" — cost_source IS the signal
      .limit(ROW_LIMIT),
    backup.from('box_master').select('box_type, weight_kg'),
    backup
      .from('pricing_constants')
      .select('id, market, value_numeric')
      .eq('market', ACTIVE_PRICING_MARKET),
  ]);

  if (mirrorRes.error) {
    console.error('[admin/catalog/deal-calculator] mirror fetch error:', mirrorRes.error);
  }
  if (boxesRes.error) {
    console.error('[admin/catalog/deal-calculator] box_master fetch error:', boxesRes.error);
  }
  if (constantsRes.error) {
    console.error('[admin/catalog/deal-calculator] pricing_constants fetch error:', constantsRes.error);
  }

  const mirrorRows = (mirrorRes.data ?? []) as unknown as MirrorRowRaw[];
  const boxRows = (boxesRes.data ?? []) as unknown as BoxMasterRowRaw[];
  const constantRows = (constantsRes.data ?? []) as PricingConstantValueRow[];

  // Shape into client props -------------------------------------------
  const skus: DealSku[] = mirrorRows
    .map((r) => {
      const farm_cost = toNum(r.farm_cost);
      const units_per_box = toNum(r.units_per_box);
      // SKU is unusable without farm_cost (defensive — query already filters it).
      if (farm_cost == null) return null;
      const sku: DealSku = {
        id: r.id,
        name: r.name ?? `#${r.id}`,
        vendor: r.vendor ?? '',
        tier: r.tier ?? '',
        variety: r.variety ?? '',
        length: r.length ?? '',
        unit: r.unit ?? 'stem',
        category: r.category ?? '',
        farm_cost,
        list_price: toNum(r.price),
        box_type: r.box_type ?? null,
        units_per_box,
        total_stems: r.total_stems ?? null,
      };
      return sku;
    })
    .filter((s): s is DealSku => s !== null);

  const boxes: DealBox[] = boxRows
    .map((b) => {
      const weight_kg = toNum(b.weight_kg);
      if (weight_kg == null || !b.box_type) return null;
      const box: DealBox = { box_type: b.box_type, weight_kg };
      return box;
    })
    .filter((b): b is DealBox => b !== null);

  const constants: DealConstants = {
    gpm: requireNumericPricingConstant(constantRows, 'gpm_target'),
    fedex_rate_per_kg: requireNumericPricingConstant(constantRows, 'fedex_rate_per_kg'),
    fuel_surcharge: requireNumericPricingConstant(constantRows, 'fuel_surcharge_mult'),
  };

  // Render -------------------------------------------------------------
  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      <nav className="text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
        <span>Admin</span>
        <span className="mx-1.5">/</span>
        <a href="/admin/catalog" className="hover:text-emerald-700">
          Catalog
        </a>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700 font-medium">Deal Calculator</span>
      </nav>

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Deal Calculator</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Build a custom deal on the phone with a client. Pick SKUs, set
          quantities, override prices — see cost, margin, and box-fit instantly.
        </p>
        <p className="text-[11px] text-slate-400 mt-1">
          UC-P-156 MVP — calculator only, nothing is saved.{' '}
          {skus.length.toLocaleString()} active SKUs available (
          {ROW_LIMIT.toLocaleString()}-row server cap · all vendors incl. Magic Flowers · v2.1).
          Best on desktop.
        </p>
      </div>

      <DealCalculatorClient skus={skus} boxes={boxes} constants={constants} />
    </main>
  );
}
