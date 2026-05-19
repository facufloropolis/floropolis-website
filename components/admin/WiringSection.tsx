// WiringSection -- wraps a section with optional badge + dashed/solid border.
// v1 | 2026-05-19 | Job_PM AI-CPO [V8 SHADOW]
//
// This is a SERVER component. It always renders its children. The badge +
// border accents are gated entirely by a global CSS class (`wiring-on`) that
// the <WiringToggle> client component adds to the <html> element when the URL
// carries ?wiring=on. That keeps the badge cost zero for normal use, and
// avoids prop-drilling `wiringOn` through every admin page.
//
// Why a wrapper instead of just sprinkling badges? Because we want the dashed
// border on PLAN sections to communicate "this is intentional placeholder."
// Wrapping the section also gives us a stable anchor for deep-links to the
// mockup section (data-wiring-id="...").

import type { ReactNode } from 'react';
import WiringBadge, { type WiringLevel } from './WiringBadge';

export interface WiringSectionProps {
  level: WiringLevel;
  note?: string;
  id?: string;
  mockupLink?: string;
  className?: string;
  children: ReactNode;
}

const BORDER_CLS_BY_LEVEL: Record<WiringLevel, string> = {
  LIVE: 'wiring-section-live',
  READ: 'wiring-section-read',
  MOCK: 'wiring-section-mock',
  PLAN: 'wiring-section-plan',
};

export default function WiringSection({
  level,
  note,
  id,
  mockupLink,
  className,
  children,
}: WiringSectionProps): ReactNode {
  const wrapCls = `${BORDER_CLS_BY_LEVEL[level]} ${className ?? ''}`.trim();
  return (
    <div
      className={`wiring-section ${wrapCls}`.trim()}
      data-wiring-level={level}
      data-wiring-id={id}
    >
      <div className="wiring-section-badge">
        <WiringBadge level={level} note={note} />
        {mockupLink ? (
          <a
            href={mockupLink}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-[10px] text-slate-500 hover:text-emerald-700 underline"
          >
            mockup
          </a>
        ) : null}
      </div>
      {children}
    </div>
  );
}
