// POST /api/admin/surface-status
// v1 | 2026-06-10 | Job_PM (CPO)
//
// Facu approving the CANONICAL stage of an admin surface (tab). Body:
//   { surfaceKey: string, stage: 'structure'|'mockup'|'alpha'|'mvp'|'ga' }.
//
// On success: UPDATE public.admin_surface_status SET stage=$stage,
//   stage_approved=true, approved_by=<session email>, approved_at=now(),
//   updated_at=now() WHERE surface_key=$surfaceKey. Returns { ok: true }.
//
// Auth mirrors /api/admin/supply/decide (ADMIN_EMAILS allowlist OR
//   client_profiles.status='admin').

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

type Stage = 'structure' | 'mockup' | 'alpha' | 'mvp' | 'ga';
const VALID_STAGES: Stage[] = ['structure', 'mockup', 'alpha', 'mvp', 'ga'];

interface AuthOk { ok: true; userId: string; email: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true, userId: user.id, email: emailLc };

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') return { ok: true, userId: user.id, email: emailLc };

  return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

interface ApproveBody {
  surfaceKey?: unknown;
  stage?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: ApproveBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as ApproveBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.surfaceKey !== 'string' || body.surfaceKey.trim().length === 0) {
    return NextResponse.json({ error: 'invalid_surface_key' }, { status: 400 });
  }
  if (typeof body.stage !== 'string' || !VALID_STAGES.includes(body.stage as Stage)) {
    return NextResponse.json(
      { error: 'invalid_stage', detail: `stage must be one of ${VALID_STAGES.join('|')}` },
      { status: 400 },
    );
  }

  const surfaceKey = body.surfaceKey.trim().slice(0, 100);
  const stage = body.stage as Stage;
  const nowIso = new Date().toISOString();

  const svc = getBackupServiceClient();
  const { data: updated, error } = await svc
    .from('admin_surface_status')
    .update({
      stage,
      stage_approved: true,
      approved_by: auth.email || 'facu',
      approved_at: nowIso,
      updated_at: nowIso,
    })
    .eq('surface_key', surfaceKey)
    .select('surface_key, stage, stage_approved, approved_by, approved_at')
    .maybeSingle();

  if (error) {
    console.error('[admin/surface-status] update:', error);
    return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'surface_not_found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, surface: updated });
}
