// /api/admin/search -- backs the Cmd+K command palette in the v2 admin shell.
// v1 | 2026-05-19 | Job_PM SHELL-V2 [V8 SHADOW]
//
// Returns up to ~12 hits across three sources:
//   - SKUs (catalog_classifications joined with floropolis_inventory_mirror)
//   - Orders (orders.order_number ilike)
//   - Screens (static list, mirrored in AdminCommandPalette.tsx for client-side
//     instant filter -- this endpoint does not return screens)
//
// Auth: enforces ADMIN_EMAILS allowlist + status='admin' fallback, mirroring
// app/admin/page.tsx. Non-admin -> 401.
//
// Style: GET handler. q must be at least 1 char. Empty -> empty hits.

import { NextResponse } from 'next/server';
import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SearchHit {
  type: 'sku' | 'order' | 'screen';
  id: string;
  label: string;
  sub?: string;
  href: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();

  // Auth gate ------------------------------------------------------------
  const supabase = await createBackupServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
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
  if (!isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (q.length === 0) {
    return NextResponse.json({ hits: [] satisfies SearchHit[] });
  }

  const svc = getBackupServiceClient();
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const hits: SearchHit[] = [];

  // SKU hits -- search floropolis_inventory_mirror by name/variety/vendor, and
  // by numeric id if q parses as an integer.
  try {
    const skuQuery = svc
      .from('floropolis_inventory_mirror')
      .select('id, name, vendor, variety, length')
      .limit(8);

    const asInt = parseInt(q, 10);
    if (Number.isFinite(asInt) && String(asInt) === q) {
      const { data } = await skuQuery.eq('id', asInt);
      (data ?? []).forEach((r) => {
        const row = r as { id: number; name: string | null; vendor: string | null; variety: string | null; length: number | null };
        hits.push({
          type: 'sku',
          id: String(row.id),
          label: row.name ?? `SKU #${row.id}`,
          sub: [row.vendor, row.variety, row.length ? `${row.length}cm` : null].filter(Boolean).join(' . '),
          href: `/admin/catalog/${row.id}`,
        });
      });
    } else {
      const { data } = await svc
        .from('floropolis_inventory_mirror')
        .select('id, name, vendor, variety, length')
        .or(`name.ilike.${like},variety.ilike.${like},vendor.ilike.${like}`)
        .limit(8);
      (data ?? []).forEach((r) => {
        const row = r as { id: number; name: string | null; vendor: string | null; variety: string | null; length: number | null };
        hits.push({
          type: 'sku',
          id: String(row.id),
          label: row.name ?? `SKU #${row.id}`,
          sub: [row.vendor, row.variety, row.length ? `${row.length}cm` : null].filter(Boolean).join(' . '),
          href: `/admin/catalog/${row.id}`,
        });
      });
    }
  } catch (err) {
    console.error('[admin/search] sku', err);
  }

  // Order hits -- search by order_number ilike.
  try {
    const { data } = await svc
      .from('orders')
      .select('id, order_number, status, grand_total')
      .ilike('order_number', like)
      .order('created_at', { ascending: false })
      .limit(5);
    (data ?? []).forEach((r) => {
      const row = r as { id: number; order_number: string; status: string; grand_total: number | string | null };
      hits.push({
        type: 'order',
        id: String(row.id),
        label: row.order_number,
        sub: `${row.status} . $${row.grand_total ?? 0}`,
        href: `/admin/orders/${row.id}`,
      });
    });
  } catch (err) {
    console.error('[admin/search] order', err);
  }

  return NextResponse.json({ hits });
}
