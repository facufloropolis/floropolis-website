// Debug endpoint: returns what middleware + the backup server client see
// for the current session. Use to diagnose admin gate / RLS issues.
//
// DELETE this file after Phase 4 launch. Safe to keep in preview only.

import { NextResponse } from "next/server";
import { createBackupServerClient } from "@/lib/supabase/backup-server-session";
import { getBackupServiceClient } from "@/lib/supabase/backup-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {
    env: {
      NEXT_PUBLIC_BACKUP_SUPABASE_URL_set: !!process.env.NEXT_PUBLIC_BACKUP_SUPABASE_URL,
      NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY_set: !!process.env.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY,
      BACKUP_SUPABASE_SERVICE_KEY_set: !!process.env.BACKUP_SUPABASE_SERVICE_KEY,
      STRIPE_SECRET_KEY_set: !!process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET_set: !!process.env.STRIPE_WEBHOOK_SECRET,
    },
    session: null,
    profile: null,
    isAdminViaService: null,
  };

  try {
    const supabase = await createBackupServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) out.session = { error: error.message };
    else if (user) out.session = { user_id: user.id, email: user.email, last_sign_in_at: user.last_sign_in_at };
    else out.session = { user: null };
  } catch (e) {
    out.session = { fatal: String(e) };
  }

  // Look up profile via service role (bypasses RLS)
  try {
    const userId = (out.session as { user_id?: string })?.user_id;
    if (userId) {
      const svc = getBackupServiceClient();
      const { data: profile, error } = await svc
        .from("client_profiles")
        .select("user_id,business_name,status,notes")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) out.profile = { error: error.message };
      else out.profile = profile;
      out.isAdminViaService = profile?.status === "admin";
    } else {
      out.profile = { skipped: "no user_id from session" };
    }
  } catch (e) {
    out.profile = { fatal: String(e) };
  }

  return NextResponse.json(out, { status: 200 });
}
