// POST /api/admin/dispatch/label-file?date=YYYY-MM-DD
// v1 | 2026-06-09 | Job_PM dispatch-enrich (D2)
//
// Returns a downloadable CSV (FedEx label-input columns, one row per box) for
// the given dispatch date. Real rows only; honest empty (header + comment) when
// the date has no boxes. PROD is HARD READ-ONLY for Job_PM — this route only
// reads (dispatch_tracking + sample_box_status + box_master) and never writes.
//
// Auth mirrors the dispatch page + export route: ADMIN_EMAILS allowlist OR
// client_profiles.status='admin'. NULL-safe end to end (buildLabelFile never
// throws; a null PROD client yields a 200 with an honest empty file).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { buildLabelFile } from '@/app/admin/dispatch/labelFile';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function handle(req: NextRequest): Promise<NextResponse> {
  // --- Resolve date --------------------------------------------------------
  const dateParam = req.nextUrl.searchParams.get('date');
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayIso();

  // --- Auth (mirror dispatch page) ----------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user?.email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
  if (!isAdmin) {
    // NULL-safe: getBackupServiceClient() THROWS if BACKUP env is missing
    // (backup-server.ts). Wrap so a missing-env / lookup failure degrades to a
    // clean 403 (not_admin) instead of an unhandled 500 — mirrors page.tsx,
    // which already try/catches its service-client use.
    try {
      const adminClient = getBackupServiceClient();
      const { data: profile } = await adminClient
        .from('client_profiles')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profile?.status === 'admin') isAdmin = true;
    } catch {
      isAdmin = false;
    }
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'not_admin' }, { status: 403 });
  }

  // --- Build the file (PROD read-only, NULL-safe) -------------------------
  const result = await buildLabelFile(date);

  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${result.filename}"`,
      'cache-control': 'no-store',
      'x-label-rows': String(result.rowCount),
      'x-prod-configured': String(result.configured),
    },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}
