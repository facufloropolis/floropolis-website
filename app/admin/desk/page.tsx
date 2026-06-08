// Facu's Desk — Zones 2 + 3 (+ Zone 4 stub).
// v1 | 2026-06-05 | Job_PM (CPO)
//
// Spec: kb/facu_catalog_ux_reflection_2026-06-04.md — "Facu's Desk".
// One landing surface that ranks Facu's next 30 minutes. The decision finds HIM,
// ranked by value, with context attached, one action away.
//
// Zone 1 (the pulse) already lives on /admin/catalog via CatalogPulseStrip.
// This page builds:
//   Zone 2 — Your decisions: admin_proposals WHERE status='awaiting_facu',
//            rendered as context cards (TITLE / TODAY / WHAT CHANGES IF APPROVED /
//            RECOMMENDATION / proposer + age), ranked by unblock value v1.
//   Zone 3 — Your knowledge: the four live micro-questions only Facu can answer,
//            seeded from a static const array, two with live counts/tables.
//   Zone 4 — What the machine did (collapsed): last 10 improvement_loop_state_log rows.
//
// Read-only honesty v1: NO write actions. Decisions deep-link to the existing
// /admin/catalog/approval-queue decide UI; knowledge questions name the channel
// (admin tab / reply to Job_PM). One-click decide-in-Desk lands in v2.
//
// Auth: mirrors /admin/catalog/blocked + approval-queue exactly (ADMIN_EMAILS or
// client_profiles.status='admin'; non-admin -> redirect('/')).
//
// Data sources (supabase-backup): admin_proposals, v_catalog_admin (unpriced
// count), box_master_mirror, improvement_loop_state_log.
//
// Style: emerald-600 primary, slate scale, ASCII-clean copy. No new design lang.

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import ProposalDecision from './ProposalDecision';
import KnowledgeAnswerForm from './KnowledgeAnswerForm';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export const metadata = {
  title: "Facu's Desk | Floropolis Admin",
  robots: { index: false, follow: false },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProposalRow {
  id: string;
  type: string;
  target_table: string | null;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  notes: string | null;
  source_agent: string | null;
  source_rationale: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  proposed_at: string;
}

interface BoxRow {
  vendor_canonical_name: string | null;
  box_family: string | null;
  variant_code: string | null;
  fedex_chargeable_kg: number | string | null;
  stems_per_box: number | null;
}

interface RepairLogRow {
  actor: string | null;
  from_state: string | null;
  to_state: string | null;
  at: string | null;
}

// ---------------------------------------------------------------------------
// Ranking — simple unblock-value heuristic v1.
// Config-level changes affect ALL SKUs -> top tier. Per-SKU types -> lower.
// Within a tier, oldest first (proposed_at ASC).
// ---------------------------------------------------------------------------

// Types whose target is config that fans out across the whole catalog.
const CONFIG_TIER_TYPES = new Set<string>([
  'catalog_quality_rebalance',
  'catalog_quality_gate.create',
  'catalog_published.computed_price_column',
  'catalog_quality_weight.update',
  'catalog_quality_threshold.update',
  'pricing_constants.update',
]);

function rankTier(type: string): number {
  // 0 = config (affects all / many), 1 = per-SKU or narrower.
  return CONFIG_TIER_TYPES.has(type) ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Humanize a proposal type + target into a readable TITLE.
// ---------------------------------------------------------------------------

function humanizeTitle(p: ProposalRow): string {
  const target = p.target_id ?? p.target_table ?? '';
  switch (p.type) {
    case 'catalog_quality_rebalance':
      return 'Rebalance quality-score weights';
    case 'catalog_quality_gate.create':
      return `Restore quality signals to the ledger${target ? ` (${target})` : ''}`;
    case 'catalog_published.computed_price_column':
      return 'Make sell price a single computed column';
    case 'catalog_quality_weight.update':
      return `Set weight: ${prettyTarget(target)}`;
    case 'catalog_quality_threshold.update':
      return `Set threshold: ${prettyTarget(target)}`;
    case 'pricing_constants.update':
      return `Update pricing constant: ${prettyTarget(target)}`;
    default: {
      const verb = p.type.replace(/[._]/g, ' ');
      return target ? `${verb}: ${prettyTarget(target)}` : verb;
    }
  }
}

function prettyTarget(t: string): string {
  return t.replace(/[_:]/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// TODAY prose — prefer source_rationale; fall back to notes. Show prose, not JSON.
// ---------------------------------------------------------------------------

function todayProse(p: ProposalRow): string {
  const r = (p.source_rationale ?? '').trim();
  if (r) return r;
  const n = (p.notes ?? '').trim();
  if (n) return n;
  return 'No rationale captured on this proposal.';
}

// ---------------------------------------------------------------------------
// WHAT CHANGES IF APPROVED — render before_value -> after_value readably.
// Both are jsonb objects; align on shared keys and show key: before -> after.
// ---------------------------------------------------------------------------

interface DiffLine {
  key: string;
  before: string;
  after: string;
}

function scalarToStr(v: unknown): string {
  if (v == null) return '∅';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

function buildDiff(p: ProposalRow): DiffLine[] {
  const before = p.before_value ?? {};
  const after = p.after_value ?? {};
  const keys = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  );
  const lines: DiffLine[] = [];
  for (const k of keys) {
    const b = (before as Record<string, unknown>)[k];
    const a = (after as Record<string, unknown>)[k];
    const bs = scalarToStr(b);
    const as_ = scalarToStr(a);
    if (bs === as_) continue; // unchanged keys add no signal
    lines.push({ key: k, before: bs, after: as_ });
  }
  return lines;
}

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}d old`;
  const hrs = Math.floor(ms / (60 * 60 * 1000));
  if (hrs >= 1) return `${hrs}h old`;
  return 'just now';
}

// ---------------------------------------------------------------------------
// Zone 3 — Your knowledge: static-config v1. Live counts/tables injected below.
// ---------------------------------------------------------------------------

interface KnowledgeQuestion {
  id: string;
  question: string;
  stakes: string; // one-line: what it unblocks / why it matters
  answerWhere: string; // where the answer goes
}

const KNOWLEDGE_QUESTIONS: KnowledgeQuestion[] = [
  {
    id: 'bouquets_per_hb',
    question: 'How many bouquets fit per HB box?',
    stakes:
      'Unblocks the unpriced bouquets — no box yield means no per-unit cost, no price, no publish.',
    answerWhere: 'Reply to Job_PM with the number, or set it on the Box Master tab.',
  },
  {
    id: 'fedex_kg_per_box',
    question: 'Are these the real FedEx chargeable kg per box?',
    stakes:
      'These drive every delivery cost, every margin, every floor number. One wrong kg skews a whole vendor.',
    answerWhere: 'Confirm or correct each row via the Box Master tab.',
  },
  {
    id: 'mf_tropical_sample',
    question: 'MF "tropical mini fiesta sample": seed it live or drop it?',
    stakes: 'Quarantined SKU sitting in limbo. One word unblocks it either way.',
    answerWhere: 'Reply to Job_PM: "seed" or "drop".',
  },
  {
    id: 'megaflor_garden_roses',
    question:
      'Are the 6 Megaflor garden-rose-class varieties truly premium as shipped?',
    stakes:
      'Gates whether they fill the premium garden-rose directional gap or sit as standard. Your eyes, not the machine\'s.',
    answerWhere: 'Reply to Job_PM; links to the directional-fill flag.',
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function FacusDeskPage() {
  // Auth gate (mirrors blocked/page.tsx + approval-queue/page.tsx) -----------
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
    if (!profile || profile.status !== 'admin') {
      redirect('/');
    }
  }

  const backup = getBackupServiceClient();

  // Zone 2 — awaiting_facu proposals ----------------------------------------
  const { data: propRaw, error: propErr } = await backup
    .from('admin_proposals')
    .select(
      'id, type, target_table, target_id, payload, notes, source_agent, source_rationale, before_value, after_value, proposed_at',
    )
    .eq('status', 'awaiting_facu')
    .limit(200);
  if (propErr) console.error('[admin/desk] proposals:', propErr);
  const proposals = (propRaw ?? []) as unknown as ProposalRow[];

  // source_agent is a free-text label (e.g. 'Job_PM', 'job'), shown as-is — no
  // email resolution needed (it is not a uuid foreign key here).

  // Rank: tier asc (config first), then oldest first within tier.
  const rankedProposals = [...proposals].sort((a, b) => {
    const ta = rankTier(a.type);
    const tb = rankTier(b.type);
    if (ta !== tb) return ta - tb;
    return new Date(a.proposed_at).getTime() - new Date(b.proposed_at).getTime();
  });

  // Zone 3 — live numbers ----------------------------------------------------
  // (1) unpriced bouquet count from v_catalog_admin.
  let unpricedCount: number | null = null;
  {
    const { count, error } = await backup
      .from('v_catalog_admin')
      .select('sku_id', { count: 'exact', head: true })
      .eq('margin_status', 'unpriced');
    if (error) console.error('[admin/desk] unpriced count:', error);
    else unpricedCount = count ?? 0;
  }

  // (2) box_master_mirror rows for the FedEx-kg question.
  let boxRows: BoxRow[] = [];
  {
    const { data, error } = await backup
      .from('box_master_mirror')
      .select(
        'vendor_canonical_name, box_family, variant_code, fedex_chargeable_kg, stems_per_box',
      )
      .eq('active', true)
      .order('vendor_canonical_name', { ascending: true });
    if (error) console.error('[admin/desk] box_master_mirror:', error);
    else boxRows = (data ?? []) as unknown as BoxRow[];
  }

  // Zone 4 — last 10 improvement-loop transitions ---------------------------
  let repairLog: RepairLogRow[] = [];
  {
    const { data, error } = await backup
      .from('improvement_loop_state_log')
      .select('actor, from_state, to_state, at')
      .order('at', { ascending: false })
      .limit(10);
    if (error) console.error('[admin/desk] improvement_loop_state_log:', error);
    else repairLog = (data ?? []) as unknown as RepairLogRow[];
  }

  const configCount = rankedProposals.filter((p) => rankTier(p.type) === 0).length;

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
        <Link href="/admin/catalog" className="hover:text-emerald-700">
          Catalog
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700 font-medium">Desk</span>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Facu&apos;s Desk</h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Your next 30 minutes, ranked by value. The decisions that need YOU,
            then the knowledge only you can give. Decide inline: proposals post to
            the governed per-proposal routes; knowledge answers route to the
            admin_proposals queue (type facu_knowledge_answer) for review. Sources:
            admin_proposals, v_catalog_admin, box_master_mirror,
            improvement_loop_state_log (supabase-backup).
          </p>
        </div>
        <Link
          href="/admin/catalog"
          className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
        >
          ← Back to catalog
        </Link>
      </div>

      {/* ================= ZONE 2 — Your decisions ================= */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-900">Your decisions</h2>
          <span className="text-xs text-slate-500">
            {rankedProposals.length} awaiting · {configCount} affect the whole
            catalog
          </span>
        </div>

        {rankedProposals.length === 0 ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-6 text-sm text-emerald-700 font-medium">
            Nothing awaiting your sign-off. The queue is clear.
          </div>
        ) : (
          <div className="space-y-4">
            {rankedProposals.map((p) => {
              const tier = rankTier(p.type);
              const diff = buildDiff(p);
              const today = todayProse(p);
              const longToday = today.length > 220;
              const rec = (p.notes ?? '').trim();
              const payloadKeys = p.payload ? Object.keys(p.payload) : [];
              return (
                <article
                  key={p.id}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                >
                  {/* Card header */}
                  <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {tier === 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                            affects all SKUs
                          </span>
                        )}
                        <h3 className="text-base font-semibold text-slate-900">
                          {humanizeTitle(p)}
                        </h3>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        {p.type}
                        {p.target_id ? ` → ${p.target_id}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] text-slate-500">
                        {p.source_agent ?? 'unknown'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {ageLabel(p.proposed_at)}
                      </div>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="px-4 py-3 space-y-3">
                    {/* TODAY */}
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">
                        Today
                      </div>
                      {longToday ? (
                        <details className="text-sm text-slate-700">
                          <summary className="cursor-pointer text-slate-700">
                            {today.slice(0, 200)}…{' '}
                            <span className="text-emerald-700 font-medium">
                              read more
                            </span>
                          </summary>
                          <p className="mt-1 whitespace-pre-wrap">{today}</p>
                        </details>
                      ) : (
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">
                          {today}
                        </p>
                      )}
                    </div>

                    {/* WHAT CHANGES IF APPROVED */}
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">
                        What changes if approved
                      </div>
                      {diff.length > 0 ? (
                        <ul className="space-y-1">
                          {diff.map((d) => (
                            <li
                              key={d.key}
                              className="text-sm text-slate-700 flex flex-wrap items-center gap-1.5"
                            >
                              <span className="font-mono text-[12px] text-slate-500">
                                {prettyTarget(d.key)}
                              </span>
                              <span className="text-slate-400 line-through">
                                {d.before}
                              </span>
                              <span className="text-slate-400">→</span>
                              <span className="font-semibold text-emerald-700">
                                {d.after}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-500 italic">
                          No before/after diff on this proposal — see payload
                          for the change.
                        </p>
                      )}
                    </div>

                    {/* RECOMMENDATION (notes) */}
                    {rec && rec !== today && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">
                          Recommendation
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">
                          {rec}
                        </p>
                      </div>
                    )}

                    {/* Raw payload (collapsed) */}
                    {payloadKeys.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-slate-400 hover:text-slate-600">
                          Raw payload ({payloadKeys.length} key
                          {payloadKeys.length === 1 ? '' : 's'})
                        </summary>
                        <pre className="mt-1 p-2 rounded bg-slate-50 border border-slate-100 overflow-x-auto text-[11px] text-slate-600">
                          {JSON.stringify(p.payload, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>

                  {/* Card footer — inline decide (governed per-proposal routes) */}
                  <ProposalDecision proposalId={p.id} />
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ================= ZONE 3 — Your knowledge ================= */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-900">Your knowledge</h2>
          <span className="text-xs text-slate-500">
            {KNOWLEDGE_QUESTIONS.length} questions only you can answer
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-3 max-w-2xl">
          Each answer becomes data the machine can&apos;t derive. Type it inline
          and it lands in the governed proposals queue with provenance.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {KNOWLEDGE_QUESTIONS.map((q) => (
            <article
              key={q.id}
              className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-2"
            >
              <h3 className="text-sm font-semibold text-slate-900">
                {q.question}
              </h3>

              {/* Inline live context per question */}
              {q.id === 'bouquets_per_hb' && (
                <div className="text-xs text-emerald-700 font-medium">
                  {unpricedCount === null
                    ? 'unpriced count: source unavailable'
                    : `${unpricedCount} SKU${unpricedCount === 1 ? '' : 's'} unpriced right now (margin_status='unpriced')`}
                </div>
              )}

              {q.id === 'fedex_kg_per_box' && (
                <div className="overflow-x-auto">
                  {boxRows.length === 0 ? (
                    <div className="text-xs text-slate-400">
                      box_master_mirror: source unavailable
                    </div>
                  ) : (
                    <table className="w-full text-[11px] mt-1">
                      <thead>
                        <tr className="text-left text-slate-400 uppercase tracking-wide">
                          <th className="py-1 pr-2">Vendor</th>
                          <th className="py-1 pr-2">Box</th>
                          <th className="py-1 pr-2">kg</th>
                          <th className="py-1">Stems</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boxRows.map((b, i) => (
                          <tr
                            key={`${b.vendor_canonical_name}-${b.box_family}-${b.variant_code}-${i}`}
                            className="border-t border-slate-50"
                          >
                            <td className="py-1 pr-2 text-slate-700">
                              {b.vendor_canonical_name ?? '--'}
                            </td>
                            <td className="py-1 pr-2 text-slate-600">
                              {b.box_family ?? '--'}
                              {b.variant_code && b.variant_code !== 'standard'
                                ? ` (${b.variant_code})`
                                : ''}
                            </td>
                            <td className="py-1 pr-2 text-slate-900 font-medium tabular-nums">
                              {b.fedex_chargeable_kg ?? '--'}
                            </td>
                            <td className="py-1 text-slate-600 tabular-nums">
                              {b.stems_per_box ?? '--'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="text-[10px] text-slate-400 mt-1">
                    These drive every delivery / margin / floor number — edit via
                    the Box Master tab if wrong.
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-600">{q.stakes}</p>
              <KnowledgeAnswerForm questionKey={q.id} question={q.question} />
              <div className="mt-auto pt-1 text-[11px] text-slate-500 border-t border-slate-50">
                <span className="font-semibold text-slate-600">Or answer via:</span>{' '}
                {q.answerWhere}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ================= ZONE 4 — What the machine did (collapsed) ============ */}
      <section className="mb-6">
        <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 select-none">
            What the machine did
            <span className="ml-2 text-xs font-normal text-slate-400">
              last {repairLog.length} improvement-loop transition
              {repairLog.length === 1 ? '' : 's'} — read-only proof the loop runs
            </span>
          </summary>
          <div className="px-4 pb-4">
            {repairLog.length === 0 ? (
              <div className="text-xs text-slate-400">
                improvement_loop_state_log: no rows / source unavailable
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 uppercase tracking-wide text-[10px]">
                    <th className="py-1 pr-3">Actor</th>
                    <th className="py-1 pr-3">Transition</th>
                    <th className="py-1">At</th>
                  </tr>
                </thead>
                <tbody>
                  {repairLog.map((r, i) => (
                    <tr key={i} className="border-t border-slate-50">
                      <td className="py-1 pr-3 text-slate-700">
                        {r.actor ?? '--'}
                      </td>
                      <td className="py-1 pr-3 text-slate-600">
                        {(r.from_state ?? '?') + ' → ' + (r.to_state ?? '?')}
                      </td>
                      <td className="py-1 text-slate-500 tabular-nums">
                        {r.at ? new Date(r.at).toLocaleString() : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      </section>

      <p className="text-xs text-slate-400">
        Sources: supabase-backup admin_proposals (status=awaiting_facu),
        v_catalog_admin (margin_status=unpriced), box_master_mirror (active),
        improvement_loop_state_log. Zone 2 decisions post to the governed
        per-proposal routes (approve / reject / frame-correction); Zone 3 answers
        route to admin_proposals (type facu_knowledge_answer) for review.
      </p>
    </main>
  );
}
