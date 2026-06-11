// DispatchPeriod — period selector for the Dispatch hub.
// v1 | 2026-06-11 | Job_PM (CPO)
//
// Renders two <input type="date"> (Desde / Hasta) defaulting to tomorrow (today+1).
// "Un dia" toggle collapses the range to Desde = Hasta.
// State is managed by the parent (DispatchHub) via props + callbacks.
// Style: emerald-600/slate, ASCII-clean Spanish.

'use client';

interface Props {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}

export default function DispatchPeriod({ from, to, onFromChange, onToChange }: Props) {
  const isOneDay = from === to;

  function toggleOneDay() {
    if (isOneDay) {
      // Expand to a 7-day range from current from
      const d = new Date(from + 'T00:00:00');
      d.setDate(d.getDate() + 6);
      onToChange(d.toISOString().slice(0, 10));
    } else {
      // Collapse to a single day (set to = from)
      onToChange(from);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-end gap-3 flex-wrap">
      <div className="flex flex-col gap-1 min-w-0">
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
          Desde
        </label>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            onFromChange(e.target.value);
            // If single-day mode, keep to = from
            if (isOneDay) onToChange(e.target.value);
          }}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      {!isOneDay && (
        <div className="flex flex-col gap-1 min-w-0">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            Hasta
          </label>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => onToChange(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
      )}

      <button
        type="button"
        onClick={toggleOneDay}
        className={[
          'text-xs font-semibold rounded-lg border px-3 py-2 transition-colors',
          isOneDay
            ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50',
        ].join(' ')}
      >
        {isOneDay ? 'Un dia' : 'Ver un solo dia'}
      </button>

      <div className="text-[12px] text-slate-400 self-end pb-2">
        {isOneDay
          ? `Mostrando: ${from}`
          : `Rango: ${from} → ${to}`}
      </div>
    </div>
  );
}
