// Admin catalog -- Proposals (meta).
// v1 | 2026-05-18 | Job_PM admin-port X8 [V8 SHADOW]
//
// CPO-level view: what specializations the platform needs (Tab A) and what
// Job_PM has already specced (Tab B). Pure informational, no DB writes; all
// data hardcoded so this screen ships even before the underlying admin_*
// proposal tables are wired through.
//
// Two tabs, state held in ?tab= search param so it survives reload + share.
//   - Tab A: specializations  (15 roles across 3 phases)
//   - Tab B: contracts        (agents, contracts, tables, flows, verifiers)
//
// Card grid: 3 cols on desktop, 1 col on mobile. Empty state per tab.
//
// Access:
//   - Middleware guards /admin and restricts to ADMIN_EMAILS or
//     client_profiles.status='admin'.
//   - Server-side belt-and-suspenders: re-check session + admin status here.
//   - Non-admin -> redirect('/').
//
// Style: emerald-600 primary, Plus Jakarta Sans (inherited), ASCII-clean copy.

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import Navigation from '@/components/Navigation';
import TopBanner from '@/components/TopBanner';
import Footer from '@/components/Footer';

const ADMIN_EMAILS = ['facu@floropolis.com', 'jjpj@crescoinversiones.com'];

// -- Tab state -------------------------------------------------------------

type Tab = 'specializations' | 'contracts';
const TAB_VALUES: Tab[] = ['specializations', 'contracts'];
const TAB_LABELS: Record<Tab, string> = {
  specializations: 'Specializations needed',
  contracts: 'Contracts + agents specced',
};

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

function tabHref(t: Tab): string {
  if (t === 'specializations') return '/admin/catalog/proposals';
  return `/admin/catalog/proposals?tab=${t}`;
}

// -- Tab A: Specializations ------------------------------------------------

type Phase = 'cutover_blocker' | 'phase_2' | 'phase_3';
type Area = 'frontend' | 'backend' | 'infra';
type SpecStatus = 'proposed' | 'in_progress' | 'staffed' | 'blocked';

interface Specialization {
  id: string;
  area: Area;
  title: string;
  phase: Phase;
  why: string;
  status: SpecStatus;
}

