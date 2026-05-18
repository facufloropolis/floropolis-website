// Admin refund approvals queue.
// v1 | 2026-05-17 | Job_PM W4-S13 [V8 SHADOW]
//
// Lists pending refund_approvals from supabase-backup. Shows quorum status,
// individual JJ / Facu votes, expiry, and an "Execute refund" button when
// quorum_met=true.
//
// Access:
//   - Middleware guards /admin and restricts to facu@floropolis.com.
//   - Server-side belt-and-suspenders: re-check session + client_profiles.status='admin'.
//   - Non-admin -> redirect("/").
//
// Style: emerald-600 primary, Plus Jakarta Sans (inherited), ASCII-clean copy.

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';
import RefundActions from './RefundActions';

interface RefundApprovalRow {
  id: number;
  order_id: number;
  payment_id: number | null;
  proposed_amount: number | string;
  currency: string;
  status: string;
  proposed_by: string;
  reason: string;
  jj_approved: boolean | null;
  jj_approved_at: string | null;
  facu_approved: boolean | null;
  facu_approved_at: string | null;
  quorum_met: boolean;
  expires_at: string;
  created_at: string;
  // Supabase typegen returns nested embeds as arrays for one-to-many; we treat
  // it as either-or so the same shape works whether the FK is interpreted as
  // one-to-one or one-to-many.
  orders?: { order_number: string | null } | { order_number: string | null }[] | null;
}

function orderNumber(o: RefundApprovalRow['orders']): string | null {
  if (!o) return null;
  if (Array.isArray(o)) return o[0]?.order_number ?? null;
  return o.order_number ?? null;
}

function tierLabel(amount: number): string {
  if (amount <= 200) return 'Tier 1 (<= $200, JJ or Facu)';
  if (amount <= 500) return 'Tier 2 ($200-$500, Facu only)';
  return 'Tier 3 (> $500, JJ + Facu)';
}

