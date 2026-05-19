// /api/admin/catalog/export
// v1 | 2026-05-19 | Job_PM admin-port Phase B [V8 SHADOW]
//
// GET — stream catalog rows as CSV. Mirrors the filter contract of
// /admin/catalog/page.tsx so what you see is what you export.
//
// Query params accepted (all optional, same as the page):
//   q, vendor, source, category, visibility, gpm, flags, state, sort
//
// Auth: admin only (matches /admin/catalog page gate).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

interface MirrorRow {
  id: number;
  name: string | null;
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
  live: boolean | null;
  active: boolean | null;
  quality_family_id: string | null;
  is_on_deal: boolean | null;
  price_override: boolean | null;
  arrival_date: string | null;
}

function asNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // -- admin gate --
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const emailLc = (user.email ?? '').toLowerCase();
  const service = getBackupServiceClient();
  let isAdmin = ADMIN_EMAILS.includes(emailLc);
  if (!isAdmin) {
    const { data: profile } = await service
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    isAdmin = profile?.status === 'admin';
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'not_admin' }, { status: 403 });
  }

  // -- parse filters (mirror page.tsx) --
  const url = new URL(req.url);
  const search = (url.searchParams.get('q') ?? '').trim();
  const vendorFilter = (url.searchParams.get('vendor') ?? 'all').trim();
  const sourceFilter = (url.searchParams.get('source') ?? 'all').trim();
  const categoryFilter = (url.searchParams.get('category') ?? 'all').trim();
  const visibilityFilter = (url.searchParams.get('visibility') ?? 'all').trim();
  const gpmFilter = (url.searchParams.get('gpm') ?? 'all').trim();
  const flagsFilter = (url.searchParams.get('flags') ?? 'all').trim();

  // -- query --
  let mq = service
    .from('floropolis_inventory_mirror')
    .select(
      'id, name, vendor, tier, category, variety, length, unit, price, farm_cost, cost_source, cost_verified_at, stock, total_stems, units_per_box, box_type, margin_status, k2k_alignment_status, live, active, quality_family_id, is_on_deal, price_override, arrival_date',
    );

  if (vendorFilter !== 'all') mq = mq.eq('vendor', vendorFilter);
  if (categoryFilter !== 'all') mq = mq.eq('category', categoryFilter);
  if (sourceFilter === 't2') mq = mq.eq('tier', 'T2');
  if (sourceFilter === 't3') mq = mq.eq('tier', 'T3');
  if (sourceFilter === 'k2k_live') mq = mq.ilike('cost_source', '%_k2k_%');
  if (visibilityFilter === 'live') mq = mq.eq('live', true);
  if (visibilityFilter === 'hidden') mq = mq.eq('live', false).eq('active', true);
  if (visibilityFilter === 'draft') mq = mq.eq('active', false);

  mq = mq.order('vendor', { ascending: true }).order('name', { ascending: true }).limit(5000);

  const { data, error } = await mq;
  if (error) {
    return NextResponse.json(
      { error: 'query_failed', detail: error.message },
      { status: 500 },
    );
  }
  const rows = (data ?? []) as unknown as MirrorRow[];

  // -- post-filter for derived fields --
  const filtered = rows.filter((r) => {
    const farm = asNum(r.farm_cost);
    const price = asNum(r.price);
    const gpm =
      farm != null && price != null && price > 0 ? (price - farm) / price : null;
    if (gpmFilter !== 'all') {
      if (gpmFilter === 'no_gpm' && gpm != null) return false;
      if (gpmFilter === 'green' && (gpm == null || gpm < 0.33)) return false;
      if (gpmFilter === 'yellow' && (gpm == null || gpm < 0.28 || gpm >= 0.33))
        return false;
      if (gpmFilter === 'red' && (gpm == null || gpm >= 0.28)) return false;
    }
    if (flagsFilter === 'no_cost' && farm != null) return false;
    if (flagsFilter === 'no_box_dims' && r.box_type && r.box_type !== '') return false;
    if (search) {
      const q = search.toLowerCase();
      const blob = `${r.name ?? ''} ${r.vendor ?? ''} ${r.variety ?? ''} ${r.category ?? ''} ${r.id}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  // -- build CSV --
  const headers = [
    'id',
    'name',
    'vendor',
    'tier',
    'category',
    'variety',
    'length',
    'unit',
    'price_usd',
    'farm_cost_usd',
    'gpm_pct',
    'cost_source',
    'cost_verified_at',
    'arrival_date',
    'stock',
    'total_stems',
    'units_per_box',
    'box_type',
    'margin_status',
    'k2k_alignment_status',
    'live',
    'active',
    'visibility_state',
    'quality_family_id',
    'is_on_deal',
    'has_price_override',
  ];
  const lines: string[] = [headers.join(',')];
  for (const r of filtered) {
    const farm = asNum(r.farm_cost);
    const price = asNum(r.price);
    const gpm =
      farm != null && price != null && price > 0
        ? (((price - farm) / price) * 100).toFixed(2)
        : '';
    const vis =
      r.live === true ? 'live' : r.active === false ? 'draft' : 'hidden';
    const row = [
      r.id,
      r.name ?? '',
      r.vendor ?? '',
      r.tier ?? '',
      r.category ?? '',
      r.variety ?? '',
      r.length ?? '',
      r.unit ?? '',
      price ?? '',
      farm ?? '',
      gpm,
      r.cost_source ?? '',
      r.cost_verified_at ?? '',
      r.arrival_date ?? '',
      r.stock ?? '',
      r.total_stems ?? '',
      r.units_per_box ?? '',
      r.box_type ?? '',
      r.margin_status ?? '',
      r.k2k_alignment_status ?? '',
      r.live === true ? 'true' : r.live === false ? 'false' : '',
      r.active === true ? 'true' : r.active === false ? 'false' : '',
      vis,
      r.quality_family_id ?? '',
      r.is_on_deal === true ? 'true' : 'false',
      r.price_override === true ? 'true' : 'false',
    ];
    lines.push(row.map(csvEscape).join(','));
  }
  const csv = lines.join('\n');
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="floropolis-catalog-${ts}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
