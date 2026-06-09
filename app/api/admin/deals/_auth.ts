// Shared admin guard for the Deal Builder API routes.
// Mirrors /admin/cohort-review: ADMIN_EMAILS or client_profiles.status='admin'.
// v1 | 2026-06-09 | Job_PM (CPO)

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

/** Returns the admin user email when authorized, or null when not. */
export async function requireAdminApi(): Promise<{ email: string } | null> {
  try {
    const userClient = await createUserClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return null;

    const emailLc = (user.email ?? '').toLowerCase();
    if (ADMIN_EMAILS.includes(emailLc)) return { email: emailLc };

    const adminClient = getBackupServiceClient();
    const { data: profile } = await adminClient
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile && profile.status === 'admin') return { email: emailLc };

    return null;
  } catch {
    return null;
  }
}
