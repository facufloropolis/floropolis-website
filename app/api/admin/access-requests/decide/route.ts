// POST /api/admin/access-requests/decide  body={id, decision: 'approve'|'reject'}.
// Approve: marks the request approved + grants admin (best-effort: finds the user by
// email and sets client_profiles.status/role='admin'). Reject: marks it rejected.
// v1 | 2026-06-09 | Job_PM (CPO)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { requireAdminApi } from '../../deals/_auth';

export async function POST(req: Request) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let id: string | null = null;
  let decision: 'approve' | 'reject' | null = null;
  try {
    const body = (await req.json()) as { id?: unknown; decision?: unknown };
    id = typeof body.id === 'string' ? body.id : null;
    decision = body.decision === 'approve' || body.decision === 'reject' ? body.decision : null;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  if (!id || !decision) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });

  const svc = getBackupServiceClient();

  try {
    // Mark the request.
    const { data: reqRow, error: updErr } = await svc
      .from('access_requests')
      .update({ status: decision === 'approve' ? 'approved' : 'rejected', decided_by: admin.email })
      .eq('id', id)
      .select('requester_email')
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    let granted = false;
    if (decision === 'approve') {
      const email = (reqRow as { requester_email?: string | null })?.requester_email?.toLowerCase() ?? null;
      if (email) {
        // Best-effort admin grant: find the auth user by email, upsert client_profiles admin.
        try {
          const { data: list } = await svc.auth.admin.listUsers();
          const user = list?.users?.find((u) => (u.email ?? '').toLowerCase() === email);
          if (user) {
            const { data: existing } = await svc
              .from('client_profiles')
              .select('user_id')
              .eq('user_id', user.id)
              .maybeSingle();
            if (existing) {
              await svc.from('client_profiles').update({ status: 'admin', role: 'admin' }).eq('user_id', user.id);
            } else {
              await svc.from('client_profiles').insert({ user_id: user.id, status: 'admin', role: 'admin' });
            }
            granted = true;
          }
        } catch {
          // grant is best-effort; the request is still marked approved.
        }
      }
    }

    return NextResponse.json({ ok: true, granted });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'internal_error' }, { status: 500 });
  }
}
