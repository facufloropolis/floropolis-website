// TEMP diagnostic — /api/_diag/prod  (Job_PM 2026-06-10, REMOVE after diagnosis)
// Reports (no secrets) why the PROD read client can/can't read v_flora_cohort.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getProdReadClient } from '@/lib/supabase/prod-server';

export async function GET(): Promise<NextResponse> {
  const svc = process.env.PROD_SUPABASE_SERVICE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const purl = process.env.PROD_SUPABASE_URL;
  const npurl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const env = {
    PROD_SUPABASE_SERVICE_KEY_present: svc !== undefined,
    PROD_SUPABASE_SERVICE_KEY_len: (svc ?? '').length,
    NEXT_PUBLIC_SUPABASE_ANON_KEY_present: anon !== undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY_len: (anon ?? '').length,
    PROD_SUPABASE_URL_present: purl !== undefined,
    PROD_SUPABASE_URL_len: (purl ?? '').length,
    NEXT_PUBLIC_SUPABASE_URL_host: (npurl ?? '').replace(/^https?:\/\//, '').slice(0, 40),
  };

  const client = getProdReadClient();
  let query: Record<string, unknown> = { clientNull: client === null };
  if (client) {
    try {
      const { data, count, error } = await client
        .from('v_flora_cohort')
        .select('account_name', { count: 'exact' })
        .limit(3);
      query = {
        clientNull: false,
        count: count ?? null,
        rowsReturned: Array.isArray(data) ? data.length : null,
        sampleNames: Array.isArray(data) ? data.map((r) => (r as { account_name?: string }).account_name) : null,
        error: error ? { message: error.message, code: (error as { code?: string }).code ?? null } : null,
      };
    } catch (e) {
      query = { clientNull: false, threw: String(e) };
    }
  }

  return NextResponse.json({ env, query }, { headers: { 'cache-control': 'no-store' } });
}
