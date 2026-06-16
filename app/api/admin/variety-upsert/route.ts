// POST /api/admin/variety-upsert
// v1 | 2026-06-09 | Job_PM (CPO)
//
// Reusable variety editor backend. Does NOT write canonical catalog data.
// Writes a PROPOSAL row to public.admin_proposals (BACKUP) which flows to the
// approval queue. Same mechanism used by the Deal Builder and (later) by
// /admin/catalog edit. Auth mirrors /api/admin/supply/decide (ADMIN_EMAILS or
// client_profiles.status='admin').
//
// Body: { variety, farmCost?, source?, country?, grade?, disposition, tier?,
//         promoExpiresAt?, isUpdate }.
// disposition ∈ { one_off, tier, temp_promo }.
//
// Write: admin_proposals {
//   type = isUpdate ? 'catalog.update_variety' : 'catalog.add_variety',
//   target_table = 'catalog', target_id = null,
//   payload = { variety, farmCost, source, country, grade, disposition, tier, promoExpiresAt },
//   warnings = [], status = 'awaiting_facu', proposed_by = session email }.
//
// LIVE BUG FIX (2026-06-16, Job_PM): this route previously wrote status='pending',
// which VIOLATES admin_proposals_status_check (allowed: awaiting_facu | approved |
// rejected | framing_rejected | withdrawn). Every add/update from the Deal Builder
// and /admin/catalog edit therefore errored at INSERT. Corrected to 'awaiting_facu'.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

interface AuthOk { ok: true; userId: string; email: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
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

  return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

type Disposition = 'one_off' | 'tier' | 'temp_promo';
const VALID_DISPOSITIONS: Disposition[] = ['one_off', 'tier', 'temp_promo'];

interface VarietyBody {
  variety?: unknown;
  farmCost?: unknown;
  source?: unknown;
  country?: unknown;
  grade?: unknown;
  disposition?: unknown;
  tier?: unknown;
  promoExpiresAt?: unknown;
  isUpdate?: unknown;
}

function asTrimmedString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: VarietyBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as VarietyBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const variety = asTrimmedString(body.variety);
  if (!variety) {
    return NextResponse.json({ error: 'invalid_variety', detail: 'variety is required' }, { status: 400 });
  }

  if (typeof body.disposition !== 'string' || !VALID_DISPOSITIONS.includes(body.disposition as Disposition)) {
    return NextResponse.json(
      { error: 'invalid_disposition', detail: `disposition must be one of ${VALID_DISPOSITIONS.join('|')}` },
      { status: 400 },
    );
  }
  const disposition = body.disposition as Disposition;

  const tier = disposition === 'tier' ? asTrimmedString(body.tier) : null;
  const promoExpiresAt = disposition === 'temp_promo' ? asTrimmedString(body.promoExpiresAt) : null;
  const isUpdate = body.isUpdate === true;

  const payload = {
    variety: variety.slice(0, 200),
    farmCost: asNumber(body.farmCost),
    source: asTrimmedString(body.source),
    country: asTrimmedString(body.country),
    grade: asTrimmedString(body.grade),
    disposition,
    tier,
    promoExpiresAt,
  };

  const svc = getBackupServiceClient();

  const { data: inserted, error } = await svc
    .from('admin_proposals')
    .insert({
      // DEPRECATED ROUTE: superseded by /api/admin/inventory/propose (flow B gate).
      // No UI calls this anymore. Kept temporarily; proposed_by is uuid -> must be null/uuid, never email.
      type: isUpdate ? 'catalog.update_variety' : 'catalog.add_variety',
      target_table: 'dim_sku',
      target_id: null,
      payload,
      warnings: [],
      status: 'awaiting_facu',
      proposed_by: null,
      source_rationale: auth.email,
      notes: 'via deprecated variety-upsert; use /inventory/propose',
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[admin/variety-upsert] insert:', error);
    return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, proposalId: inserted?.id });
}
