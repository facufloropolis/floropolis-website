// GET /api/admin/deals/intel?leadMasterId= -> getClientIntel. Admin-guarded.
// v1 | 2026-06-09 | Job_PM (CPO)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getClientIntel } from '@/lib/deal/data';
import { requireAdminApi } from '../_auth';

export async function GET(req: Request) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = new URL(req.url).searchParams.get('leadMasterId');
  const leadMasterId = Number(raw);
  if (!raw || !Number.isFinite(leadMasterId)) {
    return NextResponse.json({ error: 'bad_lead_master_id' }, { status: 400 });
  }

  const intel = await getClientIntel(leadMasterId);
  return NextResponse.json(intel);
}
