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
    <div className="px-4 py-5 max-w-[900px] mx-auto">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Sample Review -- JJ</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Preguntas de Facu sobre tus samples. Responde aca; tu respuesta vuelve a Facu.
          </p>
        </div>
        <Link
          href="/admin/samples"
          className="shrink-0 text-sm rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
        >
          Vista Facu
        </Link>
      </div>

      <JJAnswerPanel rows={openRows} />
    </div>
  );
}
