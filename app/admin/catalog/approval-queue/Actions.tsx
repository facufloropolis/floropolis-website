// Client island for the catalog approval queue.
// v1 | 2026-05-18 | Job_PM CAT-S5 [V8 SHADOW]
//
// Two flavours:
//   - RowActions: per-row buttons + notes textarea + select checkbox.
//   - BulkBar:    sticky bar at top with select-all and bulk action buttons.
//
// Both POST to /api/admin/catalog/approval-queue/action and router.refresh() on
// success. Selection state lives on a tiny context so the two pieces stay in sync
// without prop-drilling sku ids through the server-component tree.

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

type ReviewerAction = 'approve_publish' | 'reject_hide' | 'forward_to_rose';

interface SelectionCtx {
  selected: Set<number>;
  toggle: (skuId: number) => void;
  setMany: (ids: number[], on: boolean) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionCtx | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = useCallback((skuId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(skuId)) next.delete(skuId);
      else next.add(skuId);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: number[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const value = useMemo(
    () => ({ selected, toggle, setMany, clear }),
    [selected, toggle, setMany, clear],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

function useSelection(): SelectionCtx {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('SelectionProvider missing');
  return ctx;
}

async function postAction(
  skuIds: number[],
  action: ReviewerAction,
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/catalog/approval-queue/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku_ids: skuIds, action, notes }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: body.detail
          ? `${body.error}: ${body.detail}`
          : (body.error ?? `HTTP ${res.status}`),
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

// ---------------------------------------------------------------------------
// Per-row controls
// ---------------------------------------------------------------------------

interface RowActionsProps {
  skuId: number;
}

export function RowSelect({ skuId }: { skuId: number }) {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      checked={selected.has(skuId)}
      onChange={() => toggle(skuId)}
      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
      aria-label={`Select SKU ${skuId}`}
    />
  );
}

export function RowActions({ skuId }: RowActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<ReviewerAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  async function run(action: ReviewerAction) {
    setBusy(action);
    setError(null);
    const result = await postAction([skuId], action, notes);
    if (result.ok) {
      setNotes('');
      router.refresh();
    } else {
      setError(result.error ?? 'failed');
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-2 min-w-[180px]">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run('approve_publish')}
        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        {busy === 'approve_publish' ? 'Saving...' : 'Approve publish'}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run('reject_hide')}
        className="text-xs font-semibold text-red-700 border border-red-200 hover:border-red-400 hover:bg-red-50 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        {busy === 'reject_hide' ? 'Saving...' : 'Reject hide'}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run('forward_to_rose')}
        className="text-xs font-semibold text-amber-800 border border-amber-200 hover:border-amber-400 hover:bg-amber-50 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        {busy === 'forward_to_rose' ? 'Saving...' : 'Forward to Rose'}
      </button>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Reviewer notes (optional)"
        rows={2}
        className="text-xs border border-slate-200 rounded-md px-2 py-1 focus:border-emerald-400 focus:outline-none"
      />
      {error && (
        <span className="text-[11px] text-red-600 font-mono">{error}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk action bar
// ---------------------------------------------------------------------------

interface BulkBarProps {
  allSkuIds: number[];
}

export function BulkBar({ allSkuIds }: BulkBarProps) {
  const router = useRouter();
  const { selected, setMany, clear } = useSelection();
  const [busy, setBusy] = useState<ReviewerAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const count = selected.size;
  const allChecked = count > 0 && count === allSkuIds.length;

  async function bulkRun(action: ReviewerAction) {
    if (count === 0) return;
    const ids = Array.from(selected);
    const label =
      action === 'approve_publish'
        ? 'approve'
        : action === 'reject_hide'
          ? 'reject'
          : 'forward';
    if (!confirm(`${label} ${ids.length} row${ids.length === 1 ? '' : 's'}?`)) {
      return;
    }
    setBusy(action);
    setError(null);
    const result = await postAction(ids, action);
    if (result.ok) {
      clear();
      router.refresh();
    } else {
      setError(result.error ?? 'failed');
    }
    setBusy(null);
  }

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-slate-200 -mx-4 px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={allChecked}
          ref={(el) => {
            if (el) el.indeterminate = count > 0 && !allChecked;
          }}
          onChange={(e) => {
            if (e.target.checked) setMany(allSkuIds, true);
            else clear();
          }}
          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span className="font-medium">
          {count === 0
            ? 'Select all on page'
            : `${count} selected`}
        </span>
      </label>

      <button
        type="button"
        disabled={count === 0 || busy !== null}
        onClick={() => bulkRun('approve_publish')}
        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-40"
      >
        {busy === 'approve_publish' ? 'Saving...' : `Approve ${count}`}
      </button>
      <button
        type="button"
        disabled={count === 0 || busy !== null}
        onClick={() => bulkRun('reject_hide')}
        className="text-xs font-semibold text-red-700 border border-red-200 hover:border-red-400 hover:bg-red-50 px-3 py-1.5 rounded-md disabled:opacity-40"
      >
        {busy === 'reject_hide' ? 'Saving...' : `Reject ${count}`}
      </button>
      <button
        type="button"
        disabled={count === 0 || busy !== null}
        onClick={() => bulkRun('forward_to_rose')}
        className="text-xs font-semibold text-amber-800 border border-amber-200 hover:border-amber-400 hover:bg-amber-50 px-3 py-1.5 rounded-md disabled:opacity-40"
      >
        {busy === 'forward_to_rose' ? 'Saving...' : `Forward ${count} to Rose`}
      </button>

      {error && (
        <span className="text-[11px] text-red-600 font-mono">{error}</span>
      )}
    </div>
  );
}
