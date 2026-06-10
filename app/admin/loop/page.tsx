// Admin -- IMPROVEMENT LOOP audit view ("the audit trail behind the streak").
// v1 | 2026-06-05 | Job_PM
//
// Facu's ask: an audit view of the improvement loop so he can AUDIT the loop
// himself instead of trusting summary counts. The improvement loop is the
// product's generic spine: every gap the system finds moves
//   open -> routed -> landed -> re_scored -> verified
// each transition carrying evidence. This server component renders every loop
// item, its current step, who owns it, how it was routed, and the raw evidence
// jsonb shown honestly (expandable key-value, never summarized away).
//
// Data sources (supabase-backup):
//   public.improvement_loop_state   (state machine: one row per sku+gate)
//   public.v_loop_closure_rate      (per-domain weekly closure stats)
//   public.dim_sku                  (vendor / variety / size / color / tier labels)
//
// Filters are URL searchParams (server-rendered, no client state libs):
//   ?domain= &state= &gate= &owner=
// Default sort: most recent activity first. Capped at 100 rows; filtered total
// is always shown so the cap is honest.
//
// Read-only. Style mirrors /admin/catalog/blocked/page.tsx (emerald-600 accent,
// slate scale, ASCII-clean copy).

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import SurfaceStatusBanner from '../_components/SurfaceStatusBanner';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export const metadata = {
  title: 'Improvement Loop | Floropolis Admin',
  robots: { index: false, follow: false },
};

const ROW_CAP = 100;

// ---------------------------------------------------------------------------
// Loop steps -- the 5-step spine, in order.
// ---------------------------------------------------------------------------

const STEPS = ['open', 'routed', 'landed', 're_scored', 'verified'] as const;
type Step = (typeof STEPS)[number];

// Short labels for the progress indicator (ASCII-clean).
const STEP_LABEL: Record<Step, string> = {
  open: 'open',
  routed: 'routed',
  landed: 'landed',
  re_scored: 're-scored',
  verified: 'verified',
};

// State chip styling, matching the blocked page's repair chip idiom.
const STATE_CHIP: Record<string, string> = {
  open: 'bg-slate-100 text-slate-600 border border-slate-200',
  routed: 'bg-blue-50 text-blue-700 border border-blue-200',
  landed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  re_scored: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  verified: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
};

