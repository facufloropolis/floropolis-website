export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  let body: { new_status: string; note?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { new_status, note } = body;
  if (!['fulfilled', 'cancelled'].includes(new_status)) {
    return NextResponse.json({ error: 'new_status must be fulfilled or cancelled' }, { status: 400 });
  }

  const svc = getBackupServiceClient();
  const { data: order } = await svc.from('orders').select('id, status').eq('id', orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  if (['cancelled', 'refunded'].includes(order.status)) {
    return NextResponse.json({ error: `Cannot change status from ${order.status}` }, { status: 422 });
  }

  if (new_status === 'fulfilled') {
    const { data: dispatch } = await svc.from('dispatches').select('delivered_at').eq('order_id', orderId).maybeSingle();
    if (!dispatch?.delivered_at) {
      return NextResponse.json({ error: 'Cannot mark fulfilled — dispatch not delivered yet' }, { status: 422 });
    }
  }

  if (new_status === 'cancelled') {
    const { count } = await svc.from('refund_approvals').select('*', { count: 'exact', head: true }).eq('order_id', orderId).eq('status', 'pending');
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: 'Cannot cancel — pending refund approval exists' }, { status: 422 });
    }
  }

  const timestampField = new_status === 'fulfilled' ? 'fulfilled_at' : 'cancelled_at';
  const { error } = await svc.from('orders').update({
    status: new_status,
    [timestampField]: new Date().toISOString(),
    ...(note ? { internal_note: note } : {}),
  }).eq('id', orderId);

  if (error) {
    console.error('[orders/status]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: orderId, new_status });
}