const SPECIALIZATIONS: Specialization[] = [
  // ===== Phase 1: cutover blockers =====
  {
    id: 'F2',
    area: 'frontend',
    title: 'Frontend QA pipeline',
    phase: 'cutover_blocker',
    why: 'Visual regression + a11y + perf budgets in CI. 17+ admin routes -- manual QA does not scale and admin breakage stops ops.',
    status: 'proposed',
  },
  {
    id: 'F3',
    area: 'frontend',
    title: 'UX writer / microcopy owner',
    phase: 'cutover_blocker',
    why: 'Approval-queue warnings, empty states, error states, confirmation modals. Bad copy = Facu approves without reading.',
    status: 'proposed',
  },
  {
    id: 'B1',
    area: 'backend',
    title: 'Pricing Engine owner',
    phase: 'cutover_blocker',
    why: 'Multi-country target_price_v2 materialized daily + event-driven recompute on box/shipping/GPM edits. Owns the engine, not just the scripts.',
    status: 'proposed',
  },
  {
    id: 'B5',
    area: 'backend',
    title: 'API Contract Steward',
    phase: 'cutover_blocker',
    why: 'Komet + FedEx + Stripe + Supabase RPC contracts can drift silently. Versioned schemas + daily contract tests + breakage alerts.',
    status: 'proposed',
  },
  {
    id: 'I1',
    area: 'infra',
    title: 'Observability (SLOs, logs, traces, alerts)',
    phase: 'cutover_blocker',
    why: 'Post-cutover, when checkout breaks the customer notices first -- unacceptable. SLOs per critical path + alerts that page before customer impact.',
    status: 'proposed',
  },
  {
    id: 'I2',
    area: 'infra',
    title: 'Security Engineer (RLS, TOTP, secrets, PCI)',
    phase: 'cutover_blocker',
    why: 'Stripe brings PCI scope. RLS audit + secret rotation + TOTP enforcement + device approval audit before live charges go through.',
    status: 'proposed',
  },
  // ===== Phase 2 =====
  {
    id: 'F1',
    area: 'frontend',
    title: 'Design System owner',
    phase: 'phase_2',
    why: 'Tokens + component library + motion + a11y baseline. Tailwind + ad-hoc components will drift across 17+ admin routes without a canonical layer.',
    status: 'proposed',
  },
  {
    id: 'F4',
    area: 'frontend',
    title: 'Data viz specialist',
    phase: 'phase_2',
    why: 'Decision Engine previews, GPM bands, cascade impact charts, sell-through trends. Tables-only stops working past a point.',
    status: 'proposed',
  },
  {
    id: 'B2',
    area: 'backend',
    title: 'Decision Engine owner',
    phase: 'phase_2',
    why: 'When 4 vendors have Rose Mondial 60cm, the site can show one. Picks best offer by price + stock + quality + vendor reliability. Tuning loop.',
    status: 'proposed',
  },
  {
    id: 'B3',
    area: 'backend',
    title: 'Ingestion Adapter framework',
    phase: 'phase_2',
    why: 'Vendors send emails, WhatsApp voice notes, photos of handwritten lists. Parser plugins + Claude fallback -> normalized staging table. Does not scale past 5 vendors without this.',
    status: 'proposed',
  },
  {
    id: 'B4',
    area: 'backend',
    title: 'SKU Mapper owner',
    phase: 'phase_2',
    why: 'Different vendors name the same flower differently. Canonical name + attributes -> parent SKU + quality_family_id with confidence + human review queue.',
    status: 'proposed',
  },
  // ===== Phase 3 =====
  {
    id: 'B6',
    area: 'backend',
    title: 'Search / Discovery engineer',
    phase: 'phase_3',
    why: 'At 5000+ SKUs across many vendors, search becomes a product: faceted, ranked, autocomplete, conversion-tuned.',
    status: 'proposed',
  },
  {
    id: 'I3',
    area: 'infra',
    title: 'Data Pipeline Engineer',
    phase: 'phase_3',
    why: 'Ingestion adapters + decision engine + materialized views + override layer + audit. Orchestration + backfill + lineage need a dedicated owner.',
    status: 'proposed',
  },
  {
    id: 'I4',
    area: 'infra',
    title: 'FinOps cost watcher',
    phase: 'phase_3',
    why: 'Vercel + Supabase + Komet + FedEx + Stripe + Claude API. Nobody owns spend per layer today. Surprise bills are inevitable.',
    status: 'proposed',
  },
  {
    id: 'I5',
    area: 'infra',
    title: 'Release Engineer (flags, canary, rollback)',
    phase: 'phase_3',
    why: 'pre-deploy-check.sh only today. Every deploy is all-or-nothing. Feature flags + canary deploys + tested rollback playbook.',
    status: 'proposed',
  },
];

// -- Tab B: Contracts + agents ---------------------------------------------

type ContractCategory = 'agent' | 'contract' | 'flow' | 'table' | 'verifier';
type ContractStatus = 'LIVE' | 'SPECCED' | 'TBD';

interface ContractItem {
  id: string;
  title: string;
  category: ContractCategory;
  status: ContractStatus;
  summary: string;
  link?: { href: string; label: string };
}

