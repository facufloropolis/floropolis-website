// Admin catalog -- discount rules.
// v3 | 2026-05-19 | Job_PM Phase D [V8 SHADOW]
//
// Phase D changes:
//   - Active rules: Pause/Expire button next to each row creates a
//     discount_rule.status_change admin_proposal. Executor not yet wired
//     (stub flagged on the page).
//   - Active rules: usage stats per rule -- N orders, $X revenue -- joined
//     from public.discount_applications (new in Phase D).
// v2 | 2026-05-18 | Job_PM admin-port X6 [V8 SHADOW]
//
// Rewritten per mockup /mockups/admin-catalog-discounts. Drives a real
// proposal flow:
//
//   1. Side-by-side "Create new rule" form (client island). Computes 3
//      warnings live (low margin > 15% on sku/category; below GPM target
//      based on pricing_constants.gpm_target; new client < 3 paid orders).
//      Submit POSTs to /api/admin/proposals (type='discount_rule.create').
//   2. "Pending" section above active rules. Reads admin_proposals where
//      type='discount_rule.create' AND status='awaiting_facu'. Each row
//      has inline Approve / Reject buttons that POST to
//      /api/admin/proposals/[id]/{approve|reject} and refresh the page.
//   3. "Active rules" section below. Reads discount_rules where
//      status='active'. Shows scope badge, value, discount_pct, min_qty,
//      valid range, status. No inline edit on this pass -- pause/expire
//      ship in a follow-up.
//
// Scope value resolution: vendors come from floropolis_inventory_mirror.vendor
// (distinct), categories from .category (distinct), SKUs from .id (with name
// + price for the GPM warning). Clients come from client_profiles +
// get_client_emails RPC; paid_order_count is derived from a single
// COUNT-by-buyer query.
//
// Access:
//   - Middleware guards /admin and restricts to ADMIN_EMAILS or
//     client_profiles.status='admin'.
//   - Server-side belt-and-suspenders: re-check session + admin status.
//   - Non-admin -> redirect("/").
//
// Style: emerald-600 primary, Plus Jakarta Sans (inherited), ASCII-clean copy.

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { ACTIVE_PRICING_MARKET } from '@/lib/pricing-constants';
import WiringSection from '@/components/admin/WiringSection';
import MockupLinkBanner from '@/components/admin/MockupLinkBanner';
import { getWiringForPage } from '@/lib/admin/wiring';
import CreateDiscountForm, {
  type ScopeOption,
} from './CreateDiscountForm';
import PendingActions from './PendingActions';
import StatusChangeAction from './StatusChangeAction';

interface DiscountRuleRow {
  id: string;
  scope: string;
  scope_value: string;
  discount_pct: number | string;
  valid_from: string | null;
  valid_until: string | null;
  min_qty: number;
  status: string;
  notes: string | null;
  created_by_proposal_id: string | null;
  created_at: string;
}

interface PendingProposalRow {
  id: string;
  type: string;
  target_table: string;
  target_id: string | null;
  payload: Record<string, unknown>;
  warnings: unknown;
  status: string;
  proposed_by: string | null;
  proposed_at: string;
  notes: string | null;
}

interface ProposalWarning {
  severity: 'info' | 'warn' | 'critical';
  text: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtPct(n: number | string): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  return `${v}%`;
}

function asWarnings(raw: unknown): ProposalWarning[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((w) => {
    if (!w || typeof w !== 'object') return [];
    const r = w as { severity?: unknown; text?: unknown; detail?: unknown };
    const sev = r.severity;
    if (sev !== 'info' && sev !== 'warn' && sev !== 'critical') return [];
    const text =
      typeof r.text === 'string'
        ? r.text
        : typeof r.detail === 'string'
          ? r.detail
          : '';
    if (!text) return [];
    return [{ severity: sev, text }];
  });
}

