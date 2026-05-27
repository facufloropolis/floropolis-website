// POST /api/admin/generate-recommendations
// v1 | 2026-05-26 | Job_PM [V8 SHADOW]
//
// Triggers the recommendation generator: reads floropolis_inventory_mirror and
// creates admin_proposals for formula deviations, open price alerts, and
// missing descriptions. Idempotent — skips proposals that already exist.
//
// Returns stats: { formula_reset, open_alert, missing_description } each with
// { created, skipped, errors }.
//
// Access: admin only (same allowlist as approve/reject routes).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { generateRecommendationProposals } from '@/lib/admin/generators/generate-recommendations';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export async function POST(req: NextRequest): Promise<NextResponse> {
  void req;

  const userClient = await createUserClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const emailLc = (user.email ?? '').toLowerCase();
  if (!ADMIN_EMAILS.includes(emailLc)) {
    const adminClient = getBackupServiceClient();
    const { data: profile } = await adminClient
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile?.status !== 'admin') {
      return NextResponse.json({ error: 'not_admin' }, { status: 403 });
    }
  }

  const service = getBackupServiceClient();

  try {
    const stats = await generateRecommendationProposals(service);
    const totalCreated =
      stats.formula_reset.created +
      stats.open_alert.created +
      stats.missing_description.created;
    const totalErrors =
      stats.formula_reset.errors +
      stats.open_alert.errors +
      stats.missing_description.errors;

    return NextResponse.json({
      ok: true,
      total_created: totalCreated,
      stats,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'admin/generate-recommendations' } });
    return NextResponse.json(
      { error: 'generator_failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
