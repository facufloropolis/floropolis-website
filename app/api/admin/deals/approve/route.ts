// POST /api/admin/deals/approve  body={dealId} -> approves a pending deal.
// JJ o Facu pueden aprobar (pre-approval gate). Sets approval_status='approved',
// approved_by_role (facu if facu email, else jj), and status='approved'.
// v1 | 2026-06-09 | Job_PM (CPO)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { requireAdminApi } from '../_auth';

export async function POST(req: Request) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let dealId: number | null = null;
  try {
    const body = (await req.json()) as { dealId?: unknown };
    dealId = typeof body.dealId === 'number' ? body.dealId : Number(body.dealId);
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  if (!dealId || Number.isNaN(dealId)) {
    return NextResponse.json({ error: 'missing_dealId' }, { status: 400 });
  }

  const role = admin.email.startsWith('facu') ? 'facu' : 'jj';

  try {
    const svc = getBackupServiceClient();
    const { error } = await svc
      .from('deals')
      .update({
        approval_status: 'approved',
        approved_by_role: role,
        approved_by: admin.email,
        status: 'approved',
      })
      .eq('id', dealId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, approvedBy: role });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'internal_error' }, { status: 500 });
  }
}
