// Catalog Pulse Strip — Facu's Desk, Zone 1 ("the pulse").
// v1 | 2026-06-04 | Job_PM (CPO)
//
// Spec: kb/facu_catalog_ux_reflection_2026-06-04.md, "Zone 1 — The pulse (10s)".
// A single horizontal band at the very top of /admin/catalog answering, in ten
// seconds: is it getting BETTER since I last looked, what's the #1 limiter, and
// how many decisions need ME?
//
// Four cells:
//   1. Published <n> (▲/▼ delta since last visit | "first visit")
//   2. Blocked <n> (delta) -> links to /admin/catalog/blocked
//   3. #1 limiter: <label> — <n> SKUs · owner <agent> · <n> in flight
//   4. Your decisions: <n> -> links to /admin/catalog/approval-queue
//
// Async server component. Reads everything via fetchPulse(backup) — the same
// service client the parent page uses. NEVER fakes a zero: any unavailable
// metric renders "—" / "source unavailable". Style matches the admin surface
// (slate/emerald, compact) — no new design language.
//
// RACI: display-only. All numbers come pre-computed from lib/admin/pulse.ts.

import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPulse, type Metric } from '@/lib/admin/pulse';

function fmtNum(v: Metric): string {
  return typeof v === 'number' ? v.toLocaleString() : '—';
}

// Renders the delta annotation: ▲+12 (green) / ▼−85 (also green when it's a
// "good" drop, e.g. blocked going down) — caller decides good-direction.
// goodWhen: 'up' => increases are green; 'down' => decreases are green.
function DeltaTag({
  delta,
  firstVisit,
  goodWhen,
}: {
  delta: number | null;
  firstVisit: boolean;
  goodWhen: 'up' | 'down';
}) {
  if (firstVisit) {
    return <span className="text-[11px] text-slate-400 font-normal">first visit</span>;
  }
  if (delta === null) {
    return <span className="text-[11px] text-slate-400 font-normal">—</span>;
  }
  if (delta === 0) {
    return <span className="text-[11px] text-slate-400 font-normal">no change</span>;
  }
  const isUp = delta > 0;
  const good = (goodWhen === 'up' && isUp) || (goodWhen === 'down' && !isUp);
  const arrow = isUp ? '▲' : '▼';
  const sign = isUp ? '+' : '−';
  const cls = good ? 'text-emerald-600' : 'text-red-600';
  return (
    <span className={`text-[11px] font-semibold ${cls}`}>
      {arrow}
      {sign}
      {Math.abs(delta).toLocaleString()}
      <span className="text-slate-400 font-normal"> since last visit</span>
    </span>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-2.5 flex flex-col gap-0.5 min-w-0">{children}</div>;
}

export default async function CatalogPulseStrip({ backup }: { backup: SupabaseClient }) {
  const pulse = await fetchPulse(backup);

  // The whole strip degrades to a single honest message only when the two
  // headline state counts are both unavailable (the data layer is down).
  const stateDown = pulse.published === null && pulse.blocked === null;

  if (stateDown) {
    return (
      <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        Pulse: source unavailable
      </div>
    );
  }

  const limiter = pulse.limiter;

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
        {/* 1. Published */}
        <Cell>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Published
          </span>
          <span className="text-lg font-bold text-emerald-700 tabular-nums leading-none">
            {fmtNum(pulse.published)}
          </span>
          <DeltaTag delta={pulse.deltas.published} firstVisit={pulse.firstVisit} goodWhen="up" />
        </Cell>

        {/* 2. Blocked -> /admin/catalog/blocked */}
        <Cell>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Blocked
          </span>
          <Link
            href="/admin/catalog/blocked"
            className="text-lg font-bold text-red-700 tabular-nums leading-none hover:underline decoration-dotted underline-offset-2 w-fit"
            title="Everything NOT publishable, grouped by failing gate"
          >
            {fmtNum(pulse.blocked)}
          </Link>
          <DeltaTag delta={pulse.deltas.blocked} firstVisit={pulse.firstVisit} goodWhen="down" />
        </Cell>

        {/* 3. #1 limiter */}
        <Cell>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            #1 limiter
          </span>
          {limiter ? (
            <>
              <span className="text-sm font-semibold text-slate-800 leading-tight truncate" title={limiter.label}>
                {limiter.label}
              </span>
              <span className="text-[11px] text-slate-500">
                <Link
                  href="/admin/catalog/blocked"
                  className="font-medium text-slate-700 hover:underline decoration-dotted underline-offset-2"
                >
                  {limiter.count.toLocaleString()} SKUs
                </Link>
                {' · owner '}
                <span className="font-medium text-slate-700">{limiter.owner ?? '—'}</span>
                {' · '}
                {typeof limiter.inFlight === 'number'
                  ? `${limiter.inFlight.toLocaleString()} in flight`
                  : '— in flight'}
              </span>
            </>
          ) : (
            <span className="text-sm text-slate-400">source unavailable</span>
          )}
        </Cell>

        {/* 4. Your decisions -> /admin/catalog/approval-queue */}
        <Cell>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Your decisions
          </span>
          <Link
            href="/admin/desk"
            className="text-lg font-bold text-slate-900 tabular-nums leading-none hover:underline decoration-dotted underline-offset-2 w-fit"
            title="Facu's Desk — your decisions ranked + knowledge questions"
          >
            {fmtNum(pulse.decisionsWaiting)}
            <span className="text-slate-400 font-normal"> →</span>
          </Link>
          <span className="text-[11px] text-slate-400">awaiting you</span>
        </Cell>
      </div>
    </div>
  );
}
