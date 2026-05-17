// Service-role Supabase client pointed at supabase-backup (ibckhcjvyxzrhvdiazbx).
// v1 | 2026-05-17 | Job_PM W3-S9 [V8 SHADOW]
// Wave 3 of web_transactions writes orders/order_lines/payments/etc to BACKUP project,
// NOT production. RLS would block these writes from the browser anon key, so server
// routes use the service role here.
//
// DO NOT use this client from browser code (service role bypasses RLS).
// DO NOT modify lib/supabase/server.ts — that's the user-context anon client used
// by the rest of the app (login, quote_requests, etc.).
//
// Required env (server-only, never NEXT_PUBLIC_*):
//   BACKUP_SUPABASE_URL              e.g. https://ibckhcjvyxzrhvdiazbx.supabase.co
//   BACKUP_SUPABASE_SERVICE_KEY      service_role key from supabase-backup project
//
// TODO wave-3-ops: confirm both env vars are set in Vercel before first deploy.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _backup: SupabaseClient | null = null;

export function getBackupServiceClient(): SupabaseClient {
  if (_backup) return _backup;

  const url = process.env.BACKUP_SUPABASE_URL;
  const key = process.env.BACKUP_SUPABASE_SERVICE_KEY;
  if (!url) {
    throw new Error(
      '[supabase/backup-server] MISSING ENV: BACKUP_SUPABASE_URL',
    );
  }
  if (!key) {
    throw new Error(
      '[supabase/backup-server] MISSING ENV: BACKUP_SUPABASE_SERVICE_KEY',
    );
  }

  _backup = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-floropolis-context': 'wave3-web-transactions' } },
  });

  return _backup;
}
