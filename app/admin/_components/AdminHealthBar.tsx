// AdminHealthBar -- 6 J.x dimension pills shown under the top bar.
// v1 | 2026-05-19 | Job_PM SHELL-V2 [V8 SHADOW]
//
// CURRENT STATUS: MOCK. Values are hardcoded from app/mockups/v2-admin/page.tsx
// while the live J.x metric queries are still on the roadmap. Wired in the
// registry as MOCK so the badge is truthful.
//
// When the live queries land (Round 3+), this becomes a server component that
// reads from {dimension_health view or similar} and the registry flips to LIVE.

import type { ReactNode } from 'react';

type DimensionStatus = 'green' | 'yellow' | 'red';

interface Dimension {
  id: string;
  label: string;
  value: string;
  status: DimensionStatus;
}

const DIMENSIONS: Dimension[] = [
  { id: 'J.1', label: 'Quality',    value: '0 ghost',          status: 'green'  },
  { id: 'J.2', label: 'Coverage',   value: '-- %',             status: 'yellow' },
  { id: 'J.3', label: 'Conversion', value: '-- %',             status: 'yellow' },
  { id: 'J.4', label: 'Activity',   value: '6 props / wk',     status: 'green'  },
  { id: 'J.5', label: 'Margin',     value: '31.2% L7d',        status: 'yellow' },
  { id: 'J.6', label: 'Ops',        value: '0 P0 open',        status: 'green'  },
];

const STATUS_CLS: Record<DimensionStatus, string> = {
  green:  'bg-emerald-100 text-emerald-800 border-emerald-300',
  yellow: 'bg-amber-100 text-amber-800 border-amber-300',
  red:    'bg-red-100 text-red-800 border-red-300',
};

const DOT_CLS: Record<DimensionStatus, string> = {
  green:  'bg-emerald-500',
  yellow: 'bg-amber-500',
  red:    'bg-red-500',
};

export default function AdminHealthBar(): ReactNode {
  return (
    <div
      id="health"
      className="px-4 py-2 border-t border-slate-100 overflow-x-auto bg-white"
    >
      <div className="flex items-center gap-3 min-w-max">
        <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
          Dimensions
        </span>
        {DIMENSIONS.map((d) => (
          <div
            key={d.id}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${STATUS_CLS[d.status]}`}
            title={`${d.id} ${d.label}: ${d.value} -- MOCK, awaiting J.x metric queries`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLS[d.status]}`} />
            <span className="font-mono text-[10px]">{d.id}</span>
            <span className="font-semibold">{d.label}</span>
            <span className="opacity-80">{d.value}</span>
          </div>
        ))}
        <span className="text-[10px] text-amber-700 italic ml-2">MOCK</span>
      </div>
    </div>
  );
}
