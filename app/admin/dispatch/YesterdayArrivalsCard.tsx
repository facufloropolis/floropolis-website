// YesterdayArrivalsCard — server component, lists yesterday's deliveries with
// inline "Mark arrived ✓" action per row.
// v1 | 2026-05-28 | Job_PM dispatch-v1-refactor [V8 SHADOW]
//
// Mockup: /mockups/admin-dispatch lines 294-305 (Yesterday's arrivals card,
// middle column inside Communications). This component renders that card.
//
// Data: dispatches where status='delivered' AND delivered_at >= (today - 1 day).
// Match by UTC date to keep parity with the rest of the dispatch page logic.
//
// Action: each row exposes a server action that POSTs to
//   /api/admin/dispatch/{id}/arrival-confirm
// via fetch (server-side fetch with cookie forwarding). After the action,
// revalidatePath('/admin/dispatch') refreshes the surface.
//
// Auth: this card is rendered only inside /admin/dispatch which already
// gates on admin via createUserClient() + client_profiles.status='admin',
// so we don't re-check here.

import type { ReactElement } from 'react';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { headers } from 'next/headers';

import { getBackupServiceClient } from '@/lib/supabase/backup-server';

interface YesterdayRow {
  dispatchId: string;
  orderId: number;
  orderNumber: string;
  businessName: string;
  deliveredAt: string | null;
  alreadyConfirmed: boolean;
}

function yesterdayIsoUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function markArrived(formData: FormData): Promise<void> {
  'use server';
  const id = String(formData.get('dispatchId') ?? '');
  if (!id) return;

  // Forward cookies so the API route can re-check auth.
  const h = await headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const cookie = h.get('cookie') ?? '';
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (host ? `${proto}://${host}` : 'http://localhost:3000');

  try {
    await fetch(`${base}/api/admin/dispatch/${id}/arrival-confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: '{}',
      cache: 'no-store',
    });
  } catch (e) {
    // Swallow — UI will simply not refresh; user can retry. Sentry captures
    // route-side failures separately.
    console.error('[YesterdayArrivalsCard] arrival-confirm fetch failed', e);
  }
  revalidatePath('/admin/dispatch');
}

export default async function YesterdayArrivalsCard(): Promise<ReactElement> {
  const backup = getBackupServiceClient();
  const yesterdayIso = yesterdayIsoUtc();

  // Pull delivered dispatches that landed yesterday (UTC). The delivered_at
  // column is timestamptz; we match by date prefix.
  const { data: dispatchesRaw, error: disErr } = await backup
    .from('dispatches')
    .select('id, order_id, status, delivered_at')
    .eq('status', 'delivered')
    .gte('delivered_at', `${yesterdayIso}T00:00:00Z`)
    .lt('delivered_at', `${yesterdayIso}T23:59:59Z`)
    .order('delivered_at', { ascending: false })
    .limit(50);

  if (disErr) {
    console.error('[YesterdayArrivalsCard] dispatches fetch error:', disErr);
  }

  const dispatches = (dispatchesRaw ?? []) as Array<{
    id: string;
    order_id: number;
    status: string;
    delivered_at: string | null;
  }>;

  // Hydrate order + business name + last arrival-confirm comm in parallel.
  const orderIds = dispatches.map((d) => d.order_id);
  const dispatchIds = dispatches.map((d) => d.id);

  const [ordersRes, commsRes] = await Promise.all([
    orderIds.length > 0
      ? backup
          .from('orders')
          .select('id, order_number, shipping_address_snapshot')
          .in('id', orderIds)
      : Promise.resolve({ data: [] as unknown[] }),
    dispatchIds.length > 0
      ? backup
          .from('dispatch_communications')
          .select('dispatch_id, notes')
          .in('dispatch_id', dispatchIds)
          .eq('notes', 'arrival_confirmed')
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const ordersById = new Map<number, { order_number: string; business: string }>();
  for (const o of (ordersRes.data ?? []) as Array<{
    id: number;
    order_number: string;
    shipping_address_snapshot:
      | { business_name?: string | null; recipient_name?: string | null }
      | null;
  }>) {
    const business =
      o.shipping_address_snapshot?.business_name ??
      o.shipping_address_snapshot?.recipient_name ??
      `Order #${o.order_number}`;
    ordersById.set(o.id, { order_number: o.order_number, business });
  }

  const confirmedSet = new Set<string>();
  for (const c of (commsRes.data ?? []) as Array<{ dispatch_id: string }>) {
    confirmedSet.add(c.dispatch_id);
  }

  const rows: YesterdayRow[] = dispatches.map((d) => {
    const o = ordersById.get(d.order_id);
    return {
      dispatchId: d.id,
      orderId: d.order_id,
      orderNumber: o?.order_number ?? `#${d.order_id}`,
      businessName: o?.business ?? `Order ${d.order_id}`,
      deliveredAt: d.delivered_at,
      alreadyConfirmed: confirmedSet.has(d.id),
    };
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-semibold text-slate-700 mb-3">
        Yesterday&apos;s arrivals ({yesterdayIso})
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 italic">
          No deliveries marked yesterday.
        </p>
      ) : (
        <div className="space-y-1">
          {rows.map((r) => (
            <div
              key={r.dispatchId}
              className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0 gap-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">
                  {r.businessName}
                </p>
                <Link
                  href={`/admin/orders/${r.orderId}`}
                  className="text-xs text-slate-400 hover:text-emerald-700 hover:underline font-mono"
                >
                  {r.orderNumber}
                </Link>
              </div>
              {r.alreadyConfirmed ? (
                <span className="text-xs text-emerald-600 font-semibold shrink-0">
                  ✓ Confirmed
                </span>
              ) : (
                <form action={markArrived}>
                  <input type="hidden" name="dispatchId" value={r.dispatchId} />
                  <button
                    type="submit"
                    className="text-xs text-emerald-700 font-semibold border border-emerald-200 px-2 py-0.5 rounded-lg hover:bg-emerald-50 shrink-0"
                  >
                    Mark arrived ✓
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
