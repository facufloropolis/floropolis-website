// GET /api/admin/samples/labels
// v1 | 2026-06-10 | Job_PM (CPO)
//
// Returns a downloadable CSV of approved-pending sample boxes so the CEO can
// create FedEx labels and ship tomorrow. Reads BACKUP sample_review_loop (approved
// rows) + PROD v_flora_cohort (shipping addresses). PROD is HARD READ-ONLY.
//
// Auth: ADMIN_EMAILS allowlist OR client_profiles.status='admin' (mirrors create-box).
//
// ?json=1  -> returns { rows, rowCount, error } as JSON (for the UI preview panel).
// default  -> returns the CSV as a download attachment.
//
// NULL-safe end to end: a missing BACKUP/PROD client, empty result, or any query error
// always returns 200 with an honest empty CSV (header only) or empty rows array.
// Never 500 on empty / missing data.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { buildSampleLabels } from '@/app/admin/samples/labelsBuild';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

interface AuthOk { ok: true }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  let userClient;
  try {
    userClient = await createUserClient();
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true };

  try {
    const adminClient = getBackupServiceClient();
    const { data: profile } = await adminClient
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile?.status === 'admin') return { ok: true };
  } catch {
    // degrade to 403
  }
  return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const wantJson = req.nextUrl.searchParams.get('json') === '1';

  // Use the request date param if provided (YYYY-MM-DD); otherwise today.
  const dateParam = req.nextUrl.searchParams.get('date');
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : new Date().toISOString().slice(0, 10);

  // Build — NULL-safe, never throws
  const result = await buildSampleLabels(date);

  if (wantJson) {
    return NextResponse.json(
      {
        rows: result.rows,
        rowCount: result.rowCount,
        error: result.error,
        filename: result.filename,
        date,
      },
      {
        status: 200,
        headers: { 'cache-control': 'no-store' },
      },
    );
  }

  // CSV download
  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${result.filename}"`,
      'cache-control': 'no-store',
      'x-label-rows': String(result.rowCount),
    },
  });
}
