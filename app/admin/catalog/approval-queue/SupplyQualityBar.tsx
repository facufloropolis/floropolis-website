// SupplyQualityBar | v1 | 2026-05-23 | Job_PM [V8 SHADOW]
//
// Persistent supply quality bar above the approval queue tab bar.
// Shows current catalog state (blocked / publishable / perfect) and two
// actionable sections:
//   - "If resolved today" — potential unlocks per panel
//   - "In flight" — corrections Facu has already submitted + their status
//
// Pure display component. No client interactivity required.
// Named export CorrectionsTable is also available for standalone use.

export interface PendingCorrection {
  id: string;
  type: string;           // e.g. 'ingest.price_field_bug', 'cost_source.facu_correction'
  label: string;          // human-readable: e.g. 'Ingest price bug', 'Cost source correction'
  priority: string | null; // 'P0', 'P1', 'P2', or null
  proposed_at: string;    // ISO string
  days_open: number;      // pre-computed
}

export interface PotentialUnlock {
  label: string;          // e.g. 'Fix ingest pipeline'
  sku_count: number;      // how many SKUs become eligible if this is resolved
  panel: string;          // e.g. 'ingest', 'cost_source', 'price_alert', 'description'
}

export interface HistoricalMetric {
  label: string;          // e.g. 'Ingest price bug'
  applied_count: number;  // how many corrections of this type have been approved+executed
  avg_days_to_apply: number | null; // null if none yet; computed from proposed_at -> decided_at
  last_applied_at: string | null;   // ISO string of most recent approval
}

interface Props {
  blockedCount: number;
  publishableCount: number;
  perfectCount: number;
  totalCount: number;
  pendingCorrections: PendingCorrection[];
  potentialUnlocks: PotentialUnlock[];
  historicalMetrics: HistoricalMetric[];
}

// Panel color dot mapping
const PANEL_DOT: Record<string, string> = {
  ingest:       'bg-red-500',
  cost_source:  'bg-amber-500',
  price_alert:  'bg-orange-500',
  description:  'bg-violet-500',
};

function panelDot(panel: string): string {
  return PANEL_DOT[panel] ?? 'bg-slate-400';
}

// Priority badge styling
function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  const cls =
    priority === 'P0'
      ? 'bg-red-100 text-red-800'
      : priority === 'P1'
        ? 'bg-orange-100 text-orange-800'
        : 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>
      {priority}
    </span>
  );
}

// Section 1 — Supply state
function SupplyStateSection({
  blockedCount,
  publishableCount,
  perfectCount,
  totalCount,
}: {
  blockedCount: number;
  publishableCount: number;
  perfectCount: number;
  totalCount: number;
}) {
  const safe = totalCount > 0 ? totalCount : 1;
  const perfectPct  = Math.round((perfectCount  / safe) * 100);
  const publishPct  = Math.round((publishableCount / safe) * 100);
  const blockedPct  = Math.round((blockedCount  / safe) * 100);

  return (
    <div className="py-1">
      <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 mb-2">
        Supply state
      </p>
      <div className="flex gap-2 flex-wrap mb-3">
        {/* Blocked */}
        <div className="flex flex-col items-center bg-red-100 text-red-900 rounded-lg px-3 py-1.5 min-w-[64px]">
          <span className="text-xl font-bold leading-none">{blockedCount.toLocaleString()}</span>
          <span className="text-[10px] mt-0.5 font-medium">blocked</span>
        </div>
        {/* Publishable */}
        <div className="flex flex-col items-center bg-amber-100 text-amber-900 rounded-lg px-3 py-1.5 min-w-[64px]">
          <span className="text-xl font-bold leading-none">{publishableCount.toLocaleString()}</span>
          <span className="text-[10px] mt-0.5 font-medium">publishable</span>
        </div>
        {/* Perfect */}
        <div className="flex flex-col items-center bg-emerald-100 text-emerald-900 rounded-lg px-3 py-1.5 min-w-[64px]">
          <span className="text-xl font-bold leading-none">{perfectCount.toLocaleString()}</span>
          <span className="text-[10px] mt-0.5 font-medium">perfect</span>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mb-2">of {totalCount.toLocaleString()} SKUs in universe</p>
      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${perfectPct}%` }}
          title={`Perfect: ${perfectPct}%`}
        />
        <div
          className="h-full bg-amber-400 transition-all"
          style={{ width: `${publishPct}%` }}
          title={`Publishable: ${publishPct}%`}
        />
        <div
          className="h-full bg-red-400 transition-all"
          style={{ width: `${blockedPct}%` }}
          title={`Blocked: ${blockedPct}%`}
        />
      </div>
      <div className="flex gap-3 mt-1.5 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />perfect {perfectPct}%</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" />publishable {publishPct}%</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-400" />blocked {blockedPct}%</span>
      </div>
    </div>
  );
}

// Section 2 — Potential unlocks
function PotentialUnlocksSection({ unlocks }: { unlocks: PotentialUnlock[] }) {
  return (
    <div className="py-1">
      <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 mb-2">
        If resolved today
      </p>
      {unlocks.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No pending panels</p>
      ) : (
        <ul className="space-y-1.5">
          {unlocks.map((u, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-slate-700">
              <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${panelDot(u.panel)}`} />
              <span className="font-medium">{u.label}</span>
              <span className="ml-auto font-semibold text-emerald-700 whitespace-nowrap">
                +{u.sku_count.toLocaleString()} eligible
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Section 3 — Corrections in flight (also exported as CorrectionsTable)
export function CorrectionsTable({ corrections }: { corrections: PendingCorrection[] }) {
  const MAX_SHOWN = 4;
  const shown = corrections.slice(0, MAX_SHOWN);
  const overflow = corrections.length - MAX_SHOWN;

  if (corrections.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic">No corrections pending</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {shown.map((c) => (
        <div key={c.id} className="flex items-center gap-2 text-xs">
          <span className="font-medium text-slate-700 truncate max-w-[140px]" title={c.label}>
            {c.label}
          </span>
          <PriorityBadge priority={c.priority} />
          <span
            className={`ml-auto whitespace-nowrap font-medium ${
              c.days_open > 7 ? 'text-red-600' : 'text-slate-500'
            }`}
          >
            {c.days_open}d open
          </span>
        </div>
      ))}
      {overflow > 0 && (
        <p className="text-[11px] text-slate-400">+{overflow} more</p>
      )}
    </div>
  );
}

