// GET  /api/admin/samples/approved-boxes — list approved-pending boxes with editable fields.
// POST /api/admin/samples/approved-boxes — patch a box's editable fields into proposed_composition.
// v1 | 2026-06-10 | Job_PM (CPO)
//
// SOURCE: BACKUP public.sample_review_loop rows where status='aligned' OR facu_decision='yes'.
// Editable fields live in proposed_composition (jsonb):
//   box_type    — string (box family / legacy_box_type code)
//   contents    — array of { variety: string; stems: number }
//   ship_address — { street, city, state, zip }
//   notes       — free-text comment
//
// GET address fallback: if proposed_composition.ship_address is absent, parse
// PROD v_flora_cohort.description "CONFIRMED ADDRESS:" by zoho_id (anon read via
// getProdReadClient). addressSource reflects the provenance:
//   'edited'  — explicitly saved by JJ/Facu via POST
//   'parsed'  — from v_flora_cohort description (default, not yet confirmed)
//   'missing' — neither source has an address
//
// POST merges the patch into proposed_composition (preserving unrelated keys),
// sets updated_by + updated_at. Admin-guarded (mirrors create-box auth).
//
// NULL-safe: never 500. Returns { boxes: [], error } on any unexpected failure.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getProdReadClient } from '@/lib/supabase/prod-server';

// ---------------------------------------------------------------------------
// Admin auth (mirrors create-box)
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
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'auth_error' }, { status: 500 }) };
  }
}

// ---------------------------------------------------------------------------
// Address parser — mirrors labelsBuild.ts parseConfirmedAddress exactly.
// "CONFIRMED ADDRESS: <street>, <city>, <state>, <zip>"
// ---------------------------------------------------------------------------
function parseConfirmedAddress(
  description: string | null | undefined,
): { street: string; city: string; state: string; zip: string } | null {
  if (!description) return null;
  const marker = 'CONFIRMED ADDRESS:';
  const idx = description.indexOf(marker);
  if (idx === -1) return null;
  const raw = description.slice(idx + marker.length).trim();
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  if (parts.length === 2) return { street: '', city: parts[0], state: parts[1], zip: '' };
  if (parts.length === 3) return { street: parts[0], city: parts[1], state: parts[2], zip: '' };
  const zip = parts[parts.length - 1];
  const state = parts[parts.length - 2];
  const city = parts[parts.length - 3];
  const street = parts.slice(0, parts.length - 3).join(', ');
  return { street, city, state, zip };
}

// ---------------------------------------------------------------------------
// Shape returned by GET
// ---------------------------------------------------------------------------
export interface ApprovedBox {
  id: string;
  businessName: string;
  zohoId: string | null;
  floraScore: number | null;
  leadMasterId: number | null;
  boxType: string | null;
  contents: Array<{ variety: string; stems: number }>;
  ship: { street: string; city: string; state: string; zip: string } | null;
  notes: string;
  addressSource: 'edited' | 'parsed' | 'missing';
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    let svc;
    try { svc = getBackupServiceClient(); } catch {
      return NextResponse.json({ boxes: [], error: 'BACKUP client not configured' });
    }

    const { data: loopRaw, error: loopErr } = await svc
      .from('sample_review_loop')
      .select('id, business_name, lead_master_id, proposed_composition, facu_decision, status, updated_at')
      .or('status.eq.aligned,facu_decision.eq.yes')
      .order('updated_at', { ascending: false });

    if (loopErr) {
      return NextResponse.json({ boxes: [], error: 'loop_fetch_failed: ' + loopErr.message });
    }

    const loopRows = (loopRaw ?? []) as Array<Record<string, unknown>>;

    // Collect zoho_ids for PROD fallback address lookup
    const zohoIds: string[] = [];
    for (const row of loopRows) {
      const comp = row.proposed_composition && typeof row.proposed_composition === 'object' && !Array.isArray(row.proposed_composition)
        ? (row.proposed_composition as Record<string, unknown>) : null;
      const zid = comp && typeof comp.zoho_id === 'string' && comp.zoho_id.trim() ? comp.zoho_id.trim() : null;
      if (zid && !zohoIds.includes(zid)) zohoIds.push(zid);
    }

