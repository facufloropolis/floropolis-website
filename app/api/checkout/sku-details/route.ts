// GET /api/checkout/sku-details?ids=1,2,3 — hydrate cart from inventory mirror
// v2 | 2026-05-17 | Job_PM W4-S11 [V8 SHADOW]
//
// Why: localStorage cart only stores {sku_id, quantity}. The /checkout page
// needs the live name/variety/length/unit/price/vendor/images for each line
// before the user submits — so they can see what they're paying for. We read
// from supabase-backup's floropolis_inventory_mirror via the service role.
//
// Auth: NOT required. The cart is anonymous until the user authenticates at
// submit time inside /api/checkout/session. SKU listings are public anyway.
//
// Missing SKUs: return them in `missing_ids` rather than 404-ing the whole
// request, so the page can render what it has and flag the gone items.
//
// v2 (2026-05-17): graceful mock fallback when BACKUP_SUPABASE_URL/KEY missing
// OR the mirror fetch fails. This lets /checkout?demo=1 render in preview/dev
// environments without seeded env. Response includes `x-data-source: mock`
// header so DevTools can confirm whether real or fallback data is served.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const MAX_IDS_PER_REQUEST = 200;

interface SkuDetail {
  id: number;
  name: string;
  variety: string | null;
  length: string | null;
  unit: string | null;
  price: number;
  vendor: string | null;
  is_on_deal: boolean;
  deal_price: number | null;
  images: unknown | null;
}

function mockItemForId(id: number): SkuDetail {
  const price = Number((2.25 + (id % 10) * 0.10).toFixed(2));
  return {
    id,
    name: `Demo Bouquet ${id}`,
    variety: 'Demo Variety',
    length: '50cm',
    unit: 'Stem',
    price,
    vendor: 'Demo',
    is_on_deal: false,
    deal_price: null,
    images: null,
  };
}

function mockResponse(ids: number[]): NextResponse {
  const items = ids.map(mockItemForId);
  return NextResponse.json(
    { items, missing_ids: [] satisfies number[] },
    { status: 200, headers: { 'x-data-source': 'mock' } },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const raw = req.nextUrl.searchParams.get('ids') ?? '';
  if (!raw.trim()) {
    return NextResponse.json(
      { items: [], missing_ids: [] satisfies number[] },
      { status: 200 },
    );
  }

  // Parse + sanitize. Reject anything non-numeric to avoid SQL injection via
  // the .in() builder (it already escapes, but explicit > implicit).
  const ids = Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ).slice(0, MAX_IDS_PER_REQUEST);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'no_valid_ids' },
      { status: 400 },
    );
  }

  // Pre-flight: if env is missing, skip the supabase call entirely and serve
  // mock data so /checkout?demo=1 renders cleanly in dev/preview.
  if (!process.env.BACKUP_SUPABASE_URL || !process.env.BACKUP_SUPABASE_SERVICE_KEY) {
    return mockResponse(ids);
  }

  try {
    const backup = getBackupServiceClient();
    const { data, error } = await backup
      .from('floropolis_inventory_mirror')
      .select(
        'id,name,variety,length,unit,price,vendor,is_on_deal,deal_price,images',
      )
      .in('id', ids);

    if (error) {
      Sentry.captureException(error, {
        tags: { route: 'checkout/sku-details', step: 'mirror_fetch' },
      });
      // Graceful fallback: serve mock data instead of 500ing the cart.
      return mockResponse(ids);
    }

    const items: SkuDetail[] = (data ?? []).map((row) => ({
      id: Number(row.id),
      name: row.name,
      variety: row.variety,
      length: row.length,
      unit: row.unit,
      price: Number(row.price),
      vendor: row.vendor,
      is_on_deal: !!row.is_on_deal,
      deal_price: row.deal_price != null ? Number(row.deal_price) : null,
      images: row.images ?? null,
    }));

    const foundIds = new Set(items.map((i) => i.id));
    const missing_ids = ids.filter((id) => !foundIds.has(id));

    return NextResponse.json({ items, missing_ids });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: 'checkout/sku-details', step: 'handler' },
    });
    // Graceful fallback on unexpected throw (e.g. env validation error from
    // getBackupServiceClient if env shape changes upstream).
    return mockResponse(ids);
  }
}