function payloadString(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  return typeof v === 'string' ? v : '';
}
function payloadNumber(p: Record<string, unknown>, key: string): number | null {
  const v = p[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function ScopePill({ scope }: { scope: string }) {
  const map: Record<string, string> = {
    category: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    vendor: 'bg-blue-100 text-blue-800 border-blue-200',
    sku: 'bg-violet-100 text-violet-800 border-violet-200',
    client: 'bg-orange-100 text-orange-800 border-orange-200',
    client_category: 'bg-amber-100 text-amber-800 border-amber-200',
  };
  const cls = map[scope] ?? 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span
      className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${cls}`}
    >
      {scope}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    awaiting_facu: 'bg-orange-100 text-orange-800 border-orange-200',
    paused: 'bg-slate-100 text-slate-700 border-slate-200',
    expired: 'bg-red-100 text-red-700 border-red-200',
  };
  const cls = map[status] ?? 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span
      className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${cls}`}
    >
      {status}
    </span>
  );
}

function validRangeLabel(from: string | null, until: string | null): string {
  if (!from && !until) return 'no expiry';
  if (from && until) return `${fmtDate(from)} - ${fmtDate(until)}`;
  if (from) return `from ${fmtDate(from)}`;
  return `until ${fmtDate(until)}`;
}

