// DetailActionPanel -- shared sticky right-column action card for /admin
// detail pages (catalog/orders/clients).
// v1 | 2026-05-19 | Job_PM DETAIL-2COL [V8 SHADOW]
//
// Pattern: detail pages render a 2-column grid (`grid lg:grid-cols-[1fr_320px]`)
// where the main content lives on the left and this panel anchors the right.
// On desktop it sticks just below the SHELL-V2 sticky header. On mobile it
// collapses naturally to the bottom of the column flow.
//
// Server-or-client agnostic: the component itself is a server component, but
// its `children` slot can hold any mix of client islands (the existing propose
// forms, action buttons, refund forms, etc.). We deliberately keep this card
// thin so the wrapped forms keep their own styling -- the caller should drop
// any redundant outer card on a wrapped form so it doesn't double-border.

import type { ReactNode } from 'react';

interface DetailActionPanelProps {
  /** Heading rendered at the top of the card. */
  title: string;
  /**
   * Optional small subtitle (e.g. status string, freshness, context note).
   * Plain string -- if you need rich content, use the children slot.
   */
  subtitle?: string;
  /**
   * Forms / buttons / clusters of actions. The panel applies a flex-col gap
   * so children stack with consistent spacing.
   */
  children: ReactNode;
  /**
   * Tailwind top offset for the sticky position on desktop. Defaults to
   * `lg:top-[var(--admin-shell-header-height)]` which reads the shared CSS
   * variable defined on :root in app/globals.css (single source of truth for
   * AdminShell + sticky descendants). Override only if a page adds extra
   * sticky chrome above the 2-col grid.
   */
  stickyTopClass?: string;
}

export default function DetailActionPanel({
  title,
  subtitle,
  children,
  stickyTopClass = 'lg:top-[var(--admin-shell-header-height)]',
}: DetailActionPanelProps) {
  return (
    <aside
      className={`w-full lg:w-80 lg:sticky ${stickyTopClass} lg:self-start`}
      aria-label={title}
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          {subtitle && (
            <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="px-4 py-3 flex flex-col gap-3">
          {children}
        </div>
      </div>
    </aside>
  );
}
