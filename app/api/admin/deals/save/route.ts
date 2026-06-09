// POST /api/admin/deals/save  body=DealDraft -> saveDeal -> {ok,dealId}.
// Floor violations thrown by lib/deal/save ('below_floor' / 'line_below_floor') -> 422.
// v1 | 2026-06-09 | Job_PM (CPO)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { saveDeal } from '@/lib/deal/save';
import type { DealDraft } from '@/lib/deal/types';
import { requireAdminApi } from '../_auth';

export async function POST(req: Request) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let draft: DealDraft;
  try {
    draft = (await req.json()) as DealDraft;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  // Stamp the creator from the authenticated admin when absent.
  if (!draft.createdBy) draft.createdBy = admin.email;

  try {
    const { dealId } = await saveDeal(draft);
    return NextResponse.json({ ok: true, dealId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Floor enforcement -> 422 (recoverable, surfaced to the seller).
    if (msg.startsWith('below_floor') || msg.startsWith('line_below_floor')) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