function fmtUsd(amount: number | string, currency: string): string {
  const n = Number(amount);
  const sign = currency === 'USD' ? '$' : `${currency} `;
  return `${sign}${n.toFixed(2)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function expiresInWords(iso: string): { text: string; expired: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: 'expired', expired: true };
  const hours = Math.floor(ms / 3600_000);
  if (hours < 24) return { text: `in ${hours}h`, expired: false };
  const days = Math.floor(hours / 24);
  return { text: `in ${days}d`, expired: false };
}

export const metadata = {
  title: 'Refund Approvals | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function AdminRefundsPage() {
  // Re-check admin server-side ----------------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect('/');

  const { data: profile } = await userClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'admin') {
    redirect('/');
  }

  // Fetch pending refund_approvals from supabase-backup ---------------------
  const backup = getBackupServiceClient();
  const { data: approvalsRaw, error } = await backup
    .from('refund_approvals')
    .select(
      'id, order_id, payment_id, proposed_amount, currency, status, proposed_by, reason, jj_approved, jj_approved_at, facu_approved, facu_approved_at, quorum_met, expires_at, created_at, orders ( order_number )',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[admin/refunds] fetch error:', error);
  }

  const approvals = (approvalsRaw ?? []) as unknown as RefundApprovalRow[];

  // Resolve proposer email via the same RPC used in /admin/clients ---------
  const proposerIds = Array.from(new Set(approvals.map((a) => a.proposed_by)));
  const emailMap: Record<string, string> = {};
  if (proposerIds.length > 0) {
    const { data: emailRows } = await userClient.rpc('get_client_emails', {
      user_ids: proposerIds,
    });
    (emailRows ?? []).forEach((r: { user_id: string; email: string }) => {
      emailMap[r.user_id] = r.email;
    });
  }

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            Refund approvals - Facu + JJ
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Quorum: JJ or Facu &lt;= $200; Facu only $200-$500; both &gt; $500.
            Approvals expire 7 days after creation.
          </p>
          <div className="flex gap-4 mt-4 text-sm">
            <div>
              <span className="font-semibold text-slate-900">{approvals.length}</span>
              <span className="text-slate-500 ml-1">pending</span>
            </div>
            <div>
              <span className="font-semibold text-emerald-700">
                {approvals.filter((a) => a.quorum_met).length}
              </span>
              <span className="text-slate-500 ml-1">ready to execute</span>
            </div>
          </div>
        </div>

        {approvals.length === 0 ? (
          <div className="text-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <p className="font-semibold text-slate-600">No pending refund approvals</p>
            <p className="text-sm mt-1">
              New refund requests will appear here for vote and execution.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {approvals.map((a) => {
              const amt = Number(a.proposed_amount);
              const exp = expiresInWords(a.expires_at);
              const proposerEmail = emailMap[a.proposed_by] ?? a.proposed_by.slice(0, 8) + '...';
              return (
                <div
                  key={a.id}
                  className="border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors"
                >
                  <div className="flex flex-wrap justify-between items-start gap-4">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xl font-bold text-slate-900">
                          {fmtUsd(a.proposed_amount, a.currency)}
                        </span>
                        <span className="text-sm font-mono text-slate-500">
                          {orderNumber(a.orders) ?? `order #${a.order_id}`}
                        </span>
                        {a.quorum_met ? (
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold border bg-emerald-100 text-emerald-800 border-emerald-200">
                            Quorum met
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold border bg-amber-100 text-amber-800 border-amber-200">
                            Awaiting votes
                          </span>
                        )}
                        {exp.expired && (
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold border bg-red-100 text-red-700 border-red-200">
                            Expired
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {tierLabel(amt)} - proposed by {proposerEmail} on{' '}
                        {fmtDate(a.created_at)} - expires {exp.text}
                      </div>
                      <p className="text-sm text-slate-700 mt-3 whitespace-pre-wrap">
                        {a.reason}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-500 font-mono">
                      approval #{a.id}
                    </div>
                  </div>

                  {/* Vote status grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    <div className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                          JJ
                        </span>
                        {a.jj_approved === true && (
                          <span className="text-emerald-700 text-xs font-semibold">
                            Approved
                          </span>
                        )}
                        {a.jj_approved === false && (
                          <span className="text-red-600 text-xs font-semibold">
                            Rejected
                          </span>
                        )}
                        {a.jj_approved == null && (
                          <span className="text-slate-400 text-xs">No vote</span>
                        )}
                      </div>
                      {a.jj_approved_at && (
                        <div className="text-xs text-slate-400 mt-1">
                          {fmtDate(a.jj_approved_at)}
                        </div>
                      )}
                    </div>
                    <div className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                          Facu
                        </span>
                        {a.facu_approved === true && (
                          <span className="text-emerald-700 text-xs font-semibold">
                            Approved
                          </span>
                        )}
                        {a.facu_approved === false && (
                          <span className="text-red-600 text-xs font-semibold">
                            Rejected
                          </span>
                        )}
                        {a.facu_approved == null && (
                          <span className="text-slate-400 text-xs">No vote</span>
                        )}
                      </div>
                      {a.facu_approved_at && (
                        <div className="text-xs text-slate-400 mt-1">
                          {fmtDate(a.facu_approved_at)}
                        </div>
                      )}
                    </div>
                  </div>

                  <RefundActions
                    id={a.id}
                    quorumMet={a.quorum_met}
                    expired={exp.expired}
                    jjApproved={a.jj_approved}
                    facuApproved={a.facu_approved}
                  />
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-slate-400 mt-8">
          Data source: supabase-backup refund_approvals. Execution calls Stripe directly;
          on success the row flips to status=&quot;executed&quot; and a payments ledger row is
          written with idempotency_key=&quot;refund:{'{id}'}&quot;.
        </p>
      </main>

      <Footer />
    </div>
  );
}