const CONTRACTS: ContractItem[] = [
  // ===== Agents =====
  {
    id: 'ag_ingestion',
    title: 'Vendor Ingestion Adapter (agent)',
    category: 'agent',
    status: 'SPECCED',
    summary:
      'Parses email / WhatsApp voice + image / CSV / K2K API into a normalized vendor_ingest_staging row. Plugin per vendor format with Claude fallback for unknown shapes.',
  },
  {
    id: 'ag_sku_mapper',
    title: 'SKU Mapper (agent)',
    category: 'agent',
    status: 'SPECCED',
    summary:
      'Vendor raw name + attributes -> parent SKU + quality_family_id with confidence. < 0.85 -> human review queue. Training data curated from accepted mappings.',
  },
  {
    id: 'ag_decision',
    title: 'Decision Engine',
    category: 'agent',
    status: 'SPECCED',
    summary:
      'Picks which vendor offer to display per quality_family per delivery_week. Inputs: price + stems + quality score + vendor reliability. Tuning loop on conversion + feedback.',
  },
  {
    id: 'ag_vendor_comms',
    title: 'Vendor Comms Agent (P2)',
    category: 'agent',
    status: 'TBD',
    summary:
      'Routes vendor inbox: cost dispute -> Rose, new SKU pitch -> Facu + Job. Threaded per SKU. Explicitly NOT Alvar, NOT Enzo.',
  },

  // ===== Flows =====
  {
    id: 'fl_override_approval',
    title: 'Override approval flow',
    category: 'flow',
    status: 'LIVE',
    summary:
      'Anyone proposes -> warnings generated -> Facu signs on approval queue -> override layer applied + audited. End-to-end live for box / pricing / shipping proposals.',
    link: { href: '/admin/catalog/approval-queue', label: 'Open approval queue' },
  },

  // ===== Contracts (views / shared types between agents) =====
  {
    id: 'co_unified_inventory',
    title: 'unified_inventory (view)',
    category: 'contract',
    status: 'SPECCED',
    summary:
      'Joins K2K live mirror + T2 + T3 + staged email/WhatsApp into a single inventory surface keyed on quality_family_id.',
  },
  {
    id: 'co_target_price_v2',
    title: 'target_price_v2 (materialized table)',
    category: 'contract',
    status: 'SPECCED',
    summary:
      'Per SKU x vendor x delivery_week: cost + box_share + shipping + margin -> price + GPM band, with breakdown JSON for admin transparency.',
  },

  // ===== Tables =====
  {
    id: 'tb_admin_proposals',
    title: 'admin_proposals',
    category: 'table',
    status: 'LIVE',
    summary:
      'Every edit anyone proposes lands here with payload + warnings + cascade impact. Source of truth for the approval queue.',
    link: { href: '/admin/catalog/approval-queue', label: 'Open approval queue' },
  },
  {
    id: 'tb_admin_approvals',
    title: 'admin_approvals',
    category: 'table',
    status: 'SPECCED',
    summary:
      'Facu sign-off events with reason + timestamp + linked proposal id. Drives override layer application + audit trail.',
  },
  {
    id: 'tb_discount_rules',
    title: 'discount_rules',
    category: 'table',
    status: 'LIVE',
    summary:
      'Scoped by category / vendor / SKU / client with expiry + warnings + approval audit. Replaces ad-hoc per-SKU price overrides.',
    link: { href: '/admin/catalog/discounts', label: 'Open discounts' },
  },
  {
    id: 'tb_visibility_rules',
    title: 'visibility_rules',
    category: 'table',
    status: 'SPECCED',
    summary:
      'Clear rules per source x quality_family x vendor. Maintained by Job (rule-based, not case-by-case), reviewed quarterly by Facu.',
  },
  {
    id: 'tb_override_audit',
    title: 'override_audit (immutable)',
    category: 'table',
    status: 'SPECCED',
    summary:
      'Every approved override recorded immutably with reason + approver + timestamp. Read-only after write.',
  },
  {
    id: 'tb_shipping_config',
    title: 'shipping_config_v2 (multi-country)',
    category: 'table',
    status: 'LIVE',
    summary:
      'Per {origin_country, dest_port}: base rate, fuel mult, dim divisor, REL_NUMBER, customs fees. Unlocks Colombia + Holland vendors alongside Ecuador.',
  },

  // ===== Verifiers (Pipeline Law) =====
  {
    id: 'vf_pipeline_law',
    title: '9 verifiers (Pipeline Law)',
    category: 'verifier',
    status: 'TBD',
    summary:
      'One verifier per layer (vendors, SKU master, cost, boxes+shipping, target price, K2K mirror, floropolis<->k2k, reconciliation, override). Today: 3 exist (T1, ghost, price_drift). 6 more owed.',
  },
  {
    id: 'vf_admin_consistency',
    title: 'verify_admin_consistency.py',
    category: 'verifier',
    status: 'TBD',
    summary:
      'Job-owned. Proves what the UI shows = target_price_v2 x discount_rules x visibility_rules. Blocks morning send on FAIL per Pipeline Law.',
  },
];

