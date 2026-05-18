// Browser-side Supabase client pointed at supabase-backup (ibckhcjvyxzrhvdiazbx).
// v2 | 2026-05-18 | Job_PM AUTH-FIX [V8 SHADOW]
//
// v2: removed the redundant cookieOptions: { sameSite: "lax" } override.
// SameSite=Lax is already the @supabase/ssr default and our server-side
// clients (backup-server-session, middleware, callback-backup/route) do
// NOT override cookieOptions. Keeping the override only on the browser
// side risked an asymmetric cookie config between the writer (browser
// during signInWithOAuth verifier write) and the reader (server during
// exchangeCodeForSession). All four clients now use library defaults.
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

import { createBrowserClient } from "@supabase/ssr";

export function createBackupClient() {
  const url = process.env.NEXT_PUBLIC_BACKUP_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Fail loudly in the browser console — better than a confusing 401 later.
    throw new Error(
      "[supabase/backup-client] MISSING ENV: NEXT_PUBLIC_BACKUP_SUPABASE_URL or NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY",
    );
  }
  // Library defaults: HttpOnly, Secure (prod), Path=/, SameSite=Lax.
  // No explicit cookieOptions — server clients also use defaults.
  return createBrowserClient(url, key);
}