    // PROD v_flora_cohort for fallback addresses (anon read, best-effort)
    const cohortByZohoId: Record<string, string | null> = {};
    if (zohoIds.length > 0) {
      try {
        const prod = getProdReadClient();
        if (prod) {
          const { data: cohortRaw } = await prod
            .from('v_flora_cohort')
            .select('zoho_id, description')
            .in('zoho_id', zohoIds);
          for (const r of (cohortRaw ?? []) as Array<Record<string, unknown>>) {
            const zid = typeof r.zoho_id === 'string' ? r.zoho_id.trim() : null;
            if (zid) cohortByZohoId[zid] = typeof r.description === 'string' ? r.description : null;
          }
        }
      } catch {
        // best-effort; missing address will be marked 'missing'
      }
    }

    // Assemble boxes
    const boxes: ApprovedBox[] = [];
    for (const row of loopRows) {
      const comp = row.proposed_composition && typeof row.proposed_composition === 'object' && !Array.isArray(row.proposed_composition)
        ? (row.proposed_composition as Record<string, unknown>) : null;

      const zohoId = comp && typeof comp.zoho_id === 'string' && comp.zoho_id.trim() ? comp.zoho_id.trim() : null;
      const floraScore = comp && typeof comp.flora_score === 'number' ? comp.flora_score : null;
      const boxType = comp && typeof comp.box_type === 'string' && comp.box_type.trim() ? comp.box_type.trim() : null;

      // Contents: array of { variety, stems }
      let contents: Array<{ variety: string; stems: number }> = [];
      if (comp && Array.isArray(comp.contents)) {
        for (const item of comp.contents as unknown[]) {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            const it = item as Record<string, unknown>;
            const variety = typeof it.variety === 'string' ? it.variety.trim() : null;
            const stems = typeof it.stems === 'number' && Number.isFinite(it.stems) ? it.stems
              : typeof it.stems === 'string' && Number.isFinite(Number(it.stems)) ? Number(it.stems) : null;
            if (variety && stems != null && stems > 0) contents.push({ variety, stems });
          }
        }
      }

      // Address: prefer edited ship_address, then parse from cohort
      let ship: ApprovedBox['ship'] = null;
      let addressSource: ApprovedBox['addressSource'] = 'missing';

      const editedShip = comp && comp.ship_address && typeof comp.ship_address === 'object' && !Array.isArray(comp.ship_address)
        ? (comp.ship_address as Record<string, unknown>) : null;

      if (editedShip) {
        const street = typeof editedShip.street === 'string' ? editedShip.street.trim() : '';
        const city = typeof editedShip.city === 'string' ? editedShip.city.trim() : '';
        const state = typeof editedShip.state === 'string' ? editedShip.state.trim() : '';
        const zip = typeof editedShip.zip === 'string' ? editedShip.zip.trim() : '';
        ship = { street, city, state, zip };
        addressSource = 'edited';
      } else if (zohoId && cohortByZohoId[zohoId] !== undefined) {
        const parsed = parseConfirmedAddress(cohortByZohoId[zohoId]);
        if (parsed) {
          ship = parsed;
          addressSource = 'parsed';
        }
      }

      const notes = comp && typeof comp.notes === 'string' ? comp.notes : '';

      boxes.push({
        id: String(row.id),
        businessName: typeof row.business_name === 'string' ? row.business_name.trim() : '',
        zohoId,
        floraScore,
        leadMasterId: typeof row.lead_master_id === 'number' ? row.lead_master_id : null,
        boxType,
        contents,
        ship,
        notes,
        addressSource,
      });
    }

    return NextResponse.json({ boxes, error: null });
  } catch (err) {
    console.error('[approved-boxes GET] unexpected:', err);
    return NextResponse.json({ boxes: [], error: 'internal_error' });
  }
}

