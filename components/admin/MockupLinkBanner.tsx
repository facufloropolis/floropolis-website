// MockupLinkBanner -- compact banner shown at the top of an admin page when
// the wiring overlay is on. Links out to the equivalent mockup so the CEO can
// compare what's specced vs what's wired.
// v1 | 2026-05-19 | Job_PM AI-CPO [V8 SHADOW]

import type { ReactNode } from 'react';

export interface MockupLinkBannerProps {
  mockupHref: string;
  pageLabel?: string;
}

export default function MockupLinkBanner({
  mockupHref,
  pageLabel,
}: MockupLinkBannerProps): ReactNode {
  return (
    <div className="wiring-mockup-banner mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-center justify-between gap-3">
      <span>
        <strong className="font-semibold">Wiring overlay on.</strong>{' '}
        {pageLabel ? <span>Page: {pageLabel}.</span> : null}{' '}
        Hover any badge for the full description.
      </span>
      <a
        href={mockupHref}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-emerald-700 hover:text-emerald-900 underline whitespace-nowrap"
      >
        Compare to mockup -&gt;
      </a>
    </div>
  );
}
