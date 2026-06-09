// Sample Review -- JJ's view: the open questions Facu raised on his samples.
// v1 | 2026-06-09 | Job_PM (CPO)
//
// JJ answers here, in admin (not Zoho/Sheet/inbox). Answering moves the loop
// question_open -> answered, which returns it to Facu. Same admin auth as the
// Facu page (JJ's emails are in ADMIN_EMAILS).

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import {
  getSampleReviewCohort,
  type SampleReviewRow,
} from '@/lib/admin/sample-review';
import JJAnswerPanel from '../_components/JJAnswerPanel';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export const metadata = {
  title: 'Sample Review -- JJ | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function SamplesJJPage() {
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

  const cohort: SampleReviewRow[] = await getSampleReviewCohort();
  const openRows = cohort.filter((r) => r.status === 'question_open');

  return (
    <main className="px-4 py-6 max-w-[900px] mx-auto">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Sample Review
            <span className="text-slate-400 font-medium"> &middot; JJ</span>
          </h1>
          <p className="text-[13px] text-slate-500 mt-1.5 leading-relaxed">
            Preguntas de Facu sobre tus samples. Responde aca &mdash; tu respuesta vuelve a Facu.
          </p>
        </div>
        <Link
          href="/admin/samples"
          className="shrink-0 inline-flex items-center text-sm font-medium rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
        >
          Vista Facu
        </Link>
      </div>

      <JJAnswerPanel rows={openRows} />
    </main>
  );
}
