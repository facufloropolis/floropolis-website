"use client";
// 2026-05-18 | Job_PM AUTH-FIX r4 [V8 SHADOW]
// Switched from PROD createClient to BACKUP createBackupClient. /account is
// gated by middleware on the BACKUP session, so sign-out must clear BACKUP
// cookies. Using the PROD client only cleared the unused prod session and
// left the user signed in on the backup project.

import { useRouter } from "next/navigation";
import { createBackupClient } from "@/lib/supabase/backup-client";

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createBackupClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="text-sm font-semibold text-slate-600 hover:text-red-600 border border-slate-300 hover:border-red-300 px-4 py-2 rounded-lg transition-colors"
    >
      Sign out
    </button>
  );
}
