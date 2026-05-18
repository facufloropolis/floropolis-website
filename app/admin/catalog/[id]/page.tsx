// Admin Catalog -- SKU detail (X2 STUB).
// v0.1 | 2026-05-18 | Job_PM CAT-S3 [V8 SHADOW]
//
// TODO (CAT-S4): replace with full editor: per-field actions, override
// publish/hide, forward-to-Rose, reviewer notes, gate-by-gate fixes.
//
// For now this is a minimal placeholder:
//   - Same admin gate pattern as the list page
//   - Reads catalog_classifications row + floropolis_inventory_mirror row
//     for the given sku_id
//   - Shows raw fields in a definition list
//   - Shows each failing_gates entry with a short "what this means" line
//
// Access: middleware + server-side admin re-check, non-admin -> redirect("/").
// Style: emerald-600 primary, ASCII clean copy.

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface ClassificationRow {
  sku_id: number;
  status: string;
  gate_score: number;
  failing_gates: string[] | null;
  vendor: string | null;
  tier: string | null;
  variety: string | null;
  last_validated_at: string | null;
  last_changed_at: string | null;
  reviewer_action: string | null;
  reviewer_at: string | null;
  reviewer_notes: string | null;
  created_at: string | null;
}

// Lightweight gate-id -> human explanation map. Filled in as gates are
// canonicalized in kb/projects/perfect_inventory_bar.md. Unknown ids show
// a generic line.
const GATE_EXPLAIN: Record<string, string> = {
  price_zero: 'Listed price is zero or null -- shop would show $0.00.',
  price_negative: 'Listed price is below zero.',
  cost_missing: 'Vendor cost is null -- cannot compute margin.',
  cost_zero: 'Vendor cost is zero -- formula divide-by-zero risk.',
  margin_unknown: 'Margin cannot be computed (cost or price missing).',
  margin_negative: 'Margin is negative -- selling at a loss.',
  margin_below_floor: 'Margin below the configured floor for this tier.',
  formula_deviation: 'Price diverges from formula by more than the allowed band.',
  name_missing: 'Product name is null on the mirror.',
  variety_missing: 'Variety is null -- needed for shop filtering.',
  vendor_missing: 'Vendor field is null on classification or mirror.',
  tier_missing: 'Tier (T1/T2/T3) is unset.',
  stock_zero: 'Stock is zero or null.',
  k2k_misaligned: 'k2k_alignment_status flags this row.',
  cost_stale: 'cost_verified_at older than the stale threshold.',
  override_conflict: 'Admin override conflicts with classifier output.',
};

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

