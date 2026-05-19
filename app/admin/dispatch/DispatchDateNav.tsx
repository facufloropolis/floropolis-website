'use client';
// Date navigation header (prev/next day, today shortcut, calendar input).
// v1 | 2026-05-19 | Job_PM Phase F [V8 SHADOW]
//
// Pushes ?date=YYYY-MM-DD which the server component reads and uses to filter
// the manifest by dispatches.dispatch_date.

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

function fmt(iso: string): string {
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

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => goto(addDays(date, -1))}
        className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-400"
      >
        &lt;- {fmt(addDays(date, -1))}
      </button>
      <span className="text-sm font-semibold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg">
        {fmt(date)}
      </span>
      <button
        type="button"
        onClick={() => goto(addDays(date, 1))}
        className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-400"
      >
        {fmt(addDays(date, 1))} -&gt;
      </button>
      {date !== todayIso && (
        <button
          type="button"
          onClick={() => goto(todayIso)}
          className="text-xs text-emerald-700 hover:underline ml-1"
        >
          Today
        </button>
      )}
      <input
        type="date"
        value={date}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) goto(v);
        }}
        className="text-xs border border-slate-200 rounded px-1 py-0.5 text-slate-600"
      />
    </div>
  );
}
