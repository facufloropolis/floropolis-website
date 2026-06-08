'use client';

// AdminSidebar -- persistent left nav for /admin/*.
// v1 | 2026-05-19 | Job_PM SHELL-V2 [V8 SHADOW]
//
// 8 nav items matching app/mockups/v2-admin/page.tsx (in the same order).
// Active state derived from usePathname() with prefix matching so deep routes
// (e.g. /admin/catalog/[id]) keep the "Catalog" item highlighted.
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

const NAV: NavItem[] = [
  { id: 'home',      label: 'Today',     icon: '*', url: '/admin',                          sub: 'Your inbox',                matchPrefix: '/admin' },
  { id: 'desk',      label: 'Desk',      icon: '>', url: '/admin/desk',                     sub: 'Pulse / decisions / knowledge', matchPrefix: '/admin/desk' },
  { id: 'catalog',   label: 'Catalog',   icon: 'C', url: '/admin/catalog',                  sub: 'SKUs / inventory / pricing', matchPrefix: '/admin/catalog' },
  { id: 'blocked',   label: 'Blocked',   icon: 'B', url: '/admin/catalog/blocked',          sub: 'SKUs by gate / repair',      matchPrefix: '/admin/catalog/blocked' },
  { id: 'orders',    label: 'Orders',    icon: 'O', url: '/admin/orders',                   sub: 'Queue / fulfillment',        matchPrefix: '/admin/orders' },
  { id: 'dispatch',      label: 'Dispatch',      icon: 'D',  url: '/admin/dispatch',                 sub: 'FedEx / labels / vendor',    matchPrefix: '/admin/dispatch' },
  { id: 'sales-cleanup', label: 'Sales Cleanup', icon: '$',  url: '/admin/sales-cleanup',            sub: 'Orphan transactions',        matchPrefix: '/admin/sales-cleanup' },
  { id: 'approvals',     label: 'Approvals',     icon: 'A',  url: '/admin/catalog/approval-queue',   sub: 'Awaiting your sign-off',     matchPrefix: '/admin/catalog/approval-queue' },
  { id: 'proposals', label: 'Proposals', icon: 'P', url: '/admin/catalog/proposals',        sub: 'Full history',               matchPrefix: '/admin/catalog/proposals' },
  { id: 'settings',  label: 'Config',    icon: 'S', url: '/admin/catalog/config',           sub: 'Box / shipping / GPM',       matchPrefix: '/admin/catalog/config' },
  { id: 'loop',      label: 'Improvement Loop', icon: 'L', url: '/admin/loop',              sub: 'Repair audit trail',         matchPrefix: '/admin/loop' },
];

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
      {NAV.map((n) => {
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
    </nav>
  );
}
