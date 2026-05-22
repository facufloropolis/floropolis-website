// POST /api/admin/sales-cleanup/[id]/resolve
// v2 | 2026-05-22 | Job_PM [V8 SHADOW]
//
// Calls public.sales_cleanup_resolve RPC (deployed 2026-05-22).
// Auth: ADMIN_EMAILS. Both Facu and JJ can resolve (full admin, per Facu 2026-05-22).
// User email passed explicitly to RPC since service-role JWT has no user email.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getProdReadClient } from '@/lib/supabase/prod-server';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const prod = getProdReadClient();
  if (!prod) {
    return NextResponse.json({ error: 'Production DB not configured' }, { status: 503 });
  }

  let body: {
    resolution_action: string;
    resolution_note?: string;
    apply_as_pattern?: {
      pattern_id: string;
      pattern_description: string;
      pattern_signature: Record<string, unknown>;
    };
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.resolution_action) {
    return NextResponse.json({ error: 'resolution_action is required' }, { status: 400 });
  }

  const { data, error } = await prod.rpc('sales_cleanup_resolve', {
    p_id: id,
    p_action: body.resolution_action,
    p_note: body.resolution_note ?? null,
    p_user_email: user.email,
    p_apply_pattern: body.apply_as_pattern ?? null,
  });

  if (error) {
    console.error('[sales-cleanup/resolve]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data as {
    error?: string;
    id?: string;
    resolution_status?: string;
    resolved_at?: string;
    resolved_by?: string;
    cascade_resolved_count?: number;
  };

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}
