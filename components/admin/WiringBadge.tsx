// WiringBadge -- visual indicator of how a section is wired end-to-end.
// v1 | 2026-05-19 | Job_PM AI-CPO [V8 SHADOW]
//
// Visibility levels:
//   LIVE  = data real + action works end-to-end (DB writes + audit)
//   READ  = data real but action stubbed (no write, logs only, or modal-only)
//   MOCK  = data placeholder / hardcoded / decorative
//   PLAN  = placeholder space, not built
//
// Renders a small pill (top-right of a section). Hover -> tooltip with note +
// level description. Server-component friendly (no client hooks here).

import type { ReactNode } from 'react';

export type WiringLevel = 'LIVE' | 'READ' | 'MOCK' | 'PLAN';

export interface WiringBadgeProps {
  level: WiringLevel;
  note?: string;
}

const LEVEL_META: Record<
  WiringLevel,
  { label: string; cls: string; description: string }
> = {
  LIVE: {
    label: 'LIVE',
    cls: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    description:
      'Real data + action works end-to-end (DB writes + audit row).',
  },
  READ: {
    label: 'READ',
    cls: 'bg-blue-100 text-blue-800 border-blue-300',
    description:
      'Real data, but the action is stubbed (button no-op, logs-only, or modal opens with no writeback).',
  },
  MOCK: {
    label: 'MOCK',
    cls: 'bg-amber-100 text-amber-800 border-amber-300',
    description:
      'Placeholder / hardcoded data. Not backed by a real query.',
  },
  PLAN: {
    label: 'PLAN',
    cls: 'bg-slate-100 text-slate-600 border-slate-300 border-dashed',
    description:
      'Placeholder space. Section not built yet -- specced only.',
  },
};

export function levelDescription(level: WiringLevel): string {
  return LEVEL_META[level].description;
}

export default function WiringBadge({ level, note }: WiringBadgeProps): ReactNode {
  const meta = LEVEL_META[level];
  const tip = note ? `${meta.description} -- ${note}` : meta.description;
  return (
    <span
      title={tip}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${meta.cls}`}
      aria-label={`wiring level ${meta.label}: ${tip}`}
    >
      {meta.label}
    </span>
  );
}
