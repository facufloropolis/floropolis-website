// HistoricalView — date-range picker + per-day list of DispatchTodayPanel.
// v1 | 2026-05-28 | Job_PM dispatch-v1-refactor [V8 SHADOW]
//
// Server component. Uses a plain <form method="get"> so no client JS is needed
// for the picker — the URL params drive the server fetch in page.tsx.
//
// URL params:
//   ?view=historical&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// If only `from` is provided, treats it as a single-day view (from=to).

import type { ReactElement } from 'react';

import DispatchTodayPanel, {
  type TodayRow,
  type TodayProspect,
} from './DispatchTodayPanel';

export interface DayBlock {
  isoDate: string;          // YYYY-MM-DD
  heading: string;          // "Friday · May 23, 2026"
  rows: TodayRow[];
  totalBoxes: number;
  activePipelineStep: number;
}

interface Props {
  fromIso: string;
  toIso: string;
  blocks: DayBlock[];
  prospects: TodayProspect[];
  defaultDispatchId: string | null;
  todayLabel: string;
}

export default function HistoricalView({
  fromIso,
  toIso,
  blocks,
  prospects,
  defaultDispatchId,
  todayLabel,
}: Props): ReactElement {
  return (
    <div className="space-y-6">
      {/* Date-range picker */}
      <form
        method="get"
        action="/admin/dispatch"
        className="flex items-end gap-3 flex-wrap bg-white border border-slate-200 rounded-2xl p-4"
      >
        <input type="hidden" name="view" value="historical" />
        <div className="flex flex-col">
          <label htmlFor="hist-from" className="text-xs font-semibold text-slate-500 mb-1">
            From
          </label>
          <input
            id="hist-from"
            type="date"
            name="from"
            defaultValue={fromIso}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1 text-slate-700"
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor="hist-to" className="text-xs font-semibold text-slate-500 mb-1">
            To
          </label>
          <input
            id="hist-to"
            type="date"
            name="to"
            defaultValue={toIso}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1 text-slate-700"
          />
        </div>
        <button
          type="submit"
          className="text-sm font-semibold bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700"
        >
          Apply range
        </button>
        <p className="text-xs text-slate-400 ml-2">
          Showing {fromIso} → {toIso} · {blocks.reduce((s, b) => s + b.rows.length, 0)} order
          {blocks.reduce((s, b) => s + b.rows.length, 0) === 1 ? '' : 's'} across {blocks.length} day
          {blocks.length === 1 ? '' : 's'}
        </p>
      </form>

      {/* Per-day list */}
      {blocks.length === 0 ? (
        <div className="text-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <p className="font-semibold text-slate-600">No orders in this range</p>
          <p className="text-sm mt-1">Try widening the date range.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {blocks.map((b) =>
            b.rows.length === 0 ? (
              <section
                key={b.isoDate}
                className="border border-dashed border-slate-200 rounded-xl px-6 py-5"
              >
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">
                  {b.heading}
                </h2>
                <p className="text-xs text-slate-400">No orders.</p>
              </section>
            ) : (
              <DispatchTodayPanel
                key={b.isoDate}
                rows={b.rows}
                totalBoxes={b.totalBoxes}
                todayLabel={todayLabel}
                activePipelineStep={b.activePipelineStep}
                prospects={prospects}
                defaultDispatchId={defaultDispatchId}
                dayHeading={b.heading}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
