// DataPlaneStatusPanel -- "what's NOT yet connected to the DB" surface.
// v1 | 2026-05-27 | Job_PM Sub-Agent B [V8 SHADOW]
//
// Per Facu directive 2026-05-27: every piece of the supply-gate model whose
// backing data is NOT properly connected to the database yet must be visible
// at a glance from /admin. This panel renders that list.
//
// Static content — describes the data-plane state, NOT per-request DB calls.
// Updates when dependencies actually ship (edit this file when status flips).
//
// Source of truth for the dependency list:
//   - Job_PM/kb/projects/perfect_inventory_bar.md (canonical spec v2)
//   - meta.agent_inbox id 0b3fa5be-2713-4a23-a0a1-76e2e3fa842d (routed to Nahua 2026-05-27)
//
// Rendered on app/admin/page.tsx ABOVE AdminCatalogHealthPanel.

import type { ReactNode } from 'react';

type Status = 'PENDING' | 'PARTIAL' | 'LIVE';

interface Dependency {
  id: string;
  name: string;
  status: Status;
  today: string;
  target: string;
  impact: string;
  routed?: string; // e.g. "routed to Nahua 2026-05-27"
}

// ── Rose dependencies (the 5 that block the supply-gate model today) ─────────
const ROSE_DEPS: Dependency[] = [
  {
    id: 'box-master-vendor',
    name: 'Vendor-scoped box_master',
    status: 'PENDING',
    today: 'Global box dims per box_type (one row per box).',
    target: 'Per (vendor, box_type) — every vendor packs differently.',
    impact: 'Validator uses global box dims for all vendors; per-vendor accuracy pending Rose schema migration.',
    routed: 'routed to Nahua 2026-05-27',
  },
  {
    id: 'country-pricing',
    name: 'Country-scoped pricing constants (GPM, FedEx, fuel)',
    status: 'PENDING',
    today: 'Global pricing_constants — single GPM / fedex_rate / fuel_mult applied to every SKU.',
    target: 'Per origin_country — Ecuador, Colombia, US each get their own constants.',
    impact: 'T2/T3 from non-Ecuador origins compute with Ecuador constants until split.',
    routed: 'routed to Nahua 2026-05-27',
  },
  {
    id: 'price-review-signal',
    name: 'Canonical "price needs review" signal',
    status: 'PENDING',
    today: 'has_open_price_alert deprecated (shared/kb/canonical_definitions.md:27). No active price-review gate.',
    target: 'New canonical signal owned by Rose, written when formula deviation or vendor change should trigger review.',
    impact: 'No automated price-review surfacing; manual review only until Rose defines replacement.',
    routed: 'routed to Nahua 2026-05-27',
  },
  {
    id: 'k2k-live-feed',
    name: 'Real-time K2K API live feed',
    status: 'PENDING',
    today: 'Stale live flag — v_catalog_admin reflects catalog_published presence (publishable = active), not real-time stock.',
    target: 'Live feed with extracted_at + valid_until + source_vendor (Magic Flowers excluded).',
    impact: '"Live" badges + fast-lane delivery windows not reliable until API feed ships.',
    routed: 'routed to Nahua 2026-05-27',
  },
  {
    id: 'origin-expansion',
    name: 'Origin acceptance expansion (Colombia + US T2/T3)',
    status: 'PENDING',
    today: 'tier_visibility_windows.accepted=true only for Ecuador.',
    target: 'Expand row-by-row as Colombia + US pipelines come online.',
    impact: 'Only Ecuador T2/T3 surfaceable today; non-Ecuador supply silently hidden.',
    routed: 'routed to Nahua 2026-05-27',
  },
];

