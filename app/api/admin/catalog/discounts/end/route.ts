// POST /api/admin/catalog/discounts/end
// v1 | 2026-05-18 | Job_PM CAT-S10 [V8 SHADOW]
//
// Body: { sku_id }
// Sets is_on_deal=false and clears deal_label / deal_price / deal_expiry on
// the matching floropolis_inventory_mirror row.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

interface EndBody {
  sku_id?: unknown;
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
  let body: EndBody;
  try {
    body = (await req.json()) as EndBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const skuId = Number(body.sku_id);
  if (!Number.isFinite(skuId) || skuId <= 0) {
    return NextResponse.json(
      { error: 'invalid_sku_id', detail: 'must be a positive number' },
      { status: 400 },
    );
  }

  const { data: existing, error: existingErr } = await adminClient
    .from('floropolis_inventory_mirror')
    .select('id')
    .eq('id', skuId)
    .maybeSingle();
  if (existingErr) {
    Sentry.captureException(existingErr, {
      tags: { route: 'admin/catalog/discounts/end', step: 'existing' },
    });
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'sku_not_found' }, { status: 404 });
  }

  const { data: updated, error: updateErr } = await adminClient
    .from('floropolis_inventory_mirror')
    .update({
      is_on_deal: false,
      deal_label: null,
      deal_price: null,
      deal_expiry: null,
    })
    .eq('id', skuId)
    .select('id,is_on_deal')
    .maybeSingle();
  if (updateErr) {
    Sentry.captureException(updateErr, {
      tags: { route: 'admin/catalog/discounts/end', step: 'update' },
    });
    return NextResponse.json(
      { error: 'update_failed', detail: updateErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ sku: updated });
}
