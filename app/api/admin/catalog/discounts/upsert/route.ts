// POST /api/admin/catalog/discounts/upsert
// v1 | 2026-05-18 | Job_PM CAT-S10 [V8 SHADOW]
//
// Body: { sku_id, is_on_deal, deal_label, deal_price, deal_expiry }
// Sets the deal_* columns on a single floropolis_inventory_mirror row.
//
// Validations:
//   - Admin only (client_profiles.status='admin').
//   - sku_id must exist in floropolis_inventory_mirror.
//   - When is_on_deal=true: deal_label, deal_price, deal_expiry required;
//     deal_price > 0; deal_expiry in the future.
//   - deal_price > original price is ALLOWED (future price-hike case) but
//     surfaced in the response as warning so the UI can echo it.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

interface UpsertBody {
  sku_id?: unknown;
  is_on_deal?: unknown;
  deal_label?: unknown;
  deal_price?: unknown;
  deal_expiry?: unknown;
}

function badRequest(error: string, detail?: string): NextResponse {
  return NextResponse.json({ error, ...(detail ? { detail } : {}) }, { status: 400 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth -------------------------------------------------------------
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

  // Body -------------------------------------------------------------
  let body: UpsertBody;
  try {
    body = (await req.json()) as UpsertBody;
  } catch {
    return badRequest('bad_json');
  }

  const skuId = Number(body.sku_id);
  if (!Number.isFinite(skuId) || skuId <= 0) {
    return badRequest('invalid_sku_id', 'must be a positive number');
  }

  const isOnDeal = body.is_on_deal === true || body.is_on_deal === 'true';
  const dealLabel =
    typeof body.deal_label === 'string' ? body.deal_label.trim() : '';
  const dealPriceNum =
    body.deal_price === null || body.deal_price === undefined
      ? null
      : Number(body.deal_price);
  const dealExpiryStr =
    typeof body.deal_expiry === 'string' ? body.deal_expiry.trim() : '';

  if (isOnDeal) {
    if (!dealLabel) {
      return badRequest('invalid_deal_label', 'required when is_on_deal=true');
    }
    if (dealPriceNum == null || !Number.isFinite(dealPriceNum) || dealPriceNum <= 0) {
      return badRequest(
        'invalid_deal_price',
        'must be a positive number when is_on_deal=true',
      );
    }
    if (!dealExpiryStr) {
      return badRequest(
        'invalid_deal_expiry',
        'required when is_on_deal=true',
      );
    }
    // Accept YYYY-MM-DD or ISO. Treat YYYY-MM-DD as end-of-day local.
    const isoCandidate =
      dealExpiryStr.length === 10 ? `${dealExpiryStr}T23:59:59` : dealExpiryStr;
    const expMs = new Date(isoCandidate).getTime();
    if (!Number.isFinite(expMs) || expMs <= Date.now()) {
      return badRequest('invalid_deal_expiry', 'must be in the future');
    }
  }

  // Ensure SKU exists ------------------------------------------------
  const backup = adminClient;
  const { data: existing, error: existingErr } = await backup
    .from('floropolis_inventory_mirror')
    .select('id,price')
    .eq('id', skuId)
    .maybeSingle();
  if (existingErr) {
    Sentry.captureException(existingErr, {
      tags: { route: 'admin/catalog/discounts/upsert', step: 'existing' },
    });
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'sku_not_found' }, { status: 404 });
  }

  const originalPrice = Number(existing.price ?? 0);
  const warnings: string[] = [];
  if (
    isOnDeal &&
    dealPriceNum != null &&
    Number.isFinite(originalPrice) &&
    originalPrice > 0 &&
    dealPriceNum > originalPrice
  ) {
    warnings.push(
      `deal_price ($${dealPriceNum.toFixed(2)}) is higher than original ($${originalPrice.toFixed(2)})`,
    );
  }

  // Build update ----------------------------------------------------
  const update: Record<string, unknown> = isOnDeal
    ? {
        is_on_deal: true,
        deal_label: dealLabel,
        deal_price: dealPriceNum,
        deal_expiry:
          dealExpiryStr.length === 10
            ? `${dealExpiryStr}T23:59:59Z`
            : dealExpiryStr,
      }
    : {
        is_on_deal: false,
        deal_label: null,
        deal_price: null,
        deal_expiry: null,
      };

  const { data: updated, error: updateErr } = await backup
    .from('floropolis_inventory_mirror')
    .update(update)
    .eq('id', skuId)
    .select('id,is_on_deal,deal_label,deal_price,deal_expiry')
    .maybeSingle();
  if (updateErr) {
    Sentry.captureException(updateErr, {
      tags: { route: 'admin/catalog/discounts/upsert', step: 'update' },
    });
    return NextResponse.json(
      { error: 'update_failed', detail: updateErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ sku: updated, warnings });
}
