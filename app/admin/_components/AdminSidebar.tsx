'use client';

// AdminSidebar -- persistent left nav for /admin/*.
// v2 | 2026-06-09 | Job_PM SHELL-V2
//
// Nav grouped into 3 logical sections matching Facu's operating model (S2):
//   1. Supply           -- Supply Engine + image (Catalog / Blocked / Supply)
//   2. Desk + Approvals -- Desk, Approvals, and the operational loop
//                          (Orders / Samples / Deals / Dispatch / Sales Cleanup / Config)
//   3. Loop & Learning  -- Improvement Loop visibility
// This is grouping/labelling ONLY -- every item id + url is unchanged, every tab
// keeps working. 'Today' stays ungrouped at the top (the inbox landing).
//
// Active state derived from usePathname() with prefix matching so deep routes
// (e.g. /admin/catalog/[id]) keep the matching item highlighted.
//
// Sticky w-56 on >=md; hidden on mobile (TODO: mobile drawer in a later wave).

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  url: string;
  sub: string;
  matchPrefix?: string;
}

interface NavSection {
  // null heading -> rendered ungrouped (no header), e.g. the Today landing.
  heading: string | null;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    heading: null,
    items: [
      { id: 'home', label: 'Today', icon: '*', url: '/admin', sub: 'Your inbox', matchPrefix: '/admin' },
    ],
  },
  {
    heading: 'Supply',
    items: [
      { id: 'catalog', label: 'Catalog', icon: 'C', url: '/admin/catalog',         sub: 'SKUs / inventory / pricing', matchPrefix: '/admin/catalog' },
      { id: 'blocked', label: 'Blocked', icon: 'B', url: '/admin/catalog/blocked', sub: 'SKUs by gate / repair',      matchPrefix: '/admin/catalog/blocked' },
      { id: 'supply',  label: 'Supply',  icon: 'R', url: '/admin/supply',          sub: 'Engine recommendations',     matchPrefix: '/admin/supply' },
    ],
  },
  {
    heading: 'Desk + Approvals',
    items: [
      { id: 'desk',          label: 'Desk',          icon: '>', url: '/admin/desk',                   sub: 'Pulse / decisions / knowledge', matchPrefix: '/admin/desk' },
      { id: 'approvals',     label: 'Approvals',     icon: 'A', url: '/admin/catalog/approval-queue', sub: 'Sign-off + full history',       matchPrefix: '/admin/catalog/approval-queue' },
      { id: 'orders',        label: 'Orders',        icon: 'O', url: '/admin/orders',                 sub: 'Queue / fulfillment',           matchPrefix: '/admin/orders' },
      { id: 'samples',       label: 'Samples',       icon: 'M', url: '/admin/samples',                sub: 'Review / dispatch jueves',      matchPrefix: '/admin/samples' },
      { id: 'deals',         label: 'Deals',         icon: 'K', url: '/admin/deals',                  sub: 'Deal builder / standing',       matchPrefix: '/admin/deals' },
      { id: 'dispatch',      label: 'Dispatch',      icon: 'D', url: '/admin/dispatch',               sub: 'FedEx / labels / vendor',       matchPrefix: '/admin/dispatch' },
      { id: 'sales-cleanup', label: 'Sales Cleanup', icon: '$', url: '/admin/sales-cleanup',          sub: 'Orphan transactions',           matchPrefix: '/admin/sales-cleanup' },
      { id: 'settings',      label: 'Config',        icon: 'S', url: '/admin/catalog/config',         sub: 'Box / shipping / GPM',          matchPrefix: '/admin/catalog/config' },
    ],
  },
  {
    heading: 'Loop & Learning',
    items: [
      { id: 'loop', label: 'Improvement Loop', icon: 'L', url: '/admin/loop', sub: 'Repair audit trail', matchPrefix: '/admin/loop' },
    ],
  },
];

// Flat list of every nav item (all sections) -- used for active-state
// disambiguation so longer prefixes win regardless of section boundaries.
const NAV: NavItem[] = SECTIONS.flatMap((s) => s.items);

function isActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  // Exact match for Home
  if (item.id === 'home') return pathname === '/admin';
  if (!item.matchPrefix) return false;
  // Prefer more-specific matches first: an item is active if its prefix matches
  // AND no later item in NAV has a longer matching prefix.
  if (!pathname.startsWith(item.matchPrefix)) return false;
  for (const other of NAV) {
    if (other.id === item.id) continue;
    if (!other.matchPrefix) continue;
    if (
      other.matchPrefix.length > item.matchPrefix.length &&
      pathname.startsWith(other.matchPrefix)
    ) {
      return false;
    }
  }
  return true;
}

export default function AdminSidebar() {
  const pathname = usePathname();
  return (
    <nav className="bg-white border-r border-slate-200 w-56 shrink-0 py-3 hidden md:block sticky top-[33px] self-start max-h-screen overflow-y-auto">
      {SECTIONS.map((section, si) => (
        <div key={section.heading ?? `_ungrouped-${si}`} className={si > 0 ? 'mt-3' : ''}>
          {section.heading && (
            <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {section.heading}
            </div>
          )}
          {section.items.map((n) => {
            const active = isActive(pathname, n);
            return (
              <Link
                key={n.id}
                href={n.url}
                className={
                  'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ' +
                  (active
                    ? 'bg-emerald-50 text-emerald-800 border-l-2 border-emerald-600 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50 border-l-2 border-transparent')
                }
              >
                <span className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                  {n.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div>{n.label}</div>
                  <div className="text-[10px] text-slate-400 font-normal">{n.sub}</div>
                </div>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
