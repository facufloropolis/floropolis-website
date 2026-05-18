// My Orders page — /account/orders
// v1 | 2026-05-17 | Job_PM W4-S12 [V8 SHADOW]
// Server-rendered list of the current user's orders. Reads supabase-backup
// via service-role client and filters by user_id explicitly (since the FK to
// auth.users is being dropped per the cross-project user_id workaround in W4-S11).
//
// Replaces the mockup at /mockups/account-orders (which stays as design ref).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import TopBanner from '@/components/TopBanner';

export const metadata = {
  title: 'My Orders | Floropolis',
  description: 'Your Floropolis order history.',
};

const PAGE_SIZE = 20;

type OrderStatus =
  | 'cart'
  | 'pending_payment'
  | 'card_saved'
  | 'preauth_held'
  | 'paid'
  | 'fulfilled'
  | 'cancelled'
  | 'refunded'
  | 'failed';

interface OrderListRow {
  id: number;
  order_number: string;
  status: OrderStatus;
  requested_delivery_date: string;
  grand_total: number | string;
  currency: string;
  created_at: string;
}

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  cart:             { label: 'Cart',             cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pending_payment:  { label: 'Pending payment',  cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  card_saved:       { label: 'Card saved',       cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  preauth_held:     { label: 'Preauth held',     cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  paid:             { label: 'Paid',             cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  fulfilled:        { label: 'Fulfilled',        cls: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
  failed:           { label: 'Failed',           cls: 'bg-red-50 text-red-800 border-red-200' },
  cancelled:        { label: 'Cancelled',        cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  refunded:         { label: 'Refunded',         cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function fmtCurrency(value: number | string, currency = 'USD'): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(d);
}

export default async function AccountOrdersPage() {
  // ---- Auth (BACKUP session -- Phase 4 SEGURISIMA) ----
  const userClient = await createBackupServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    redirect('/auth/login?next=/account/orders');
  }

  // ---- Fetch orders from supabase-backup via service-role ----
  const backup = getBackupServiceClient();
  const { data, error } = await backup
    .from('orders')
    .select(
      'id, order_number, status, requested_delivery_date, grand_total, currency, created_at',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (error) {
    console.error('[account/orders] fetch failed:', error);
  }

  const orders = (data ?? []) as OrderListRow[];

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My orders</h1>
            <p className="text-slate-500 text-sm mt-1">{user.email}</p>
          </div>
          <Link
            href="/shop"
            className="text-sm px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
          >
            Shop again
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center">
            <p className="text-base font-semibold text-slate-900 mb-2">No orders yet.</p>
            <p className="text-sm text-slate-600 mb-5">
              When you place your first order, it&apos;ll show up here.
            </p>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors"
            >
              Shop now
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const meta = STATUS_META[o.status] ?? STATUS_META.pending_payment;
              return (
                <Link
                  key={o.id}
                  href={`/order-confirmation/${o.id}`}
                  className="block bg-white rounded-2xl border border-slate-200 p-5 hover:border-emerald-300 hover:shadow-sm transition-all"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs text-slate-500">
                          {o.order_number}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Placed {fmtDate(o.created_at)} &middot; Delivery {fmtDate(o.requested_delivery_date)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-slate-900">
                        {fmtCurrency(o.grand_total, o.currency)}
                      </p>
                      <p className="text-xs text-emerald-600 font-medium mt-1">View &rarr;</p>
                    </div>
                  </div>
                </Link>
              );
            })}
            {orders.length === PAGE_SIZE && (
              <p className="text-xs text-slate-400 text-center pt-4">
                Showing your most recent {PAGE_SIZE} orders.
              </p>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
