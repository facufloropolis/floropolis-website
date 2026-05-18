// GET /api/account/last-address?kind=shipping|billing — most recent address for user
// v1 | 2026-05-18 | Job_PM CHK-POLISH [V8 SHADOW]
//
// Why: /checkout wants to prefill the shipping form for returning users so they
// don't retype their last delivery address. Pulls the most recent row from
// addresses for the authenticated user, filtered by `kind`.
//
// Auth: REQUIRED. Resolves auth.uid() from the BACKUP session client. Service-role
// is only used for the read AFTER the user id is confirmed (Facu's pattern: gate
// before bypassing RLS).
//
// Response shapes:
//   200 OK  -> { address: { recipient_name, business_name, phone, line1, line2,
//                           city, state, postal_code, country } }
//   404     -> { error: "no_address" }   (no prior address of that kind)
//   401     -> { error: "unauthenticated" }
//   400     -> { error: "invalid_kind" } (kind not in shipping|billing|both)
//
// We deliberately DO NOT return id — the page treats this as a snapshot to seed
// the form, not a "use this row" pointer. New inline addresses go through the
// existing /api/checkout/session insertAddress path.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

type AddressKind = 'shipping' | 'billing' | 'both';
const VALID_KINDS: AddressKind[] = ['shipping', 'billing', 'both'];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const kindParam = (req.nextUrl.searchParams.get('kind') ?? 'shipping') as AddressKind;
  if (!VALID_KINDS.includes(kindParam)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }

  // ---- 1. Auth gate (user-context) ----
  let userId: string;
  try {
    const userClient = await createBackupServerClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    userId = user.id;
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'account/last-address', step: 'auth' } });
    return NextResponse.json({ error: 'auth_failed' }, { status: 500 });
  }

  // ---- 2. Read most-recent address (service-role, but gated on userId) ----
  try {
    const backup = getBackupServiceClient();
    // Match the requested kind OR 'both'. Order by created_at desc to get the
    // freshest one — this is what the user most likely wants pre-filled.
    const kinds: AddressKind[] = kindParam === 'both'
      ? ['both']
      : [kindParam, 'both'];
    const { data, error } = await backup
      .from('addresses')
      .select('recipient_name,business_name,phone,line1,line2,city,state,postal_code,country')
      .eq('user_id', userId)
      .in('kind', kinds)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      Sentry.captureException(error, { tags: { route: 'account/last-address', step: 'fetch' } });
      return NextResponse.json({ error: 'fetch_failed' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'no_address' }, { status: 404 });
    }
    return NextResponse.json({
      address: {
        recipient_name: data.recipient_name ?? '',
        business_name: data.business_name ?? '',
        phone: data.phone ?? '',
        line1: data.line1 ?? '',
        line2: data.line2 ?? '',
        city: data.city ?? '',
        state: data.state ?? '',
        postal_code: data.postal_code ?? '',
        country: data.country ?? 'US',
      },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'account/last-address', step: 'handler' } });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
