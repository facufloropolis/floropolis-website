// Sample Box Cohort Review -- the LIVE twin of /mockups/cohort-review.
// v1 | 2026-06-08 | Job_PM (CPO)
//
// Reads the real cohort from public.orders and writes decisions to
// public.cohort_decisions (via /api/admin/cohort-review/decide). The mockup at
// /mockups/cohort-review is the visual target; this page renders real data only.
//
// The cohort = orders WHERE source='sample'
//   AND fulfillment_state IN ('requested','address_confirmed','qualified')
//   AND is_test=false.
// There are ZERO such rows today -> honest empty state. We do NOT fabricate cards.
//
// Enrichment (best-effort, NULL-safe): lead_master (legitimacy) + lead_enrichment
// (touchpoints, Interest_Score -> Heat band, SB_* signals). Presence is probed via
// information_schema; an absent table degrades to "--", never an error.
//
// Auth: mirrors /admin/desk + approval-queue (ADMIN_EMAILS or
// client_profiles.status='admin'; non-admin -> redirect('/')).
//
// Style: emerald-600 primary, slate scale, rounded-xl cards, ASCII-clean copy.

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import DecisionBar from './DecisionBar';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export const metadata = {
  title: 'Cohort Review | Floropolis Admin',
  robots: { index: false, follow: false },
};

