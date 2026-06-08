'use client';

// MOCKUP — Admin information-architecture consolidation (BEFORE -> AFTER).
// v1 | 2026-06-08 | Job_PM (CPO)
//
// Spec: Job_PM/kb/specs/admin_surface_consolidation_spec.md
// Purpose: show the CEO the PROPOSED consolidated admin nav before we touch real
// pages. Problem: Desk / Approvals / Proposals are 3 views over the same
// admin_proposals table at different curation levels -> confusing.
//
// Static / hardcoded. No DB. 'use client' only for the local tab toggle in Part B.
// Design idiom mirrors AdminSidebar.tsx + desk/page.tsx: emerald-600 primary,
// slate scale, rounded cards, uppercase micro-labels, ASCII-clean copy.

import { useState } from 'react';

// ---------------------------------------------------------------------------
// PART A data — current vs proposed sidebars
// ---------------------------------------------------------------------------

interface NavRow {
  icon: string;
  label: string;
  sub: string;
  overlap?: boolean; // amber-flag the 3 overlapping decision surfaces (current)
  role?: string; // tiny role tag (proposed)
}

const CURRENT_NAV: NavRow[] = [
  { icon: '*', label: 'Today', sub: 'Your inbox' },
  { icon: '>', label: 'Desk', sub: 'Pulse / decisions / knowledge', overlap: true },
  { icon: 'C', label: 'Catalog', sub: 'SKUs / inventory / pricing' },
  { icon: 'B', label: 'Blocked', sub: 'SKUs by gate / repair' },
  { icon: 'O', label: 'Orders', sub: 'Queue / fulfillment' },
  { icon: 'D', label: 'Dispatch', sub: 'FedEx / labels / vendor' },
  { icon: '$', label: 'Sales Cleanup', sub: 'Orphan transactions' },
  { icon: 'A', label: 'Approvals', sub: 'Awaiting your sign-off', overlap: true },
  { icon: 'P', label: 'Proposals', sub: 'Full history', overlap: true },
  { icon: 'S', label: 'Config', sub: 'Box / shipping / GPM' },
  { icon: 'L', label: 'Improvement Loop', sub: 'Repair audit trail' },
];

const PROPOSED_NAV: NavRow[] = [
  { icon: '>', label: 'Desk', sub: 'Business decisions that need YOU', role: 'decide (business)' },
  { icon: 'C', label: 'Catalog', sub: 'SKUs / inventory / pricing' },
  { icon: 'B', label: 'Blocked', sub: 'SKUs by gate / repair' },
  { icon: 'O', label: 'Orders', sub: 'Queue / fulfillment' },
  { icon: 'D', label: 'Dispatch', sub: 'FedEx / labels / vendor' },
  { icon: '$', label: 'Sales Cleanup', sub: 'Orphan transaction repair', role: 'data repair' },
  { icon: 'A', label: 'Approvals', sub: 'The full queue + history', role: 'full queue + history' },
  { icon: 'L', label: 'Improvement Loop', sub: 'Read-only repair audit', role: 'audit (read-only)' },
];

// ---------------------------------------------------------------------------
// PART B data — consolidated Approvals deep view (static rows for "Awaiting")
// ---------------------------------------------------------------------------

type ChipTone = 'awaiting' | 'approved' | 'rejected';

interface ProposalRow {
  type: string;
  target: string;
  proposedBy: string;
  status: string;
  tone: ChipTone;
  technical?: boolean;
}

const AWAITING_ROWS: ProposalRow[] = [
  { type: 'price.formula_deviation_review', target: 'rose-garden-premium-x10', proposedBy: 'Rose_BI', status: 'awaiting', tone: 'awaiting' },
  { type: 'catalog_quality_weight.update', target: 'weight: vase_life', proposedBy: 'Job_PM', status: 'awaiting', tone: 'awaiting', technical: true },
  { type: 'sku.publish_exception', target: 'mf-tropical-mini-fiesta', proposedBy: 'Job_PM', status: 'awaiting', tone: 'awaiting' },
  { type: 'box_master.update', target: 'HB / bouquets_per_box', proposedBy: 'Rose_BI', status: 'awaiting', tone: 'awaiting', technical: true },
];

