// POST /api/admin/dispatch/[id]/communication
// v1 | 2026-05-19 | Job_PM Phase F [V8 SHADOW]
//
// Logs a dispatch_communications row tied to one dispatch. Phase F is a STUB:
// for channel='email' we WRITE the row but DO NOT send the message - Phase G
// will wire Brevo (auto Brevo intentionally skipped per CEO).
//
// Body:
//   { channel: 'email'|'whatsapp'|'phone_note',
//     direction: 'outbound'|'inbound',
//     subject?: string, body?: string, recipient?: string,
//     notes?: string, external_message_id?: string }
//
// Auth: admin (client_profiles.status='admin'); service-role writes the row.
// Returns the inserted comm row.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

type Channel = 'email' | 'whatsapp' | 'phone_note';
type Direction = 'outbound' | 'inbound';

const CHANNELS: Channel[] = ['email', 'whatsapp', 'phone_note'];
const DIRECTIONS: Direction[] = ['outbound', 'inbound'];

interface CommBody {
  channel?: unknown;
  direction?: unknown;
  subject?: unknown;
  body?: unknown;
  recipient?: unknown;
  notes?: unknown;
  external_message_id?: unknown;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Auth -------------------------------------------------------------------
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

  // Body -------------------------------------------------------------------
  let body: CommBody;
  try {
    body = (await req.json()) as CommBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.channel !== 'string' || !CHANNELS.includes(body.channel as Channel)) {
    return NextResponse.json(
      { error: 'invalid_channel', detail: `must be one of: ${CHANNELS.join(', ')}` },
      { status: 400 },
    );
  }
  if (typeof body.direction !== 'string' || !DIRECTIONS.includes(body.direction as Direction)) {
    return NextResponse.json(
      { error: 'invalid_direction', detail: `must be one of: ${DIRECTIONS.join(', ')}` },
      { status: 400 },
    );
  }

  const channel = body.channel as Channel;
  const direction = body.direction as Direction;

  const asStr = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length ? t : null;
  };

  const subject = asStr(body.subject);
  const bodyText = asStr(body.body);
  const recipient = asStr(body.recipient);
  const notes = asStr(body.notes);
  const externalMessageId = asStr(body.external_message_id);

  // Phone notes must have body or notes content; emails should have subject.
  if (channel === 'phone_note' && !bodyText && !notes) {
    return NextResponse.json(
      { error: 'missing_content', detail: 'phone_note requires body or notes' },
      { status: 400 },
    );
  }
  if (channel === 'email' && direction === 'outbound' && !subject) {
    return NextResponse.json(
      { error: 'missing_subject', detail: 'outbound email requires subject' },
      { status: 400 },
    );
  }

  // Verify dispatch exists ------------------------------------------------
  const { data: dispatch, error: dispErr } = await adminClient
    .from('dispatches')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (dispErr || !dispatch) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Insert row -----------------------------------------------------------
  // NOTE: Phase F deliberately does NOT call any external API. For email,
  // Phase G will wire Brevo; we only persist the intent here so the UI can
  // show the log + render "Sent (logged - Phase G send pending)".
  const { data: inserted, error: insErr } = await adminClient
    .from('dispatch_communications')
    .insert({
      dispatch_id: id,
      channel,
      direction,
      subject,
      body: bodyText,
      recipient,
      sent_by: user.id,
      notes,
      external_message_id: externalMessageId,
    })
    .select('*')
    .single();
  if (insErr) {
    Sentry.captureException(insErr, {
      tags: { route: 'admin/dispatch/communication', step: 'insert' },
    });
    return NextResponse.json(
      { error: 'insert_failed', detail: insErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ communication: inserted, send_status: 'stub_logged_only' }, { status: 201 });
}
