// Admin dispatch — daily dispatch manifest, rebuilt to match the approved
// mockup at /mockups/admin-dispatch (3-panel layout + Rose pipeline stepper).
// v5 | 2026-06-09 | Job_PM dispatch-mockup-rebuild
//
// WHAT CHANGED (vs v4 tab-based surface):
//   - Restored the mockup's 3-panel layout: Today's Dispatch | Communications |
//     Labels & Confirmations, with the FedEx clarification banner, date nav,
//     2-box-minimum chip, Rose pipeline stepper, and Sample Box modal.
//   - WIRED to the REAL Rose dispatch tables in PROD (read-only) instead of the
//     old BACKUP orders/dispatches D1 model:
//       dispatch_tracking  -> the boxes dispatched on the date (the spine)
//       sample_box_status  -> recipient, destination, products, SB + delivery status
//       farm_shipments     -> farm-side rollup (farm, boxes, stems, AWB)
//       n8n_dispatch_queue -> client notification emails (status/timing)
//     See DispatchManifestData.ts for the assembly + NULL-safety contract.
//   - If today has no dispatch, the page lands on the most recent dispatch date
//     that has data, so Facu always sees a populated manifest.
//
// PENDING (no source wired):
//   - Driver pickup confirmation (no WhatsApp table) -> local-only toggles.
//   - FedEx depot "notified" flag -> local-only toggle.
//   - Per-shipment customs (REL/HTS/declared) -> static reference card.
//   These are clearly labeled "local only" / "pending" in the UI.
//
// Constraints: PROD is HARD READ-ONLY for Job_PM (no writes). Auth mirrors the
// prior page (ADMIN_EMAILS + client_profiles.status='admin'). NULL-safe: a null
// PROD client renders an honest "not configured" empty state, never throws.

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

