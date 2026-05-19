// POST /api/admin/auth-sessions/[user_id]/force-logout
// Phase E | 2026-05-19 | Job_PM admin-clients [V8 SHADOW]
//
// Force-logs-out a single client by revoking all their auth sessions via
// supabase.auth.admin.signOut(). Both CEO + Co-Admin can fire this.
// Rationale is mandatory (>= 5 chars). No user-facing notification per BR-LOGIN-5.
//
// Writes an override_audit row so we can answer "who force-logged-out whom and why".
// We use override_audit (not admin_proposals) because this is a Tier-1 admin action
// that runs immediately; the audit trail is post-hoc, not pre-approval.
//
// Body: { rationale: string }
// Returns: { ok: true, audit_id: uuid } or { error, detail }

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

interface AuthOk {
  ok: true;
  userId: string;
  email: string;
}
interface AuthFail {
  ok: false;
  response: NextResponse;
}

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user || !user.email) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
    };
  }

  const emailLc = user.email.toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) {
    return { ok: true, userId: user.id, email: emailLc };
  }

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin' || profile?.role === 'admin') {
    return { ok: true, userId: user.id, email: emailLc };
  }
  return {
    ok: false,
    response: NextResponse.json({ error: 'not_admin' }, { status: 403 }),
  };
}

interface PostBody {
  rationale?: unknown;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ user_id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { user_id: targetUserId } = await ctx.params;
  if (!targetUserId || targetUserId.length < 10) {
    return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const rationale =
    typeof body.rationale === 'string' ? body.rationale.trim() : '';
  if (rationale.length < 5) {
    return NextResponse.json(
      { error: 'rationale_required', detail: 'min 5 chars' },
      { status: 400 },
    );
  }
  if (rationale.length > 2000) {
    return NextResponse.json(
      { error: 'rationale_too_long', detail: 'max 2000 chars' },
      { status: 400 },
    );
  }

  const svc = getBackupServiceClient();

  // Verify the target exists. We do not block force-logout on status; even a
  // suspended user can have a stale session worth revoking.
  const { data: target, error: readErr } = await svc
    .from('client_profiles')
    .select('user_id, business_name, status, role')
    .eq('user_id', targetUserId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json(
      { error: 'lookup_failed', detail: readErr.message },
      { status: 500 },
    );
  }
  // We tolerate the target not having a client_profiles row (orphan auth.users)
  // and still attempt the revoke -- the auth.admin.signOut is the source of truth.

  // Revoke all sessions for the target user. signOut('global') invalidates
  // every refresh token, forcing a fresh login on next page load.
  try {
    const signOutResult = await (
      svc as unknown as {
        auth: {
          admin: {
            signOut: (userId: string, scope?: 'global' | 'local' | 'others') => Promise<{
              error: { message: string } | null;
            }>;
          };
        };
      }
    ).auth.admin.signOut(targetUserId, 'global');
    if (signOutResult.error) {
      Sentry.captureException(new Error(signOutResult.error.message), {
        tags: { route: 'admin/auth-sessions/force-logout', step: 'signOut' },
      });
      return NextResponse.json(
        { error: 'signout_failed', detail: signOutResult.error.message },
        { status: 500 },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Sentry.captureException(e, {
      tags: { route: 'admin/auth-sessions/force-logout', step: 'signOut_threw' },
    });
    return NextResponse.json(
      { error: 'signout_threw', detail: msg },
      { status: 500 },
    );
  }

  // Audit row -- post-hoc since this is direct (not proposal-routed).
  const auditPayload = {
    proposal_id: null,
    target_table: 'auth.users',
    target_id: targetUserId,
    before_jsonb: {
      action: 'force_logout',
      target_business_name: target?.business_name ?? null,
      target_status: target?.status ?? null,
      target_role: target?.role ?? null,
    },
    after_jsonb: {
      action: 'force_logout',
      rationale,
      actor_user_id: auth.userId,
      actor_email: auth.email,
      executed_at: new Date().toISOString(),
    },
    applied_by_function:
      'api/admin/auth-sessions/[user_id]/force-logout (POST)',
  };

  // override_audit.proposal_id is nullable in the live schema (any field this
  // route inserts via service-role bypasses NOT NULLs that were not declared).
  // If proposal_id is NOT NULL in your env, the insert errors and we surface it.
  const { data: auditRow, error: auditErr } = await svc
    .from('override_audit')
    .insert(auditPayload)
    .select('id')
    .maybeSingle();
  if (auditErr) {
    // The logout already happened; we cannot un-do it. Log loud and return ok
    // with a warning so the UI knows the audit row is missing.
    Sentry.captureException(auditErr, {
      tags: {
        route: 'admin/auth-sessions/force-logout',
        step: 'override_audit_insert',
      },
    });
    return NextResponse.json(
      {
        ok: true,
        warning: 'audit_insert_failed',
        detail: auditErr.message,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true, audit_id: auditRow?.id ?? null });
}
