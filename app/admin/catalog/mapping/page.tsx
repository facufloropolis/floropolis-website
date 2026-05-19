// Admin catalog -- SKU mapping queue (vendor SKU text -> canonical parent / quality family).
// v1 | 2026-05-18 | Job_PM admin-port X5 [V8 SHADOW]
//
// Reads sku_mappings from supabase-backup. Four tabs:
//   - awaiting_review (default)
//   - low_confidence  (parser confidence < 0.5)
//   - mapped
//   - rejected
//
// For each row we render:
//   - vendor_id + vendor_sku_text
//   - suggested parent_sku_id (if confidence >= 0.7) and suggested quality_family_id
//   - confidence bar (red / amber / emerald based on threshold)
//   - actions:
//       * Confirm mapping  -> opens picker, POSTs admin_proposals
//         (type=sku_mapping.confirm). Approval flips status='mapped'.
//       * Reject           -> POSTs /api/admin/mapping/[id]/reject directly
//         (no proposal -- rejection is reversible).
//
// Access:
//   - Middleware guards /admin and restricts to ADMIN_EMAILS or
//     client_profiles.status='admin'.
//   - Server-side belt-and-suspenders: re-check session + admin status here.
//   - Non-admin -> redirect("/").
//
// Style: emerald-600 primary, Plus Jakarta Sans (inherited), ASCII-clean copy.

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import WiringSection from '@/components/admin/WiringSection';
import MockupLinkBanner from '@/components/admin/MockupLinkBanner';
import { getWiringForPage } from '@/lib/admin/wiring';
import MappingActions, { type QualityFamilyOption } from './MappingActions';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

type Status = 'awaiting_review' | 'low_confidence' | 'mapped' | 'rejected';
const STATUS_VALUES: Status[] = [
  'awaiting_review',
  'low_confidence',
  'mapped',
  'rejected',
];
const STATUS_LABELS: Record<Status, string> = {
  awaiting_review: 'Awaiting review',
  low_confidence: 'Low confidence',
  mapped: 'Mapped',
  rejected: 'Rejected',
};

interface MappingRow {
  id: string;
  vendor_id: string;
  vendor_sku_text: string;
  parent_sku_id: string | null;
  quality_family_id: string | null;
  confidence: number | string;
  status: string;
  mapped_by: string | null;
  mapped_at: string | null;
  mapped_via_proposal_id: string | null;
  created_at: string;
}

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function confidenceClasses(conf: number): { text: string; bar: string } {
  if (conf >= 0.85)
    return { text: 'text-emerald-700', bar: 'bg-emerald-500' };
  if (conf >= 0.5) return { text: 'text-amber-700', bar: 'bg-amber-500' };
  return { text: 'text-red-700', bar: 'bg-red-500' };
}

function tabHref(s: Status): string {
  if (s === 'awaiting_review') return '/admin/catalog/mapping';
  return `/admin/catalog/mapping?status=${s}`;
}

