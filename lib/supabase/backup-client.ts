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
    throw new Error(
      "[supabase/backup-client] MISSING ENV: NEXT_PUBLIC_BACKUP_SUPABASE_URL or NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY",
    );
  }
  // 2026-05-18 (AUTH-FIX r7): back to PKCE (default).
  //
  // Round 2 set flowType='implicit' to dodge a server-side exchange bug, but
  // /api/debug/whoami showed the server couldn't see the session at all
  // ("Auth session missing!"). Implicit flow makes supabase-js fall back to
  // localStorage (browser-only) instead of writing cookies — so the browser
  // looked signed-in (nav showed "Sign out") but middleware/SSR routes
  // treated every request as anonymous and bounced /admin/* to /shop.
  //
  // PKCE writes to cookie storage (visible to both client AND server). The
  // exchange-loses-verifier bug from rounds 1-3 is now moot because /auth/post-oauth
  // runs PKCE end-to-end in the browser (same process that wrote the verifier
  // does the read). No server-side exchange in the path.
  return createBrowserClient(url, key, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
    },
  });
}