// ── Perfect-tier roadmap signals (progressive — data exists, rollup pending) ─
const ROADMAP_DEPS: Dependency[] = [
  {
    id: 'feedback-rollup',
    name: 'Customer feedback / star rating aggregation',
    status: 'PARTIAL',
    today: 'Raw feedback in dispatch_feedback table.',
    target: 'Per-SKU rollup view + perfect-tier gate consuming avg rating.',
    impact: 'Easiest to ship next — pure aggregation, no new ingest.',
  },
  {
    id: 'demand-general',
    name: 'Demand-general (variety frequency from orders)',
    status: 'PARTIAL',
    today: 'Order rows exist in orders table.',
    target: 'Rollup view: orders per variety per N-day window → demand score.',
    impact: 'Perfect tier currently cannot weight by realized demand.',
  },
  {
    id: 'demand-traffic',
    name: 'Demand-traffic (GA4 PDP/ATB/search per SKU)',
    status: 'PARTIAL',
    today: 'GA4 events ingested at session level.',
    target: 'Per-SKU rollup: PDP views, ATB rate, search queries.',
    impact: 'Cannot blend traffic intent into importance score until rollup ships.',
  },
  {
    id: 'exclusivity',
    name: 'Exclusivity (own-side + competitor delta)',
    status: 'PARTIAL',
    today: 'Own-side computable from mirror (which vendors offer this variety).',
    target: 'Competitor delta from Pillar 2 SEO/competitor intel.',
    impact: 'Half the signal — own-side ready, competitor side blocked on Pillar 2.',
  },
  {
    id: 'price-competitiveness',
    name: 'Price competitiveness (vs competitor_prices)',
    status: 'PENDING',
    today: 'No competitor_prices ingest. Pillar 2 (SEO/competitor intel) parked.',
    target: 'Scheduled competitor scrape + per-SKU price-gap signal.',
    impact: 'Cannot surface "we are X% under PetalJet" or similar until Pillar 2 unparks.',
  },
];

// ── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Status }) {
  if (status === 'LIVE') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
        LIVE
      </span>
    );
  }
  if (status === 'PARTIAL') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
        PARTIAL
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-700">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
      PENDING
    </span>
  );
}

// ── Dependency row ──────────────────────────────────────────────────────────
function DependencyRow({ dep }: { dep: Dependency }) {
  return (
    <div className="py-3 border-t border-slate-100 first:border-t-0">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="text-sm font-semibold text-slate-900 leading-tight">
          {dep.name}
        </div>
        <StatusBadge status={dep.status} />
      </div>
      <div className="text-[11px] text-slate-600 leading-snug">
        <span className="text-slate-400">Today:</span> {dep.today}
      </div>
      <div className="text-[11px] text-slate-600 leading-snug mt-0.5">
        <span className="text-slate-400">Target:</span> {dep.target}
      </div>
      <div className="text-[11px] text-slate-700 leading-snug mt-1">
        <span className="font-medium">Impact:</span> {dep.impact}
      </div>
      {dep.routed && (
        <div className="text-[10px] text-emerald-700 mt-1 font-mono">
          {dep.routed}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DataPlaneStatusPanel(): ReactNode {
  const pendingCount = ROSE_DEPS.filter((d) => d.status === 'PENDING').length;
  const partialCount = [...ROSE_DEPS, ...ROADMAP_DEPS].filter((d) => d.status === 'PARTIAL').length;

  return (
    <section
      id="data-plane-status"
      className="bg-white rounded-2xl border border-slate-200 p-5 mb-4 scroll-mt-20"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Data plane status — what&apos;s not yet connected
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Supply-gate model dependencies whose backing data is stubbed,
            partial, or not yet wired to the canonical pipeline. Per Facu
            directive 2026-05-27.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
            {pendingCount} pending
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
            {partialCount} partial
          </span>
        </div>
      </div>

      {/* Rose dependencies — the 5 that block the supply-gate model */}
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
          Rose dependencies · 5 routed
        </p>
        <div>
          {ROSE_DEPS.map((dep) => (
            <DependencyRow key={dep.id} dep={dep} />
          ))}
        </div>
      </div>

      {/* Perfect-tier roadmap — progressive signals */}
      <div className="mt-5 pt-4 border-t border-slate-200">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
          Perfect-tier roadmap (progressive)
        </p>
        <p className="text-[11px] text-slate-500 mb-1">
          Signals that lift SKUs from publishable → perfect once their rollups
          ship. Ranked by how close they are to landing.
        </p>
        <div>
          {ROADMAP_DEPS.map((dep) => (
            <DependencyRow key={dep.id} dep={dep} />
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 leading-snug">
        Static surface — updates when dependencies ship. Source of truth:
        <code className="font-mono ml-1">Job_PM/kb/projects/perfect_inventory_bar.md</code>.
        Edit this file when status flips.
      </div>
    </section>
  );
}
