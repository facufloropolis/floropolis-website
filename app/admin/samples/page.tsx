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
  type SampleReviewRow,
} from '@/lib/admin/sample-review';
import SamplesReviewClient from './_components/SamplesReviewClient';

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
    <div className="px-4 py-5 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Sample Review</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Los samples que JJ propone para dispatch -- score + por que, engagement real,
            analisis de comms, hipotesis de win, direccion, y composicion por fit.
            Decidi SI / NO / Pregunta; las preguntas van a JJ en admin.
          </p>
        </div>
        <Link
          href="/admin/samples/jj"
          className="shrink-0 text-sm rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
        >
          Vista JJ{openQuestions > 0 ? ` (${openQuestions})` : ''}
        </Link>
      </div>

      <SamplesReviewClient rows={rows} />
    </div>
  );
}
