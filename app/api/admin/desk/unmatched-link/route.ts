// POST /api/admin/desk/unmatched-link
// v1 | 2026-06-11 | Job_PM (CPO)
//
// Writes Facu's LINK or SKIP decision for an unmatched Zoho entity (from
// v_unmatched_review_with_candidate) to BACKUP public.dedup_decisions.
// group_key = 'unmatched_{id}'; Rose ingests and links / ignores accordingly.
//
// Body: { id: number, decision: 'LINK' | 'SKIP', candidate_lead_master_id?: number }

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

const VALID_DECISIONS = new Set(['LINK', 'SKIP']);

async function requireAdmin() {
  const userClient = await createUserClient();
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false as const, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true as const, userId: user.id, email: emailLc };
  const svc = getBackupServiceClient();
  const { data: profile } = await svc.from('client_profiles').select('status').eq('user_id', user.id).maybeSingle();
  if (profile?.status === 'admin') return { ok: true as const, userId: user.id, email: emailLc };
  return { ok: false as const, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.id !== 'number' || !Number.isFinite(body.id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  if (typeof body.decision !== 'string' || !VALID_DECISIONS.has(body.decision)) {
    return NextResponse.json({ error: 'invalid_decision' }, { status: 400 });
  }
  const id = Math.round(body.id);
  const decision = body.decision;
  const survivorLeadId =
    decision === 'LINK' && typeof body.candidate_lead_master_id === 'number'
      ? Math.round(body.candidate_lead_master_id)
      : null;
  if (decision === 'LINK' && survivorLeadId == null) {
    return NextResponse.json({ error: 'link_requires_candidate_lead_master_id' }, { status: 400 });
  }

  const svc = getBackupServiceClient();
  const { data: inserted, error } = await svc
    .from('dedup_decisions')
    .insert({
      group_key: `unmatched_${id}`,
      decision,
      survivor_lead_id: survivorLeadId,
      decided_by: auth.email,
    })
    .select('id, group_key, decision, survivor_lead_id, decided_at')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, decision: inserted });
}
