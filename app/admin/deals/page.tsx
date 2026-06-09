// Deal Builder -- the LIVE twin of /mockups/deal-builder.
// Server page: requireAdmin (ADMIN_EMAILS or client_profiles.status='admin');
// loads box types + an initial top client list server-side, then renders the client.
// v1 | 2026-06-09 | Job_PM (CPO)

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getBoxTypes, searchClients } from '@/lib/deal/data';
import DealBuilderClient from './_components/DealBuilderClient';
import DealsQueue, { type PendingDeal } from './_components/DealsQueue';

async function getPendingDeals(): Promise<PendingDeal[]> {
  try {
    const svc = getBackupServiceClient();
    const { data } = await svc
      .from('deals')
      .select('id, client_snapshot, deal_type, cadence, total_price, blended_gpm, created_by')
      .eq('approval_status', 'pending_approval')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!Array.isArray(data)) return [];
    return data.map((d: Record<string, unknown>) => {
      const snap = (d.client_snapshot ?? {}) as Record<string, unknown>;
      const name = (snap.businessName ?? snap.name ?? null) as string | null;
      return {
        id: Number(d.id),
        businessName: name,
        dealType: (d.deal_type ?? null) as string | null,
        cadence: (d.cadence ?? null) as string | null,
        totalPrice: d.total_price != null ? Number(d.total_price) : null,
        blendedGpm: d.blended_gpm != null ? Number(d.blended_gpm) : null,
        createdBy: (d.created_by ?? null) as string | null,
      };
    });
  } catch {
    return [];
  }
}

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export const metadata = {
  title: 'Deal Builder | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function DealBuilderPage() {
  // --- Auth (mirrors /admin/cohort-review) ------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect('/');

  const emailLc = (user.email ?? '').toLowerCase();
  if (!ADMIN_EMAILS.includes(emailLc)) {
    const adminClient = getBackupServiceClient();
    const { data: profile } = await adminClient
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!profile || profile.status !== 'admin') redirect('/');
  }

  // --- Server-side initial data -----------------------------------------------
  const [boxTypes, initialClients, pendingDeals] = await Promise.all([
    getBoxTypes(),
    searchClients(''),
    getPendingDeals(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
      {pendingDeals.length > 0 && (
        <div className="mx-auto max-w-[1280px] px-4 pt-6 sm:px-6">
          <DealsQueue initial={pendingDeals} />
        </div>
      )}
      <DealBuilderClient initialClients={initialClients.slice(0, 15)} boxTypes={boxTypes} />
    </div>
  );
}