const COHORT_STATES = ['requested', 'address_confirmed', 'qualified'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrderRow {
  id: number;
  business_name: string | null;
  client_name: string | null;
  client_email: string | null;
  flora_score: number | string | null;
  flora_reasoning: string | null;
  box_choice: string | null;
  address_confirmed_at: string | null;
  account_flags: Record<string, unknown> | null;
  cohort_id: string | null;
  fulfillment_state: string;
  lead_master_id: number | null;
}

interface LeadMasterRow {
  id: number;
  website: string | null;
  instagram: string | null;
  google_rating: number | string | null;
  google_reviews: number | string | null;
  category: string | null;
  city: string | null;
  state: string | null;
}

interface LeadEnrichmentRow {
  lead_id: number;
  interest_score: number | string | null;
  call_count: number | null;
  connected_call_count: number | null;
  talk_min_total: number | string | null;
  emails_sent: number | null;
  emails_received: number | null;
  last_call_date: string | null;
  sb_status: string | null;
  sb_requested: boolean | null;
  business_type: string | null;
}

interface DecisionRow {
  order_id: number;
  decision: string;
  rationale: string | null;
}

// PostgREST does not expose information_schema, so we probe each enrichment
// table with a cheap head-count read. A missing table (or any read error)
// returns false -> the UI degrades to "--" rather than throwing. Verified
// present in the BACKUP project on 2026-06-08, but this stays defensive in case
// a Rose mirror drops a table.
async function tableReadable(
  svc: ReturnType<typeof getBackupServiceClient>,
  table: string,
): Promise<boolean> {
  const { error } = await svc.from(table).select('*', { count: 'exact', head: true }).limit(1);
  return !error;
}

// Derive a heat band from Interest_Score (no heat_band column exists). NULL-safe.
function heatBand(score: number | null): { label: string; dot: string; text: string } {
  if (score === null) return { label: 'Unknown', dot: 'bg-slate-300', text: 'text-slate-400' };
  if (score >= 70) return { label: 'Hot', dot: 'bg-red-500', text: 'text-red-600' };
  if (score >= 40) return { label: 'Warm', dot: 'bg-amber-500', text: 'text-amber-600' };
  return { label: 'Cold', dot: 'bg-slate-400', text: 'text-slate-500' };
}

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CohortReviewPage() {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect('/');

  const adminClient = getBackupServiceClient();
  const emailLc = (user.email ?? '').toLowerCase();
  if (!ADMIN_EMAILS.includes(emailLc)) {
    const { data: profile } = await adminClient
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!profile || profile.status !== 'admin') redirect('/');
  }

  const svc = getBackupServiceClient();

  // Cohort orders (the only fabrication-free source of cards). -----------------
  const { data: orderData, error: orderErr } = await svc
    .from('orders')
    .select(
      'id, business_name, client_name, client_email, flora_score, flora_reasoning, box_choice, address_confirmed_at, account_flags, cohort_id, fulfillment_state, lead_master_id',
    )
    .eq('source', 'sample')
    .eq('is_test', false)
    .in('fulfillment_state', COHORT_STATES)
    .order('flora_score', { ascending: false, nullsFirst: false });
  if (orderErr) console.error('[admin/cohort-review] orders:', orderErr);
  const orders = (orderData ?? []) as unknown as OrderRow[];

  // Enrichment presence probe + best-effort loads (only if there ARE orders). ---
  const present = new Set<string>();
  if (orders.length > 0) {
    for (const t of ['lead_master', 'lead_enrichment', 'cohort_decisions']) {
      if (await tableReadable(svc, t)) present.add(t);
    }
  } else {
    // No cards to enrich; still probe cohort_decisions cheaply for completeness.
    if (await tableReadable(svc, 'cohort_decisions')) present.add('cohort_decisions');
  }

  const leadIds = Array.from(
    new Set(orders.map((o) => o.lead_master_id).filter((x): x is number => x != null)),
  );

  const leadMasterById = new Map<number, LeadMasterRow>();
  if (orders.length > 0 && leadIds.length > 0 && present.has('lead_master')) {
    const { data, error } = await svc
      .from('lead_master')
      .select('id, website, instagram, google_rating, google_reviews, category, city, state')
      .in('id', leadIds);
    if (error) console.error('[admin/cohort-review] lead_master:', error);
    else for (const r of (data ?? []) as unknown as LeadMasterRow[]) leadMasterById.set(r.id, r);
  }

  const enrichmentByLead = new Map<number, LeadEnrichmentRow>();
  if (orders.length > 0 && leadIds.length > 0 && present.has('lead_enrichment')) {
    const { data, error } = await svc
      .from('lead_enrichment')
      .select(
        'lead_id, interest_score, call_count, connected_call_count, talk_min_total, emails_sent, emails_received, last_call_date, sb_status, sb_requested, business_type',
      )
      .in('lead_id', leadIds);
    if (error) console.error('[admin/cohort-review] lead_enrichment:', error);
    else for (const r of (data ?? []) as unknown as LeadEnrichmentRow[]) enrichmentByLead.set(r.lead_id, r);
  }

  // Existing decisions (so re-visited rows show their prior stamp). -------------
  const decisionByOrder = new Map<number, DecisionRow>();
  if (orders.length > 0 && present.has('cohort_decisions')) {
    const orderIds = orders.map((o) => o.id);
    const { data, error } = await svc
      .from('cohort_decisions')
      .select('order_id, decision, rationale, decided_at')
      .in('order_id', orderIds)
      .order('decided_at', { ascending: false });
    if (error) console.error('[admin/cohort-review] cohort_decisions:', error);
    else
      for (const r of (data ?? []) as unknown as DecisionRow[]) {
        // first (most recent) wins
        if (!decisionByOrder.has(r.order_id)) decisionByOrder.set(r.order_id, r);
      }
  }

  const enrichmentAbsent = !present.has('lead_master') && !present.has('lead_enrichment');

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
        <Link href="/admin/catalog" className="hover:text-emerald-700">
          Catalog
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700 font-medium">Cohort Review</span>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sample Box Cohort Review</h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            The week&apos;s sample-box requests awaiting your call. Each decision
            writes to <span className="font-mono">cohort_decisions</span>;
            approving a qualified lead advances it to dispatch. Live twin of the{' '}
            <Link href="/mockups/cohort-review" className="text-emerald-700 hover:underline">
              approved mockup
            </Link>
            . Source: orders (source=sample, not test, in the request/qualify window).
          </p>
        </div>
        <Link
          href="/admin/desk"
          className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
        >
          &larr; Desk
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
          <div className="text-slate-300 text-3xl mb-2" aria-hidden>
            &#9711;
          </div>
          <h2 className="text-base font-semibold text-slate-700">
            No sample orders awaiting review
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            The engine fills this as requests land. When a sample-box request
            enters the cohort window (requested &rarr; address confirmed &rarr;
            qualified), its card appears here with the call analysis, legitimacy
            evidence, and the ask &mdash; one decision away.
          </p>
          <p className="text-[11px] text-slate-400 mt-4">
            0 rows in orders WHERE source=&apos;sample&apos; AND
            fulfillment_state IN (requested, address_confirmed, qualified) AND
            is_test=false.
          </p>
        </div>
      ) : (
        <>
          <p className="text-[13px] text-slate-500 mb-4">
            {orders.length} to review
            {enrichmentAbsent && (
              <span className="ml-2 text-amber-600">
                &middot; enrichment tables not readable &mdash; showing order data only
              </span>
            )}
          </p>
          <div className="space-y-4">
            {orders.map((o) => {
              const lm = o.lead_master_id != null ? leadMasterById.get(o.lead_master_id) : undefined;
              const en = o.lead_master_id != null ? enrichmentByLead.get(o.lead_master_id) : undefined;
              const flora = toNum(o.flora_score);
              const interest = toNum(en?.interest_score ?? null);
              const heat = heatBand(interest);
              const prior = decisionByOrder.get(o.id) ?? null;
              const isQualified = o.fulfillment_state === 'qualified';
              const title = o.business_name || o.client_name || `Order #${o.id}`;

              return (
                <article
                  key={o.id}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
                >
                  <div className="p-5 space-y-4">
                    {/* Identity */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                          <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            {o.fulfillment_state}
                          </span>
                        </div>
                        <div className="text-[12px] text-slate-500 mt-0.5">
                          {o.client_name || '--'}
                          {o.client_email ? ` · ${o.client_email}` : ''}
                          {lm?.city ? ` · ${lm.city}${lm.state ? `, ${lm.state}` : ''}` : ''}
                        </div>
                      </div>
                      <span
                        className={
                          'font-bold rounded-md border tabular-nums shrink-0 text-xs px-2.5 py-1 ' +
                          (flora !== null && flora >= 70
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200')
                        }
                      >
                        FLORA {flora ?? '--'}
                      </span>
                    </div>

                    {/* Legitimacy (lead_master) */}
                    <section>
                      <MicroLabel>Real florist? &mdash; evidence</MicroLabel>
                      {!present.has('lead_master') ? (
                        <p className="text-[13px] text-slate-400">--</p>
                      ) : lm ? (
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          {lm.website ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                              {lm.website}
                            </span>
                          ) : null}
                          {lm.instagram ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-slate-50 text-slate-600 border-slate-200">
                              IG {lm.instagram}
                            </span>
                          ) : null}
                          {lm.google_rating != null ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-slate-50 text-slate-600 border-slate-200">
                              GMB {lm.google_rating}
                              {lm.google_reviews != null ? ` · ${lm.google_reviews} rev` : ''}
                            </span>
                          ) : null}
                          {lm.category ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-slate-50 text-slate-600 border-slate-200">
                              {lm.category}
                            </span>
                          ) : null}
                          {!lm.website && !lm.instagram && lm.google_rating == null && !lm.category ? (
                            <span className="text-slate-400">no legitimacy signals on file</span>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-[13px] text-slate-400">no linked lead_master record</p>
                      )}
                    </section>

                    {/* Relationship (lead_enrichment) */}
                    <section>
                      <MicroLabel>Relationship &mdash; touchpoints</MicroLabel>
                      {!present.has('lead_enrichment') ? (
                        <p className="text-[13px] text-slate-400">--</p>
                      ) : en ? (
                        <div className="flex items-center gap-2 flex-wrap text-[13px] text-slate-700">
                          <span className="font-medium">
                            {en.call_count ?? 0} {en.call_count === 1 ? 'call' : 'calls'}
                            {en.talk_min_total != null ? (
                              <span className="text-slate-400"> ({en.talk_min_total} min)</span>
                            ) : null}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span>
                            {en.emails_sent ?? 0} sent / {en.emails_received ?? 0} replied
                          </span>
                          {en.last_call_date ? (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="text-slate-500">
                                last call {new Date(en.last_call_date).toLocaleDateString()}
                              </span>
                            </>
                          ) : null}
                          <span className="text-slate-300">·</span>
                          <span
                            className={
                              'inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-md border bg-white border-slate-200 ' +
                              heat.text
                            }
                          >
                            <span className={'h-2 w-2 rounded-full ' + heat.dot} aria-hidden />
                            Heat: {heat.label}
                          </span>
                          {interest != null ? (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border bg-slate-50 text-slate-600 border-slate-200 tabular-nums">
                              Interest_Score {interest}
                            </span>
                          ) : null}
                          {en.sb_status || en.sb_requested ? (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                              SB {en.sb_status ?? (en.sb_requested ? 'requested' : '')}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-[13px] text-slate-400">no enrichment record</p>
                      )}
                    </section>

                    {/* The analysis (flora_reasoning) */}
                    <section>
                      <MicroLabel>The analysis &mdash; FLORA reasoning</MicroLabel>
                      {o.flora_reasoning ? (
                        <p className="text-sm text-slate-700 leading-relaxed">{o.flora_reasoning}</p>
                      ) : (
                        <p className="text-[13px] text-slate-400">no reasoning recorded</p>
                      )}
                    </section>

                    {/* The ask */}
                    <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <MicroLabel>Box choice</MicroLabel>
                        {o.box_choice ? (
                          <p className="text-[13px] text-slate-800 font-medium">{o.box_choice}</p>
                        ) : (
                          <span className="inline-flex text-[11px] px-2 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-200">
                            REQUIRED before approve
                          </span>
                        )}
                      </div>
                      <div>
                        <MicroLabel>Address confirmed</MicroLabel>
                        {o.address_confirmed_at ? (
                          <p className="text-[13px] text-emerald-700 font-medium">
                            {new Date(o.address_confirmed_at).toLocaleDateString()}
                          </p>
                        ) : (
                          <span className="inline-flex text-[11px] px-2 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-200">
                            not confirmed
                          </span>
                        )}
                      </div>
                    </section>

                    {/* Account flags (jsonb) */}
                    {o.account_flags && Object.keys(o.account_flags).length > 0 ? (
                      <section>
                        <MicroLabel>Account flags</MicroLabel>
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          {Object.entries(o.account_flags).map(([k, v]) => (
                            <span
                              key={k}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-slate-50 text-slate-600 border-slate-200"
                            >
                              {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </span>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </div>

                  {/* Decision bar (client child) */}
                  <DecisionBar
                    orderId={o.id}
                    cohortId={o.cohort_id ?? `order-${o.id}`}
                    systemSuggestion={
                      flora !== null && flora >= 70 ? 'ENVIAR' : 'NURTURE'
                    }
                    canApprove={isQualified}
                    initialDecision={prior ? { decision: prior.decision, rationale: prior.rationale } : null}
                  />
                </article>
              );
            })}
          </div>
        </>
      )}

      <p className="text-xs text-slate-400 mt-8">
        Live v1. Sources: orders (cohort window), lead_master + lead_enrichment
        (enrichment, NULL-safe), cohort_decisions (writes). No fabricated rows
        &mdash; empty state is honest.
      </p>
    </main>
  );
}
