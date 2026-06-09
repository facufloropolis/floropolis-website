// GET /api/admin/deals/varieties?q= -> searchCatalogVarieties(q). Admin-guarded.
// v1 | 2026-06-09 | Job_PM (CPO)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { searchCatalogVarieties } from '@/lib/deal/data';
import { requireAdminApi } from '../_auth';

export async function GET(req: Request) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const q = new URL(req.url).searchParams.get('q') ?? '';
  const varieties = await searchCatalogVarieties(q);
  return NextResponse.json(varieties);
}
