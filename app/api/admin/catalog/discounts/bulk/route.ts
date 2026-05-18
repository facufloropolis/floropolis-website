// POST /api/admin/catalog/discounts/bulk
// v1 | 2026-05-18 | Job_PM CAT-S10 [V8 SHADOW]
//
// Body:
//   {
//     filter: { vendor?, variety?, tier? },
//     change: {
//       deal_price_fixed?: number,
//       deal_pct_off?:    number (0..100, exclusive),
//       deal_label:       string,
//       deal_expiry:      string (YYYY-MM-DD or ISO)
//     },
//     confirm: boolean
//   }
//
// Two-step: confirm=false returns { count, sample[<=20], warning? } and does
// NOT write. confirm=true performs the write and returns { count, updated }.
//
// Safety:
//   - At least one filter (vendor | variety | tier) must be non-empty so we
//     never accidentally apply to the entire catalog.
//   - deal_expiry must be in the future.
//   - For fixed mode: deal_price_fixed > 0.
//   - For pct mode:   0 < deal_pct_off < 100.
//   - SKUs with NULL or non-positive price are skipped in pct mode (we can't
//     compute their deal price).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

interface FilterBody {
  vendor?: string;
  variety?: string;
  tier?: string;
}
interface ChangeBody {
  deal_price_fixed?: number;
  deal_pct_off?: number;
  deal_label?: string;
  deal_expiry?: string;
}
interface BulkBody {
  filter?: FilterBody;
  change?: ChangeBody;
  confirm?: boolean;
}

interface MirrorRow {
  id: number;
  name: string;
  variety: string | null;
  length: string | null;
  vendor: string | null;
  tier: string | null;
  price: number | string | null;
}

interface SampleItem {
  id: number;
  name: string;
  variety: string | null;
  length: string | null;
  vendor: string | null;
  tier: string | null;
  price: number | null;
  proposed_deal_price: number | null;
}

const SAMPLE_LIMIT = 20;
const HARD_LIMIT = 5000; // safety on a single bulk apply

function badRequest(error: string, detail?: string): NextResponse {
  return NextResponse.json({ error, ...(detail ? { detail } : {}) }, { status: 400 });
}

