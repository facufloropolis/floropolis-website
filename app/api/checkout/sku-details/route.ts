// GET /api/checkout/sku-details?ids=<uuid>,<uuid> — hydrate cart from the
// published static catalog (catalog_published).
// v3 | 2026-06-15 | Job_PM — buy_path_identity_and_price_coherence: resolve cart
//      items by catalog_published uuid against the SAME static catalog the
//      storefront displays (lib/checkout/catalog-source.ts), NOT
//      floropolis_inventory_mirror. This makes shown == charged by construction
//      and makes the 16-gate publish authority the buyability gate for free.
// v2 | 2026-05-17 | Job_PM W4-S11 [V8 SHADOW]
//
// Why: localStorage cart only stores {sku_id, quantity}. The /checkout page
// needs the name/variety/length/unit/price/vendor/images for each line before
// the user submits — so they can see what they're paying for. sku_id is the
// real catalog_published SKU uuid; we resolve it against the published catalog.
//
// Auth: NOT required. The cart is anonymous until the user authenticates at
// submit time inside /api/checkout/session. SKU listings are public anyway.
//
// Missing/unpublished SKUs: returned in `missing_ids` rather than 404-ing the
// whole request, so the page can render what it has and flag the gone items. A
// uuid absent from the published catalog (unpublished / gate-failed) lands here.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { getPublishedSkuMap } from '@/lib/checkout/catalog-source';

const MAX_IDS_PER_REQUEST = 200;
// Loose uuid shape check — keeps obvious garbage out of the lookup. Resolution
// against the published catalog is the real gate.
const UUID_RE = /^[0-9a-fA-F-]{8,64}$/;

interface SkuDetail {
  id: string;
  name: string;
  variety: string | null;
  length: string | null;
  unit: string | null;
  price: number;
  vendor: string | null;
  is_on_deal: boolean;
  deal_price: number | null;
  images: unknown | null;
  // CHK-POLISH (2026-05-18): line-item unit context. /checkout uses these to show
  // "3 stems = less than 1 bunch" and friends without re-querying.
  stems_per_bunch: number | null;
  units_per_box: number | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const raw = req.nextUrl.searchParams.get('ids') ?? '';
  if (!raw.trim()) {
    return NextResponse.json(
      { items: [] as SkuDetail[], missing_ids: [] as string[] },
      { status: 200 },
    );
  }

  // Parse + sanitize. Keep only uuid-shaped tokens.
  const ids = Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => UUID_RE.test(s)),
    ),
  ).slice(0, MAX_IDS_PER_REQUEST);

  if (ids.length === 0) {
    return NextResponse.json({ error: 'no_valid_ids' }, { status: 400 });
  }

  try {
    // Resolve against the published static catalog — the same module the
    // storefront renders from, so price here == price shown.
    const catalog = getPublishedSkuMap();
    const items: SkuDetail[] = [];
    const missing_ids: string[] = [];
    for (const id of ids) {
      const sku = catalog.get(id);
      if (!sku) {
        missing_ids.push(id);
        continue;
      }
      items.push({
        id: sku.sku_uuid,
        name: sku.name,
        variety: sku.variety,
        length: sku.length,
        unit: sku.unit,
        price: sku.price,
        vendor: sku.vendor,
        is_on_deal: sku.is_on_deal,
        deal_price: sku.deal_price,
        images: sku.images,
        stems_per_bunch: sku.stems_per_bunch,
        units_per_box: sku.units_per_box,
      });
    }

    return NextResponse.json({ items, missing_ids });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: 'checkout/sku-details', step: 'handler' },
    });
    return NextResponse.json({ error: 'catalog_unavailable' }, { status: 500 });
  }
}