function CorrectionsInFlightSection({ corrections }: { corrections: PendingCorrection[] }) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
          In flight
        </p>
        {corrections.length > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 leading-none">
            {corrections.length}
          </span>
        )}
      </div>
      <CorrectionsTable corrections={corrections} />
    </div>
  );
}

// Section 4 — Historical metrics (track record of closed corrections)
function HistoricalMetricsSection({ metrics }: { metrics: HistoricalMetric[] }) {
  const hasData = metrics.some(m => m.applied_count > 0);

  return (
    <div className="pt-3 border-t border-slate-100 mt-1">
      <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 mb-2">
        Track record
      </p>
      {!hasData ? (
        <p className="text-xs text-slate-400 italic">
          No corrections applied yet — first ones are in flight above.
        </p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {metrics.filter(m => m.applied_count > 0).map((m, i) => (
            <div key={i} className="text-xs text-slate-700">
              <span className="font-medium">{m.label}</span>
              <span className="mx-1 text-slate-400">—</span>
              <span className="text-emerald-700 font-semibold">{m.applied_count} applied</span>
              {m.avg_days_to_apply != null && (
                <span className="text-slate-500 ml-1">
                  (avg {m.avg_days_to_apply.toFixed(1)}d to apply)
                </span>
              )}
              {m.last_applied_at && (
                <span className="text-slate-400 ml-1">
                  · last {new Date(m.last_applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Main component — default export
export default function SupplyQualityBar({
  blockedCount,
  publishableCount,
  perfectCount,
  totalCount,
  pendingCorrections,
  potentialUnlocks,
  historicalMetrics,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm mb-5 p-4">
      {/* Header strip */}
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" />
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Supply quality
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        {/* Column 1 — state */}
        <div className="pt-3 md:pt-0 md:pr-4">
          <SupplyStateSection
            blockedCount={blockedCount}
            publishableCount={publishableCount}
            perfectCount={perfectCount}
            totalCount={totalCount}
          />
        </div>

        {/* Column 2 — unlocks */}
        <div className="pt-3 md:pt-0 md:px-4">
          <PotentialUnlocksSection unlocks={potentialUnlocks} />
        </div>

        {/* Column 3 — corrections */}
        <div className="pt-3 md:pt-0 md:pl-4">
          <CorrectionsInFlightSection corrections={pendingCorrections} />
        </div>
      </div>

      {/* Track record row — below the grid */}
      <HistoricalMetricsSection metrics={historicalMetrics} />
    </div>
  );
}