export const metadata = {
  title: 'SKU detail | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function AdminCatalogDetailPage({ params }: PageProps) {
  // Admin gate ----------------------------------------------------------
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

  const { id } = await params;
  const skuId = Number.parseInt(id, 10);
  if (!Number.isFinite(skuId)) notFound();

  const backup = getBackupServiceClient();

  const { data: classRow } = await backup
    .from('catalog_classifications')
    .select(
      'sku_id, status, gate_score, failing_gates, vendor, tier, variety, last_validated_at, last_changed_at, reviewer_action, reviewer_at, reviewer_notes, created_at',
    )
    .eq('sku_id', skuId)
    .maybeSingle();

  const { data: mirrorRow } = await backup
    .from('floropolis_inventory_mirror')
    .select('*')
    .eq('id', skuId)
    .maybeSingle();

  const cls = classRow as ClassificationRow | null;
  const failing = (cls?.failing_gates ?? []) as string[];

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-5xl mx-auto px-4 py-10">
        {/* TODO banner */}
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <strong>STUB:</strong> Detailed editor + per-field actions land in
          CAT-S4. For now this page shows the raw classification + mirror
          fields so the &quot;Detail&quot; links from the list page do not 404.
        </div>

        {/* Header */}
        <div className="mb-8">
          <nav className="text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
            <Link href="/admin/catalog" className="hover:underline">
              Admin
            </Link>
            <span className="mx-1.5">/</span>
            <Link href="/admin/catalog" className="hover:underline">
              Catalog
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-700 font-medium font-mono">{skuId}</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900">
            SKU {skuId}{' '}
            {mirrorRow?.name && (
              <span className="text-slate-500 font-normal">
                -- {mirrorRow.name as string}
              </span>
            )}
          </h1>
          {cls ? (
            <p className="text-slate-500 text-sm mt-1">
              Status: <span className="font-semibold text-slate-700">{cls.status}</span>{' '}
              . Gate: <span className="font-mono">{cls.gate_score}/16</span>{' '}
              . Last validated {fmtDate(cls.last_validated_at)}
            </p>
          ) : (
            <p className="text-slate-500 text-sm mt-1">
              No classification row yet for this SKU.
            </p>
          )}
        </div>

        {/* Failing gates */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Failing gates
          </h2>
          {failing.length === 0 ? (
            <p className="text-sm text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg p-3">
              No failing gates -- this SKU is currently clean.
            </p>
          ) : (
            <ul className="space-y-2">
              {failing.map((g) => (
                <li
                  key={g}
                  className="border border-red-200 bg-red-50 rounded-lg p-3 text-sm"
                >
                  <div className="font-mono text-xs text-red-700">{g}</div>
                  <div className="text-slate-700 mt-1">
                    {GATE_EXPLAIN[g] ??
                      'Gate explanation not yet documented in GATE_EXPLAIN map.'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Classification raw fields */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Classification row
          </h2>
          {cls ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm border border-slate-200 rounded-xl p-4 bg-white">
              <DefRow label="sku_id" value={String(cls.sku_id)} mono />
              <DefRow label="status" value={cls.status} />
              <DefRow label="gate_score" value={`${cls.gate_score}/16`} mono />
              <DefRow label="vendor" value={cls.vendor ?? '-'} />
              <DefRow label="tier" value={cls.tier ?? '-'} />
              <DefRow label="variety" value={cls.variety ?? '-'} />
              <DefRow label="last_validated_at" value={fmtDate(cls.last_validated_at)} />
              <DefRow label="last_changed_at" value={fmtDate(cls.last_changed_at)} />
              <DefRow label="reviewer_action" value={cls.reviewer_action ?? '-'} />
              <DefRow label="reviewer_at" value={fmtDate(cls.reviewer_at)} />
              <DefRow
                label="reviewer_notes"
                value={cls.reviewer_notes ?? '-'}
                wide
              />
              <DefRow label="created_at" value={fmtDate(cls.created_at)} />
            </dl>
          ) : (
            <p className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg p-4">
              No row in catalog_classifications for sku_id {skuId}. Validator
              has not classified this SKU yet.
            </p>
          )}
        </section>

        {/* Mirror raw fields */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Mirror row (floropolis_inventory_mirror)
          </h2>
          {mirrorRow ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm border border-slate-200 rounded-xl p-4 bg-white">
              {Object.entries(mirrorRow).map(([k, v]) => (
                <DefRow
                  key={k}
                  label={k}
                  value={renderRaw(v)}
                  mono={k === 'id' || k === 'sku_id'}
                />
              ))}
            </dl>
          ) : (
            <p className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg p-4">
              No row in floropolis_inventory_mirror for id {skuId}. Mirror
              truncates daily -- check the next reload cycle.
            </p>
          )}
        </section>

        <Link
          href="/admin/catalog"
          className="text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
        >
          Back to catalog
        </Link>
      </main>

      <Footer />
    </div>
  );
}

function renderRaw(v: unknown): string {
  if (v == null) return '-';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function DefRow({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
        {label}
      </dt>
      <dd
        className={
          mono
            ? 'text-slate-900 font-mono text-xs break-all'
            : 'text-slate-900 break-words'
        }
      >
        {value}
      </dd>
    </div>
  );
}
