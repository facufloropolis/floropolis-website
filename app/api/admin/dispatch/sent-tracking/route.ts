// GET /api/admin/dispatch/sent-tracking?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns { rollup, samples } for the 3-level Dispatch "Enviadas" view.
// v1 | 2026-06-11 | Job_PM (CPO)
//
// Auth: admin-guarded (mirrors app/api/admin/samples/approved-boxes/route.ts).
// Data: reads PROD views via getSentSamplesTracking (anon-readable, getProdReadClient).
// NULL-safe: never 500; returns { rollup, samples: [], error } on failure.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getSentSamplesTracking } from '@/lib/admin/sample-tracking';
import type { SentSamplesPayload } from '@/lib/admin/sample-tracking';

// ---------------------------------------------------------------------------
// Admin auth (mirrors approved-boxes route exactly)
// ---------------------------------------------------------------------------

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

interface AuthOk { ok: true }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  try {
    const userClient = await createUserClient();
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
    }
    const emailLc = (user.email ?? '').toLowerCase();
    if (ADMIN_EMAILS.includes(emailLc)) return { ok: true };

    const adminClient = getBackupServiceClient();
    const { data: profile } = await adminClient
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile?.status === 'admin') return { ok: true };

    return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'auth_error' }, { status: 500 }) };
  }
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

const validDate = /^\d{4}-\d{2}-\d{2}$/;

function emptyPayload(error: string | null): SentSamplesPayload & { error: string | null } {
  return {
    rollup: {
      sampleCount: 0,
      avgDaysToShip: null,
      avgInteractions: null,
      wonCount: 0,
      lostCount: 0,
      pendingCount: 0,
      closeRate: null,
      mostCommonObjection: null,
      pctQuoted: null,
      likedCount: 0,
      molestoCount: 0,
    },
    samples: [],
    error,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const fromParam = url.searchParams.get('from') ?? '';
    const toParam = url.searchParams.get('to') ?? '';

    if (!validDate.test(fromParam) || !validDate.test(toParam)) {
      return NextResponse.json(
        emptyPayload('invalid_params — esperado ?from=YYYY-MM-DD&to=YYYY-MM-DD'),
        { status: 400 },
      );
    }

    if (fromParam > toParam) {
      return NextResponse.json(
        emptyPayload('invalid_range — from debe ser <= to'),
        { status: 400 },
      );
    }

    const payload = await getSentSamplesTracking(fromParam, toParam);
    return NextResponse.json({ ...payload, error: null });
  } catch (err) {
    console.error('[sent-tracking GET] unexpected:', err);
    return NextResponse.json(emptyPayload('internal_error'));
  }
}