// -- Helpers ---------------------------------------------------------------

const PHASE_META: Record<Phase, { label: string; subtitle: string; tone: 'red' | 'amber' | 'slate' }> = {
  cutover_blocker: {
    label: 'Phase 1 -- cutover blockers',
    subtitle: 'Required before checkout + payment system goes live',
    tone: 'red',
  },
  phase_2: {
    label: 'Phase 2',
    subtitle: 'Unlocks scale beyond 5 vendors / single country',
    tone: 'amber',
  },
  phase_3: {
    label: 'Phase 3',
    subtitle: 'Unlocks 10x scale + platform maturity',
    tone: 'slate',
  },
};

const AREA_BADGE: Record<Area, string> = {
  frontend: 'bg-blue-100 text-blue-800',
  backend: 'bg-emerald-100 text-emerald-800',
  infra: 'bg-violet-100 text-violet-800',
};

const SPEC_STATUS_BADGE: Record<SpecStatus, string> = {
  proposed: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-800',
  staffed: 'bg-emerald-100 text-emerald-800',
  blocked: 'bg-red-100 text-red-700',
};

const CONTRACT_STATUS_BADGE: Record<ContractStatus, string> = {
  LIVE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  SPECCED: 'bg-amber-100 text-amber-800 border-amber-200',
  TBD: 'bg-slate-100 text-slate-700 border-slate-200',
};

const CATEGORY_META: Record<ContractCategory, { label: string; subtitle: string }> = {
  agent: { label: 'Agents', subtitle: 'New specialized agents to build or extend' },
  table: { label: 'Tables', subtitle: 'Supabase tables for the override layer + multi-country support' },
  contract: { label: 'Contracts', subtitle: 'Views + materialized tables that flow between agents' },
  flow: { label: 'Flows', subtitle: 'Process flows that govern the override layer' },
  verifier: { label: 'Verifiers', subtitle: 'Pipeline Law -- one verifier per layer' },
};
const CATEGORY_ORDER: ContractCategory[] = ['agent', 'flow', 'contract', 'table', 'verifier'];

function phaseHeaderClasses(tone: 'red' | 'amber' | 'slate'): string {
  if (tone === 'red') return 'text-red-900 bg-red-50 border-red-200';
  if (tone === 'amber') return 'text-amber-900 bg-amber-50 border-amber-200';
  return 'text-slate-900 bg-slate-50 border-slate-200';
}

// -- Page ------------------------------------------------------------------

