'use client';
// Date navigation header (prev/next day, today shortcut, calendar input).
// v2 | 2026-05-19 | Job_PM disp-chrome [V8 SHADOW]
//
// Pushes ?date=YYYY-MM-DD which the server component reads and uses to filter
// the manifest by dispatches.dispatch_date.
//
// v2: skip weekends per BRD dispatch-day rule (Mon/Tue/Thu/Fri are the primary
// dispatch days; Sat/Sun never are). Friday "next" jumps to Monday and Monday
// "prev" jumps to Friday. Wed remains navigable (rare but allowed). The calendar
// input still permits any date in case Facu wants to inspect a weekend manually.

import { useRouter, useSearchParams } from 'next/navigation';

interface Props {
  date: string; // YYYY-MM-DD
  todayIso: string;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(iso: string): number {
  // 0 = Sun, 1 = Mon, ..., 6 = Sat
  return new Date(iso + 'T00:00:00Z').getUTCDay();
}

function skipWeekends(iso: string, direction: 1 | -1): string {
  let cur = iso;
  // step at most 3 times so we never loop forever on bad input
  for (let i = 0; i < 3; i++) {
    const dow = dayOfWeek(cur);
    if (dow !== 0 && dow !== 6) return cur;
    cur = addDays(cur, direction);
  }
  return cur;
}

function nextBusinessDay(iso: string): string {
  return skipWeekends(addDays(iso, 1), 1);
}

function prevBusinessDay(iso: string): string {
  return skipWeekends(addDays(iso, -1), -1);
}

function fmt(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function fmtLong(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  });
}

export default function DispatchDateNav({ date, todayIso }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function goto(iso: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('date', iso);
    sp.delete('tab'); // date filter and tab are mutually exclusive; date wins
    router.push(`/admin/dispatch?${sp.toString()}`);
  }

  const prev = prevBusinessDay(date);
  const next = nextBusinessDay(date);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => goto(prev)}
        className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-400"
        title={fmtLong(prev)}
      >
        &lt;- {fmt(prev)}
      </button>
      <span
        className="text-sm font-semibold bg-emerald-600 text-white px-3 py-1.5 rounded-lg"
        title={fmtLong(date)}
      >
        {fmt(date)}
      </span>
      <button
        type="button"
        onClick={() => goto(next)}
        className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-400"
        title={fmtLong(next)}
      >
        {fmt(next)} -&gt;
      </button>
      {date !== todayIso && (
        <button
          type="button"
          onClick={() => goto(todayIso)}
          className="text-xs font-medium text-emerald-700 hover:underline ml-1"
        >
          Hoy
        </button>
      )}
      <input
        type="date"
        value={date}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) goto(v);
        }}
        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 hover:border-slate-400 transition-colors"
      />
    </div>
  );
}
