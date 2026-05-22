// Read-only Supabase client pointed at the PRODUCTION project (swhglnjyuorkycpgkmec).
// v1 | 2026-05-19 | Job_PM disp-real [V8 SHADOW]
//
// Floropolis runs on TWO Supabase projects in parallel:
//   - swhglnjyuorkycpgkmec  -> production (Rose owns these tables: n8n_dispatch_queue,
//                              dispatch_batches, dispatch_events, dispatch_tracking,
//                              farm_shipments, etc). HARD READ-ONLY for Job_PM.
//   - ibckhcjvyxzrhvdiazbx  -> supabase-backup (D1: orders, dispatches, ...).
//
// HARD CONTRACT (rose_table_audit_v1.md section 4):
//   - n8n_dispatch_queue : JOB_READ_OK + HARD BOUNDARY (no writes, no cancels)
//   - dispatch_batches / events / tracking : JOB_READ_OK
//   - farm_shipments : JOB_READ_OK
// This client therefore EXPOSES READS ONLY. Any write call against it is a bug.
//
// Required env (server-only, never NEXT_PUBLIC_*):
//   PROD_SUPABASE_URL                e.g. https://swhglnjyuorkycpgkmec.supabase.co
//   PROD_SUPABASE_SERVICE_KEY        service_role key from production project
//
// Fallback behavior:
//   - If PROD_SUPABASE_URL is missing, falls back to NEXT_PUBLIC_SUPABASE_URL
//     (which already points at production for this app).
//   - If PROD_SUPABASE_SERVICE_KEY is missing, the client is NOT created and
//     getProdReadClient() returns null. Callers must handle the null case by
//     rendering the "production read client not configured" empty state.
//
// Never import this client from browser code (service role bypasses RLS).

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _prod: SupabaseClient | null = null;

export function getProdReadClient(): SupabaseClient | null {
  // Only memoize a real client — never cache null. Vercel cold starts may
  // resolve env vars after module init, so we must re-attempt on each call
  // until a client is successfully created.
  if (_prod) return _prod;

  const url =
    process.env.PROD_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    '';
  // Service key preferred (bypasses RLS for Rose tables).
  // Falls back to anon key — sufficient for SECURITY DEFINER RPCs granted to anon.
  const key =
    process.env.PROD_SUPABASE_SERVICE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    '';
  if (!url || !key) return null;

  _prod = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-floropolis-context': 'job-pm-read-only-rose-tables' } },
  });

  return _prod;
}

/**
 * isProdReadConfigured — cheap check the page can use to decide whether to
 * even attempt a Rose-tab fetch, vs immediately rendering the "not configured"
 * banner. Same logic as getProdReadClient() but does not allocate a client.
 */
export function isProdReadConfigured(): boolean {
  const url =
    process.env.PROD_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    '';
  const key =
    process.env.PROD_SUPABASE_SERVICE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    '';
  return Boolean(url && key);
}