function proposedDealPrice(
  originalPrice: number | null,
  fixed: number | undefined,
  pct: number | undefined,
): number | null {
  if (fixed != null) return Number(fixed.toFixed(2));
  if (pct != null && originalPrice != null && originalPrice > 0) {
    return Number((originalPrice * (1 - pct / 100)).toFixed(2));
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth -------------------------------------------------------------
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

  // Body -------------------------------------------------------------
  let body: BulkBody;
  try {
    body = (await req.json()) as BulkBody;
  } catch {
    return badRequest('bad_json');
  }

  const filter = body.filter ?? {};
  const change = body.change ?? {};
  const confirm = body.confirm === true;

  const vendor =
    typeof filter.vendor === 'string' ? filter.vendor.trim() : '';
  const variety =
    typeof filter.variety === 'string' ? filter.variety.trim() : '';
  const tier =
    typeof filter.tier === 'string' ? filter.tier.trim().toUpperCase() : '';

  if (!vendor && !variety && !tier) {
    return badRequest(
      'no_filter',
      'set at least one of vendor / variety / tier',
    );
  }

  const fixed =
    change.deal_price_fixed != null ? Number(change.deal_price_fixed) : undefined;
  const pct =
    change.deal_pct_off != null ? Number(change.deal_pct_off) : undefined;

  if (fixed != null && pct != null) {
    return badRequest(
      'invalid_change',
      'set either deal_price_fixed or deal_pct_off, not both',
    );
  }
  if (fixed == null && pct == null) {
    return badRequest(
      'invalid_change',
      'one of deal_price_fixed or deal_pct_off is required',
    );
  }
  if (fixed != null && (!Number.isFinite(fixed) || fixed <= 0)) {
    return badRequest('invalid_deal_price_fixed', 'must be > 0');
  }
  if (pct != null && (!Number.isFinite(pct) || pct <= 0 || pct >= 100)) {
    return badRequest('invalid_deal_pct_off', 'must be 0 < pct < 100');
  }

  const dealLabel =
    typeof change.deal_label === 'string' ? change.deal_label.trim() : '';
  if (!dealLabel) {
    return badRequest('invalid_deal_label', 'required');
  }
  const dealExpiryStr =
    typeof change.deal_expiry === 'string' ? change.deal_expiry.trim() : '';
  if (!dealExpiryStr) {
    return badRequest('invalid_deal_expiry', 'required');
  }
  const isoCandidate =
    dealExpiryStr.length === 10 ? `${dealExpiryStr}T23:59:59` : dealExpiryStr;
  const expMs = new Date(isoCandidate).getTime();
  if (!Number.isFinite(expMs) || expMs <= Date.now()) {
    return badRequest('invalid_deal_expiry', 'must be in the future');
  }
  const dealExpiryIso =
    dealExpiryStr.length === 10 ? `${dealExpiryStr}T23:59:59Z` : dealExpiryStr;

  // Build query ------------------------------------------------------
  const backup = adminClient;
  let q = backup
    .from('floropolis_inventory_mirror')
    .select('id,name,variety,length,vendor,tier,price');
  if (vendor) q = q.eq('vendor', vendor);
  if (variety) q = q.ilike('variety', `%${variety}%`);
  if (tier) q = q.eq('tier', tier);

  // Cap to HARD_LIMIT rows so a misclick can't pummel the table. If the user
  // hits this they need to narrow filters.
  const { data: rowsRaw, error: rowsErr } = await q.limit(HARD_LIMIT);
  if (rowsErr) {
    Sentry.captureException(rowsErr, {
      tags: { route: 'admin/catalog/discounts/bulk', step: 'fetch' },
    });
    return NextResponse.json(
      { error: 'fetch_failed', detail: rowsErr.message },
      { status: 500 },
    );
  }
  const rows = (rowsRaw ?? []) as unknown as MirrorRow[];

  // Drop rows where pct mode can't compute (null/zero price).
  const eligible: MirrorRow[] =
    pct != null
      ? rows.filter((r) => {
          const p = r.price == null ? null : Number(r.price);
          return p != null && Number.isFinite(p) && p > 0;
        })
      : rows;

  const skippedCount = rows.length - eligible.length;
  const sample: SampleItem[] = eligible.slice(0, SAMPLE_LIMIT).map((r) => {
    const p = r.price == null ? null : Number(r.price);
    return {
      id: r.id,
      name: r.name,
      variety: r.variety,
      length: r.length,
      vendor: r.vendor,
      tier: r.tier,
      price: p != null && Number.isFinite(p) ? p : null,
      proposed_deal_price: proposedDealPrice(
        p != null && Number.isFinite(p) ? p : null,
        fixed,
        pct,
      ),
    };
  });

  const warnings: string[] = [];
  if (skippedCount > 0 && pct != null) {
    warnings.push(
      `${skippedCount} SKU(s) skipped (no price set; pct discount can't compute)`,
    );
  }
  if (rows.length >= HARD_LIMIT) {
    warnings.push(
      `hit hard limit of ${HARD_LIMIT} rows -- narrow your filter`,
    );
  }
  // Future price-hike warning for fixed mode
  if (fixed != null) {
    const hike = eligible.filter((r) => {
      const p = r.price == null ? null : Number(r.price);
      return p != null && Number.isFinite(p) && p > 0 && fixed > p;
    }).length;
    if (hike > 0) {
      warnings.push(
        `${hike} SKU(s) would have deal_price > current price (future price hike)`,
      );
    }
  }

  if (!confirm) {
    return NextResponse.json({
      count: eligible.length,
      sample,
      warning: warnings.join('; ') || undefined,
    });
  }

  // Commit ----------------------------------------------------------
  if (eligible.length === 0) {
    return NextResponse.json({ count: 0, updated: 0, warning: 'no_matches' });
  }

  // For fixed mode we can do a single UPDATE on the matched ids.
  // For pct mode each SKU has its own computed price -- update in chunks.
  let updated = 0;
  if (fixed != null) {
    const ids = eligible.map((r) => r.id);
    const { error: updErr, count } = await backup
      .from('floropolis_inventory_mirror')
      .update(
        {
          is_on_deal: true,
          deal_label: dealLabel,
          deal_price: Number(fixed.toFixed(2)),
          deal_expiry: dealExpiryIso,
        },
        { count: 'exact' },
      )
      .in('id', ids);
    if (updErr) {
      Sentry.captureException(updErr, {
        tags: { route: 'admin/catalog/discounts/bulk', step: 'update_fixed' },
      });
      return NextResponse.json(
        { error: 'update_failed', detail: updErr.message },
        { status: 500 },
      );
    }
    updated = count ?? ids.length;
  } else {
    // pct mode -- per-SKU update
    const CHUNK = 200;
    for (let i = 0; i < eligible.length; i += CHUNK) {
      const chunk = eligible.slice(i, i + CHUNK);
      for (const r of chunk) {
        const p = Number(r.price);
        const dp = Number((p * (1 - (pct as number) / 100)).toFixed(2));
        const { error: rowErr } = await backup
          .from('floropolis_inventory_mirror')
          .update({
            is_on_deal: true,
            deal_label: dealLabel,
            deal_price: dp,
            deal_expiry: dealExpiryIso,
          })
          .eq('id', r.id);
        if (rowErr) {
          Sentry.captureException(rowErr, {
            tags: {
              route: 'admin/catalog/discounts/bulk',
              step: 'update_pct',
              sku_id: String(r.id),
            },
          });
          continue;
        }
        updated += 1;
      }
    }
  }

  return NextResponse.json({
    count: eligible.length,
    updated,
    warning: warnings.join('; ') || undefined,
  });
}
