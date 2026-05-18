// Admin catalog -- approval queue (Facu triage).
// v1 | 2026-05-18 | Job_PM CAT-S5 [V8 SHADOW]
//
// Lists catalog_classifications rows where status='needs_facu_review' AND
// reviewer_action='awaiting'. Per Facu (2026-05-18):
//   "Rose sends you what you should publish and you flag what is approved
//    and force me to review."
//
// For each row Facu can:
//   - Approve publish      -> reviewer_action='approve_publish', status='admin_overridden_publish'
//   - Reject hide          -> reviewer_action='reject_hide',     status='admin_overridden_hide'
//   - Forward to Rose      -> reviewer_action='forward_to_rose', status='needs_data_fix'
//
// Bulk action bar applies the same to all selected rows.
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
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';
import {
  BulkBar,
  RowActions,
  RowSelect,
  SelectionProvider,
} from './Actions';
import { gateCategory, gateLabel } from '@/lib/catalog-gates';

interface ClassificationRow {
  sku_id: number;
  status: string;
  failing_gates: string[] | null;
  gate_score: number;
  vendor: string | null;
  tier: string | null;
  variety: string | null;
  last_validated_at: string;
}

interface MirrorSlim {
  id: number;
  name: string | null;
  variety: string | null;
  length: string | null;
  vendor: string | null;
}

interface PageProps {
  searchParams: Promise<{
    filter?: string;
  }>;
}

type Filter = 'all' | 'price' | 'formula' | 't3_edge';
const FILTER_LABELS: Record<Filter, string> = {
  all: 'All awaiting',
  price: 'Just price issues',
  formula: 'Just formula issues',
  t3_edge: 'Just T3 edge cases',
};

function asGateArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}

function rowMatchesFilter(gates: string[], filter: Filter): boolean {
  if (filter === 'all') return true;
  return gates.some((g) => gateCategory(g) === filter);
}

function skuLabel(m: MirrorSlim | undefined, c: ClassificationRow): string {
  const bits = [
    m?.name ?? c.variety ?? 'unknown',
    m?.variety,
    m?.length,
  ].filter(Boolean);
  return bits.join(' / ') || `SKU #${c.sku_id}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const metadata = {
  title: 'Approval queue | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function AdminCatalogApprovalQueuePage({
  searchParams,
}: PageProps) {
  // Auth gate ------------------------------------------------------------
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

  const sp = await searchParams;
  const rawFilter = (sp.filter ?? 'all') as Filter;
  const filter: Filter = (['all', 'price', 'formula', 't3_edge'] as Filter[]).includes(rawFilter)
    ? rawFilter
    : 'all';

  // Fetch rows awaiting Facu review --------------------------------------
  const backup = getBackupServiceClient();
  const { data: classRaw, error: classErr } = await backup
    .from('catalog_classifications')
    .select(
      'sku_id,status,failing_gates,gate_score,vendor,tier,variety,last_validated_at',
    )
    .eq('status', 'needs_facu_review')
    .eq('reviewer_action', 'awaiting')
    .order('last_validated_at', { ascending: false })
    .limit(500);
  if (classErr) {
    console.error('[admin/catalog/approval-queue] fetch:', classErr);
  }
  const classifications = (classRaw ?? []).map((r) => ({
    ...(r as ClassificationRow),
    failing_gates: asGateArray((r as { failing_gates: unknown }).failing_gates),
  })) as ClassificationRow[];

  // Filter post-fetch (gate category is derived in JS).
  const filtered = classifications.filter((c) =>
    rowMatchesFilter(c.failing_gates ?? [], filter),
  );

  // Mirror lookup for name / length context ------------------------------
  const skuIds = filtered.map((c) => c.sku_id);
  let mirrorById: Record<number, MirrorSlim> = {};
  if (skuIds.length > 0) {
    const { data: mirrorRaw } = await backup
      .from('floropolis_inventory_mirror')
      .select('id,name,variety,length,vendor')
      .in('id', skuIds);
    for (const m of (mirrorRaw ?? []) as MirrorSlim[]) {
      mirrorById[m.id] = m;
    }
  }

  // Filter chip hrefs ----------------------------------------------------
  function chipHref(f: Filter): string {
    if (f === 'all') return '/admin/catalog/approval-queue';
    return `/admin/catalog/approval-queue?filter=${f}`;
  }

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Approval queue</h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            {filtered.length} row{filtered.length === 1 ? '' : 's'} awaiting your
            review. Rose sends what looks publishable; the validator flags rows
            that need a human call. Approve, reject, or send back to Rose.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {(['all', 'price', 'formula', 't3_edge'] as Filter[]).map((f) => {
              const active = filter === f;
              return (
                <a
                  key={f}
                  href={chipHref(f)}
                  className={
                    active
                      ? 'px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'px-3 py-1 text-xs font-medium rounded-full text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }
                >
                  {FILTER_LABELS[f]}
                </a>
              );
            })}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <p className="font-semibold text-slate-600">
              Nothing awaiting your review.
            </p>
            <p className="text-sm mt-1">
              Validator is happy or no rows match needs_facu_review.
            </p>
          </div>
        ) : (
          <SelectionProvider>
            <BulkBar allSkuIds={filtered.map((c) => c.sku_id)} />

            <div className="space-y-4">
              {filtered.map((c) => {
                const m = mirrorById[c.sku_id];
                const gates = c.failing_gates ?? [];
                return (
                  <div
                    key={c.sku_id}
                    className="border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex flex-wrap items-start gap-4">
                      {/* Left: select + identity */}
                      <div className="flex items-start gap-3 min-w-[220px] flex-1">
                        <div className="pt-1">
                          <RowSelect skuId={c.sku_id} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 text-sm">
                            {skuLabel(m, c)}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {(c.vendor ?? m?.vendor) ?? 'no vendor'}
                            {c.tier ? ` -- ${c.tier.toUpperCase()}` : ''}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-1">
                            SKU #{c.sku_id} -- gate score {c.gate_score}/16 --
                            last validated {fmtDate(c.last_validated_at)}
                          </div>
                        </div>
                      </div>

                      {/* Middle: failing gates */}
                      <div className="flex-1 min-w-[260px]">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">
                          Failing gates
                        </div>
                        {gates.length === 0 ? (
                          <div className="text-xs text-slate-400 italic">
                            No gates listed -- forwarded by override
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {gates.map((g) => (
                              <div
                                key={g}
                                className="flex items-start gap-2 text-xs"
                              >
                                <span className="inline-block shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">
                                  {g}
                                </span>
                                <span className="text-slate-700">
                                  {gateLabel(g)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right: actions */}
                      <RowActions skuId={c.sku_id} />
                    </div>
                  </div>
                );
              })}
            </div>
          </SelectionProvider>
        )}

        <p className="text-xs text-slate-400 mt-8">
          Data source: supabase-backup catalog_classifications. Approve =
          status flips to admin_overridden_publish; reject = admin_overridden_hide;
          forward = back to Rose with status needs_data_fix. All three stamp
          reviewer_user_id + reviewer_at + reviewer_notes.
        </p>
      </main>

      <Footer />
    </div>
  );
}
