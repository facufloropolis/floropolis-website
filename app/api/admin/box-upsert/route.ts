// POST /api/admin/box-upsert
// v1 | 2026-06-09 | Job_PM (CPO)
//
// Reusable box editor backend. Does NOT write canonical box_master data.
// Writes a PROPOSAL row to public.admin_proposals (BACKUP) which flows to the
// approval queue. Same mechanism used by the Deal Builder and (later) by the
// boxes config screen. Auth mirrors /api/admin/supply/decide.
//
// Body: { boxType, lengthCm, widthCm, heightCm, capacity, capacityUnit,
//         country?, realKg?, availableToOthers?, isUpdate }.
//
// The FedEx estimate is recomputed server-side (never trusts the client) and
// embedded in the payload.
//
// Write: admin_proposals {
//   type = isUpdate ? 'box_master.update_capacity' : 'box_master.create',
//   target_table = 'box_master_mirror', target_id = null,
//   payload = { boxType, dims:{lengthCm,widthCm,heightCm}, capacity, capacityUnit,
//               country, realKg, availableToOthers, estimate },
//   warnings = [], status = 'awaiting_facu', proposed_by = null }.
//
// LIVE BUG FIX (2026-06-16, Job_PM): previously wrote status='pending' (VIOLATES
// admin_proposals_status_check: awaiting_facu|approved|rejected|framing_rejected|withdrawn)
// and proposed_by = session email (admin_proposals.proposed_by is a uuid column → type error).
// Both broke the Deal Builder box-add INSERT. Corrected to status='awaiting_facu' and
// proposed_by=null, with the actor email carried in source_rationale (mirrors variety-upsert).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { estimateBoxCost } from '@/lib/deal/fedex-estimate';

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

interface BoxBody {
  boxType?: unknown;
  lengthCm?: unknown;
  widthCm?: unknown;
  heightCm?: unknown;
  capacity?: unknown;
  capacityUnit?: unknown;
  country?: unknown;
  realKg?: unknown;
  availableToOthers?: unknown;
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

  let body: BoxBody = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw) as BoxBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const boxType = asTrimmedString(body.boxType);
  if (!boxType) {
    return NextResponse.json({ error: 'invalid_box_type', detail: 'boxType is required' }, { status: 400 });
  }

  const lengthCm = asNumber(body.lengthCm);
  const widthCm = asNumber(body.widthCm);
  const heightCm = asNumber(body.heightCm);
  if (lengthCm === null || widthCm === null || heightCm === null) {
    return NextResponse.json(
      { error: 'invalid_dims', detail: 'lengthCm, widthCm, heightCm must be numeric' },
      { status: 400 },
    );
  }

  const capacity = asNumber(body.capacity) ?? 0;
  const realKg = asNumber(body.realKg) ?? undefined;
  const capacityUnit = asTrimmedString(body.capacityUnit) ?? 'stems';
  const country = asTrimmedString(body.country);
  const availableToOthers = body.availableToOthers === true;
  const isUpdate = body.isUpdate === true;

  // Recompute the estimate server-side — never trust the client's numbers.
  const estimate = estimateBoxCost({ lengthCm, widthCm, heightCm, realKg, capacity });

  const payload = {
    boxType: boxType.slice(0, 200),
    dims: { lengthCm, widthCm, heightCm },
    capacity,
    capacityUnit,
    country,
    realKg: realKg ?? null,
    availableToOthers,
    estimate,
  };

  const svc = getBackupServiceClient();

  const { data: inserted, error } = await svc
    .from('admin_proposals')
    .insert({
      type: isUpdate ? 'box_master.update_capacity' : 'box_master.create',
      target_table: 'box_master_mirror',
      target_id: null,
      payload,
      warnings: [],
      status: 'awaiting_facu',
      proposed_by: null,
      source_rationale: auth.email,
      notes: null,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[admin/box-upsert] insert:', error);
    return NextResponse.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, proposalId: inserted?.id, estimate });
}
