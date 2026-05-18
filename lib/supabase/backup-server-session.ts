// Server-side Supabase client pointed at supabase-backup that reads the
// authenticated user from cookies (NOT service-role).
// v1 | 2026-05-17 | Job_PM W5-S15 [V8 SHADOW]
//
// Use this for routes that need auth.uid() in user-context (RLS applies):
//   - /api/checkout/session
//   - /api/orders/list
//   - /api/refunds/[id]/vote
//   - /api/refunds/[id]/execute
//   - /order-confirmation/[id] page
//   - /account/orders page
//   - /admin/refunds page
//
// For data writes that need to BYPASS RLS, keep using lib/supabase/backup-server.ts
// (service-role). For browser code, use lib/supabase/backup-client.ts.
//
// DO NOT modify lib/supabase/server.ts -- that client still serves Rose's
// legacy /shop, /quote, /admin/clients, /account flows on the prod project.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createBackupServerClient() {
  const url = process.env.NEXT_PUBLIC_BACKUP_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "[supabase/backup-server-session] MISSING ENV: NEXT_PUBLIC_BACKUP_SUPABASE_URL or NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components can't set cookies -- middleware handles refresh.
        }
      },
    },
  });
}
