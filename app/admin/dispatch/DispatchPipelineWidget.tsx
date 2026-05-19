'use client';
// Rose Dispatch Pipeline widget — 5-step pipeline for the current view.
// v1 | 2026-05-19 | Job_PM Phase F [V8 SHADOW]
//
// Derives each step's count from the dispatch + order state already loaded
// server-side. Clicking a step pushes a query param ?stage=<key> that the
// server component reads to filter the manifest.
//
// 5 stages per Phase F brief:
//   Quote          = order exists
//   Cost confirmed = order has cost_verified-equivalent (payment_mode set + paid_at OR fulfilled)
//   Procured       = dispatch.status >= 'awaiting_pack' (i.e. row exists)
//   Packed         = dispatch.status >= 'packed'
//   Shipped        = dispatch.status >= 'in_transit'

import { useRouter, useSearchParams } from 'next/navigation';

export type PipelineStage = 'quote' | 'cost_confirmed' | 'procured' | 'packed' | 'shipped';

export interface PipelineCounts {
  quote: number;
  cost_confirmed: number;
  procured: number;
  packed: number;
  shipped: number;
}

const STAGES: { key: PipelineStage; label: string; desc: string }[] = [
  { key: 'quote',          label: 'Quote',          desc: 'Order row exists.' },
  { key: 'cost_confirmed', label: 'Cost confirmed', desc: 'Payment cleared (paid / fulfilled).' },
  { key: 'procured',       label: 'Procured',       desc: 'Dispatch row created (awaiting pack or later).' },
  { key: 'packed',         label: 'Packed',         desc: 'Dispatch advanced past packed.' },
  { key: 'shipped',        label: 'Shipped',        desc: 'Dispatch in transit or delivered.' },
];

interface Props {
  counts: PipelineCounts;
  activeStage: PipelineStage | null;
}

export default function DispatchPipelineWidget({ counts, activeStage }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function click(stage: PipelineStage) {
    const sp = new URLSearchParams(searchParams.toString());
    if (activeStage === stage) {
      sp.delete('stage');
    } else {
      sp.set('stage', stage);
    }
    router.push(`/admin/dispatch?${sp.toString()}`);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wide">
          Rose Dispatch Pipeline
        </h2>
        <span className="text-xs text-slate-400">
          5 stages - click a stage to filter the manifest
        </span>
      </div>
      <div className="flex items-stretch gap-0">
        {STAGES.map((s, i) => {
          const active = activeStage === s.key;
          const count = counts[s.key];
          return (
            <div key={s.key} className="flex items-stretch flex-1">
              <button
                type="button"
                onClick={() => click(s.key)}
                className={`flex-1 text-left rounded-lg px-3 py-2 transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
                title={s.desc}
              >
                <div className="text-xs font-semibold uppercase tracking-wide">
                  {s.label}
                </div>
                <div className="text-lg font-bold font-mono mt-0.5">{count}</div>
              </button>
              {i < STAGES.length - 1 && (
                <div className="self-center w-3 text-slate-300 text-center">-&gt;</div>
              )}
            </div>
          );
        })}
      </div>
      {activeStage && (
        <p className="text-xs text-slate-500 mt-2">
          Filtering by stage: <span className="font-semibold">{activeStage}</span>.{' '}
          <button
            type="button"
            onClick={() => click(activeStage)}
            className="underline text-emerald-700 hover:text-emerald-900"
          >
            Clear filter
          </button>
        </p>
      )}
    </div>
  );
}
