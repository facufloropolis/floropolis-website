// POST /api/admin/surface-status/idea
// v1 | 2026-06-10 | Job_PM (CPO)
//
// Editable ideas on an admin surface, so Facu AND JJ can drop ideas/feedback per tab.
// Body:
//   { action: 'add',     surfaceKey: string, idea: string }   -> insert (author = session email)
//   { action: 'resolve', ideaId: uuid, resolved?: boolean }   -> mark resolved/unresolved
//
// Writes public.admin_surface_ideas (BACKUP, Job-owned). author/resolved_by = the
// authenticated admin's email (Facu or JJ), never hardcoded. Auth mirrors the parent
// /api/admin/surface-status route (ADMIN_EMAILS allowlist OR client_profiles.status='admin').

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

interface IdeaBody {
  action?: unknown;
  surfaceKey?: unknown;
  idea?: unknown;
  ideaId?: unknown;
  resolved?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: IdeaBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as IdeaBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const svc = getBackupServiceClient();
  const actor = auth.email || 'admin';
  const nowIso = new Date().toISOString();

  // --- add -------------------------------------------------------------------
  if (body.action === 'add') {
    if (typeof body.surfaceKey !== 'string' || body.surfaceKey.trim().length === 0) {
      return NextResponse.json({ error: 'invalid_surface_key' }, { status: 400 });
    }
    if (typeof body.idea !== 'string' || body.idea.trim().length === 0) {
      return NextResponse.json({ error: 'empty_idea' }, { status: 400 });
    }
    const { data, error } = await svc
      .from('admin_surface_ideas')
      .insert({
        surface_key: body.surfaceKey.trim().slice(0, 100),
        author: actor,
        idea: body.idea.trim().slice(0, 2000),
      })
      .select('id, surface_key, author, idea, resolved, created_at')
      .maybeSingle();
    if (error) {
      console.error('[surface-status/idea] add:', error);
      return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, idea: data });
  }

  // --- resolve ---------------------------------------------------------------
  if (body.action === 'resolve') {
    if (typeof body.ideaId !== 'string' || body.ideaId.length < 8) {
      return NextResponse.json({ error: 'invalid_idea_id' }, { status: 400 });
    }
    const resolved = body.resolved !== false; // default true
    const { error } = await svc
      .from('admin_surface_ideas')
      .update({
        resolved,
        resolved_by: resolved ? actor : null,
        resolved_at: resolved ? nowIso : null,
      })
      .eq('id', body.ideaId);
    if (error) {
      console.error('[surface-status/idea] resolve:', error);
      return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
