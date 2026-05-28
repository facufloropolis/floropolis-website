// QueuedView — renders the next-7-days queue as a vertical stack of
// DispatchTodayPanel instances, one per day, with a day heading per block.
// v1 | 2026-05-28 | Job_PM dispatch-v1-refactor [V8 SHADOW]
//
// Server component: receives pre-bucketed day blocks from page.tsx and renders
// DispatchTodayPanel (client) per block. Empty days collapse to a thin "no
// orders" stub so Facu can see the gap.

import type { ReactElement } from 'react';

import DispatchTodayPanel, {
  type TodayRow,
  type TodayProspect,
} from './DispatchTodayPanel';

export interface DayBlock {
  isoDate: string;          // YYYY-MM-DD
  heading: string;          // "Tomorrow · May 29"
  rows: TodayRow[];
  totalBoxes: number;
  activePipelineStep: number;
}

interface Props {
  blocks: DayBlock[];
  prospects: TodayProspect[];
  defaultDispatchId: string | null;
  todayLabel: string;
}

export default function QueuedView({
  blocks,
  prospects,
  defaultDispatchId,
  todayLabel,
}: Props): ReactElement {
  if (blocks.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-xl">
        <p className="font-semibold text-slate-600">No queued orders</p>
        <p className="text-sm mt-1">
          Nothing scheduled for the next 7 days. Check Today or Historical.
        </p>
      </div>
    );
  }

  return (
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
            <p className="text-xs text-slate-400">No orders scheduled.</p>
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
  );
}
