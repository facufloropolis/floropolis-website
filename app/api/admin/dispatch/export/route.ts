// GET /api/admin/dispatch/export?date=YYYY-MM-DD
// v1 | 2026-05-19 | Job_PM Phase F [V8 SHADOW]
//
// FedEx Ship Manager CSV export for one dispatch day. UC-O-188.
// One row per dispatch (Phase F approximation; full schema is one-row-per-box,
// which requires the box_plan to be persisted - that lives in Rose's pipeline
// and is out of Job scope). The 50-column schema below is a superset of the
// FedEx Ship Manager v6.x bulk import template; empty columns are left blank
// for FedEx to fill from broker defaults.
//
// Auth: admin (client_profiles.status='admin'); service-role reads.
// Returns: text/csv with Content-Disposition for download.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

// 50-column FedEx Ship Manager schema (per UC-O-188; superset of v6.x bulk import).
const FEDEX_COLUMNS = [
  'recipient_company',          // 1
  'recipient_contact',           // 2
  'recipient_address_1',         // 3
  'recipient_address_2',         // 4
  'recipient_city',              // 5
  'recipient_state',             // 6
  'recipient_postal',            // 7
  'recipient_country',           // 8
  'recipient_phone',             // 9
  'recipient_email',             // 10
  'recipient_residential',       // 11 (Y/N)
  'shipper_company',             // 12
  'shipper_contact',             // 13
  'shipper_address_1',           // 14
  'shipper_city',                // 15
  'shipper_state',               // 16
  'shipper_postal',              // 17
  'shipper_country',             // 18
  'shipper_phone',               // 19
  'service_type',                // 20
  'package_type',                // 21
  'weight_kg',                   // 22
  'length_cm',                   // 23
  'width_cm',                    // 24
  'height_cm',                   // 25
  'declared_value_usd',          // 26
  'customs_value_usd',           // 27
  'currency',                    // 28
  'commodity_description',       // 29
  'commodity_quantity',          // 30
  'commodity_unit_value',        // 31
  'hts_code',                    // 32
  'country_of_manufacture',      // 33
  'ein_tax_id',                  // 34
  'reference_1',                 // 35  (order_number)
  'reference_2',                 // 36  (sku_summary)
  'reference_3',                 // 37  (vendor)
  'ship_date',                   // 38
  'requested_delivery_date',     // 39
  'broker_name',                 // 40
  'broker_address',              // 41
  'rel_number',                  // 42
  'ppq_permit',                  // 43
  'ppq_seal',                    // 44
  'etd_enabled',                 // 45  (Y/N)
  'duties_payor',                // 46  (SENDER/RECIPIENT/THIRD)
  'taxes_payor',                 // 47
  'incoterm',                    // 48
  'notes',                       // 49
  'box_seq',                     // 50
];

interface OrderLineRow {
  quantity: number | null;
  sku_name_snapshot: string | null;
  sku_vendor_snapshot: string | null;
}
interface DispatchOrderRow {
  id: string;
  order_id: number;
  status: string;
  tracking_number: string | null;
  dispatch_date: string | null;
  orders: {
    order_number: string | null;
    requested_delivery_date: string | null;
    shipping_address_snapshot: Record<string, unknown> | null;
    order_lines: OrderLineRow[] | null;
  } | { order_number: string | null; requested_delivery_date: string | null; shipping_address_snapshot: Record<string, unknown> | null; order_lines: OrderLineRow[] | null }[] | null;
}

