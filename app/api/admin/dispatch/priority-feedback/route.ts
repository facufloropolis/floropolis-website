// POST /api/admin/dispatch/priority-feedback — capture Facu's correction of the
// DIRECTIONAL dispatch-priority ranking (bump / drop / correct).
// v1 | 2026-06-08 | Job_PM dispatch-priority
//
// Reuses the existing supply_recommendation_feedback table (BACKUP) so dispatch
// corrections land in the same feedback substrate as supply corrections:
//   rec_type      = 'dispatch_priority'
//   target_variety= NULL
//   target_sku    = NULL  (uuid column; dispatch items aren't SKUs)
//   decision      = 'bump' | 'drop' | 'correct'
//   reason_tags   = [ 'ref:<order/prebook/sample ref>', 'key:<source:id>',
//                     'client:<name>', 'note:<free text>' ]
//   weight_delta  = +1 (bump) | -1 (drop) | 0 (correct)
//   decided_by    = admin email
//
// The point is simple: Facu can say "this should be higher / lower / here's why"
// and it's captured for the loop. Directional scoring reads these back later.

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

type Decision = 'bump' | 'drop' | 'correct';
const VALID_DECISIONS: Decision[] = ['bump', 'drop', 'correct'];
const WEIGHT_DELTA: Record<Decision, number> = { bump: 1, drop: -1, correct: 0 };

export async function POST(req: NextRequest) {
  const supa = await createBackupServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const service = getBackupServiceClient();
  let isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
  if (!isAdmin) {
    const { data: profile } = await service
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile?.status === 'admin') isAdmin = true;
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { ref?: string; key?: string; client?: string; decision?: string; note?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const decision = (body.decision ?? '').toLowerCase() as Decision;
  if (!VALID_DECISIONS.includes(decision)) {
    return NextResponse.json({ error: 'invalid_decision' }, { status: 400 });
  }
  const ref = (body.ref ?? '').toString().slice(0, 120);
  if (!ref) {
    return NextResponse.json({ error: 'missing_ref' }, { status: 400 });
  }

  const reasonTags: string[] = [`ref:${ref}`];
  if (body.key) reasonTags.push(`key:${String(body.key).slice(0, 120)}`);
  if (body.client) reasonTags.push(`client:${String(body.client).slice(0, 120)}`);
  if (body.note) reasonTags.push(`note:${String(body.note).slice(0, 500)}`);

  const { error } = await service.from('supply_recommendation_feedback').insert({
    rec_type: 'dispatch_priority',
    target_variety: null,
    target_sku: null,
    decision,
    reason_tags: reasonTags,
    weight_delta: WEIGHT_DELTA[decision],
    decided_by: user.email,
  });

  if (error) {
    console.error('[dispatch/priority-feedback] insert error:', error.message);
    return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, decision, ref }, { status: 200 });
}