const TABS = [
  { key: 'awaiting', label: 'Awaiting', note: 'curated subset shown on Desk' },
  { key: 'approved', label: 'Approved', note: '' },
  { key: 'rejected', label: 'Rejected', note: '' },
  { key: 'history', label: 'All history', note: 'was the Proposals page' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function StatusChip({ tone, label }: { tone: ChipTone; label: string }) {
  const cls =
    tone === 'awaiting'
      ? 'bg-amber-100 text-amber-800 border-amber-200'
      : tone === 'approved'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : 'bg-rose-100 text-rose-700 border-rose-200';
  return (
    <span className={'text-[10px] px-2 py-0.5 rounded font-semibold border ' + cls}>
      {label}
    </span>
  );
}

function SidebarItem({
  item,
  variant,
}: {
  item: NavRow;
  variant: 'current' | 'proposed';
}) {
  const flagged = variant === 'current' && item.overlap;
  return (
    <div
      className={
        'flex items-center gap-3 px-3 py-2.5 border-l-2 ' +
        (flagged
          ? 'bg-amber-50 border-amber-400'
          : 'border-transparent hover:bg-slate-50')
      }
    >
      <span className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
        {item.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-800 font-medium">{item.label}</span>
          {flagged && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-amber-200 text-amber-900 uppercase tracking-wide">
              decisions
            </span>
          )}
          {variant === 'proposed' && item.role && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wide">
              {item.role}
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-400">{item.sub}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminNavConsolidatedMockup() {
  const [tab, setTab] = useState<TabKey>('awaiting');

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 mb-1">
          Proposed admin information architecture
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          One door for decisions, one for the full queue
        </h1>
        <p className="text-sm text-slate-500 mt-1.5 max-w-3xl">
          Today three nav items open views of the SAME decisions table at
          different curation levels: Desk, Approvals, and Proposals. The proposal
          below collapses that to two clear roles &mdash; <strong className="text-slate-700">Desk</strong> shows the
          curated business decisions that need you; <strong className="text-slate-700">Approvals</strong> is the
          complete queue plus full history. The standalone Proposals page goes
          away &mdash; it becomes a tab.
        </p>
      </header>

      {/* ================= PART A — nav comparison ================= */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          Part A &mdash; the navigation, before and after
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* LEFT — current */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">
                  Today (confusing)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                  3 places to look at decisions
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Desk, Approvals and Proposals all open the same decisions table.
              </p>
            </div>
            <div className="py-1">
              {CURRENT_NAV.map((n) => (
                <SidebarItem key={n.label} item={n} variant="current" />
              ))}
            </div>
          </div>

          {/* RIGHT — proposed */}
          <div className="rounded-xl border border-emerald-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-emerald-900">
                  Proposed (clean)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Proposals folded in
                </span>
              </div>
              <p className="text-[11px] text-emerald-700/80 mt-1">
                Each surface has one clear role. No duplicate doors.
              </p>
            </div>
            <div className="py-1">
              {PROPOSED_NAV.map((n) => (
                <SidebarItem key={n.label} item={n} variant="proposed" />
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center gap-2">
              <span className="text-slate-300 line-through text-sm font-medium">
                Proposals
              </span>
              <span className="text-[11px] text-slate-500">
                removed &mdash; now the &ldquo;All history&rdquo; tab inside Approvals
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ================= PART B — consolidated Approvals deep view ============ */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          Part B &mdash; inside the consolidated Approvals
        </h2>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {/* Page header */}
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                A
              </span>
              <h3 className="text-base font-semibold text-slate-900">Approvals</h3>
              <span className="text-[11px] text-slate-400">
                the complete decisions queue + history
              </span>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex flex-wrap gap-1 px-3 pt-3 border-b border-slate-100">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={
                    'px-3 py-2 text-sm rounded-t-md border-b-2 -mb-px transition-colors ' +
                    (active
                      ? 'border-emerald-600 text-emerald-800 font-semibold bg-emerald-50/60'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50')
                  }
                >
                  {t.label}
                  {t.note && (
                    <span className="block text-[9px] font-normal text-slate-400 leading-tight">
                      {t.note}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab body */}
          <div className="p-4">
            {tab === 'awaiting' ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3 font-semibold">Type</th>
                    <th className="py-2 pr-3 font-semibold">Target</th>
                    <th className="py-2 pr-3 font-semibold">Proposed by</th>
                    <th className="py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {AWAITING_ROWS.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-2.5 pr-3">
                        <span className="font-mono text-[12px] text-slate-700">
                          {r.type}
                        </span>
                        {r.technical && (
                          <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded font-semibold bg-slate-100 text-slate-500 uppercase tracking-wide">
                            technical config
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">{r.target}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{r.proposedBy}</td>
                      <td className="py-2.5">
                        <StatusChip tone={r.tone} label="awaiting" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-slate-500 py-6 text-center">
                {tab === 'approved' && 'Approved proposals would list here.'}
                {tab === 'rejected' && 'Rejected proposals would list here.'}
                {tab === 'history' &&
                  'Full chronological history of every proposal (this replaces the old Proposals page).'}
                <div className="text-[11px] text-slate-400 mt-1">
                  Static mockup &mdash; only the Awaiting tab is populated.
                </div>
              </div>
            )}
          </div>

          {/* Callout */}
          <div className="mx-4 mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
              How this relates to your Desk
            </div>
            <p className="text-sm text-emerald-900/90 leading-relaxed">
              <strong>Desk</strong> shows the business decisions that need you &mdash;
              curated, high-value, data-ops tuning filtered out. This{' '}
              <strong>Approvals</strong> queue is the complete list (including the
              technical config proposals) plus full history.{' '}
              <strong>Proposals is no longer a separate page</strong> &mdash; it&apos;s the
              &ldquo;All history&rdquo; tab here.
            </p>
          </div>
        </div>
      </section>

      {/* Footer note */}
      <p className="text-xs text-slate-400">
        Mockup only &mdash; hardcoded, not wired to admin_proposals. Real build follows
        the spec at Job_PM/kb/specs/admin_surface_consolidation_spec.md after Facu
        passes this. /admin/catalog/proposals will redirect (not 404) to the
        Approvals history tab.
      </p>
    </main>
  );
}
