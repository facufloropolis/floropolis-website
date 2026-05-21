// PATCH /api/admin/vendors/[name] — upsert admin_notes for a vendor profile.
// v1 | 2026-05-21 | Job_PM [V8 SHADOW]

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const supabase = await createBackupServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
  if (!isAdmin) {
    const svc = getBackupServiceClient();
    const { data: profile } = await svc
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile?.status === 'admin') isAdmin = true;
  }
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { name } = await params;
  const vendorName = decodeURIComponent(name);
  const body = await req.json();
  const admin_notes: string = typeof body.admin_notes === 'string' ? body.admin_notes : '';

  const svc = getBackupServiceClient();
  const { error } = await svc
    .from('vendor_profiles')
    .upsert(
      {
        vendor_name: vendorName,
        admin_notes,
        updated_at: new Date().toISOString(),
        updated_by: user.email,
      },
      { onConflict: 'vendor_name' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