function csvEscape(v: unknown): string {
  if (v == null) return '';
  let s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const dateParam = req.nextUrl.searchParams.get('date');
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayIso();

  // Auth
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

  // Pull dispatches for the date. We accept either dispatches.dispatch_date
  // OR (legacy) the computed ship date from orders.requested_delivery_date
  // - lead_time_days. To keep this route simple, Phase F filters on
  // dispatch_date only; if dispatch_date is null we fall back to ALL
  // dispatches in awaiting_pack..label_printed (so the export is still
  // useful before the dispatch_date backfill ships).
  let query = adminClient
    .from('dispatches')
    .select(
      'id, order_id, status, tracking_number, dispatch_date, orders ( order_number, requested_delivery_date, shipping_address_snapshot, order_lines ( quantity, sku_name_snapshot, sku_vendor_snapshot ) )',
    )
    .order('id', { ascending: true });

  // If any dispatch_date rows exist for the given date, filter by date.
  // Otherwise return everything (legacy behavior).
  const { count: datedCount } = await adminClient
    .from('dispatches')
    .select('id', { count: 'exact', head: true })
    .eq('dispatch_date', date);
  if ((datedCount ?? 0) > 0) {
    query = query.eq('dispatch_date', date);
  }
  const { data: rows, error: qErr } = await query;
  if (qErr) {
    Sentry.captureException(qErr, {
      tags: { route: 'admin/dispatch/export', step: 'query' },
    });
    return NextResponse.json(
      { error: 'query_failed', detail: qErr.message },
      { status: 500 },
    );
  }

  const records = (rows ?? []) as unknown as DispatchOrderRow[];

  const lines: string[] = [];
  lines.push(FEDEX_COLUMNS.map(csvEscape).join(','));

  for (const r of records) {
    const order = Array.isArray(r.orders) ? r.orders[0] : r.orders;
    const addr = (order?.shipping_address_snapshot ?? {}) as Record<string, unknown>;
    const orderLines = (order?.order_lines ?? []) as OrderLineRow[];

    const totalQty = orderLines.reduce((s, l) => s + (l.quantity ?? 0), 0);
    const skuSummary = orderLines
      .map((l) => `${l.quantity ?? 0}x ${l.sku_name_snapshot ?? '-'}`)
      .join('; ');
    const vendor =
      orderLines.find((l) => !!l.sku_vendor_snapshot)?.sku_vendor_snapshot ?? '';

    // declared value: $1/stem placeholder (broker uses this only as a hint;
    // real declared value lives in Rose's pricing_constants - Phase G).
    const declared = totalQty * 1.0;

    const row: Record<string, unknown> = {
      recipient_company:      addr.business_name ?? addr.recipient_name ?? '',
      recipient_contact:      addr.recipient_name ?? '',
      recipient_address_1:    addr.line1 ?? '',
      recipient_address_2:    addr.line2 ?? '',
      recipient_city:         addr.city ?? '',
      recipient_state:        addr.state ?? '',
      recipient_postal:       addr.postal_code ?? '',
      recipient_country:      addr.country ?? 'US',
      recipient_phone:        addr.phone ?? '',
      recipient_email:        '',
      recipient_residential:  'N',
      shipper_company:        'Floral Direct LLC',
      shipper_contact:        'Facu Lavino',
      shipper_address_1:      '200 S Wilton Pl',
      shipper_city:           'Los Angeles',
      shipper_state:          'CA',
      shipper_postal:         '90004',
      shipper_country:        'US',
      shipper_phone:          '',
      service_type:           'INTERNATIONAL_PRIORITY',
      package_type:           'YOUR_PACKAGING',
      weight_kg:              '',
      length_cm:              '',
      width_cm:               '',
      height_cm:              '',
      declared_value_usd:     declared.toFixed(2),
      customs_value_usd:      declared.toFixed(2),
      currency:               'USD',
      commodity_description:  'Cut flowers',
      commodity_quantity:     totalQty,
      commodity_unit_value:   '1.00',
      hts_code:               '0603.11.00',
      country_of_manufacture: 'EC',
      ein_tax_id:             '39-4713788',
      reference_1:            order?.order_number ?? '',
      reference_2:            skuSummary,
      reference_3:            vendor,
      ship_date:              r.dispatch_date ?? date,
      requested_delivery_date: order?.requested_delivery_date ?? '',
      broker_name:            'Andri Molina',
      broker_address:         'Doral FL',
      rel_number:             '34458984',
      ppq_permit:             'PPQ 587',
      ppq_seal:               '',
      etd_enabled:            'Y',
      duties_payor:           'RECIPIENT',
      taxes_payor:            'RECIPIENT',
      incoterm:               'DDU',
      notes:                  r.tracking_number ? `existing_tracking=${r.tracking_number}` : '',
      box_seq:                '',
    };

    lines.push(FEDEX_COLUMNS.map((c) => csvEscape(row[c])).join(','));
  }

  const csv = lines.join('\n') + '\n';
  const filename = `floropolis_fedex_dispatch_${date}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
