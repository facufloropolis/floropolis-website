// Admin layout -- v2 unified shell + wiring overlay.
// v2 | 2026-05-19 | Job_PM SHELL-V2 [V8 SHADOW]
//
// W3 (SHELL-V2) mounts the persistent admin chrome:
//   - <AdminShell>     -- top bar, health bar, sidebar, main column
//   - <AdminCommandPalette> -- Cmd+K / Ctrl+K modal, listens window-wide
//
// Auth: NOT enforced here. Each /admin/* page still runs its own redirect()
// against the ADMIN_EMAILS allowlist + client_profiles.status='admin' check
// (mirrors prod). The user email rendered in the top bar is best-effort: if
// the session isn't available we render "signed in" and the page-level gate
// handles the redirect downstream.
//
// KNOWN W3 CONFLICT: most /admin/* sub-pages still render their own
// <TopBanner /><Navigation /> + <Footer /> wrappers from W2. That means those
// pages currently render double chrome inside the shell's main column. This is
// a deliberate W3 trade-off (ship the shell first, port sub-pages in W4). The
// /admin home page in this commit already drops the old wrappers cleanly.

import type { ReactNode } from 'react';
import { Suspense } from 'react';
import WiringToggle from '@/components/admin/WiringToggle';
import { createBackupServerClient } from '@/lib/supabase/backup-server-session';
import AdminShell from './_components/AdminShell';
import AdminCommandPalette from './_components/AdminCommandPalette';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Best-effort email lookup for the top-bar "signed in as" pill. If anything
  // throws (anon, expired session, network), fall through to undefined and let
  // the page-level redirect handle auth.
  let userEmail: string | null = null;
  try {
    const supabase = await createBackupServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  } catch {
    userEmail = null;
  }

  return (
    <>
      <Suspense fallback={null}>
        <WiringToggle />
      </Suspense>
      <AdminShell userEmail={userEmail}>{children}</AdminShell>
      <AdminCommandPalette />
    </>
  );
}