function stateChipCls(state: string): string {
  return STATE_CHIP[state] ?? 'bg-white text-slate-400 border border-slate-200';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoopRow {
  id: string;
  sku_id: string | null;
  gate_id: string | null;
  state: string;
  owner_agent: string | null;
  routed_via: string | null;
  evidence: unknown;
  domain: string | null;
  opened_at: string | null;
  routed_at: string | null;
  landed_at: string | null;
  rescored_at: string | null;
  verified_at: string | null;
  created_at: string | null;
}

interface DimRow {
  sku_id: string;
  vendor_canonical_name: string | null;
  variety_normalized: string | null;
  size_cm: number | null;
  color_normalized: string | null;
  tier: string | null;
}

interface ClosureRow {
  domain: string;
  week_start: string;
  opened: number;
  verified: number;
  in_flight: number;
  still_open: number;
  closure_rate: number | string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return '--';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '--';
  // YYYY-MM-DD HH:MM UTC, ASCII-clean.
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

// Timestamp reached for a given step (or null if not reached).
function stepTs(row: LoopRow, step: Step): string | null {
  switch (step) {
    case 'open':
      return row.opened_at ?? row.created_at ?? null;
    case 'routed':
      return row.routed_at;
    case 'landed':
      return row.landed_at;
    case 're_scored':
      return row.rescored_at;
    case 'verified':
      return row.verified_at;
  }
}

// Most-recent-activity timestamp, for default sort.
function lastActivityMs(row: LoopRow): number {
  const t =
    row.verified_at ??
    row.rescored_at ??
    row.landed_at ??
    row.routed_at ??
    row.opened_at ??
    row.created_at;
  return t ? new Date(t).getTime() : 0;
}

function skuLabel(dim: DimRow | undefined, skuId: string | null): string {
  if (!dim) return skuId ?? '(no sku)';
  const parts = [
    dim.vendor_canonical_name,
    dim.variety_normalized,
    dim.size_cm != null ? `${dim.size_cm}cm` : null,
    dim.color_normalized,
    dim.tier,
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  return parts.length > 0 ? parts.join(' / ') : skuId ?? '(no sku)';
}

// Flatten evidence jsonb into ordered [key, value-string] pairs for honest
// key-value rendering. Nested objects/arrays are JSON-stringified (pretty), so
// nothing is hidden or summarized away.
function evidencePairs(evidence: unknown): Array<[string, string]> {
  if (evidence == null) return [];
  if (typeof evidence !== 'object' || Array.isArray(evidence)) {
    return [['value', JSON.stringify(evidence, null, 2)]];
  }
  return Object.entries(evidence as Record<string, unknown>).map(([k, v]) => {
    if (v == null) return [k, '--'] as [string, string];
    if (typeof v === 'object') return [k, JSON.stringify(v, null, 2)] as [string, string];
    return [k, String(v)] as [string, string];
  });
}

function firstParam(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminLoopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Auth gate ------------------------------------------------------------
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

  const sp = await searchParams;
  const fDomain = firstParam(sp.domain);
  const fState = firstParam(sp.state);
  const fGate = firstParam(sp.gate);
  const fOwner = firstParam(sp.owner);

  const backup = getBackupServiceClient();

  // Closure stats (summary band) -----------------------------------------
  const { data: closureRaw, error: closureErr } = await backup
    .from('v_loop_closure_rate')
    .select('domain, week_start, opened, verified, in_flight, still_open, closure_rate')
    .order('domain', { ascending: true })
    .order('week_start', { ascending: false });
  if (closureErr) console.error('[admin/loop] closure_rate:', closureErr);
  const closureRows = (closureRaw ?? []) as unknown as ClosureRow[];

  // Lifetime rollup per domain (sum opened/verified across weeks).
  interface DomainRollup {
    domain: string;
    opened: number;
    verified: number;
    inFlight: number;
    stillOpen: number;
    thisWeek: ClosureRow | null;
  }
  const rollupMap = new Map<string, DomainRollup>();
  for (const r of closureRows) {
    const cur =
      rollupMap.get(r.domain) ??
      ({ domain: r.domain, opened: 0, verified: 0, inFlight: 0, stillOpen: 0, thisWeek: null } as DomainRollup);
    cur.opened += Number(r.opened) || 0;
    cur.verified += Number(r.verified) || 0;
    cur.inFlight += Number(r.in_flight) || 0;
    cur.stillOpen += Number(r.still_open) || 0;
    // closureRows are ordered week_start desc, so the first seen per domain is the latest week.
    if (cur.thisWeek == null) cur.thisWeek = r;
    rollupMap.set(r.domain, cur);
  }
  const rollups = Array.from(rollupMap.values());

  // Build the filtered loop query. Filters applied server-side, then we sort by
  // last activity in JS (it spans 5 nullable timestamp columns).
  let query = backup
    .from('improvement_loop_state')
    .select(
      'id, sku_id, gate_id, state, owner_agent, routed_via, evidence, domain, opened_at, routed_at, landed_at, rescored_at, verified_at, created_at',
      { count: 'exact' },
    );
  if (fDomain) query = query.eq('domain', fDomain);
  if (fState) query = query.eq('state', fState);
  if (fGate) query = query.eq('gate_id', fGate);
  if (fOwner) query = query.eq('owner_agent', fOwner);

  // Pull up to a working window (cap is applied after JS sort). The table is
  // ~706 rows, so a single bounded pull is fine; we order by created_at desc
  // server-side as a stable pre-sort, then refine in JS.
  const { data: loopRaw, error: loopErr, count } = await query
    .order('created_at', { ascending: false })
    .limit(2000);
  if (loopErr) console.error('[admin/loop] loop_state:', loopErr);
  const allRows = ((loopRaw ?? []) as unknown as LoopRow[]).sort(
    (a, b) => lastActivityMs(b) - lastActivityMs(a),
  );
  const filteredTotal = count ?? allRows.length;
  const rows = allRows.slice(0, ROW_CAP);

  // Fetch dim_sku labels for the visible rows --------------------------------
  const visibleSkuIds = Array.from(
    new Set(rows.map((r) => r.sku_id).filter((id): id is string => typeof id === 'string')),
  );
  const dimById = new Map<string, DimRow>();
  for (let i = 0; i < visibleSkuIds.length; i += 500) {
    const chunk = visibleSkuIds.slice(i, i + 500);
    const { data, error } = await backup
      .from('dim_sku')
      .select('sku_id, vendor_canonical_name, variety_normalized, size_cm, color_normalized, tier')
      .in('sku_id', chunk);
    if (error) {
      console.error('[admin/loop] dim_sku:', error);
      continue;
    }
    for (const d of (data ?? []) as unknown as DimRow[]) dimById.set(d.sku_id, d);
  }

  // Distinct values for the filter dropdowns (computed over the full filtered
  // window we pulled). For the universe of options we union with the active
  // filter value so it never disappears from its own dropdown.
  function distinct(getter: (r: LoopRow) => string | null, active: string): string[] {
    const s = new Set<string>();
    for (const r of allRows) {
      const v = getter(r);
      if (v) s.add(v);
    }
    if (active) s.add(active);
    return Array.from(s).sort();
  }
  // These dropdowns are computed from the already-filtered set; to give stable
  // option lists we hardcode the known small universes where the filter would
  // otherwise narrow itself. State and step universe is the 5-step spine.
  const domainOpts = distinct((r) => r.domain, fDomain);
  const stateOpts = STEPS as readonly string[];
  const gateOpts = distinct((r) => r.gate_id, fGate);
  const ownerOpts = distinct((r) => r.owner_agent, fOwner);

  // Build a querystring preserving the other filters when changing one.
  function buildHref(overrides: Record<string, string>): string {
    const params = new URLSearchParams();
    const base: Record<string, string> = {
      domain: fDomain,
      state: fState,
      gate: fGate,
      owner: fOwner,
      ...overrides,
    };
    for (const [k, v] of Object.entries(base)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/admin/loop?${qs}` : '/admin/loop';
  }

  const anyFilter = Boolean(fDomain || fState || fGate || fOwner);

  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
        <Link href="/admin" className="hover:text-emerald-700">Admin</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700 font-medium">Improvement Loop</span>
      </nav>

      <SurfaceStatusBanner surfaceKey="loop" />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Improvement Loop</h1>
        <p className="text-slate-500 text-sm mt-1 max-w-3xl">
          Every gap the system found, who fixed it, and the evidence -- the audit
          trail behind the streak. Each item moves open -&gt; routed -&gt; landed -&gt;
          re-scored -&gt; verified, and every transition carries its own evidence.
          Read-only. Source: improvement_loop_state + v_loop_closure_rate + dim_sku
          on supabase-backup.
        </p>
      </div>

      {/* Summary band: per-domain closure stats */}
      <div className="mb-8">
        <h2 className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Closure by domain</h2>
        {rollups.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No closure data yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rollups.map((d) => {
              const tw = d.thisWeek;
              const lifeRate = d.opened > 0 ? d.verified / d.opened : 0;
              return (
                <div key={d.domain} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 capitalize">{d.domain}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold">
                      {(lifeRate * 100).toFixed(1)}% closed
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold text-slate-900">{d.opened.toLocaleString()}</div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">opened</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-emerald-700">{d.verified.toLocaleString()}</div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">verified</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-blue-700">{d.inFlight.toLocaleString()}</div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">in flight</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-slate-500">{d.stillOpen.toLocaleString()}</div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">still open</div>
                    </div>
                  </div>
                  {tw && (
                    <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                      This week ({tw.week_start}): {Number(tw.verified).toLocaleString()} verified of{' '}
                      {Number(tw.opened).toLocaleString()} opened (
                      {(Number(tw.closure_rate) * 100).toFixed(1)}%)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <FilterGroup
            label="Domain"
            active={fDomain}
            options={domainOpts}
            buildHref={(v) => buildHref({ domain: v })}
          />
          <FilterGroup
            label="State"
            active={fState}
            options={stateOpts as string[]}
            buildHref={(v) => buildHref({ state: v })}
          />
          <FilterGroup
            label="Gate"
            active={fGate}
            options={gateOpts}
            buildHref={(v) => buildHref({ gate: v })}
          />
          <FilterGroup
            label="Owner"
            active={fOwner}
            options={ownerOpts}
            buildHref={(v) => buildHref({ owner: v })}
          />
          {anyFilter && (
            <Link
              href="/admin/loop"
              className="text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-600"
            >
              Clear filters
            </Link>
          )}
        </div>
        <div className="mt-3 text-[11px] text-slate-400">
          Showing {rows.length.toLocaleString()} of {filteredTotal.toLocaleString()} matching items
          {filteredTotal > ROW_CAP && ` (capped at ${ROW_CAP}; narrow the filters to see more)`}.
          Sorted by most recent activity.
        </div>
      </div>

      {/* Item list */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          No loop items match these filters.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const dim = row.sku_id ? dimById.get(row.sku_id) : undefined;
            const pairs = evidencePairs(row.evidence);
            return (
              <div key={row.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                {/* Row header line */}
                <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {skuLabel(dim, row.sku_id)}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-mono text-slate-700">{row.gate_id ?? '--'}</span>
                      <span className="text-slate-300">|</span>
                      <span>owner: <span className="text-slate-700">{row.owner_agent ?? '--'}</span></span>
                      <span className="text-slate-300">|</span>
                      <span>domain: <span className="text-slate-700">{row.domain ?? '--'}</span></span>
                    </div>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${stateChipCls(row.state)}`}>
                    {STEP_LABEL[row.state as Step] ?? row.state}
                  </span>
                </div>

                {/* 5-step progress indicator */}
                <div className="px-4 py-3">
                  <ol className="flex flex-wrap items-stretch gap-x-2 gap-y-2">
                    {STEPS.map((step, i) => {
                      const ts = stepTs(row, step);
                      const reached = Boolean(ts);
                      return (
                        <li key={step} className="flex items-center gap-2">
                          <div
                            className={`min-w-[112px] rounded-md border px-2.5 py-1.5 ${
                              reached
                                ? 'border-emerald-200 bg-emerald-50'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <div
                              className={`text-[11px] font-semibold ${
                                reached ? 'text-emerald-800' : 'text-slate-400'
                              }`}
                            >
                              {STEP_LABEL[step]}
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 font-mono ${
                                reached ? 'text-emerald-700' : 'text-slate-300'
                              }`}
                            >
                              {fmtTs(ts)}
                            </div>
                          </div>
                          {i < STEPS.length - 1 && (
                            <span className="text-slate-300 text-xs select-none">-&gt;</span>
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  {/* routed_via */}
                  <div className="mt-3 text-[11px] text-slate-500">
                    routed via:{' '}
                    <span className="font-mono text-slate-700">{row.routed_via ?? '--'}</span>
                  </div>

                  {/* Evidence -- honest, expandable, never summarized away */}
                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 select-none">
                      Evidence ({pairs.length} {pairs.length === 1 ? 'field' : 'fields'})
                    </summary>
                    {pairs.length === 0 ? (
                      <div className="mt-2 text-[11px] text-slate-400">No evidence recorded.</div>
                    ) : (
                      <dl className="mt-2 rounded-md border border-slate-200 bg-slate-50 divide-y divide-slate-200">
                        {pairs.map(([k, v]) => (
                          <div key={k} className="px-3 py-2 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-1 sm:gap-3">
                            <dt className="text-[11px] font-mono font-semibold text-slate-600 break-words">{k}</dt>
                            <dd className="text-[11px] text-slate-700 whitespace-pre-wrap break-words font-mono">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </details>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-8">
        Read-only audit view. Filters are URL params (domain, state, gate, owner),
        server-rendered. Capped at {ROW_CAP} rows; the matching total above is the
        true count. Missing timestamps render as &quot;--&quot; -- never fabricated.
        Sources: supabase-backup improvement_loop_state, v_loop_closure_rate, dim_sku.
      </p>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Filter group -- a label + a row of toggle links (server-rendered, no JS).
// The active option links back to itself cleared (acts as a toggle-off).
// ---------------------------------------------------------------------------

function FilterGroup({
  label,
  active,
  options,
  buildHref,
}: {
  label: string;
  active: string;
  options: string[];
  buildHref: (value: string) => string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.length === 0 ? (
          <span className="text-[11px] text-slate-300">--</span>
        ) : (
          options.map((opt) => {
            const isActive = active === opt;
            return (
              <Link
                key={opt}
                href={isActive ? buildHref('') : buildHref(opt)}
                className={`text-[11px] px-2 py-0.5 rounded border font-medium ${
                  isActive
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {opt}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
