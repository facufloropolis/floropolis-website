// POST /api/admin/catalog/config/price-snapshot
// v1 | 2026-06-11 | Job_PM
//
// Reads all published SKUs from v_catalog_admin, fetches the current gpm_target
// from pricing_constants (market='US'), inserts a price_history row per SKU,
// and returns a summary with sample rows.
//
// Auth: same pattern as /api/admin/catalog/config/update — user client for
// session, service client for client_profiles admin check + writes.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

interface CatalogRow {
  sku_id: string;
  name: string | null;
  vendor: string | null;
  farm_cost: number | null;
  price: number | null;
  delivery_cost: number | null;
  gpm_actual: number | null;
  box_type: string | null;
}

interface SampleRow {
  sku_id: string;
  name: string | null;
  farm_cost: number | null;
  computed_price: number | null;
  gpm: number;
}

export async function POST(_req: NextRequest): Promise<NextResponse> {
  // Auth ------------------------------------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'admin') {
    return NextResponse.json({ error: 'not_admin' }, { status: 403 });
  }

  // Fetch gpm_target ------------------------------------------------------
  const backup = getBackupServiceClient();
  const { data: gpmRow, error: gpmErr } = await backup
    .from('pricing_constants')
    .select('value_numeric')
    .eq('id', 'gpm_target')
    .eq('market', 'US')
    .maybeSingle();
  if (gpmErr) {
    Sentry.captureException(gpmErr, {
      tags: { route: 'admin/catalog/config/price-snapshot', step: 'fetch_gpm' },
    });
    return NextResponse.json({ error: 'gpm_fetch_failed', detail: gpmErr.message }, { status: 500 });
  }
  if (!gpmRow || gpmRow.value_numeric == null) {
    return NextResponse.json({ error: 'gpm_not_found', detail: 'pricing_constants.gpm_target (US) not seeded' }, { status: 404 });
  }
  const gpm = Number(gpmRow.value_numeric);
  if (!Number.isFinite(gpm) || gpm <= 0 || gpm >= 1) {
    return NextResponse.json({ error: 'gpm_invalid', detail: `gpm_target value ${gpm} is not a valid fraction` }, { status: 500 });
  }

  // Fetch published SKUs --------------------------------------------------
  const { data: skuRows, error: skuErr } = await backup
    .from('v_catalog_admin')
    .select('sku_id, name, vendor, farm_cost, price, delivery_cost, gpm_actual, box_type')
    .eq('publish_status', 'published')
    .or('price.not.is.null,farm_cost.not.is.null');
  if (skuErr) {
    Sentry.captureException(skuErr, {
      tags: { route: 'admin/catalog/config/price-snapshot', step: 'fetch_skus' },
    });
    return NextResponse.json({ error: 'sku_fetch_failed', detail: skuErr.message }, { status: 500 });
  }
  const rows = (skuRows ?? []) as CatalogRow[];
  if (rows.length === 0) {
    return NextResponse.json({ snapshotted: 0, avg_price: null, sample_rows: [], message: 'no published SKUs with price or farm_cost' });
  }

  // Build price_history inserts -------------------------------------------
  const capturedAt = new Date().toISOString();
  const inserts = rows.map((r) => {
    const farmCost = r.farm_cost != null ? Number(r.farm_cost) : null;
    const priceExDelivery = farmCost != null ? farmCost / (1 - gpm) : null;
    const computedPrice = r.price != null ? Number(r.price) : priceExDelivery;
    return {
      sku_id: r.sku_id,
      computed_price: computedPrice ?? 0,
      inputs: {
        farm_cost: farmCost,
        gpm,
        box_type: r.box_type ?? null,
        delivery_per_stem: r.delivery_cost != null ? Number(r.delivery_cost) : null,
        price_ex_delivery: priceExDelivery,
        market: 'US',
      },
      captured_at: capturedAt,
    };
  });

  // Insert in batches of 500 to stay under Supabase payload limits --------
  const BATCH = 500;
  let totalInserted = 0;
  for (let i = 0; i < inserts.length; i += BATCH) {
    const batch = inserts.slice(i, i + BATCH);
    const { error: insertErr } = await backup.from('price_history').insert(batch);
    if (insertErr) {
      Sentry.captureException(insertErr, {
        tags: { route: 'admin/catalog/config/price-snapshot', step: 'insert_batch', batch_start: String(i) },
      });
      return NextResponse.json(
        { error: 'insert_failed', detail: insertErr.message, inserted_so_far: totalInserted },
        { status: 500 },
      );
    }
    totalInserted += batch.length;
  }

  // Summary ---------------------------------------------------------------
  const prices = inserts
    .map((r) => r.computed_price)
    .filter((p): p is number => p != null && Number.isFinite(p));
  const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;

  const sampleRows: SampleRow[] = rows.slice(0, 5).map((r) => {
    const farmCost = r.farm_cost != null ? Number(r.farm_cost) : null;
    const priceExDelivery = farmCost != null ? farmCost / (1 - gpm) : null;
    const computedPrice = r.price != null ? Number(r.price) : priceExDelivery;
    return {
      sku_id: r.sku_id,
      name: r.name ?? null,
      farm_cost: farmCost,
      computed_price: computedPrice ?? null,
      gpm,
    };
  });

  return NextResponse.json({
    snapshotted: totalInserted,
    avg_price: avgPrice != null ? Math.round(avgPrice * 100) / 100 : null,
    gpm_used: gpm,
    captured_at: capturedAt,
    sample_rows: sampleRows,
  });
}
