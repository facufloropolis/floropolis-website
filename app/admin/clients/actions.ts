'use server';
// Admin client actions -- Phase E
// v2 | 2026-05-19 | Job_PM Phase E [V8 SHADOW]
//
// All status changes route through admin_proposals (type=client_profiles.status_change).
// Direct UPDATE statements REMOVED from this file 2026-05-19 -- the v1 approve/reject
// helpers were the only direct writers and they bypassed the proposal audit trail.
//
// Surfaces still calling approveClient / rejectClient (the v1 names) get a
// proposal created in awaiting_facu state. CEO/Co-Admin approves it in
// /admin/catalog/approval-queue and the proposal-executors.execClientProfileStatusChange
// path actually mutates client_profiles.

import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { revalidatePath } from 'next/cache';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user || !user.email) {
    throw new Error('unauthenticated');
  }

  const emailLc = user.email.toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) {
    return { userId: user.id, email: emailLc };
  }

  const svc = getBackupServiceClient();
  const { data: profile } = await svc
    .from('client_profiles')
    .select('status, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin' || profile?.role === 'admin') {
    return { userId: user.id, email: emailLc };
  }
  throw new Error('not_admin');
}

async function insertStatusProposal(opts: {
  targetUserId: string;
  newStatus: 'approved' | 'rejected' | 'pending' | 'suspended' | 'admin';
  proposedBy: string;
  proposerEmail: string;
  reason?: string;
  extraPayload?: Record<string, unknown>;
}): Promise<{ ok: boolean; proposalId?: string; error?: string }> {
  const svc = getBackupServiceClient();

  const { data: target, error: readErr } = await svc
    .from('client_profiles')
    .select('user_id, status, role, business_name')
    .eq('user_id', opts.targetUserId)
    .maybeSingle();
  if (readErr) return { ok: false, error: `read_failed: ${readErr.message}` };
  if (!target) return { ok: false, error: 'client_not_found' };

  const payload: Record<string, unknown> = {
    new_status: opts.newStatus,
    ...opts.extraPayload,
  };
  if (opts.reason) payload.reason = opts.reason;

  const notes =
    `Phase E client status change: ${target.status ?? 'unknown'} -> ${opts.newStatus} ` +
    `by ${opts.proposerEmail}` +
    (opts.reason ? ` -- ${opts.reason}` : '');

  const { data: proposal, error: insErr } = await svc
    .from('admin_proposals')
    .insert({
      type: 'client_profiles.status_change',
      target_table: 'client_profiles',
      target_id: opts.targetUserId,
      payload,
      warnings: [],
      status: 'awaiting_facu',
      proposed_by: opts.proposedBy,
      notes,
      source_agent: 'job',
      source_table: 'client_profiles',
      source_id: opts.targetUserId,
      source_rationale: opts.reason ?? notes,
      filter_status: 'passed',
      before_value: { status: target.status ?? null, role: target.role ?? null },
      after_value: { status: opts.newStatus },
      cascade_summary: {
        affected_sku_count: 0,
        affected_skus_sample: [],
        warnings: [],
        computed_at: new Date().toISOString(),
        computed_by: 'admin/clients/actions.insertStatusProposal',
      },
    })
    .select('id')
    .single();

  if (insErr) return { ok: false, error: `insert_failed: ${insErr.message}` };
  return { ok: true, proposalId: proposal.id };
}

// ---------------------------------------------------------------------------
// v1-compat shims (kept so the old list page calls still work; both now route
// via the proposal queue rather than mutating directly).
// ---------------------------------------------------------------------------

export async function approveClient(userId: string): Promise<void> {
  const auth = await requireAdmin();
  await insertStatusProposal({
    targetUserId: userId,
    newStatus: 'approved',
    proposedBy: auth.userId,
    proposerEmail: auth.email,
    reason: 'Quick-approve from clients list',
  });
  revalidatePath('/admin/clients');
}

export async function rejectClient(userId: string): Promise<void> {
  const auth = await requireAdmin();
  await insertStatusProposal({
    targetUserId: userId,
    newStatus: 'rejected',
    proposedBy: auth.userId,
    proposerEmail: auth.email,
    reason: 'Quick-reject from clients list',
  });
  revalidatePath('/admin/clients');
}

// ---------------------------------------------------------------------------
// Phase E actions
// ---------------------------------------------------------------------------

