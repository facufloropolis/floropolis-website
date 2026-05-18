// Admin Catalog -- Ingest (vendor data staging viewer).
// v1 | 2026-05-18 | Job_PM admin-port X4 [V8 SHADOW]
//
// Reads ingestion_batches from supabase-backup and renders:
//   - 5 source badges with counts (komet_api LIVE; vendor_email/whatsapp/csv_upload PLANNED;
//     manual_paste LIVE via the form on this page)
//   - Filter tabs (All / awaiting_review / mapped / rejected / imported)
//   - Row list per batch: received_at, source badge, vendor_id, # parsed rows,
//     parser_confidence (color coded), status badge, expand to see raw_payload
//     vs parsed_rows side-by-side
//   - Manual paste form -> POST /api/admin/ingest/manual
//
// This page is a VIEWER. The Komet API live pipeline is owned by Rose_BI and
// runs as a separate cron writing rows with source='komet_api'. The
// vendor_email / whatsapp / csv_upload adapters DON'T EXIST YET (P2 vendor
// ingestion agent specs).
//
// Access:
//   - Middleware guards /admin and restricts to ADMIN_EMAILS or
//     client_profiles.status='admin'.
//   - Server-side belt-and-suspenders: re-check here. Non-admin -> redirect("/").
//
// Style: emerald-600 primary, Plus Jakarta Sans (inherited), ASCII-clean copy.

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';
import ManualPasteForm from './ManualPasteForm';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

type Source =
  | 'komet_api'
  | 'vendor_email'
  | 'whatsapp'
  | 'csv_upload'
  | 'manual_paste';

type Status = 'awaiting_review' | 'mapped' | 'rejected' | 'imported';

const SOURCE_VALUES: Source[] = [
  'komet_api',
  'vendor_email',
  'whatsapp',
  'csv_upload',
  'manual_paste',
];

const STATUS_VALUES: (Status | 'all')[] = [
  'all',
  'awaiting_review',
  'mapped',
  'rejected',
  'imported',
];

const SOURCE_LABEL: Record<Source, string> = {
  komet_api: 'Komet API',
  vendor_email: 'Vendor email',
  whatsapp: 'WhatsApp',
  csv_upload: 'CSV upload',
  manual_paste: 'Manual paste',
};

// LIVE = real pipeline already writes here. PLANNED = adapter not built yet.
const SOURCE_LIVE: Record<Source, boolean> = {
  komet_api: true,
  vendor_email: false,
  whatsapp: false,
  csv_upload: false,
  manual_paste: true,
};

const SOURCE_BADGE_CLS: Record<Source, string> = {
  komet_api: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  vendor_email: 'bg-blue-50 text-blue-700 border-blue-200',
  whatsapp: 'bg-green-50 text-green-700 border-green-200',
  csv_upload: 'bg-slate-50 text-slate-700 border-slate-200',
  manual_paste: 'bg-amber-50 text-amber-700 border-amber-200',
};

const STATUS_LABEL: Record<Status, string> = {
  awaiting_review: 'Awaiting review',
  mapped: 'Mapped',
  rejected: 'Rejected',
  imported: 'Imported',
};

const STATUS_BADGE_CLS: Record<Status, string> = {
  awaiting_review: 'bg-orange-100 text-orange-800',
  mapped: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-800',
  imported: 'bg-emerald-100 text-emerald-800',
};

