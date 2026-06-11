// POST /api/admin/samples/reschedule — reschedule the dispatch date for approved sample boxes.
// v1 | 2026-06-11 | Job_PM (CPO)
//
// Body: { date: 'YYYY-MM-DD', reason: string, ids?: string[] }
//   - date     : new dispatch date in ISO format YYYY-MM-DD (validated by regex)
//   - reason   : human reason, trimmed, max 300 chars
//   - ids      : optional array of row IDs; when absent, targets ALL aligned/yes rows
//
// For each target row: merges into proposed_composition:
//   { dispatch_date, reschedule_reason, reschedule_at, reschedule_by }
// preserving all other keys. Sets updated_by + updated_at.
//
// Returns: { ok: true, updated: <count> }
// NULL-safe: never 500 uncaught. Returns { ok: false, error } on any failure.
//
// Auth: mirrors approved-boxes route — ADMIN_EMAILS OR client_profiles.status='admin'.
// BACKUP writes via getBackupServiceClient().

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

// ---------------------------------------------------------------------------
// Admin auth (mirrors approved-boxes)
// ---------------------------------------------------------------------------
const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

interface AuthOk { ok: true; userId: string; email: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  try {
    const userClient = await createUserClient();
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return { ok: false, response: NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 }) };
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

    return { ok: false, response: NextResponse.json({ ok: false, error: 'not_admin' }, { status: 403 }) };
  } catch {
    return { ok: false, response: NextResponse.json({ ok: false, error: 'auth_error' }, { status: 500 }) };
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
interface RescheduleBody {
  date?: unknown;
  reason?: unknown;
  ids?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    // Parse body
    let body: RescheduleBody = {};
    try {
      const raw = await req.text();
      if (raw.length > 0) body = JSON.parse(raw) as RescheduleBody;
    } catch {
      return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
    }

    // Validate date: must be a string matching YYYY-MM-DD exactly
    const dateStr = typeof body.date === 'string' ? body.date.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json(
        { ok: false, error: 'invalid_date: must be YYYY-MM-DD' },
        { status: 400 },
      );
    }

    // Validate reason
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
    if (!reason) {
      return NextResponse.json({ ok: false, error: 'reason_required' }, { status: 400 });
    }

    // Optional ids list
    let targetIds: string[] | null = null;
    if (body.ids !== undefined) {
      if (!Array.isArray(body.ids)) {
        return NextResponse.json({ ok: false, error: 'ids_must_be_array' }, { status: 400 });
      }
      const parsed: string[] = [];
      for (const item of body.ids) {
        if (typeof item === 'string' && item.trim()) parsed.push(item.trim());
      }
      if (parsed.length === 0) {
        return NextResponse.json({ ok: false, error: 'ids_empty_after_filter' }, { status: 400 });
      }
      targetIds = parsed;
    }

    let svc;
    try { svc = getBackupServiceClient(); } catch {
      return NextResponse.json({ ok: false, error: 'BACKUP client not configured' }, { status: 500 });
    }

    // Fetch target rows
    let query = svc
      .from('sample_review_loop')
      .select('id, proposed_composition')
      .or('status.eq.aligned,facu_decision.eq.yes');

    if (targetIds !== null) {
      query = query.in('id', targetIds);
    }

    const { data: rowsRaw, error: fetchErr } = await query;
    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: 'fetch_failed: ' + fetchErr.message },
        { status: 500 },
      );
    }

    const rows = (rowsRaw ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    const nowIso = new Date().toISOString();
    let updatedCount = 0;

    // Update each row individually to do a safe merge of proposed_composition
    for (const row of rows) {
      const prevComp =
        row.proposed_composition &&
        typeof row.proposed_composition === 'object' &&
        !Array.isArray(row.proposed_composition)
          ? (row.proposed_composition as Record<string, unknown>)
          : {};

      // Merge: preserve all existing keys, add/overwrite only dispatch-related keys
      const merged: Record<string, unknown> = {
        ...prevComp,
        dispatch_date: dateStr,
        reschedule_reason: reason,
        reschedule_at: nowIso,
        reschedule_by: auth.email,
      };

      const rowId = typeof row.id === 'string' || typeof row.id === 'number'
        ? String(row.id) : null;
      if (!rowId) continue;

      const { error: updErr } = await svc
        .from('sample_review_loop')
        .update({
          proposed_composition: merged,
          updated_by: auth.email,
          updated_at: nowIso,
        })
        .eq('id', rowId);

      if (!updErr) {
        updatedCount++;
      } else {
        // Log but don't abort the whole batch
        console.error('[reschedule POST] update failed for id', rowId, updErr.message);
      }
    }

    return NextResponse.json({ ok: true, updated: updatedCount });
  } catch (err) {
    console.error('[reschedule POST] unexpected:', err);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