export const metadata = {
  title: 'Discount rules | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function AdminCatalogDiscountsPage() {
  // Auth gate -------------------------------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect('/');

  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'admin') {
    redirect('/');
  }

  const backup = getBackupServiceClient();

  // Active rules ----------------------------------------------------------
  const { data: activeRaw, error: activeErr } = await backup
    .from('discount_rules')
    .select(
      'id,scope,scope_value,discount_pct,valid_from,valid_until,min_qty,status,notes,created_by_proposal_id,created_at',
    )
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(500);
  if (activeErr) {
    console.error('[admin/catalog/discounts] active fetch:', activeErr);
  }
  const active = (activeRaw ?? []) as unknown as DiscountRuleRow[];

  // Usage stats per active rule -- Phase D ------------------------------
  // Aggregate from public.discount_applications: count distinct orders +
  // sum applied_amount per rule_id. One fetch + JS bucket so we don't N+1.
  const activeIds = active.map((r) => r.id);
  const usageByRule: Record<string, { orders: number; revenue: number }> = {};
  if (activeIds.length > 0) {
    const { data: appRows, error: appErr } = await backup
      .from('discount_applications')
      .select('rule_id, order_id, applied_amount')
      .in('rule_id', activeIds);
    if (appErr) {
      console.error('[admin/catalog/discounts] usage fetch:', appErr);
    }
    const seenOrdersByRule: Record<string, Set<number>> = {};
    for (const row of (appRows ?? []) as Array<{
      rule_id: string;
      order_id: number;
      applied_amount: number | string;
    }>) {
      if (!usageByRule[row.rule_id]) {
        usageByRule[row.rule_id] = { orders: 0, revenue: 0 };
        seenOrdersByRule[row.rule_id] = new Set();
      }
      const amt = Number(row.applied_amount);
      if (Number.isFinite(amt)) {
        usageByRule[row.rule_id].revenue += amt;
      }
      const oid = Number(row.order_id);
      if (Number.isFinite(oid) && !seenOrdersByRule[row.rule_id].has(oid)) {
        seenOrdersByRule[row.rule_id].add(oid);
        usageByRule[row.rule_id].orders += 1;
      }
    }
  }

  // Pending discount proposals -------------------------------------------
  const { data: pendingRaw, error: pendingErr } = await backup
    .from('admin_proposals')
    .select(
      'id,type,target_table,target_id,payload,warnings,status,proposed_by,proposed_at,notes',
    )
    .eq('type', 'discount_rule.create')
    .eq('status', 'awaiting_facu')
    .order('proposed_at', { ascending: false })
    .limit(200);
  if (pendingErr) {
    console.error('[admin/catalog/discounts] pending fetch:', pendingErr);
  }
  const pending = (pendingRaw ?? []) as unknown as PendingProposalRow[];

  // pricing_constants.gpm_target ----------------------------------------
  const { data: gpmRow } = await backup
    .from('pricing_constants')
    .select('value_numeric')
    .eq('id', 'gpm_target')
    .eq('market', ACTIVE_PRICING_MARKET)
    .maybeSingle();
  const gpmTarget = (() => {
    const v = (gpmRow as { value_numeric?: number | string | null } | null)
      ?.value_numeric;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    throw new Error(`Missing pricing_constants.gpm_target for market=${ACTIVE_PRICING_MARKET}`);
  })();

  // Scope option lists ---------------------------------------------------
  // We pull a slim facet slice of inventory mirror to get vendors + categories
  // + a SKU pick-list with name + price (for the GPM warning).
  const { data: facetRaw } = await backup
    .from('floropolis_inventory_mirror')
    .select('id,name,variety,length,vendor,category,price')
    .order('name', { ascending: true })
    .limit(2000);

  type FacetRow = {
    id: number;
    name: string | null;
    variety: string | null;
    length: string | null;
    vendor: string | null;
    category: string | null;
    price: number | string | null;
  };
  const facets = (facetRaw ?? []) as FacetRow[];

  const vendorOptions: ScopeOption[] = Array.from(
    new Set(facets.map((r) => r.vendor ?? '').filter((v) => !!v)),
  )
    .sort()
    .map((v) => ({ value: v, label: v }));

  const categoryOptions: ScopeOption[] = Array.from(
    new Set(facets.map((r) => r.category ?? '').filter((v) => !!v)),
  )
    .sort()
    .map((v) => ({ value: v, label: v }));

  const skuOptions: ScopeOption[] = facets.slice(0, 1000).map((r) => {
    const label = [r.name, r.variety, r.length].filter(Boolean).join(' / ') ||
      `SKU #${r.id}`;
    const priceN = r.price == null ? null : Number(r.price);
    return {
      value: String(r.id),
      label: `${label} (#${r.id})`,
      unitPrice: priceN != null && Number.isFinite(priceN) ? priceN : null,
    };
  });

  // Clients -- name from client_profiles + emails via RPC + paid-order count
  // from orders (count rows where paid_at is not null per user_id; bounded list).
  const { data: clientProfiles } = await backup
    .from('client_profiles')
    .select('user_id,business_name,status')
    .order('business_name', { ascending: true, nullsFirst: false })
    .limit(500);

  type ClientRow = {
    user_id: string;
    business_name: string | null;
    status: string | null;
  };
  const clientRows = (clientProfiles ?? []) as ClientRow[];
  const clientIds = clientRows.map((c) => c.user_id);

  // Resolve emails via the existing RPC (used elsewhere in admin).
  const emailMap: Record<string, string> = {};
  if (clientIds.length > 0) {
    try {
      const { data: emailRows } = await userClient.rpc('get_client_emails', {
        user_ids: clientIds,
      });
      (emailRows ?? []).forEach((r: { user_id: string; email: string }) => {
        emailMap[r.user_id] = r.email;
      });
    } catch (e) {
      console.error('[admin/catalog/discounts] email rpc:', e);
    }
  }

  // Paid order count per user. Single fetch; bucket in JS. We use paid_at IS NOT NULL
  // as the "paid" signal (orders table has no payment_status enum, just timestamps).
  const paidCountByBuyer: Record<string, number> = {};
  if (clientIds.length > 0) {
    const { data: paidOrders } = await backup
      .from('orders')
      .select('user_id,paid_at')
      .in('user_id', clientIds)
      .not('paid_at', 'is', null)
      .limit(5000);
    (paidOrders ?? []).forEach((o) => {
      const bid = (o as { user_id?: string | null }).user_id;
      if (bid) paidCountByBuyer[bid] = (paidCountByBuyer[bid] ?? 0) + 1;
    });
  }

  const clientOptions: ScopeOption[] = clientRows.map((c) => {
    const display =
      c.business_name?.trim() ||
      emailMap[c.user_id] ||
      c.user_id.slice(0, 8);
    const email = emailMap[c.user_id];
    const label = email ? `${display} (${email})` : display;
    return {
      value: c.user_id,
      label,
      paidOrderCount: paidCountByBuyer[c.user_id] ?? 0,
    };
  });

  // Build a SKU id -> label lookup for the pending list (cheap rebuild).
  const skuLabelById = new Map(
    skuOptions.map((s) => [s.value, s.label.replace(/ \(#\d+\)$/, '')]),
  );

  function renderScopeValueLabel(scope: string, value: string): string {
    if (scope === 'vendor' || scope === 'category' || scope === 'client_category') {
      return value;
    }
    if (scope === 'sku') {
      return skuLabelById.get(value) ?? `SKU #${value}`;
    }
    if (scope === 'client') {
      const opt = clientOptions.find((o) => o.value === value);
      return opt?.label ?? value.slice(0, 8);
    }
    return value;
  }

  const wiringEntry = getWiringForPage('/admin/catalog/discounts');
  const wm = (id: string) =>
    wiringEntry?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-10">
        <MockupLinkBanner mockupHref="/mockups/admin-catalog-discounts" pageLabel="/admin/catalog/discounts" />
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Discount rules
            </h1>
            <p className="text-slate-500 text-sm mt-1 max-w-2xl">
              Scope-driven discounts by category / vendor / SKU / client /
              client category. Submit a proposal on the right; Facu approves
              below. Active rules are read by checkout.
            </p>
          </div>
          <div className="flex gap-4 text-sm">
            <div>
              <span className="font-semibold text-emerald-700">
                {active.length}
              </span>
              <span className="text-slate-500 ml-1">active</span>
            </div>
            <div>
              <span className="font-semibold text-orange-700">
                {pending.length}
              </span>
              <span className="text-slate-500 ml-1">pending</span>
            </div>
            <div>
              <span className="font-semibold text-slate-700">
                {(gpmTarget * 100).toFixed(0)}%
              </span>
              <span className="text-slate-500 ml-1">GPM target</span>
            </div>
          </div>
        </div>

        {/* Two-column layout: pending+active on the left, form on the right. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left col: pending + active rules ------------------------------ */}
          <div className="lg:col-span-2 space-y-8">
            {/* Pending */}
            <WiringSection level={wm('pending').level} note={wm('pending').note} id="pending">
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold text-orange-900 uppercase tracking-wide">
                  Pending Facu approval
                </h2>
                <span className="text-xs text-slate-500">
                  {pending.length} awaiting
                </span>
              </div>

              {pending.length === 0 ? (
                <div className="text-center py-10 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  <p className="font-semibold text-slate-600">
                    No pending proposals
                  </p>
                  <p className="text-sm mt-1">
                    Submit one on the right to queue an approval.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pending.map((p) => {
                    const scope = payloadString(p.payload, 'scope');
                    const scopeValue = payloadString(p.payload, 'scope_value');
                    const discountPct = payloadNumber(p.payload, 'discount_pct');
                    const minQty = payloadNumber(p.payload, 'min_qty') ?? 1;
                    const validFrom = payloadString(p.payload, 'valid_from') || null;
                    const validUntil = payloadString(p.payload, 'valid_until') || null;
                    const warns = asWarnings(p.warnings);
                    const notes =
                      p.notes ?? (payloadString(p.payload, 'notes') || null);
                    return (
                      <div
                        key={p.id}
                        className="rounded-xl border border-orange-200 bg-orange-50/50 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <ScopePill scope={scope} />
                              <span className="font-semibold text-slate-900 text-sm">
                                {renderScopeValueLabel(scope, scopeValue)}
                              </span>
                              <span className="text-base font-bold text-slate-900">
                                {discountPct != null ? `${discountPct}% off` : '-'}
                              </span>
                              {minQty > 1 && (
                                <span className="text-[11px] text-slate-500">
                                  min {minQty} stems
                                </span>
                              )}
                              <span className="text-[11px] text-slate-500">
                                {validRangeLabel(validFrom, validUntil)}
                              </span>
                            </div>
                            {notes && (
                              <p className="text-xs text-slate-700 mt-1.5 italic">
                                {notes}
                              </p>
                            )}
                            {warns.length > 0 && (
                              <div className="mt-2 space-y-0.5">
                                {warns.map((w, i) => (
                                  <div
                                    key={i}
                                    className={
                                      'text-[11px] flex items-start gap-1 ' +
                                      (w.severity === 'critical'
                                        ? 'text-red-700'
                                        : w.severity === 'warn'
                                          ? 'text-amber-700'
                                          : 'text-slate-500')
                                    }
                                  >
                                    <span className="font-bold">
                                      {w.severity === 'critical'
                                        ? '!!'
                                        : w.severity === 'warn'
                                          ? '!'
                                          : '.'}
                                    </span>
                                    <span>{w.text}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="text-[11px] text-slate-400 mt-2">
                              Proposed {fmtDate(p.proposed_at)} - proposal{' '}
                              <span className="font-mono">
                                {p.id.slice(0, 8)}...
                              </span>
                            </p>
                          </div>
                          <PendingActions proposalId={p.id} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            </WiringSection>

            {/* Active */}
            <WiringSection level={wm('active-rules').level} note={wm('active-rules').note} id="active-rules">
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold text-emerald-900 uppercase tracking-wide">
                  Active rules
                </h2>
                <span className="text-xs text-slate-500">
                  {active.length} live
                </span>
              </div>

              {active.length === 0 ? (
                <div className="text-center py-10 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  <p className="font-semibold text-slate-600">No active rules</p>
                  <p className="text-sm mt-1">
                    Approve a pending proposal to activate it.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Scope</th>
                        <th className="px-4 py-2 font-semibold">Value</th>
                        <th className="px-4 py-2 font-semibold text-right">
                          Discount
                        </th>
                        <th className="px-4 py-2 font-semibold text-right">
                          Min qty
                        </th>
                        <th className="px-4 py-2 font-semibold">Valid range</th>
                        <th className="px-4 py-2 font-semibold text-right">Usage</th>
                        <th className="px-4 py-2 font-semibold">Status</th>
                        <th className="px-4 py-2 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {active.map((r) => {
                        const usage = usageByRule[r.id] ?? { orders: 0, revenue: 0 };
                        return (
                          <tr key={r.id}>
                            <td className="px-4 py-3 align-top">
                              <ScopePill scope={r.scope} />
                            </td>
                            <td className="px-4 py-3 align-top text-slate-900">
                              <div className="font-medium">
                                {renderScopeValueLabel(r.scope, r.scope_value)}
                              </div>
                              {r.notes && (
                                <div className="text-xs text-slate-500 italic mt-1">
                                  {r.notes}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top text-right font-semibold text-emerald-700">
                              {fmtPct(r.discount_pct)}
                            </td>
                            <td className="px-4 py-3 align-top text-right text-slate-700">
                              {r.min_qty}
                            </td>
                            <td className="px-4 py-3 align-top text-slate-700">
                              {validRangeLabel(r.valid_from, r.valid_until)}
                            </td>
                            <td className="px-4 py-3 align-top text-right text-slate-700">
                              {usage.orders > 0 ? (
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {usage.orders} {usage.orders === 1 ? 'order' : 'orders'}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    ${usage.revenue.toFixed(2)}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400">never used</span>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <StatusPill status={r.status} />
                            </td>
                            <td className="px-4 py-3 align-top text-right">
                              <StatusChangeAction
                                ruleId={r.id}
                                scope={r.scope}
                                scopeValue={r.scope_value}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            </WiringSection>
          </div>

          {/* Right col: create form (sticky on lg+) ------------------------ */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-6">
              <WiringSection level={wm('create-form').level} note={wm('create-form').note} id="create-form">
              <CreateDiscountForm
                categories={categoryOptions}
                vendors={vendorOptions}
                skus={skuOptions}
                clients={clientOptions}
                gpmTarget={gpmTarget}
              />
              </WiringSection>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400 mt-8">
          Data sources: supabase-backup discount_rules (active) +
          admin_proposals (pending). Submitting writes a proposal row, not the
          rule directly. Approval calls the executor which inserts a row here
          with status=active and stamps created_by_proposal_id. Warnings shown
          on the form are also persisted on the proposal so Facu sees them at
          approval time.
        </p>
      </main>
    </>
  );
}
