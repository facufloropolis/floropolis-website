// AdminShell -- top-level layout wrapper for /admin/*.
// v1 | 2026-05-19 | Job_PM SHELL-V2 [V8 SHADOW]
//
// Composes:
//   - Sticky top bar (logo / page title / Cmd+K trigger / signed-in-as user)
//   - Health bar (6 J.x dimension pills) -- MOCK in W3
//   - Left sidebar (8 items, persistent across /admin/*)
//   - Main column (children)
//
// The Command Palette mounts separately in app/admin/layout.tsx so it is
// available on every admin route without prop-drilling.

import type { ReactNode } from 'react';
import Link from 'next/link';
import AdminSidebar from './AdminSidebar';
import AdminHealthBar from './AdminHealthBar';
import AdminCommandPaletteTrigger from './AdminCommandPaletteTrigger';

interface AdminShellProps {
  children: ReactNode;
  userEmail?: string | null;
}

export default function AdminShell({ children, userEmail }: AdminShellProps) {
  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 sticky top-[33px] z-40">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="flex items-center gap-2">
              <div className="w-7 h-7 bg-emerald-600 rounded-md flex items-center justify-center text-white font-bold text-xs">
                F
              </div>
              <span className="font-bold text-slate-900 text-sm">Floropolis Admin</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                v2 unified
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <AdminCommandPaletteTrigger />
            <span className="text-xs text-slate-500">
              {userEmail ?? 'signed in'}
            </span>
          </div>
        </div>
        <AdminHealthBar />
      </header>

      <div className="flex flex-1">
        <AdminSidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
