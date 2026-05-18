// Browser-side Supabase client pointed at supabase-backup (ibckhcjvyxzrhvdiazbx).
// v1 | 2026-05-17 | Job_PM W5-S15 [V8 SHADOW]
//
// Per Phase 4 SEGURISIMA rule: auth + the entire transactional system run on
// supabase-backup, NOT prod. This client is for browser code (signup wizard,
// /auth/login, useAuthBackup hook) and uses the publishable (anon) key.
//
// DO NOT modify lib/supabase/client.ts -- that client still serves Rose's
// legacy /shop and /quote flows on the prod project.
//
// Required env (browser-safe, NEXT_PUBLIC_*):
//   NEXT_PUBLIC_BACKUP_SUPABASE_URL       e.g. https://ibckhcjvyxzrhvdiazbx.supabase.co
//   NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY  publishable key from supabase-backup
//
// Supabase auth cookies are project-scoped (storage key derived from the
// project ref in the URL), so this client's session is fully isolated from
// the prod client's session in the same browser. Both can coexist.

import { createBrowserClient, type CookieOptions } from "@supabase/ssr";

export function createBackupClient() {
  const url = process.env.NEXT_PUBLIC_BACKUP_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Fail loudly in the browser console — better than a confusing 401 later.
    throw new Error(
      "[supabase/backup-client] MISSING ENV: NEXT_PUBLIC_BACKUP_SUPABASE_URL or NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY",
    );
  }
  // createBrowserClient also accepts an options object for cookies; we leave
  // the default behavior which uses document.cookie scoped to the project.
  return createBrowserClient(url, key, {
    cookieOptions: { sameSite: "lax" } as CookieOptions,
  });
}
