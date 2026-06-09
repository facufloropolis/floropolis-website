// POST /api/admin/samples/create-box
// v1 | 2026-06-09 | Job_PM (CPO)
//
// The "Aprobar -> crear caja" step of the Samples FLORA cohort. Fired RIGHT AFTER
// /api/admin/samples/decide approves an account (decision 'yes'). It does TWO things,
// both HONEST about who owns what:
//
//   (a) RECORDS the create-box INTENT in BACKUP (Job-owned) public.sample_review_loop:
//       transitions the open loop row for this account to status 'aligned' and stashes a
//       create-box marker in proposed_composition (jsonb — REAL column; no fabricated cols),
//       plus appends a sample_review_event transition note. This is the durable Job record.
//
//   (b) ROUTES the ACTUAL create-box to Atlas. sample_box_status is a PROD (Rose) table and
//       Job is HARD READ-ONLY on PROD business tables, so Job NEVER writes sample_box_status.
//       Instead it inserts a request row into PROD meta.agent_inbox addressed to
//       Atlas_Actuator (R on domain 'external_write_governance' — verified in meta.agent_raci).
//       Atlas is the actuator that performs the external/PROD write.
//
// Returns { ok, routed, reason }. routed=true when the Atlas request landed in
// meta.agent_inbox (reason 'routed'). routed=false (still ok=true) degrades honestly with a
// DISCRIMINATED reason: 'prod_not_configured' (PROD env missing) vs 'route_failed' (PROD
// reachable but the insert errored — RLS/permission/transient). The UI surfaces the real
// reason instead of presuming "not configured". The BACKUP intent is always captured and the
// UI can re-run. Job does NOT write PROD sample_box_status; it captures the intent + routes
// the write. No shortcuts.
//
// EXACT JOIN: the caller passes leadMasterId (the synthetic decideKey the decide route keyed
// sample_review_loop.lead_master_id by). When present we attach the create-box marker to that
// EXACT row, so two accounts sharing a business_name can never cross-attach. Falls back to a
// business_name match only when no decideKey is provided.
//
// NULL-SAFETY: the PROD client may be null (env missing) -> we skip routing and return
// routed=false, never throw. The BACKUP client is required for the loop record.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getProdReadClient } from '@/lib/supabase/prod-server';

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

interface CreateBoxBody {
  accountName?: unknown;
  floraScore?: unknown;
  zohoId?: unknown;
  // The synthetic decide key the decide route used to key sample_review_loop.lead_master_id.
  // Optional (degrades to business_name match) but, when present, gives an EXACT join.
  leadMasterId?: unknown;
}

// Discriminated routing outcome. routed=true when the Atlas request row landed. When false,
// reason distinguishes a real, recoverable failure from a missing-env degrade so the UI does
// NOT presumptively report "PROD no configurado" for an RLS/permission/transient error.
//   - 'routed'              -> landed in meta.agent_inbox (routed=true)
//   - 'prod_not_configured' -> PROD client null (env missing): honest degrade
//   - 'route_failed'        -> PROD reachable but the insert errored/threw: real failure
type RouteReason = 'routed' | 'prod_not_configured' | 'route_failed';
interface RouteResult { routed: boolean; reason: RouteReason }