export const metadata = {
  title: 'SKU mapping queue | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function AdminCatalogMappingPage({
  searchParams,
}: PageProps) {
  // Auth gate ------------------------------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect('/');

  const adminClient = getBackupServiceClient();
  const emailLc = (user.email ?? '').toLowerCase();
  const isAdminByEmail = ADMIN_EMAILS.includes(emailLc);
  if (!isAdminByEmail) {
    const { data: profile } = await adminClient
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!profile || profile.status !== 'admin') {
      redirect('/');
    }
  }

  // Tab state ------------------------------------------------------------
  const sp = await searchParams;
  const requested = (sp.status ?? 'awaiting_review') as Status;
  const status: Status = STATUS_VALUES.includes(requested)
    ? requested
    : 'awaiting_review';

  // Counts for tab badges -----------------------------------------------
  const backup = getBackupServiceClient();
  const countResults = await Promise.all(
    STATUS_VALUES.map(async (s) => {
      const { count } = await backup
        .from('sku_mappings')
        .select('id', { count: 'exact', head: true })
        .eq('status', s);
      return [s, count ?? 0] as const;
    }),
  );
  const counts: Record<Status, number> = {
    awaiting_review: 0,
    low_confidence: 0,
    mapped: 0,
    rejected: 0,
  };
  for (const [s, n] of countResults) counts[s] = n;

  // Fetch mappings for the active tab -----------------------------------
  const { data: rowsRaw, error: rowsErr } = await backup
    .from('sku_mappings')
    .select(
      'id, vendor_id, vendor_sku_text, parent_sku_id, quality_family_id, confidence, status, mapped_by, mapped_at, mapped_via_proposal_id, created_at',
    )
    .eq('status', status)
    .order('confidence', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200);
  if (rowsErr) {
    console.error('[admin/catalog/mapping] fetch:', rowsErr);
  }
  const rows = (rowsRaw ?? []) as unknown as MappingRow[];

  // Quality families for the confirm dropdown ---------------------------
  const { data: qfRows, error: qfErr } = await backup
    .from('quality_families')
    .select('id, name, category')
    .order('id', { ascending: true })
    .limit(500);
  if (qfErr) {
    console.error('[admin/catalog/mapping] quality_families fetch:', qfErr);
  }
  const qualityFamilies = (qfRows ?? []) as unknown as QualityFamilyOption[];

  // Render --------------------------------------------------------------
  const wiringEntry = getWiringForPage('/admin/catalog/mapping');
  const wm = (id: string) =>
    wiringEntry?.sections.find((s) => s.id === id) ?? { level: 'PLAN' as const, note: 'unregistered' };

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-10">
        <MockupLinkBanner mockupHref="/mockups/admin-catalog-mapping" pageLabel="/admin/catalog/mapping" />
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            SKU mapping queue
          </h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Vendor SKU text =&gt; canonical (parent_sku, quality_family). Rows
            land here from the ingestion-side SKU Mapper agent. Confirming a
            mapping creates an admin proposal; rejections are reversible and
            apply immediately. Data source: supabase-backup sku_mappings.
          </p>
        </div>

        {/* Header counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Tile
            label="Awaiting review"
            value={String(counts.awaiting_review)}
            hint="Conf 0.50 - 0.85"
            tone="orange"
          />
          <Tile
            label="Low confidence"
            value={String(counts.low_confidence)}
            hint="Conf < 0.50"
            tone="red"
          />
          <Tile
            label="Mapped"
            value={String(counts.mapped)}
            hint="Lifetime confirmed"
            tone="emerald"
          />
          <Tile
            label="Rejected"
            value={String(counts.rejected)}
            hint="Reversible"
            tone="slate"
          />
        </div>

        {/* Tab bar */}
        <WiringSection level={wm('tabs').level} note={wm('tabs').note} id="tabs">
        <div className="flex flex-wrap gap-1 mb-5 border-b border-slate-200">
          {STATUS_VALUES.map((s) => {
            const active = status === s;
            return (
              <a
                key={s}
                href={tabHref(s)}
                className={
                  active
                    ? 'px-4 py-2 text-sm font-semibold text-emerald-700 border-b-2 border-emerald-600 -mb-px'
                    : 'px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 border-b-2 border-transparent -mb-px'
                }
              >
                {STATUS_LABELS[s]}
                <span
                  className={
                    active
                      ? 'ml-2 inline-flex items-center justify-center text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5'
                      : 'ml-2 inline-flex items-center justify-center text-[11px] font-medium rounded-full bg-slate-100 text-slate-600 px-2 py-0.5'
                  }
                >
                  {counts[s]}
                </span>
              </a>
            );
          })}
        </div>

        </WiringSection>

        {/* Body */}
        <WiringSection level={wm('mapping-list').level} note={wm('mapping-list').note} id="mapping-list">
        {rows.length === 0 ? (
          <div className="text-center py-20 text-slate-500 border border-dashed border-slate-200 rounded-xl">
            <p className="font-semibold text-slate-700">
              No vendor batches awaiting mapping.
            </p>
            <p className="text-sm mt-1 max-w-md mx-auto">
              When ingestion batches land here (from the X4 ingest pipeline),
              they&apos;ll appear for review.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Vendor</th>
                  <th className="px-3 py-2 font-semibold">Vendor SKU</th>
                  <th className="px-3 py-2 font-semibold">Suggested</th>
                  <th className="px-3 py-2 font-semibold w-40">Confidence</th>
                  <th className="px-3 py-2 font-semibold">Created</th>
                  <th className="px-3 py-2 font-semibold w-44">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const conf = Number(r.confidence);
                  const c = confidenceClasses(conf);
                  const showSuggestion = conf >= 0.7;
                  const rowStatus = (
                    STATUS_VALUES.includes(r.status as Status)
                      ? r.status
                      : 'awaiting_review'
                  ) as Status;

                  return (
                    <tr
                      key={r.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 align-top"
                    >
                      <td className="px-3 py-3 text-xs text-slate-600 font-mono whitespace-nowrap">
                        {r.vendor_id}
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-900 font-medium break-words max-w-xs">
                        {r.vendor_sku_text}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700 max-w-xs">
                        {showSuggestion && (r.parent_sku_id || r.quality_family_id) ? (
                          <div className="space-y-0.5">
                            {r.parent_sku_id && (
                              <div className="font-mono break-all">
                                <span className="text-slate-400">parent: </span>
                                {r.parent_sku_id}
                              </div>
                            )}
                            {r.quality_family_id && (
                              <div className="font-mono break-all">
                                <span className="text-slate-400">family: </span>
                                {r.quality_family_id}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">
                            no high-confidence suggestion
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${c.bar}`}
                              style={{
                                width: `${Math.max(0, Math.min(1, conf)) * 100}%`,
                              }}
                            />
                          </div>
                          <span className={`text-xs font-semibold ${c.text}`}>
                            {(conf * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {fmtDate(r.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <MappingActions
                          mappingId={r.id}
                          vendorSkuText={r.vendor_sku_text}
                          suggestedQualityFamilyId={r.quality_family_id}
                          suggestedParentSkuId={r.parent_sku_id}
                          qualityFamilies={qualityFamilies}
                          status={rowStatus}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        </WiringSection>

        <p className="text-xs text-slate-400 mt-8">
          Data source: supabase-backup sku_mappings. Confirm =&gt; proposal in
          admin_proposals, flips to &quot;mapped&quot; after Facu approval.
          Reject =&gt; status flips to &quot;rejected&quot; immediately
          (reversible).
        </p>
      </main>
    </>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'orange' | 'red' | 'emerald' | 'slate';
}) {
  const cls =
    tone === 'orange'
      ? 'bg-orange-50 border-orange-200 text-orange-900'
      : tone === 'red'
        ? 'bg-red-50 border-red-200 text-red-900'
        : tone === 'emerald'
          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
          : 'bg-white border-slate-200 text-slate-900';
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
      <div className="text-[11px] mt-0.5 opacity-70">{hint}</div>
    </div>
  );
}
