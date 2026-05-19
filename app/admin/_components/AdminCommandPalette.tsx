'use client';

// AdminCommandPalette -- Cmd+K / Ctrl+K command palette for /admin/*.
// v1 | 2026-05-19 | Job_PM SHELL-V2 [V8 SHADOW]
//
// Listens globally for Cmd+K (Mac) or Ctrl+K (Win/Linux) to open a modal.
// Modal has a single input + filtered suggestions. Suggestions are fetched
// from POST /api/admin/search?q=... (debounced) and joined with a static list
// of admin routes so even with empty input there's something useful.
//
// Three suggestion types:
//   - sku    -> link to /admin/catalog/[id]
//   - order  -> link to /admin/orders/[id]
//   - screen -> link to a static /admin/* route
//
// Communicates with AdminCommandPaletteTrigger via a CustomEvent
// ('admin-cmdk-open') so the trigger button in the top bar can also open us.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export interface SearchHit {
  type: 'sku' | 'order' | 'screen';
  id: string;
  label: string;
  sub?: string;
  href: string;
}

const SCREENS: SearchHit[] = [
  { type: 'screen', id: 'admin',          label: 'Today',           sub: '/admin',                          href: '/admin' },
  { type: 'screen', id: 'catalog',        label: 'Catalog',         sub: '/admin/catalog',                  href: '/admin/catalog' },
  { type: 'screen', id: 'config',         label: 'Catalog config',  sub: '/admin/catalog/config',           href: '/admin/catalog/config' },
  { type: 'screen', id: 'discounts',      label: 'Discounts',       sub: '/admin/catalog/discounts',        href: '/admin/catalog/discounts' },
  { type: 'screen', id: 'ingest',         label: 'Ingest',          sub: '/admin/catalog/ingest',           href: '/admin/catalog/ingest' },
  { type: 'screen', id: 'mapping',        label: 'SKU mapping',     sub: '/admin/catalog/mapping',          href: '/admin/catalog/mapping' },
  { type: 'screen', id: 'approval-queue', label: 'Approval queue',  sub: '/admin/catalog/approval-queue',   href: '/admin/catalog/approval-queue' },
  { type: 'screen', id: 'proposals',      label: 'Proposals (meta)', sub: '/admin/catalog/proposals',       href: '/admin/catalog/proposals' },
  { type: 'screen', id: 'orders',         label: 'Orders',          sub: '/admin/orders',                   href: '/admin/orders' },
  { type: 'screen', id: 'dispatch',       label: 'Dispatch',        sub: '/admin/dispatch',                 href: '/admin/dispatch' },
  { type: 'screen', id: 'refunds',        label: 'Refunds',         sub: '/admin/refunds',                  href: '/admin/refunds' },
  { type: 'screen', id: 'clients',        label: 'Clients',         sub: '/admin/clients',                  href: '/admin/clients' },
];

const TYPE_CLS: Record<SearchHit['type'], string> = {
  sku:    'bg-emerald-100 text-emerald-800',
  order:  'bg-blue-100 text-blue-800',
  screen: 'bg-slate-100 text-slate-700',
};

export default function AdminCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>(SCREENS);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Open on Cmd/Ctrl+K, close on Escape ----------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Bus event so the top-bar trigger can open us ------------------------
  useEffect(() => {
    function onBus() {
      setOpen(true);
    }
    window.addEventListener('admin-cmdk-open', onBus as EventListener);
    return () => window.removeEventListener('admin-cmdk-open', onBus as EventListener);
  }, []);

  // Autofocus input + reset state when opened ---------------------------
  useEffect(() => {
    if (open) {
      setQuery('');
      setHits(SCREENS);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Fetch results debounced ---------------------------------------------
  const fetchResults = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    if (!q || q.trim().length < 1) {
      setHits(SCREENS);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, {
        signal: ac.signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`search failed: ${res.status}`);
      const data = (await res.json()) as { hits: SearchHit[] };
      // Merge fetched hits with screen matches so jump-to-screen always works.
      const ql = q.toLowerCase();
      const screenMatches = SCREENS.filter(
        (s) =>
          s.label.toLowerCase().includes(ql) ||
          s.id.toLowerCase().includes(ql) ||
          (s.sub ?? '').toLowerCase().includes(ql),
      );
      setHits([...(data.hits ?? []), ...screenMatches]);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('[AdminCommandPalette] search', e);
        // Fall back to local screen filter so the user still sees options.
        const ql = q.toLowerCase();
        setHits(
          SCREENS.filter(
            (s) =>
              s.label.toLowerCase().includes(ql) ||
              s.id.toLowerCase().includes(ql),
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      void fetchResults(query);
    }, 150);
    return () => clearTimeout(t);
  }, [query, open, fetchResults]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-slate-900/50"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Admin command palette"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden"
      >
        <div className="p-3 border-b border-slate-200 flex items-center gap-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to SKU, order, or screen..."
            className="w-full px-2 py-1.5 text-sm focus:outline-none"
          />
          {loading ? (
            <span className="text-[10px] text-slate-400">loading...</span>
          ) : (
            <span className="text-[10px] text-slate-400 font-mono">ESC</span>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2 text-sm">
          {hits.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              No matches.
            </div>
          ) : (
            hits.map((h) => (
              <Link
                key={`${h.type}-${h.id}`}
                href={h.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-md text-slate-700"
              >
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${TYPE_CLS[h.type]}`}
                >
                  {h.type}
                </span>
                <span className="flex-1 min-w-0 truncate">{h.label}</span>
                {h.sub ? (
                  <span className="text-[10px] text-slate-400 truncate max-w-[40%]">
                    {h.sub}
                  </span>
                ) : null}
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
