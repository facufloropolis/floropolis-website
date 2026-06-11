// Sample Review -- DECIDIR: review the FLORA cohort + approve. Nothing else.
// v2 | 2026-06-11 | Job_PM (CPO)
//
// TWO-TAB MODEL:
//   Samples (/admin/samples) = DECIDIR: review the FLORA-qualified + approve.
//   Dispatch (/admin/dispatch) = el hub por periodo (Planificadas + Enviadas).
//
// REMOVED from this surface: ApprovedBoxesEditor, LabelsForTomorrow, seguimiento mockup.
// Those live in /admin/dispatch (DispatchHub).

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
import FloraCohortPanel from './_components/FloraCohortPanel';
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
            <span className="text-slate-400 font-medium"> &middot; revisar y aprobar</span>
          </h1>
          <p className="text-[13px] text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
            Por cada calificado FLORA: por que es buena apuesta, que caja mandarle +
            hipotesis a probar. Aproba &rarr; pasa a Dispatch para programar el envio.
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
          <Link
            href="/admin/dispatch"
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700 transition-colors"
          >
            Ir a Dispatch
          </Link>
        </div>
      </div>

      {/* Front of the loop: review the FLORA-qualified. Approve here -> moves to Dispatch hub. */}
      <FloraCohortPanel rows={floraCohort} prodBlocked={prodBlocked} />
    </main>
  );
}