export const metadata = {
  title: 'Proposals (meta) | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default async function AdminCatalogProposalsPage({ searchParams }: PageProps) {
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
  const requested = (sp.tab ?? 'specializations') as Tab;
  const tab: Tab = TAB_VALUES.includes(requested) ? requested : 'specializations';

  const counts: Record<Tab, number> = {
    specializations: SPECIALIZATIONS.length,
    contracts: CONTRACTS.length,
  };

  // Tab A grouping
  const specsByPhase: Record<Phase, Specialization[]> = {
    cutover_blocker: SPECIALIZATIONS.filter((s) => s.phase === 'cutover_blocker'),
    phase_2: SPECIALIZATIONS.filter((s) => s.phase === 'phase_2'),
    phase_3: SPECIALIZATIONS.filter((s) => s.phase === 'phase_3'),
  };
  const PHASE_ORDER: Phase[] = ['cutover_blocker', 'phase_2', 'phase_3'];

  // Tab B grouping
  const contractsByCategory: Record<ContractCategory, ContractItem[]> = {
    agent: [],
    flow: [],
    contract: [],
    table: [],
    verifier: [],
  };
  for (const c of CONTRACTS) contractsByCategory[c.category].push(c);

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Proposals (meta)</h1>
          <p className="text-slate-500 text-sm mt-1 max-w-3xl">
            Job_PM&apos;s CPO-level view: what specializations the platform needs, and what
            contracts + agents have already been specced. Read-only informational surface --
            no DB writes from this page. Built so Facu can scan the slate of delegations in
            one place.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-violet-50 border border-violet-200 text-xs text-violet-900">
            <span className="font-semibold">Role expansion flag:</span>
            <span>
              Job_PM = Growth PM (Website) + Catalog Control Plane PM + Platform PM. Three
              roles in one.
            </span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 mb-6 border-b border-slate-200">
          {TAB_VALUES.map((t) => {
            const active = tab === t;
            return (
              <a
                key={t}
                href={tabHref(t)}
                className={
                  active
                    ? 'px-4 py-2 text-sm font-semibold text-emerald-700 border-b-2 border-emerald-600 -mb-px'
                    : 'px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 border-b-2 border-transparent -mb-px'
                }
              >
                {TAB_LABELS[t]}
                <span
                  className={
                    active
                      ? 'ml-2 inline-flex items-center justify-center text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5'
                      : 'ml-2 inline-flex items-center justify-center text-[11px] font-medium rounded-full bg-slate-100 text-slate-600 px-2 py-0.5'
                  }
                >
                  {counts[t]}
                </span>
              </a>
            );
          })}
        </div>

        {/* Tab A: specializations */}
        {tab === 'specializations' && (
          <div>
            {SPECIALIZATIONS.length === 0 ? (
              <EmptyState
                title="No specializations on the slate"
                hint="Add roles to SPECIALIZATIONS in this file to surface them here."
              />
            ) : (
              PHASE_ORDER.map((phase) => {
                const specs = specsByPhase[phase];
                if (specs.length === 0) return null;
                const meta = PHASE_META[phase];
                return (
                  <section key={phase} className="mb-8">
                    <div
                      className={`rounded-t-xl border px-4 py-2.5 ${phaseHeaderClasses(meta.tone)}`}
                    >
                      <p className="text-sm font-bold">{meta.label}</p>
                      <p className="text-xs opacity-80 mt-0.5">{meta.subtitle}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                      {specs.map((s) => (
                        <SpecCard key={s.id} s={s} />
                      ))}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        )}

        {/* Tab B: contracts + agents */}
        {tab === 'contracts' && (
          <div>
            {CONTRACTS.length === 0 ? (
              <EmptyState
                title="Nothing specced yet"
                hint="Add entries to CONTRACTS in this file to surface them here."
              />
            ) : (
              CATEGORY_ORDER.map((cat) => {
                const items = contractsByCategory[cat];
                if (items.length === 0) return null;
                const meta = CATEGORY_META[cat];
                return (
                  <section key={cat} className="mb-8">
                    <div className="mb-3">
                      <p className="text-sm font-bold text-slate-900">{meta.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{meta.subtitle}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {items.map((c) => (
                        <ContractCard key={c.id} c={c} />
                      ))}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        )}

        {/* Footer note */}
        <p className="text-xs text-slate-400 mt-10 max-w-3xl">
          Job_PM = Growth PM (Website) + Catalog control plane PM + Platform PM. This screen
          documents what gets delegated to free capacity.
        </p>
      </main>

      <Footer />
    </div>
  );
}

// -- Sub-components --------------------------------------------------------

function SpecCard({ s }: { s: Specialization }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col h-full">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
          {s.id}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${AREA_BADGE[s.area]}`}
        >
          {s.area}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ml-auto ${SPEC_STATUS_BADGE[s.status]}`}
        >
          {s.status.replace(/_/g, ' ')}
        </span>
      </div>
      <p className="font-semibold text-slate-900 text-sm leading-snug">{s.title}</p>
      <p className="text-xs text-slate-600 mt-2 leading-relaxed">{s.why}</p>
    </div>
  );
}

function ContractCard({ c }: { c: ContractItem }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="font-semibold text-slate-900 text-sm leading-snug flex-1 min-w-0">
          {c.title}
        </p>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase border shrink-0 ${CONTRACT_STATUS_BADGE[c.status]}`}
        >
          {c.status}
        </span>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed flex-1">{c.summary}</p>
      {c.link && (
        <a
          href={c.link.href}
          className="mt-3 inline-flex items-center text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
        >
          {c.link.label} -&gt;
        </a>
      )}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-16 text-slate-500 border border-dashed border-slate-200 rounded-xl">
      <p className="font-semibold text-slate-600">{title}</p>
      <p className="text-sm mt-1">{hint}</p>
    </div>
  );
}