// Route the PROD sample_box_status write to Atlas via PROD meta.agent_inbox.
// Never throws (NULL-safe): a missing/unconfigured PROD client or any insert error degrades
// to routed=false (with a discriminated reason) so the caller still returns ok:true.
async function routeToAtlas(
  accountName: string,
  floraScore: number | null,
  zohoId: string | null,
): Promise<RouteResult> {
  try {
    const prod = getProdReadClient();
    if (!prod) return { routed: false, reason: 'prod_not_configured' }; // env missing -> degrade.

    const scoreLine = floraScore != null ? String(floraScore) : '--';
    const zohoLine = zohoId && zohoId.trim() ? zohoId.trim() : '--';
    const body =
      `Job aprobo (FLORA) la cuenta "${accountName}". Solicito crear el sample_box_status (PROD) ` +
      `para esta cuenta. Job es READ-ONLY en PROD y NO escribe sample_box_status: rutea el write a Atlas.\n` +
      `account_name: ${accountName}\n` +
      `flora_score: ${scoreLine}\n` +
      `zoho_id: ${zohoLine}\n` +
      `Origen: /api/admin/samples/create-box (Samples FLORA cohort).`;

    const { error } = await prod
      .schema('meta')
      .from('agent_inbox')
      .insert({
        from_agent: 'job_pm',
        to_agent: 'Atlas_Actuator',
        domain: 'external_write_governance',
        to_domain: 'external_write_governance',
        priority: 'P1',
        subject: `Samples create-box: crear sample_box_status (PROD) para "${accountName}" (aprobado FLORA)`,
        body,
      });
    if (error) {
      // PROD WAS reachable but the insert failed (RLS/permission/transient). This is NOT a
      // missing-env case: report 'route_failed' so the UI does not say "no configurado".
      console.error('[admin/samples/create-box] route-to-atlas:', error);
      return { routed: false, reason: 'route_failed' };
    }
    return { routed: true, reason: 'routed' };
  } catch (err) {
    console.error('[admin/samples/create-box] route-to-atlas threw:', err);
    return { routed: false, reason: 'route_failed' };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    let body: CreateBoxBody = {};
    try {
      const raw = await req.text();
      if (raw.length > 0) body = JSON.parse(raw) as CreateBoxBody;
    } catch {
      return NextResponse.json({ error: 'bad_json' }, { status: 400 });
    }

    const accountName =
      typeof body.accountName === 'string' && body.accountName.trim().length > 0
        ? body.accountName.trim().slice(0, 300)
        : null;
    if (!accountName) {
      return NextResponse.json({ error: 'invalid_accountName' }, { status: 400 });
    }

    // floraScore is REAL-or-null: never coerce a missing value into a number.
    const floraScore =
      typeof body.floraScore === 'number' && Number.isFinite(body.floraScore)
        ? body.floraScore
        : typeof body.floraScore === 'string' &&
          body.floraScore.trim() !== '' &&
          Number.isFinite(Number(body.floraScore))
        ? Number(body.floraScore)
        : null;

    const zohoId =
      typeof body.zohoId === 'string' && body.zohoId.trim().length > 0
        ? body.zohoId.trim().slice(0, 200)
        : null;

    // leadMasterId = the synthetic decideKey the decide route used to key
    // sample_review_loop.lead_master_id. When present, we join on it EXACTLY (decide and
    // create-box agree on the row even if two accounts share a business_name). REAL-or-null:
    // never coerce a missing value into a number.
    const leadMasterId =
      typeof body.leadMasterId === 'number' && Number.isFinite(body.leadMasterId)
        ? body.leadMasterId
        : typeof body.leadMasterId === 'string' &&
          body.leadMasterId.trim() !== '' &&
          Number.isFinite(Number(body.leadMasterId))
        ? Number(body.leadMasterId)
        : null;

    const svc = getBackupServiceClient();
    const nowIso = new Date().toISOString();
    const actor = auth.email || 'facu';

    // (a) Record the create-box INTENT in the Job-owned BACKUP loop. Find the open loop row
    // decide just wrote. Prefer an EXACT match on lead_master_id (the decideKey decide keyed
    // by); fall back to business_name only when no decideKey was passed. Most recent first.
    let findQuery = svc
      .from('sample_review_loop')
      .select('id, status, proposed_composition');
    findQuery =
      leadMasterId !== null
        ? findQuery.eq('lead_master_id', leadMasterId)
        : findQuery.eq('business_name', accountName);
    const { data: existing, error: findErr } = await findQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findErr) {
      console.error('[admin/samples/create-box] find:', findErr);
      return NextResponse.json({ error: 'find_failed', detail: findErr.message }, { status: 500 });
    }

    // Create-box marker stashed in the REAL proposed_composition jsonb column (no fabricated
    // column). Preserve any existing composition payload, add the create-box request flag.
    const prevComp =
      existing && existing.proposed_composition && typeof existing.proposed_composition === 'object'
        ? (existing.proposed_composition as Record<string, unknown>)
        : {};
    const composition: Record<string, unknown> = {
      ...prevComp,
      create_box_requested: true,
      create_box_requested_at: nowIso,
      create_box_requested_by: actor,
      flora_score: floraScore,
      zoho_id: zohoId,
    };

    let loopId: string;
    let fromStatus: string | null = null;

    if (existing) {
      loopId = existing.id as string;
      fromStatus = (existing.status as string | null) ?? null;
      const { error: updErr } = await svc
        .from('sample_review_loop')
        .update({
          status: 'aligned',
          proposed_composition: composition,
          updated_by: actor,
          updated_at: nowIso,
        })
        .eq('id', loopId);
      if (updErr) {
        console.error('[admin/samples/create-box] update:', updErr);
        return NextResponse.json({ error: 'update_failed', detail: updErr.message }, { status: 500 });
      }
    } else {
      // No prior loop row (decide should have created one, but degrade gracefully): insert one
      // already in the 'aligned' state with the create-box marker.
      const insertRow: Record<string, unknown> = {
        business_name: accountName,
        cohort_date: nowIso.slice(0, 10),
        status: 'aligned',
        facu_decision: 'yes',
        proposed_composition: composition,
        updated_by: actor,
        updated_at: nowIso,
      };
      // Persist the decideKey so this row matches the same key decide keys by (exact join).
      if (leadMasterId !== null) insertRow.lead_master_id = leadMasterId;
      const { data: insertedLoop, error: insErr } = await svc
        .from('sample_review_loop')
        .insert(insertRow)
        .select('id')
        .maybeSingle();
      if (insErr || !insertedLoop) {
        console.error('[admin/samples/create-box] insert loop:', insErr);
        return NextResponse.json({ error: 'insert_failed', detail: insErr?.message ?? 'no row' }, { status: 500 });
      }
      loopId = insertedLoop.id as string;
      fromStatus = null;
    }

    // (b) Route the actual PROD create-box to Atlas. NULL-safe: degrades to routed=false
    // with a discriminated reason.
    const route = await routeToAtlas(accountName, floraScore, zohoId);

    // Honest event note keyed off the REAL reason (env-missing vs route-failed), not inferred.
    const eventNote = route.routed
      ? 'create_box_requested — ruteado a Atlas (meta.agent_inbox / external_write_governance)'
      : route.reason === 'prod_not_configured'
      ? 'create_box_requested — intent capturado en BACKUP; ruteo a Atlas pendiente (PROD no configurado)'
      : 'create_box_requested — intent capturado en BACKUP; ruteo a Atlas FALLO (reintentar)';

    // Append the transition event (durable Job record of the create-box request).
    // REAL actor: the authenticated admin (JJ admins can approve too), not a hardcoded 'facu'.
    const { error: evtErr } = await svc.from('sample_review_event').insert({
      loop_id: loopId,
      from_status: fromStatus,
      to_status: 'aligned',
      actor,
      note: eventNote,
    });
    if (evtErr) {
      console.error('[admin/samples/create-box] event:', evtErr);
      return NextResponse.json({ error: 'event_failed', detail: evtErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, routed: route.routed, reason: route.reason, loopId });
  } catch (err) {
    console.error('[admin/samples/create-box] unexpected:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