// ---------------------------------------------------------------------------
// POST — patch editable fields into proposed_composition
// ---------------------------------------------------------------------------
interface PatchBody {
  id?: unknown;
  patch?: {
    boxType?: unknown;
    contents?: unknown;
    ship?: unknown;
    notes?: unknown;
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    let body: PatchBody = {};
    try {
      const raw = await req.text();
      if (raw.length > 0) body = JSON.parse(raw) as PatchBody;
    } catch {
      return NextResponse.json({ error: 'bad_json' }, { status: 400 });
    }

    const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null;
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

    const patch = body.patch && typeof body.patch === 'object' && !Array.isArray(body.patch)
      ? body.patch : null;
    if (!patch) return NextResponse.json({ error: 'missing_patch' }, { status: 400 });

    let svc;
    try { svc = getBackupServiceClient(); } catch {
      return NextResponse.json({ error: 'BACKUP client not configured' }, { status: 500 });
    }

    // Fetch the current row to merge into proposed_composition
    const { data: existing, error: findErr } = await svc
      .from('sample_review_loop')
      .select('id, proposed_composition')
      .eq('id', id)
      .maybeSingle();
    if (findErr) return NextResponse.json({ error: 'find_failed: ' + findErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const prevComp = existing.proposed_composition && typeof existing.proposed_composition === 'object' && !Array.isArray(existing.proposed_composition)
      ? (existing.proposed_composition as Record<string, unknown>) : {};

    // Build merged composition — preserve all existing keys, only update provided ones
    const merged: Record<string, unknown> = { ...prevComp };

    if (typeof patch.boxType === 'string') {
      merged.box_type = patch.boxType.trim() || null;
    }

    if (Array.isArray(patch.contents)) {
      // Validate each item: { variety: string, stems: number }
      const validContents: Array<{ variety: string; stems: number }> = [];
      for (const item of patch.contents) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const it = item as Record<string, unknown>;
          const variety = typeof it.variety === 'string' ? it.variety.trim() : null;
          const stems = typeof it.stems === 'number' && Number.isFinite(it.stems) && it.stems > 0 ? it.stems
            : typeof it.stems === 'string' && Number.isFinite(Number(it.stems)) && Number(it.stems) > 0 ? Number(it.stems) : null;
          if (variety && stems != null) validContents.push({ variety, stems });
        }
      }
      merged.contents = validContents;
    }

    if (patch.ship && typeof patch.ship === 'object' && !Array.isArray(patch.ship)) {
      const s = patch.ship as Record<string, unknown>;
      merged.ship_address = {
        street: typeof s.street === 'string' ? s.street.trim() : '',
        city: typeof s.city === 'string' ? s.city.trim() : '',
        state: typeof s.state === 'string' ? s.state.trim() : '',
        zip: typeof s.zip === 'string' ? s.zip.trim() : '',
      };
    }

    if (typeof patch.notes === 'string') {
      merged.notes = patch.notes.slice(0, 2000); // hard cap
    }

    const nowIso = new Date().toISOString();
    const { error: updErr } = await svc
      .from('sample_review_loop')
      .update({
        proposed_composition: merged,
        updated_by: auth.email,
        updated_at: nowIso,
      })
      .eq('id', id);

    if (updErr) {
      return NextResponse.json({ error: 'update_failed: ' + updErr.message }, { status: 500 });
    }

    // Return the updated box shape for optimistic UI refresh
    const box: Partial<ApprovedBox> = {
      id,
      boxType: typeof merged.box_type === 'string' ? merged.box_type : null,
      contents: Array.isArray(merged.contents) ? (merged.contents as Array<{ variety: string; stems: number }>) : [],
      notes: typeof merged.notes === 'string' ? merged.notes : '',
    };
    if (merged.ship_address && typeof merged.ship_address === 'object' && !Array.isArray(merged.ship_address)) {
      const sa = merged.ship_address as Record<string, unknown>;
      box.ship = {
        street: typeof sa.street === 'string' ? sa.street : '',
        city: typeof sa.city === 'string' ? sa.city : '',
        state: typeof sa.state === 'string' ? sa.state : '',
        zip: typeof sa.zip === 'string' ? sa.zip : '',
      };
      box.addressSource = 'edited';
    }

    return NextResponse.json({ ok: true, box });
  } catch (err) {
    console.error('[approved-boxes POST] unexpected:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
