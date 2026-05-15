// Admin Catalog nav -- shared shell for the 8 catalog control plane screens
// v0.1 | 2026-05-15 | Job_PM [V8 SHADOW]

import Link from 'next/link';
import { PROPOSALS } from '../_constants/catalogQueue';

type Tab = {
  key: string;
  label: string;
  href: string;
  badge?: string;
};

const TABS: Tab[] = [
  { key: 'list',     label: 'Catalog',         href: '/mockups/admin-catalog' },
  { key: 'config',   label: 'Config',          href: '/mockups/admin-catalog-config' },
  { key: 'ingest',   label: 'Ingest',          href: '/mockups/admin-catalog-ingest' },
  { key: 'mapping',  label: 'Mapping',         href: '/mockups/admin-catalog-mapping' },
  { key: 'discount', label: 'Discounts',       href: '/mockups/admin-catalog-discounts' },
  { key: 'queue',    label: 'Approval queue',  href: '/mockups/admin-catalog-approval-queue' },
  { key: 'props',    label: 'Proposals (meta)', href: '/mockups/admin-catalog-proposals' },
];

export default function AdminCatalogNav({ active }: { active: string }) {
  const queueCount = PROPOSALS.filter(p => p.status === 'awaiting_facu').length;

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">A</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Catalog Control Plane</h1>
              <p className="text-xs text-slate-500">Admin only -- inventory, pricing, ingestion, approvals</p>
            </div>
          </div>
          <Link
            href="/mockups"
            className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
          >
            All mockups
          </Link>
        </div>

        <div className="flex flex-wrap gap-1">
          {TABS.map(t => {
            const isActive = t.key === active;
            const showBadge = t.key === 'queue' && queueCount > 0;
            return (
              <Link
                key={t.key}
                href={t.href}
                className={
                  isActive
                    ? 'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-100 text-violet-800 border border-violet-200'
                    : 'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100'
                }
              >
                {t.label}
                {showBadge && (
                  <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                    {queueCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
