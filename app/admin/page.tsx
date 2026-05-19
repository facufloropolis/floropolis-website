// Admin index — directory of all admin tools with at-a-glance counters.
// v1 | 2026-05-18 | Job_PM ADMIN-PORT [V8 SHADOW]
//
// Access: middleware enforces ADMIN_EMAILS allowlist + status='admin' fallback.

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { Suspense } from 'react';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';
import WiringSection from '@/components/admin/WiringSection';
import MockupLinkBanner from '@/components/admin/MockupLinkBanner';
import WiringFooterToggle from '@/components/admin/WiringFooterToggle';
import { getWiringForPage } from '@/lib/admin/wiring';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

interface ToolCard {
  href: string;
  title: string;
  subtitle: string;
  counter?: string;
  group: 'catalog' | 'orders' | 'people';
  emoji: string;
}

export default async function AdminIndexPage() {
  const supabase = await createBackupServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) redirect('/auth/login?next=/admin');

  let isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
  if (!isAdmin) {
    const svc = getBackupServiceClient();
    const { data: profile } = await svc
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile?.status === 'admin') isAdmin = true;
  }
  if (!isAdmin) redirect('/');

  const svc = getBackupServiceClient();
  // Pull live counters in parallel
  const [
    { count: catalogTotal },
    { count: publishable },
    { count: awaitingApproval },
    { count: ordersOpen },
    { count: refundsPending },
    { count: clientsPending },
  ] = await Promise.all([
    svc.from('catalog_classifications').select('*', { count: 'exact', head: true }),
    // Publishable = catalog_classifications.status='publishable' (text column, not a boolean).
    // Fix 2026-05-19: was .eq('publishable', true) which crashed prod with "column does not exist".
    svc.from('catalog_classifications').select('*', { count: 'exact', head: true }).eq('status', 'publishable'),
    svc.from('admin_proposals').select('*', { count: 'exact', head: true }).eq('status', 'awaiting_facu').then(
      (r) => ({ count: r.count }),
      () => ({ count: null }),
    ),
    svc.from('orders').select('*', { count: 'exact', head: true }).in('status', ['payment_authorized', 'payment_captured', 'pending']),
    svc.from('refund_approvals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    svc.from('client_profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  const publishablePct = catalogTotal ? Math.round((publishable ?? 0) * 100 / catalogTotal) : 0;

  const tools: ToolCard[] = [
    {
      href: '/admin/catalog',
      title: 'Catalog',
      subtitle: 'Unified table across vendors, sources, GPM bands',
      counter: `${publishable ?? 0} / ${catalogTotal ?? 0} publishable (${publishablePct}%)`,
      group: 'catalog',
      emoji: '🌹',
    },
    {
      href: '/admin/catalog/config',
      title: 'Config',
      subtitle: 'Box dims, shipping per country, GPM targets',
      group: 'catalog',
      emoji: '⚙️',
    },
    {
      href: '/admin/catalog/discounts',
      title: 'Discounts',
      subtitle: 'Rules by category, vendor, SKU, client',
      group: 'catalog',
      emoji: '💸',
    },
    {
      href: '/admin/catalog/ingest',
      title: 'Ingest',
      subtitle: 'Vendor data staging (API, email, WhatsApp, CSV)',
      group: 'catalog',
      emoji: '📥',
    },
    {
      href: '/admin/catalog/mapping',
      title: 'SKU mapping',
      subtitle: 'Vendor name → parent SKU + quality_family',
      group: 'catalog',
      emoji: '🔗',
    },
    {
      href: '/admin/catalog/approval-queue',
      title: 'Approval queue',
      subtitle: 'Every proposal awaiting your signoff',
      counter: awaitingApproval != null ? `${awaitingApproval} awaiting` : 'awaiting count unavailable',
      group: 'catalog',
      emoji: '✅',
    },
    {
      href: '/admin/catalog/proposals',
      title: 'Proposals (meta)',
      subtitle: 'Specializations needed + contracts specced',
      group: 'catalog',
      emoji: '🧠',
    },
    {
      href: '/admin/orders',
      title: 'Orders',
      subtitle: 'All florist orders across all stages',
      counter: `${ordersOpen ?? 0} open`,
      group: 'orders',
      emoji: '📦',
    },
    {
      href: '/admin/dispatch',
      title: 'Dispatch',
      subtitle: 'Shipments, tracking, FedEx labels',
      group: 'orders',
      emoji: '🚚',
    },
    {
      href: '/admin/refunds',
      title: 'Refunds',
      subtitle: 'Quorum approvals (JJ + Facu)',
      counter: `${refundsPending ?? 0} pending`,
      group: 'orders',
      emoji: '↩️',
    },
    {
      href: '/admin/clients',
      title: 'Clients',
      subtitle: 'Florist accounts, statuses, approvals',
      counter: `${clientsPending ?? 0} pending`,
      group: 'people',
      emoji: '👥',
    },
  ];

  const groups: Array<{ key: ToolCard['group']; label: string }> = [
    { key: 'catalog', label: 'Catalog control plane' },
    { key: 'orders', label: 'Orders & fulfillment' },
    { key: 'people', label: 'People' },
  ];

  const wiring = getWiringForPage('/admin');
  const sectionMeta = (id: string) =>
    wiring?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };
  const gridMeta = sectionMeta('tool-grid');

  return (
    <>
      <TopBanner />
      <Navigation />
      <main className="min-h-screen bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <MockupLinkBanner mockupHref="/mockups/v2-admin" pageLabel="/admin" />
          <div className="mb-8">
            <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold mb-1">Admin</div>
            <h1 className="text-2xl font-bold text-slate-900">Floropolis control plane</h1>
            <p className="text-sm text-slate-500 mt-1">Signed in as {user.email}</p>
          </div>

          <WiringSection level={gridMeta.level} note={gridMeta.note} id="tool-grid">
            {groups.map((g) => (
              <section key={g.key} className="mb-10">
                <h2 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">{g.label}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {tools.filter((t) => t.group === g.key).map((t) => (
                    <Link
                      key={t.href}
                      href={t.href}
                      className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-emerald-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-2xl leading-none">{t.emoji}</div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 text-sm">{t.title}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{t.subtitle}</div>
                          {t.counter && (
                            <div className="text-xs text-emerald-700 font-medium mt-2">{t.counter}</div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </WiringSection>

          <div className="text-xs text-slate-400 mt-12">
            v8 shadow . admin-port wave 1 . 2026-05-19
            <Suspense fallback={null}>
              <WiringFooterToggle />
            </Suspense>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
