// app/api/catalog/storefront/route.ts
// v1 | 2026-06-19 | Job_PM
//
// Serves the live storefront catalog from catalog_published (BACKUP VIEW).
// Tagged cache 'storefront-catalog' — busted by apply-image and apply-content
// on approval, so approved images/descriptions/prices reach customers without redeploy.

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function uuidToInt(uuid: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < uuid.length; i++) {
    h ^= uuid.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2000000000;
}

function sanitizeSlug(slug: string | null | undefined): string {
  return (slug || '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function availableFrom(minDaysAhead: number | null | undefined): string {
  const days = Number.isFinite(Number(minDaysAhead)) ? Number(minDaysAhead) : 14;
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const eff = new Date(todayUTC.getTime() + days * 86400000);
  return eff.toISOString().slice(0, 10);
}

const fetchCatalog = unstable_cache(
  async () => {
    const svc = getBackupServiceClient();
    const { data, error } = await svc
      .from('catalog_published')
      .select(
        'sku_id,vendor,variety,category,color,size_cm,box_type,selling_unit,tier,' +
        'origin_country,farm_cost,pack,display_name,slug,images,description,web_category,' +
        'availability_min_days_ahead,availability_max_days_ahead,display_order,sell_price'
      )
      .order('tier')
      .order('web_category')
      .order('variety')
      .order('size_cm');

    if (error) throw error;

    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
      const tier = String(row.tier || 'T3');
      const category = String(row.web_category || row.category || 'Other');
      const length = row.size_cm != null ? `${row.size_cm} cm` : null;
      const price = Number.isFinite(Number(row.sell_price)) ? Number(row.sell_price) : 0;
      const rawUnit = String(row.selling_unit || '').toLowerCase();
      const unit =
        rawUnit === 'stem' || rawUnit === 'na' || rawUnit === ''
          ? 'Stem'
          : rawUnit === 'bunch'
          ? 'Bunch'
          : rawUnit === 'box'
          ? 'Box'
          : 'Stem';
      const stemsPerBox = Number(row.pack);
      const images = Array.isArray(row.images) ? (row.images as string[]) : [];

      return {
        id: uuidToInt(String(row.sku_id)),
        sku_id: String(row.sku_id),
        name: String(row.display_name || ''),
        category,
        color: String(row.color || ''),
        variety: String(row.variety || ''),
        length,
        price,
        unit,
        stems_per_bunch: 1,
        units_per_box: Number.isFinite(stemsPerBox) && stemsPerBox > 0 ? stemsPerBox : 0,
        box_type: String(row.box_type || '').toUpperCase(),
        stock: 0,
        vendor: String(row.vendor || ''),
        is_on_deal: false,
        deal_label: null,
        deal_price: null,
        deal_expiry: null,
        is_best_seller: false,
        is_featured: false,
        display_order: Number.isFinite(Number(row.display_order)) ? Number(row.display_order) : 999,
        slug: sanitizeSlug(row.slug as string | null),
        images,
        tier,
        has_photo: images.length > 0,
        total_stems: Number.isFinite(stemsPerBox) && stemsPerBox > 0 ? stemsPerBox : null,
        contents_note: row.description ? String(row.description) : null,
        available_from: availableFrom(row.availability_min_days_ahead as number | null),
      };
    });
  },
  ['storefront-catalog'],
  { revalidate: 300, tags: ['storefront-catalog'] }
);

export async function GET() {
  try {
    const products = await fetchCatalog();
    return NextResponse.json({ products, ts: Date.now() });
  } catch (err) {
    console.error('[catalog/storefront] error:', err);
    return NextResponse.json({ error: 'catalog_fetch_failed' }, { status: 500 });
  }
}