import DispatchDateNav from './DispatchDateNav';
import DispatchPipelineStepper from './DispatchPipelineStepper';
import DispatchManifestLayout from './DispatchManifestLayout';
import {
  getDispatchManifest,
  getMostRecentDispatchDate,
  type DispatchManifest,
} from './DispatchManifestData';
import type { SampleProspect } from './DispatchManifestPanels';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export const metadata = {
  title: 'Dispatch | Floropolis Admin',
  robots: { index: false, follow: false },
};

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtHeading(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Derive the active Rose pipeline step (0..8) from the day's manifest.
//   0 PREP · 1 REVIEW · 2 DISPATCH · 3 LABELS · 4 READ · 5 EMAILS · 6 SEND ·
//   7 LOG · 8 PRE-ARRIVAL
function derivePipelineStep(m: DispatchManifest): number {
  if (m.boxes.length === 0) return 2; // awaiting dispatch / labels
  const anyLabelParsed = m.boxes.some((b) => b.trackingNumber); // tracking row == parsed label
  if (!anyLabelParsed) return 3; // labels stage
  const anyFarmEmailSent = m.farmEmails.some((e) => e.sentAt);
  if (!anyFarmEmailSent) return 5; // emails stage
  const allClientSent =
    m.clientNotifications.length > 0 &&
    m.clientNotifications.every((c) => (c.status ?? '').toUpperCase() === 'SENT');
  if (!allClientSent) return 6; // send stage
  const allDelivered = m.boxes.length > 0 && m.boxes.every((b) => b.deliveredAt != null);
  if (!allDelivered) return 8; // pre-arrival / in transit
  return 9; // fully complete (renders all steps done)
}

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function AdminDispatchPage({ searchParams }: PageProps) {
  // --- Auth (mirror prior page) --------------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user?.email) redirect('/auth/login?next=/admin/dispatch');

  let isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
  if (!isAdmin) {
    const adminClient = getBackupServiceClient();
    const { data: profile } = await adminClient
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile?.status === 'admin') isAdmin = true;
  }
  if (!isAdmin) redirect('/');

  // --- Resolve the dispatch date -------------------------------------------
  const sp = await searchParams;
  const todayIso = todayUtcIso();
  const explicitDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;

  // If no explicit date and today has no dispatch, fall back to the most recent
  // dispatch date so the surface is never an empty wall.
  let activeDate = explicitDate ?? todayIso;
  if (!explicitDate) {
    const todayManifestExists = await getMostRecentDispatchDate(todayIso);
    if (todayManifestExists && todayManifestExists !== todayIso) {
      activeDate = todayManifestExists;
    }
  }

  // --- Fetch the manifest (PROD, read-only, NULL-safe) ---------------------
  const manifest = await getDispatchManifest(activeDate);
  const pipelineStep = derivePipelineStep(manifest);

  // --- Prospects for the Sample Box modal (BACKUP) -------------------------
  let prospects: SampleProspect[] = [];
  try {
    const backup = getBackupServiceClient();
    const { data: prospectsRaw } = await backup
      .from('sample_box_prospects')
      .select('id, business_name, contact_name, status')
      .in('status', ['eligible', 'sent'])
      .order('business_name', { ascending: true })
      .limit(50);
    prospects = ((prospectsRaw ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: (p.id as number | string) ?? '',
      name: (p.business_name as string) ?? 'Unknown',
      contact: (p.contact_name as string) ?? null,
    }));
  } catch {
    prospects = [];
  }

  const totalBoxes = manifest.counts.boxes;
  const farmCount = manifest.counts.farms;
  const recipientCount = manifest.counts.recipients;
  const belowMinimum = totalBoxes > 0 && totalBoxes < 2;
  const usingFallbackDate = !explicitDate && activeDate !== todayIso;

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dispatch &mdash; {fmtHeading(activeDate)}</h1>
          <div className="flex items-center gap-3 flex-wrap text-sm text-slate-500 mt-1">
            <span>
              {totalBoxes} box{totalBoxes === 1 ? '' : 'es'} · {recipientCount} recipient{recipientCount === 1 ? '' : 's'} · {farmCount} farm{farmCount === 1 ? '' : 's'}
            </span>
            {totalBoxes === 0 ? (
              <span className="bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-lg text-xs font-semibold">No dispatch this date</span>
            ) : belowMinimum ? (
              <span className="bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-lg text-xs font-semibold">Below 2-box minimum</span>
            ) : (
              <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-lg text-xs font-semibold">2-box minimum met ({totalBoxes} boxes)</span>
            )}
          </div>
          {usingFallbackDate && (
            <p className="text-xs text-slate-400 mt-1">
              Showing the most recent dispatch date (today has no dispatch). Use the date nav to change.
            </p>
          )}
        </div>
        <DispatchDateNav date={activeDate} todayIso={todayIso} />
      </div>

      {/* FedEx clarification banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
        <span className="text-blue-500 text-lg shrink-0">[FedEx]</span>
        <p className="text-sm text-blue-800">
          <strong>FedEx receives at the Quito depot by 10pm ECT.</strong> The truck driver picks up at the farm in the afternoon;
          pickup confirmation usually arrives via WhatsApp.{' '}
          <span className="text-blue-600 font-medium">Contacts: edgar.freire@fedex.com · Dominique Romero (dromero@entregas.ec)</span>
        </p>
      </div>

      {/* PROD-not-configured banner */}
      {!manifest.configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-sm text-amber-800">
          Production read client not configured (PROD_SUPABASE_SERVICE_KEY missing). The dispatch tables live in
          the production project; panels below render empty until the key is set.
        </div>
      )}
      {manifest.configured && manifest.error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 text-sm text-red-800">
          Could not load dispatch data: {manifest.error}
        </div>
      )}

      {/* 3-panel layout */}
      <div className="mb-8">
        <DispatchManifestLayout
          boxes={manifest.boxes}
          farms={manifest.farms}
          farmEmails={manifest.farmEmails}
          clientNotifications={manifest.clientNotifications}
          yesterday={manifest.yesterday}
          totalBoxes={totalBoxes}
          farmCount={farmCount}
          belowMinimum={belowMinimum}
          prospects={prospects}
        />
      </div>

      {/* Rose pipeline stepper */}
      <DispatchPipelineStepper activeStep={pipelineStep} />

      <p className="text-xs text-slate-400 mt-6">
        Data source: PROD (read-only) dispatch_tracking + sample_box_status + farm_shipments + n8n_dispatch_queue.
        Job_PM has no write path to these tables; manual confirmations are local-only.
      </p>
    </main>
  );
}
