// POST /api/admin/dispatch/init — create a dispatches row for an order if
// one doesn't exist. Used by the "Initialize dispatch" button on
// /admin/orders/[id]. v1 | 2026-05-18 | Job_PM ADMIN-PORT wave 4

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

export async function POST(req: NextRequest) {
  const supa = await createBackupServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const service = getBackupServiceClient();
  let isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
  if (!isAdmin) {
    const { data: profile } = await service
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile?.status === 'admin') isAdmin = true;
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { order_id?: number };
  try {
    body = (await req.json()) as { order_id?: number };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const orderId = Number(body.order_id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'invalid_order_id' }, { status: 400 });
  }

  const { data: existing } = await service
    .from('dispatches')
    .select('id, status')
    .eq('order_id', orderId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, id: existing.id, already_existed: true, status: existing.status }, { status: 200 });
  }

  const { data: order } = await service
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  }

  const { data: inserted, error } = await service
    .from('dispatches')
    .insert({ order_id: orderId, status: 'awaiting_pack', carrier: 'fedex' })
    .select('id, status')
    .single();
  if (error) {
    return NextResponse.json({ error: `insert_failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted.id, status: inserted.status }, { status: 201 });
}
