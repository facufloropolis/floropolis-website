// POST /api/orders/confirm-address — invisible DB landing for the n8n confirm workflow.
// v1 | 2026-06-06 | Job_PM | SPEC #2 sample_intake_endpoint (revised section 2)
//
// THE LAW: website events land in OUR DB first. The florist-facing n8n confirm
// experience is UNCHANGED; this endpoint is the system-of-record write that the
// n8n HTTP step calls so the address confirmation becomes a real order state.
//
// Auth: header `x-floropolis-secret` must equal process.env.FLOROPOLIS_CONFIRM_SECRET.
//   - env var missing            -> 503 { error: 'secret not configured' }
//   - wrong / missing header     -> 401
//
// Body JSON: { email (required), name?, address?, city?, state?, zip?,
//              confirmed_at? (ISO, default now), source? (default 'n8n_confirm') }
//
// Behavior:
//   1. Find the MOST RECENT orders row matching the email + sample + open-ish state.
//   2. If found & not yet confirmed -> stamp address_confirmed_at + snapshot, and (if
//      currently 'requested') flip fulfillment_state to 'address_confirmed'. A DB trigger
//      auto-logs the transition with actor 'system'; we then re-attribute that log row to
//      'n8n_confirm' with hashed-email evidence (v1 actor-attribution approach, see below).
//   3. Already confirmed -> 200 already_confirmed, NO writes (idempotent).
//   4. No match -> INSERT into confirm_address_quarantine, 202 quarantined. Never drop, never 404.
//
// PII: NEVER log email/address/name. Log order ids / counts / statuses only.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ConfirmBody {
  email?: unknown;
  name?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
  confirmed_at?: unknown;
  source?: unknown;
}

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Auth -----------------------------------------------------------------
    const secret = process.env.FLOROPOLIS_CONFIRM_SECRET;
    if (!secret) {
      console.error('[confirm-address] MISSING ENV: FLOROPOLIS_CONFIRM_SECRET');
      return NextResponse.json({ error: 'secret not configured' }, { status: 503 });
    }
    const provided = req.headers.get('x-floropolis-secret');
    if (!provided || provided !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Body -----------------------------------------------------------------
    let body: ConfirmBody;
    try {
      body = (await req.json()) as ConfirmBody;
    } catch {
      return NextResponse.json({ error: 'bad_json' }, { status: 400 });
    }

    const email = asTrimmedString(body.email);
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
    }

    const name = asTrimmedString(body.name);
    const address = asTrimmedString(body.address);
    const city = asTrimmedString(body.city);
    const state = asTrimmedString(body.state);
    const zip = asTrimmedString(body.zip);
    const source = asTrimmedString(body.source) ?? 'n8n_confirm';

    const confirmedAtRaw = asTrimmedString(body.confirmed_at);
    let confirmedAt = new Date().toISOString();
    if (confirmedAtRaw) {
      const parsed = new Date(confirmedAtRaw);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'invalid_confirmed_at' }, { status: 400 });
      }
      confirmedAt = parsed.toISOString();
    }

    const admin = getBackupServiceClient();
    const emailHash = sha256(email);

    // 1. Find most recent matching sample order ----------------------------
    const { data: order, error: lookupErr } = await admin
      .from('orders')
      .select('id, fulfillment_state, address_confirmed_at')
      .ilike('client_email', email)
      .eq('source', 'sample')
      .in('fulfillment_state', ['requested', 'qualified'])
      .eq('is_test', false)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupErr) {
      console.error('[confirm-address] order lookup failed:', lookupErr.message);
      return NextResponse.json({ error: 'internal' }, { status: 500 });
    }

    // 4. No match -> quarantine (never drop, never 404) --------------------
    if (!order) {
      const { error: qErr } = await admin
        .from('confirm_address_quarantine')
        .insert({
          payload: { ...(body as Record<string, unknown>), confirmed_at: confirmedAt },
          source,
          reason: 'no_matching_order',
        });
      if (qErr) {
        console.error('[confirm-address] quarantine insert failed:', qErr.message);
        return NextResponse.json({ error: 'internal' }, { status: 500 });
      }
      console.log('[confirm-address] quarantined (no match)');
      return NextResponse.json({ status: 'quarantined' }, { status: 202 });
    }

    // 3. Idempotent: already confirmed -> no writes ------------------------
    if (order.address_confirmed_at) {
      console.log(`[confirm-address] already_confirmed order_id=${order.id}`);
      return NextResponse.json({ status: 'already_confirmed', order_id: order.id });
    }

    // 2. Confirm: stamp address + snapshot, flip state if 'requested' ------
    const update: Record<string, unknown> = {
      address_confirmed_at: confirmedAt,
      shipping_address_snapshot: { name, address, city, state, zip, source },
    };
    const willTransition = order.fulfillment_state === 'requested';
    if (willTransition) {
      // DB trigger auto-logs this transition with actor 'system'.
      update.fulfillment_state = 'address_confirmed';
    }

    const { error: updErr } = await admin
      .from('orders')
      .update(update)
      .eq('id', order.id);
    if (updErr) {
      console.error('[confirm-address] order update failed:', updErr.message, `order_id=${order.id}`);
      return NextResponse.json({ error: 'internal' }, { status: 500 });
    }

    // v1 actor-attribution approach:
    // The fulfillment_state transition is written by a DB trigger that stamps
    // actor='system'. There is no way to pass the real actor through the trigger
    // in v1, so right after the UPDATE we locate the freshest 'address_confirmed'
    // log row for this order and re-attribute it to the confirm workflow with
    // hashed-email evidence. (A future v2 should let the trigger receive the actor
    // directly, e.g. via a transaction-local GUC, and drop this read-modify step.)
    if (willTransition) {
      const { data: logRow, error: logSelErr } = await admin
        .from('order_status_log')
        .select('id')
        .eq('order_id', order.id)
        .eq('to_state', 'address_confirmed')
        .order('at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (logSelErr) {
        console.error('[confirm-address] log lookup failed:', logSelErr.message, `order_id=${order.id}`);
        // Non-fatal: the order is confirmed; attribution is best-effort.
      } else if (logRow) {
        const { error: logUpdErr } = await admin
          .from('order_status_log')
          .update({
            actor: 'n8n_confirm',
            evidence: {
              email_hash: emailHash,
              confirmed_at: confirmedAt,
              via: 'confirm-address endpoint',
            },
          })
          .eq('id', logRow.id);
        if (logUpdErr) {
          console.error('[confirm-address] log attribution failed:', logUpdErr.message, `order_id=${order.id}`);
          // Non-fatal: confirmation already landed.
        }
      }
    }

    console.log(`[confirm-address] confirmed order_id=${order.id} transitioned=${willTransition}`);
    return NextResponse.json({ status: 'confirmed', order_id: order.id });
  } catch (err) {
    // No PII in error logs.
    console.error('[confirm-address] unexpected error:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
