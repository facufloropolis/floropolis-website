// POST /api/admin/dispatch/[id]/label-upload
// v1 | 2026-05-19 | Job_PM Phase F [V8 SHADOW]
//
// multipart/form-data: { file: File (PDF) }
// Uploads the file to the private `dispatch-labels` storage bucket and stamps
// dispatches.label_url with the storage path. A signed URL is generated on
// demand by the dispatch page.
//
// Auth: admin (client_profiles.status='admin'); service-role writes storage.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const MAX_BYTES = 8 * 1024 * 1024; // 8MB hard cap
const BUCKET = 'dispatch-labels';

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

  // Verify dispatch -------------------------------------------------------
  const { data: dispatch, error: dispErr } = await adminClient
    .from('dispatches')
    .select('id, order_id')
    .eq('id', id)
    .maybeSingle();
  if (dispErr || !dispatch) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Parse form ------------------------------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_multipart' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'empty_file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file_too_large', detail: `> ${MAX_BYTES} bytes` }, { status: 413 });
  }
  // Accept application/pdf or octet-stream (some browsers do not set type for drag-drop).
  const ct = file.type || 'application/octet-stream';
  if (ct !== 'application/pdf' && ct !== 'application/octet-stream') {
    return NextResponse.json(
      { error: 'invalid_content_type', detail: `expected application/pdf, got ${ct}` },
      { status: 400 },
    );
  }

  // Sanitize filename: keep alnum/dot/dash/underscore, max 80 chars.
  const rawName = file.name || 'label.pdf';
  const safeName = rawName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  const ts = Date.now();
  const path = `${id}/${ts}_${safeName}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await adminClient.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: 'application/pdf', upsert: false });
  if (upErr) {
    Sentry.captureException(upErr, {
      tags: { route: 'admin/dispatch/label-upload', step: 'storage_upload' },
    });
    return NextResponse.json(
      { error: 'upload_failed', detail: upErr.message },
      { status: 500 },
    );
  }

  // Stamp dispatches.label_url with the storage path; UI will generate a
  // signed URL on demand. status transition is the admin's job via the
  // status route (this endpoint does not auto-advance).
  const { data: updated, error: updErr } = await adminClient
    .from('dispatches')
    .update({ label_url: path })
    .eq('id', id)
    .select('id, label_url')
    .maybeSingle();
  if (updErr) {
    Sentry.captureException(updErr, {
      tags: { route: 'admin/dispatch/label-upload', step: 'update_label_url' },
    });
    return NextResponse.json(
      { error: 'update_failed', detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ dispatch: updated, storage_path: path }, { status: 201 });
}