interface IngestionBatchRow {
  id: string;
  source: Source;
  vendor_id: string | null;
  received_at: string;
  raw_payload: unknown;
  parsed_rows: unknown;
  parser_confidence: number | string;
  status: Status;
  notes: string | null;
  created_by: string | null;
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

function confidenceTone(c: number): string {
  if (c > 0.8) return 'text-emerald-700';
  if (c >= 0.5) return 'text-amber-700';
  return 'text-red-700';
}

function countParsedRows(raw: unknown): number {
  return Array.isArray(raw) ? raw.length : 0;
}

function safeStringify(v: unknown, max = 4000): string {
  try {
    const s = JSON.stringify(v, null, 2);
    if (s.length <= max) return s;
    return s.slice(0, max) + `\n... (+${s.length - max} chars truncated)`;
  } catch {
    return String(v);
  }
}

function statusHref(s: Status | 'all'): string {
  if (s === 'all') return '/admin/catalog/ingest';
  return `/admin/catalog/ingest?status=${s}`;
}

export const metadata = {
  title: 'Vendor ingestion staging | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function AdminCatalogIngestPage({
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
  const requested = (sp.status ?? 'all') as Status | 'all';
  const statusTab: Status | 'all' = STATUS_VALUES.includes(requested)
    ? requested
    : 'all';

  const backup = getBackupServiceClient();

  // Counts per source (header badges) -----------------------------------
  const sourceCountResults = await Promise.all(
    SOURCE_VALUES.map(async (src) => {
      const { count } = await backup
        .from('ingestion_batches')
        .select('id', { count: 'exact', head: true })
        .eq('source', src);
      return [src, count ?? 0] as const;
    }),
  );
  const sourceCounts: Record<Source, number> = {
    komet_api: 0,
    vendor_email: 0,
    whatsapp: 0,
    csv_upload: 0,
    manual_paste: 0,
  };
  for (const [src, n] of sourceCountResults) sourceCounts[src] = n;

  // Counts per status (tab badges) --------------------------------------
  const statusCountResults = await Promise.all(
    (STATUS_VALUES.filter((s) => s !== 'all') as Status[]).map(async (s) => {
      const { count } = await backup
        .from('ingestion_batches')
        .select('id', { count: 'exact', head: true })
        .eq('status', s);
      return [s, count ?? 0] as const;
    }),
  );
  const statusCounts: Record<Status, number> = {
    awaiting_review: 0,
    mapped: 0,
    rejected: 0,
    imported: 0,
  };
  for (const [s, n] of statusCountResults) statusCounts[s] = n;
  const totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  // Rows for the active tab ---------------------------------------------
  let q = backup
    .from('ingestion_batches')
    .select(
      'id, source, vendor_id, received_at, raw_payload, parsed_rows, parser_confidence, status, notes, created_by',
    )
    .order('received_at', { ascending: false })
    .limit(200);
  if (statusTab !== 'all') q = q.eq('status', statusTab);

  const { data: rowsRaw, error: rowsErr } = await q;
  if (rowsErr) {
    console.error('[admin/catalog/ingest] fetch:', rowsErr);
  }
  const rows = (rowsRaw ?? []) as unknown as IngestionBatchRow[];

  // Render --------------------------------------------------------------
  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Vendor ingestion staging
          </h1>
          <p className="text-slate-500 text-sm mt-1 max-w-3xl">
            Raw vendor offers from every inbound source. Komet API and manual
            paste are LIVE; vendor email, WhatsApp, and CSV upload adapters are
            planned (P2 vendor ingestion agents). Approve a batch to route it
            to the SKU mapping queue.
          </p>
        </div>

        {/* Source badges */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {SOURCE_VALUES.map((src) => {
            const live = SOURCE_LIVE[src];
            const n = sourceCounts[src];
            return (
              <div
                key={src}
                className={`rounded-xl border p-3 ${
                  live
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${SOURCE_BADGE_CLS[src]}`}
                  >
                    {SOURCE_LABEL[src]}
                  </span>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wide ${
                      live ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {live ? 'LIVE' : 'PLANNED'}
                  </span>
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1.5">
                  {n.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {n === 1 ? 'batch' : 'batches'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-1 mb-5 border-b border-slate-200">
          {STATUS_VALUES.map((s) => {
            const active = statusTab === s;
            const label = s === 'all' ? 'All' : STATUS_LABEL[s];
            const n = s === 'all' ? totalCount : statusCounts[s];
            return (
              <a
                key={s}
                href={statusHref(s)}
                className={
                  active
                    ? 'px-4 py-2 text-sm font-semibold text-emerald-700 border-b-2 border-emerald-600 -mb-px'
                    : 'px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 border-b-2 border-transparent -mb-px'
                }
              >
                {label}
                <span
                  className={
                    active
                      ? 'ml-2 inline-flex items-center justify-center text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5'
                      : 'ml-2 inline-flex items-center justify-center text-[11px] font-medium rounded-full bg-slate-100 text-slate-600 px-2 py-0.5'
                  }
                >
                  {n.toLocaleString()}
                </span>
              </a>
            );
          })}
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <div className="text-center py-16 text-slate-500 border border-dashed border-slate-200 rounded-xl">
            <p className="font-semibold text-slate-700">
              No ingestion batches yet.
            </p>
            <p className="text-sm mt-1 max-w-md mx-auto">
              Email parser, WhatsApp scraper, and CSV upload are P2 -- for now
              this is a viewer for what will land here. Paste a batch manually
              below to test the flow.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {rows.length.toLocaleString()} batch
                {rows.length === 1 ? '' : 'es'}
                {statusTab !== 'all' ? ` -- filtered: ${STATUS_LABEL[statusTab]}` : ''}
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {rows.map((b) => {
                const conf = Number(b.parser_confidence) || 0;
                const confCls = confidenceTone(conf);
                const parsedN = countParsedRows(b.parsed_rows);
                const statusCls = STATUS_BADGE_CLS[b.status];
                return (
                  <details key={b.id} className="group">
                    <summary className="px-4 py-3 hover:bg-slate-50 cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${SOURCE_BADGE_CLS[b.source]}`}
                            >
                              {SOURCE_LABEL[b.source]}
                            </span>
                            <span className="font-medium text-slate-900 text-sm">
                              {b.vendor_id ?? <span className="text-slate-400 italic">no vendor</span>}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              . {fmtDate(b.received_at)}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${statusCls}`}
                            >
                              {STATUS_LABEL[b.status]}
                            </span>
                          </div>
                          <div className="flex gap-4 mt-2 text-[11px] text-slate-500">
                            <span>
                              <span className="text-slate-700 font-medium">
                                {parsedN.toLocaleString()}
                              </span>{' '}
                              rows parsed
                            </span>
                            <span>
                              conf{' '}
                              <span className={`font-medium ${confCls}`}>
                                {(conf * 100).toFixed(0)}%
                              </span>
                            </span>
                            <span className="text-slate-400 font-mono">
                              {b.id.slice(0, 8)}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <span className="text-xs text-emerald-700 group-open:hidden">
                            View
                          </span>
                          <span className="text-xs text-slate-500 hidden group-open:inline">
                            Hide
                          </span>
                        </div>
                      </div>
                    </summary>

                    <div className="px-4 pb-4 pt-1 bg-slate-50 border-t border-slate-100">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                            Raw payload
                          </div>
                          <pre className="text-[11px] font-mono text-slate-700 bg-white border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-80">
                            {safeStringify(b.raw_payload)}
                          </pre>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                            Parsed rows ({parsedN})
                          </div>
                          <pre className="text-[11px] font-mono text-slate-700 bg-white border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-80">
                            {safeStringify(b.parsed_rows)}
                          </pre>
                        </div>
                      </div>

                      {b.notes && (
                        <div className="mt-3 text-xs text-slate-600">
                          <span className="font-semibold text-slate-700">
                            Notes:
                          </span>{' '}
                          {b.notes}
                        </div>
                      )}

                      {b.status === 'awaiting_review' && (
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled
                            title="Mapping queue API lands with PAGE 7. This button wires up then."
                            className="text-xs px-3 py-1.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 opacity-60 cursor-not-allowed"
                          >
                            Approve and route to mapping queue
                          </button>
                          <span className="text-[11px] text-slate-400 self-center italic">
                            wired when SKU mapping queue ships
                          </span>
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual paste form */}
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-amber-900">
            Manual paste -- last-resort ingestion
          </h2>
          <p className="text-xs text-amber-800 mt-1 max-w-2xl">
            Paste CSV-ish text (one offer per line, comma-separated:{' '}
            <span className="font-mono">variety, stem_length, qty, cost</span>).
            Confidence is fixed at 0.5 -- we don&apos;t trust manual entry.
            Real vendor adapters land later.
          </p>
          <div className="mt-3">
            <ManualPasteForm />
          </div>
        </div>

        <p className="text-xs text-slate-400 mt-8">
          Data source: supabase-backup ingestion_batches. Komet API rows are
          written by Rose_BI&apos;s K2K cron. Manual paste rows are written by{' '}
          <span className="font-mono">/api/admin/ingest/manual</span>.
          vendor_email / whatsapp / csv_upload sources are reserved for P2
          adapters that don&apos;t exist yet.
        </p>
      </main>

      <Footer />
    </div>
  );
}
