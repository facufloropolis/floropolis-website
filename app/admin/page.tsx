// Admin index -- v2 unified shell home (Today + KPIs + Recent activity).
// v2 | 2026-05-19 | Job_PM SHELL-V2 [V8 SHADOW]
//
// Replaces the W2 card-grid index with the v2-admin Today panel layout per
// app/mockups/v2-admin/page.tsx. The sidebar + top bar + health bar are
// provided by app/admin/layout.tsx so this page only renders the main column.
//
// Access: same as W2. Middleware + ADMIN_EMAILS allowlist + client_profiles
// status='admin' fallback. Counter queries themselves live in
// app/admin/_components/AdminKPITiles.tsx (moved verbatim per W3 spec).

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import WiringSection from '@/components/admin/WiringSection';
import MockupLinkBanner from '@/components/admin/MockupLinkBanner';
import WiringFooterToggle from '@/components/admin/WiringFooterToggle';
import { getWiringForPage } from '@/lib/admin/wiring';
import AdminTodayPanel from './_components/AdminTodayPanel';
import AdminCatalogHealthPanel from './_components/AdminCatalogHealthPanel';
import AdminRecentActivity from './_components/AdminRecentActivity';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

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

  const wiring = getWiringForPage('/admin');
  const sectionMeta = (id: string) =>
    wiring?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };

  const todayMeta = sectionMeta('today-panel');
  const kpiMeta = sectionMeta('kpi-tiles');
  const activityMeta = sectionMeta('recent-activity');

  return (
    <div className="p-5">
      <div className="max-w-6xl mx-auto">
        <MockupLinkBanner mockupHref="/mockups/v2-admin" pageLabel="/admin" />

        <div className="mb-5">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Today</h1>
          <p className="text-sm text-slate-500">What needs you, ranked by priority.</p>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Today panel (left ~2/3) */}
          <div className="col-span-12 lg:col-span-8">
            <WiringSection level={todayMeta.level} note={todayMeta.note} id="today-panel">
              <AdminTodayPanel />
            </WiringSection>
          </div>

          {/* Right column: KPIs + Recent activity (~1/3) */}
          <aside className="col-span-12 lg:col-span-4 space-y-4">
            <WiringSection level={kpiMeta.level} note={kpiMeta.note} id="kpi-tiles">
              <AdminCatalogHealthPanel />
            </WiringSection>
            <WiringSection level={activityMeta.level} note={activityMeta.note} id="recent-activity">
              <AdminRecentActivity />
            </WiringSection>
          </aside>
        </div>

        <div className="text-xs text-slate-400 mt-12">
          v8 shadow . shell-v2 . 2026-05-19
          <Suspense fallback={null}>
            <WiringFooterToggle />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
