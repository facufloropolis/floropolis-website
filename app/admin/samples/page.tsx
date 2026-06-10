// Sample Review -- Facu's weekly review of the samples JJ proposes to dispatch.
// v1 | 2026-06-09 | Job_PM (CPO)
//
// Reads the REAL cohort (PROD sample_box_status WHERE sb_status='SB_READY') plus
// engagement/comms/qualification (PROD, read-only, directional pending Rose's
// certified views) via lib/admin/sample-review. Loop state (decision / question
// to JJ / answer / learning) lives in the BACKUP project. JJ answers at
// /admin/samples/jj (JJ is already an admin email).
//
// Auth mirrors /admin/cohort-review (ADMIN_EMAILS or client_profiles.status='admin').
// Directional v1: hypotheses + composition are Job-computed from real signal only;
// no invented scores. The dataNote banner is rendered per-row by the deep-dive.

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import {
  getSampleReviewCohort,
  getSampleReviewDetail,
  getFloraQualifiedCohort,
  probeZohoReadable,
  type SampleReviewRow,
} from '@/lib/admin/sample-review';
import SurfaceStatusBanner from '../_components/SurfaceStatusBanner';
import SamplesReviewClient from './_components/SamplesReviewClient';
import FloraCohortPanel from './_components/FloraCohortPanel';
import LabelsForTomorrow from './_components/LabelsForTomorrow';
import RefreshCohort from './_components/RefreshCohort';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export const metadata = {
  title: 'Sample Review | Floropolis Admin',
  robots: { index: false, follow: false },
};

async function requireAdmin() {
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
}

export default async function SamplesReviewPage() {
  await requireAdmin();

  // Front of the loop: accounts JJ qualified with a real FLORA score, ready to review.
  const floraCohort = await getFloraQualifiedCohort();
  // An empty cohort is ambiguous: genuinely no qualified accounts vs the PROD read
  // client can't see zoho_accounts (RLS: 0 policies -> only service role reads it).
  // Probe so the panel tells the truth instead of "sin cuentas calificadas".
  const prodBlocked = floraCohort.length === 0 ? !(await probeZohoReadable()) : false;

  // Quick list, then hydrate each row with its full comms timeline (cohort is small).
  const cohort = await getSampleReviewCohort();
  const rows: SampleReviewRow[] = await Promise.all(
    cohort.map(async (r) => {
      if (r.leadMasterId == null) return r;
      const detail = await getSampleReviewDetail(r.leadMasterId);
      return detail ?? r;
    }),
  );

  const openQuestions = rows.filter((r) => r.status === 'question_open').length;

  return (
    <main className="px-4 py-6 max-w-[1400px] mx-auto">
      <SurfaceStatusBanner surfaceKey="samples" />
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Sample Review
            <span className="text-slate-400 font-medium"> &middot; lo que JJ propone para dispatch</span>
          </h1>
          <p className="text-[13px] text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
            Por cada calificado: por que es buena apuesta, que caja mandarle + la
            hipotesis a probar, y la recomendacion de Job. Aproba &rarr; se crea la
            caja para el dispatch de manana y baja el Excel de labels.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
        <RefreshCohort />
        <Link
          href="/admin/samples/jj"
          className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
        >
          Vista JJ
          {openQuestions > 0 ? (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-sky-100 text-sky-700 text-[11px] font-bold tabular-nums">
              {openQuestions}
            </span>
          ) : null}
        </Link>
        </div>
      </div>

      {/* Front of the loop: review the FLORA-qualified before the boxed/dispatched below. */}
      <FloraCohortPanel rows={floraCohort} prodBlocked={prodBlocked} />

      {/* Approve -> labels for tomorrow's send (built from our BACKUP-approved boxes). */}
      <div className="mt-8">
        <LabelsForTomorrow />
      </div>

      {/* SEGUIMIENTO de enviadas: use case DIFERIDO. Mockup, NO validado, fuera de
          alpha hasta tener las labels de manana andando. Marcado honesto. */}
      <section className="mt-10">
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-dashed border-violet-300 bg-violet-50 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wide rounded bg-violet-200 text-violet-800 px-1.5 py-0.5">
            Mockup &mdash; no validado
          </span>
          <span className="text-[12px] text-violet-800">
            Seguimiento de muestras enviadas: en diseno, fuera de alpha hasta cerrar approvals + labels.
            La data de outcome (entrega, ganamos/perdimos, fotos) todavia no esta cargada.
          </span>
        </div>
        <div className="opacity-70">
          <SamplesReviewClient rows={rows} />
        </div>
      </section>
    </main>
  );
}
