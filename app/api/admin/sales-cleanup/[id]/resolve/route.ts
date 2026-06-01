// POST /api/admin/sales-cleanup/[id]/resolve
// v3 | 2026-05-29 | Codex safety lock
//
// Calls public.sales_cleanup_resolve RPC (deployed 2026-05-22).
// Auth: Facu-only for write path.
//
// Phase-0 lock (catalog priority): this PROD write path is disabled by default.
// To enable explicitly:
//   ENABLE_PROD_SALES_CLEANUP_RESOLVE=true
// and actor email must be facu@floropolis.com.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getProdReadClient } from '@/lib/supabase/prod-server';

const FACU_EMAIL = 'facu@floropolis.com';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  const actorEmail = user?.email?.toLowerCase() ?? '';

  if (actorEmail !== FACU_EMAIL) {
    return NextResponse.json(
      { error: `Unauthorized. Only ${FACU_EMAIL} can execute this PROD write.` },
      { status: 403 },
    );
  }

  const enabled = (process.env.ENABLE_PROD_SALES_CLEANUP_RESOLVE ?? '').toLowerCase() === 'true';
  if (!enabled) {
    return NextResponse.json(
      {
        error: 'sales-cleanup resolve is locked (catalog priority mode). Set ENABLE_PROD_SALES_CLEANUP_RESOLVE=true to unlock explicitly.',
      },
      { status: 423 },
    );
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
    p_user_email: actorEmail,
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
