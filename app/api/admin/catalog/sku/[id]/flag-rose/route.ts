// POST /api/admin/catalog/sku/[id]/flag-rose
// v1 | 2026-05-21 | Job_PM [V8 SHADOW]
//
// Body: { reason_code: string, context_note?: string }
//
// Inserts a row into rose_queue so Rose can see and action the flag.
// reason_code maps to a gate_id (e.g. "cost_unverified", "missing_image").
//
// reason_text is constructed server-side and includes:
//   - gate label + gate_id
//   - SKU name, vendor, tier, id
//   - admin-typed context_note (what Facu said)
//   - context snapshot of key mirror fields relevant to the gate
//   - flagged_by (authenticated admin email)
//   - flagged_at (server timestamp)
//
// Dedup: if an open row with the same sku_id + reason_code already exists,
// returns { status: 'duplicate', existing_id } without inserting.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { GATE_LABELS } from '@/lib/catalog-gates';

interface FlagBody {
  reason_code?: unknown;
  context_note?: unknown;
}

interface MirrorSnapshot {
  name: string | null;
  vendor: string | null;
  tier: string | null;
  price: number | string | null;
  farm_cost: number | string | null;
  cost_source: string | null;
  cost_verified_at: string | null;
  arrival_date: string | null;
  box_type: string | null;
  units_per_box: number | string | null;
  margin_status: string | null;
}

function buildReasonText(
  gateId: string,
  gateDisplayLabel: string,
  skuId: number,
  snapshot: MirrorSnapshot | null,
  contextNote: string,
  flaggedBy: string,
  flaggedAt: string,
): string {
  const lines: string[] = [];
  lines.push(`Gate: ${gateId} — "${gateDisplayLabel}"`);

  if (snapshot) {
    const name = snapshot.name ?? '(unnamed)';
    const vendor = snapshot.vendor ?? '(no vendor)';
    const tier = snapshot.tier ?? '—';
    lines.push(`SKU: ${name} (#${skuId}) | Vendor: ${vendor} | Tier: ${tier}`);
  } else {
    lines.push(`SKU: #${skuId} (mirror row not found)`);
  }

  if (contextNote) {
    lines.push(`Admin note: "${contextNote}"`);
  }

  if (snapshot) {
    const ctx: string[] = [];
    if (snapshot.price != null) ctx.push(`price: $${Number(snapshot.price).toFixed(2)}`);
    if (snapshot.farm_cost != null) ctx.push(`farm_cost: $${Number(snapshot.farm_cost).toFixed(4)}`);
    if (snapshot.cost_source) ctx.push(`cost_source: ${snapshot.cost_source}`);
    if (snapshot.cost_verified_at) {
      const daysAgo = Math.round((Date.now() - new Date(snapshot.cost_verified_at).getTime()) / 86400000);
      ctx.push(`cost_verified_at: ${snapshot.cost_verified_at.slice(0, 10)} (${daysAgo}d ago)`);
    } else {
      ctx.push('cost_verified_at: never');
    }
    if (snapshot.arrival_date) ctx.push(`arrival_date: ${snapshot.arrival_date}`);
    if (snapshot.box_type) ctx.push(`box_type: ${snapshot.box_type}`);
    if (snapshot.margin_status) ctx.push(`margin_status: ${snapshot.margin_status}`);
    if (ctx.length > 0) lines.push(`Context: ${ctx.join(' | ')}`);
  }

  lines.push(`Flagged by: ${flaggedBy}`);
  lines.push(`Flagged at: ${flaggedAt}`);
  return lines.join('\n');
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  // Params -----------------------------------------------------------------
  const { id } = await ctx.params;
  const skuId = Number.parseInt(id, 10);
  if (!Number.isFinite(skuId) || skuId <= 0) {
    return NextResponse.json({ error: 'invalid_sku_id' }, { status: 400 });
  }

  // Body -------------------------------------------------------------------
  let body: FlagBody;
  try {
    body = (await req.json()) as FlagBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (typeof body.reason_code !== 'string' || !body.reason_code.trim()) {
    return NextResponse.json({ error: 'reason_code required' }, { status: 400 });
  }
  const reasonCode = body.reason_code.trim().slice(0, 120);
  const contextNote =
    typeof body.context_note === 'string' ? body.context_note.trim().slice(0, 500) : '';

  // Dedup ------------------------------------------------------------------
  const { data: existing } = await adminClient
    .from('rose_queue')
    .select('id')
    .eq('sku_id', String(skuId))
    .eq('reason_code', reasonCode)
    .eq('status', 'open')
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ status: 'duplicate', existing_id: existing.id });
  }

  // Context snapshot -------------------------------------------------------
  const { data: mirrorRaw } = await adminClient
    .from('floropolis_inventory_mirror')
    .select('name, vendor, tier, price, farm_cost, cost_source, cost_verified_at, arrival_date, box_type, units_per_box, margin_status')
    .eq('id', skuId)
    .maybeSingle();
  const snapshot = mirrorRaw as MirrorSnapshot | null;

  // Build rich reason_text -------------------------------------------------
  const gateLabel = GATE_LABELS[reasonCode] ?? reasonCode;
  const flaggedBy = user.email ?? user.id;
  const flaggedAt = new Date().toISOString();
  const reasonText = buildReasonText(
    reasonCode,
    gateLabel,
    skuId,
    snapshot,
    contextNote,
    flaggedBy,
    flaggedAt,
  );

  // Insert -----------------------------------------------------------------
  const { data: inserted, error: insertErr } = await adminClient
    .from('rose_queue')
    .insert({
      sku_id: String(skuId),
      reason_code: reasonCode,
      reason_text: reasonText,
      flagged_by: flaggedBy,
      status: 'open',
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    console.error('[flag-rose] insert error:', insertErr);
    return NextResponse.json(
      { error: 'insert_failed', detail: insertErr?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ status: 'inserted', id: inserted.id });
}
