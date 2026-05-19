// POST /api/admin/dispatch/sample-box
// v1 | 2026-05-19 | Job_PM Phase F [V8 SHADOW]
//
// Phase F stub for UC-O-189 "Insert Sample Box". The FULL backend (synthetic
// order + order_lines + dispatch row + customer_communications_log) is Phase G
// work because it crosses into order intake (D1 schema). For Phase F we:
//   1. Validate the prospect exists and is eligible.
//   2. Flip prospect.status='sent' and stamp last_sample_sent_at.
//   3. Log a dispatch_communications row (channel='phone_note', subject='Sample Box scheduled')
//      against an existing dispatch_id if provided (admin picks the day they want to insert it).
//
// Body: { prospect_id: uuid, dispatch_id?: uuid (optional; rolls into existing day) }
//
// Auth: admin (client_profiles.status='admin'); service-role does the writes.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

interface SampleBoxBody {
  prospect_id?: unknown;
  dispatch_id?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth
  const userClient = await createUserClient();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'admin') {
    return NextResponse.json({ error: 'not_admin' }, { status: 403 });
  }

  let body: SampleBoxBody;
  try {
    body = (await req.json()) as SampleBoxBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.prospect_id !== 'string' || body.prospect_id.length < 8) {
    return NextResponse.json(
      { error: 'invalid_prospect_id', detail: 'must be uuid string' },
      { status: 400 },
    );
  }
  const prospectId = body.prospect_id;

  const dispatchId =
    typeof body.dispatch_id === 'string' && body.dispatch_id.length > 8
      ? body.dispatch_id
      : null;

  // Look up prospect
  const { data: prospect, error: pErr } = await adminClient
    .from('sample_box_prospects')
    .select('id, business_name, status')
    .eq('id', prospectId)
    .maybeSingle();
  if (pErr || !prospect) {
    return NextResponse.json({ error: 'prospect_not_found' }, { status: 404 });
  }
  if (prospect.status === 'disqualified' || prospect.status === 'converted') {
    return NextResponse.json(
      { error: 'prospect_ineligible', detail: `status=${prospect.status}` },
      { status: 400 },
    );
  }

  // If a dispatch_id is given, verify it.
  if (dispatchId) {
    const { data: disp, error: dErr } = await adminClient
      .from('dispatches')
      .select('id')
      .eq('id', dispatchId)
      .maybeSingle();
    if (dErr || !disp) {
      return NextResponse.json({ error: 'dispatch_not_found' }, { status: 404 });
    }
  }

  const nowIso = new Date().toISOString();

  // Flip prospect status
  const { error: updErr } = await adminClient
    .from('sample_box_prospects')
    .update({
      status: 'sent',
      last_sample_sent_at: nowIso,
      last_dispatch_id: dispatchId,
    })
    .eq('id', prospectId);
  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { route: 'admin/dispatch/sample-box', step: 'update_prospect' },
    });
    return NextResponse.json(
      { error: 'update_failed', detail: updErr.message },
      { status: 500 },
    );
  }

  // Optionally log a phone-note comm against the dispatch
  let commId: string | null = null;
  if (dispatchId) {
    const { data: commRow, error: cErr } = await adminClient
      .from('dispatch_communications')
      .insert({
        dispatch_id: dispatchId,
        channel: 'phone_note',
        direction: 'outbound',
        subject: 'Sample box scheduled',
        body: `Sample box scheduled for prospect ${prospect.business_name} (${prospectId}).`,
        sent_by: user.id,
        notes: 'Phase F: synthetic order + order_lines + dispatch row are Phase G work.',
      })
      .select('id')
      .single();
    if (cErr) {
      Sentry.captureException(cErr, {
        tags: { route: 'admin/dispatch/sample-box', step: 'log_comm' },
      });
      // Non-fatal: prospect flip already happened.
    } else {
      commId = commRow?.id ?? null;
    }
  }

  return NextResponse.json(
    {
      prospect_id: prospectId,
      prospect_status: 'sent',
      dispatch_id: dispatchId,
      communication_id: commId,
      todo_phase_g: 'create synthetic order + order_lines + dispatch row for full UC-O-189',
    },
    { status: 201 },
  );
}