export async function approveClientWithReason(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; proposalId?: string }> {
  const auth = await requireAdmin();
  const userId = String(formData.get('user_id') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim() || 'Approved from detail view';
  if (!userId) return { ok: false, error: 'missing_user_id' };
  const result = await insertStatusProposal({
    targetUserId: userId,
    newStatus: 'approved',
    proposedBy: auth.userId,
    proposerEmail: auth.email,
    reason,
  });
  revalidatePath('/admin/clients');
  revalidatePath(`/admin/clients/${userId}`);
  return result;
}

export async function suspendClient(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; proposalId?: string }> {
  const auth = await requireAdmin();
  const userId = String(formData.get('user_id') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  if (!userId) return { ok: false, error: 'missing_user_id' };
  if (reason.length < 5) return { ok: false, error: 'reason_required_min_5_chars' };
  const result = await insertStatusProposal({
    targetUserId: userId,
    newStatus: 'suspended',
    proposedBy: auth.userId,
    proposerEmail: auth.email,
    reason,
    extraPayload: { suspended_at: new Date().toISOString() },
  });
  revalidatePath('/admin/clients');
  revalidatePath(`/admin/clients/${userId}`);
  return result;
}

export async function unsuspendClient(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; proposalId?: string }> {
  const auth = await requireAdmin();
  const userId = String(formData.get('user_id') ?? '').trim();
  const reason =
    String(formData.get('reason') ?? '').trim() || 'Unsuspend from detail view';
  if (!userId) return { ok: false, error: 'missing_user_id' };
  const result = await insertStatusProposal({
    targetUserId: userId,
    newStatus: 'approved',
    proposedBy: auth.userId,
    proposerEmail: auth.email,
    reason,
  });
  revalidatePath('/admin/clients');
  revalidatePath(`/admin/clients/${userId}`);
  return result;
}

// promoteToAdmin: special-cased with the "no florist as admin" hard guard.
// UC-R-217 + UC-R-234. The guard is API-side (here) AND server-side in the
// proposal-executor (TODO: extend execClientProfileStatusChange in a future
// patch -- not editing proposal-executors.ts in Phase E per scope).
export async function promoteToAdmin(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; proposalId?: string }> {
  const auth = await requireAdmin();
  const userId = String(formData.get('user_id') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  const allowFlag = String(formData.get('allow_florist_promotion') ?? '') === 'true';
  if (!userId) return { ok: false, error: 'missing_user_id' };
  if (reason.length < 10) {
    return { ok: false, error: 'rationale_required_min_10_chars' };
  }

  const svc = getBackupServiceClient();
  // Hard guard: count placed orders. If > 0 and override flag not set -> reject.
  const { data: target } = await svc
    .from('client_profiles')
    .select('id, status, business_name')
    .eq('user_id', userId)
    .maybeSingle();
  if (!target) return { ok: false, error: 'client_not_found' };

  const { count: orderCount } = await svc
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const isApprovedFlorist = target.status === 'approved';
  const hasPlacedOrders = (orderCount ?? 0) > 0;

  if (isApprovedFlorist && hasPlacedOrders && !allowFlag) {
    return {
      ok: false,
      error:
        `no_florist_as_admin: target has ${orderCount} placed orders. ` +
        `Set allow_florist_promotion=true with explicit CEO rationale to override.`,
    };
  }

  const result = await insertStatusProposal({
    targetUserId: userId,
    newStatus: 'admin',
    proposedBy: auth.userId,
    proposerEmail: auth.email,
    reason,
    extraPayload: {
      new_role: 'admin',
      override_florist_admin_block: allowFlag,
      proposer_email: auth.email,
      target_business_name: target.business_name,
      target_order_count: orderCount ?? 0,
    },
  });
  revalidatePath('/admin/clients');
  revalidatePath(`/admin/clients/${userId}`);
  return result;
}

// Profile update goes through admin_proposals with a NEW type
// `client_profiles.update`. Per scope constraints we do not edit
// proposal-executors.ts in Phase E -- the proposal will land in
// /admin/catalog/approval-queue but executing it will return
// `unknown_proposal_type: client_profiles.update` until the executor is added.
// The new type IS, however, added to KNOWN_PROPOSAL_TYPES (TODO in report).
export async function proposeProfileUpdate(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; proposalId?: string }> {
  const auth = await requireAdmin();
  const userId = String(formData.get('user_id') ?? '').trim();
  if (!userId) return { ok: false, error: 'missing_user_id' };

  const fields: Record<string, string | null> = {};
  for (const key of ['business_name', 'phone', 'ein', 'notes'] as const) {
    const raw = formData.get(key);
    if (raw === null) continue;
    const str = String(raw).trim();
    fields[key] = str.length === 0 ? null : str;
  }
  if (Object.keys(fields).length === 0) {
    return { ok: false, error: 'no_fields_changed' };
  }
  // EIN format sanity (server-side belt; UI also validates):
  if (fields.ein && fields.ein.length > 32) {
    return { ok: false, error: 'invalid_ein_length' };
  }
  if (fields.phone && fields.phone.length > 32) {
    return { ok: false, error: 'invalid_phone_length' };
  }

  const svc = getBackupServiceClient();
  const { data: before, error: readErr } = await svc
    .from('client_profiles')
    .select('user_id, business_name, phone, ein, notes')
    .eq('user_id', userId)
    .maybeSingle();
  if (readErr) return { ok: false, error: `read_failed: ${readErr.message}` };
  if (!before) return { ok: false, error: 'client_not_found' };

  const reason = String(formData.get('reason') ?? '').trim() || 'Profile edit from detail view';

  const { data: proposal, error: insErr } = await svc
    .from('admin_proposals')
    .insert({
      type: 'client_profiles.update',
      target_table: 'client_profiles',
      target_id: userId,
      payload: fields,
      warnings: [],
      status: 'awaiting_facu',
      proposed_by: auth.userId,
      notes: reason,
      source_agent: 'job',
      source_table: 'client_profiles',
      source_id: userId,
      source_rationale: reason,
      filter_status: 'passed',
      before_value: before as Record<string, unknown>,
      after_value: { ...before, ...fields } as Record<string, unknown>,
      cascade_summary: {
        affected_sku_count: 0,
        affected_skus_sample: [],
        warnings: [],
        computed_at: new Date().toISOString(),
        computed_by: 'admin/clients/actions.proposeProfileUpdate',
      },
    })
    .select('id')
    .single();

  if (insErr) return { ok: false, error: `insert_failed: ${insErr.message}` };

  revalidatePath(`/admin/clients/${userId}`);
  return { ok: true, proposalId: proposal.id };
}

// Bulk approve N pending florists. Creates N proposals in one batch.
export async function bulkApprovePending(
  formData: FormData,
): Promise<{ ok: boolean; created: number; errors: string[] }> {
  const auth = await requireAdmin();
  const ids = formData.getAll('user_ids[]').map((v) => String(v).trim()).filter(Boolean);
  if (ids.length === 0) {
    return { ok: false, created: 0, errors: ['no_user_ids_selected'] };
  }
  const reason =
    String(formData.get('reason') ?? '').trim() || 'Bulk approve from clients list';

  const errors: string[] = [];
  let created = 0;
  for (const userId of ids) {
    const r = await insertStatusProposal({
      targetUserId: userId,
      newStatus: 'approved',
      proposedBy: auth.userId,
      proposerEmail: auth.email,
      reason,
    });
    if (r.ok) created += 1;
    else errors.push(`${userId.slice(0, 8)}: ${r.error}`);
  }

  revalidatePath('/admin/clients');
  return { ok: created > 0, created, errors };
}

// Log a phone note (manual entry) on the Communications tab.
// Direct insert (not proposal-routed) because phone notes are
// non-destructive append-only data; UC-R-224 spec.
export async function logPhoneNote(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; noteId?: string }> {
  const auth = await requireAdmin();
  const clientId = String(formData.get('client_id') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const orderIdRaw = String(formData.get('order_id') ?? '').trim();
  const contactedAtRaw = String(formData.get('contacted_at') ?? '').trim();
  if (!clientId) return { ok: false, error: 'missing_client_id' };
  if (note.length < 3) return { ok: false, error: 'note_too_short_min_3_chars' };
  if (note.length > 4000) return { ok: false, error: 'note_too_long_max_4000_chars' };

  let orderId: number | null = null;
  if (orderIdRaw) {
    const n = Number(orderIdRaw);
    if (Number.isFinite(n) && n > 0) orderId = n;
  }
  let contactedAt: string | null = null;
  if (contactedAtRaw) {
    const d = new Date(contactedAtRaw);
    if (!Number.isNaN(d.getTime())) contactedAt = d.toISOString();
  }

  const svc = getBackupServiceClient();
  const insert: Record<string, unknown> = {
    client_id: clientId,
    note,
    contacted_by: auth.userId,
  };
  if (orderId !== null) insert.order_id = orderId;
  if (contactedAt !== null) insert.contacted_at = contactedAt;

  const { data, error } = await svc
    .from('client_phone_notes')
    .insert(insert)
    .select('id, client_id')
    .single();
  if (error) return { ok: false, error: `insert_failed: ${error.message}` };

  // Reload the client's detail view so the new row appears.
  // The detail page is keyed by user_id; we look it up here.
  const { data: cp } = await svc
    .from('client_profiles')
    .select('user_id')
    .eq('id', clientId)
    .maybeSingle();
  if (cp?.user_id) revalidatePath(`/admin/clients/${cp.user_id}`);

  return { ok: true, noteId: data.id };
}
