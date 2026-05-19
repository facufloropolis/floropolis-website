'use client';
// ClientDetailTabs -- tab switcher for /admin/clients/[id].
// Phase E | 2026-05-19 | Job_PM admin-clients [V8 SHADOW]
//
// Server-rendered tab panels are passed in as children (one per tab). This
// component just toggles which one is visible. Deep-link is supported via the
// URL hash (#profile, #orders, #communications, #audit) so the list-view
// "Audit" link lands on the audit tab.

import { useEffect, useState } from 'react';

type TabKey = 'profile' | 'orders' | 'communications' | 'audit';

interface Props {
  profileTab: React.ReactNode;
  ordersTab: React.ReactNode;
  communicationsTab: React.ReactNode;
  auditTab: React.ReactNode;
  counts: { orders: number; communications: number; audit: number };
}

const TAB_LABELS: Record<TabKey, string> = {
  profile: 'Profile',
  orders: 'Orders',
  communications: 'Communications',
  audit: 'Audit',
};

export default function ClientDetailTabs(props: Props) {
  const [active, setActive] = useState<TabKey>('profile');

  // Honor URL hash on mount + when it changes.
  useEffect(() => {
    function sync() {
      const h = window.location.hash.replace('#', '').toLowerCase();
      if (h === 'orders' || h === 'communications' || h === 'audit' || h === 'profile') {
        setActive(h);
      }
    }
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  function setTab(t: TabKey) {
    setActive(t);
    if (typeof window !== 'undefined') {
      // Replace the hash without scrolling to top.
      history.replaceState(null, '', `#${t}`);
    }
  }

  const tabs: Array<{ key: TabKey; count?: number }> = [
    { key: 'profile' },
    { key: 'orders', count: props.counts.orders },
    { key: 'communications', count: props.counts.communications },
    { key: 'audit', count: props.counts.audit },
  ];

  return (
    <div>
      <div className="border-b border-slate-200">
        <div className="flex gap-1 -mb-px">
          {tabs.map((t) => {
            const isActive = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                  isActive
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {TAB_LABELS[t.key]}
                {typeof t.count === 'number' && (
                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                    ({t.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-5">
        <div className={active === 'profile' ? '' : 'hidden'}>{props.profileTab}</div>
        <div className={active === 'orders' ? '' : 'hidden'}>{props.ordersTab}</div>
        <div className={active === 'communications' ? '' : 'hidden'}>
          {props.communicationsTab}
        </div>
        <div className={active === 'audit' ? '' : 'hidden'}>{props.auditTab}</div>
      </div>
    </div>
  );
}
