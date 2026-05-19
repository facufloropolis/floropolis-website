// Bulk-actions client island for /admin/catalog.
// v1 | 2026-05-19 | Job_PM admin-port Phase B [V8 SHADOW]
//
// Renders:
//   - a checkbox column header that selects all rows on the page
//   - per-row checkboxes (controlled by id)
//   - a sticky toolbar that activates when >=1 row is selected, exposing:
//       Propose hide all  -> POST /api/admin/proposals visibility_override.create (one per row)
//       Export selected   -> client-side CSV from the selection set + visible row data
//       Flag to CEO       -> POST /api/admin/rose-queue (one per row, reason_code='other')
//
// State is purely client-side (URL stays clean). The server page passes the full
// list of visible rows; this island shadows them in a Map<id, RowSummary> so the
// bulk handlers can build payloads without re-fetching.

'use client';

import { useCallback, useMemo, useState } from 'react';

export interface BulkRowSummary {
  id: number;
  name: string;
  vendor: string;
  tier: string;
  category: string;
  price: number | null;
  farm_cost: number | null;
  gpm_pct: number | null;
  visibility: string;
  sources: string[];
}

interface ToolbarResult {
  attempted: number;
  ok: number;
  failed: number;
  errors: string[];
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function BulkActionsProvider({
  rows,
  children,
}: {
  rows: BulkRowSummary[];
  children: (ctx: {
    selectedIds: Set<number>;
    toggleAll: (all: boolean) => void;
    toggleOne: (id: number) => void;
    allSelected: boolean;
    anySelected: boolean;
  }) => React.ReactNode;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());

  const toggleOne = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (all: boolean) => {
      if (all) setSelectedIds(new Set(rows.map((r) => r.id)));
      else setSelectedIds(new Set());
    },
    [rows],
  );

  const allSelected = selectedIds.size > 0 && selectedIds.size === rows.length;
  const anySelected = selectedIds.size > 0;

  return (
    <>
      <BulkToolbar
        rows={rows}
        selectedIds={selectedIds}
        onClear={() => setSelectedIds(new Set())}
      />
      {children({ selectedIds, toggleAll, toggleOne, allSelected, anySelected })}
    </>
  );
}

function BulkToolbar({
  rows,
  selectedIds,
  onClear,
}: {
  rows: BulkRowSummary[];
  selectedIds: Set<number>;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ToolbarResult | null>(null);
  const count = selectedIds.size;

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  );

  if (count === 0) return null;

  async function proposeHideAll() {
    const reason = window.prompt(
      `Reason for hiding ${count} SKU(s) (min 5 chars, applies to all selected):`,
      '',
    );
    if (!reason || reason.trim().length < 5) {
      if (reason !== null) alert('Reason must be at least 5 characters');
      return;
    }
    setBusy(true);
    setResult(null);
    let ok = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const r of selectedRows) {
      try {
        const res = await fetch('/api/admin/proposals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'visibility_override.create',
            target_table: 'visibility_overrides',
            target_id: String(r.id),
            payload: { sku_id: r.id, decision: 'hide', reason: reason.trim() },
            source_table: 'floropolis_inventory',
            source_id: String(r.id),
            source_rationale: reason.trim(),
            notes: `Bulk hide proposal: SKU ${r.id} (${r.name}). Reason: ${reason.trim()}`,
          }),
        });
        if (res.ok) ok += 1;
        else {
          failed += 1;
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          errors.push(`SKU ${r.id}: ${j.error ?? `HTTP ${res.status}`}`);
        }
      } catch (e) {
        failed += 1;
        errors.push(`SKU ${r.id}: ${e instanceof Error ? e.message : 'network error'}`);
      }
    }
    setBusy(false);
    setResult({ attempted: count, ok, failed, errors: errors.slice(0, 10) });
  }

  async function flagAllToCeo() {
    const reason = window.prompt(
      `Reason for escalating ${count} SKU(s) to CEO (min 5 chars):`,
      '',
    );
    if (!reason || reason.trim().length < 5) {
      if (reason !== null) alert('Reason must be at least 5 characters');
      return;
    }
    setBusy(true);
    setResult(null);
    let ok = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const r of selectedRows) {
      try {
        const res = await fetch('/api/admin/rose-queue', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sku_id: String(r.id),
            reason_code: 'other',
            reason_text: `Bulk-flag from /admin/catalog (vendor=${r.vendor}, name=${r.name}). Reason: ${reason.trim()}`,
            flagged_by: 'admin_ui',
          }),
        });
        if (res.ok) ok += 1;
        else {
          failed += 1;
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          errors.push(`SKU ${r.id}: ${j.error ?? `HTTP ${res.status}`}`);
        }
      } catch (e) {
        failed += 1;
        errors.push(`SKU ${r.id}: ${e instanceof Error ? e.message : 'network error'}`);
      }
    }
    setBusy(false);
    setResult({ attempted: count, ok, failed, errors: errors.slice(0, 10) });
  }

  function exportSelected() {
    const headers = [
      'id',
      'name',
      'vendor',
      'tier',
      'category',
      'price_usd',
      'farm_cost_usd',
      'gpm_pct',
      'visibility',
      'sources',
    ];
    const lines: string[] = [headers.join(',')];
    for (const r of selectedRows) {
      lines.push(
        [
          r.id,
          r.name,
          r.vendor,
          r.tier,
          r.category,
          r.price ?? '',
          r.farm_cost ?? '',
          r.gpm_pct != null ? (r.gpm_pct * 100).toFixed(2) : '',
          r.visibility,
          r.sources.join('|'),
        ]
          .map(csvEscape)
          .join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `floropolis-catalog-selection-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="sticky top-2 z-30 mb-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 shadow-sm flex flex-wrap items-center gap-3">
      <span className="text-sm font-semibold text-emerald-900">
        {count} selected
      </span>
      <button
        type="button"
        onClick={proposeHideAll}
        disabled={busy}
        className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 py-1.5 rounded-md"
      >
        Propose hide all
      </button>
      <button
        type="button"
        onClick={exportSelected}
        disabled={busy}
        className="text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        Export selected (CSV)
      </button>
      <button
        type="button"
        onClick={flagAllToCeo}
        disabled={busy}
        className="text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        Flag to CEO
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className="text-[11px] text-slate-500 hover:text-slate-700 ml-auto"
      >
        Clear selection
      </button>
      {result && (
        <div className="basis-full text-[11px] text-slate-700 mt-1">
          attempted: {result.attempted}, ok: {result.ok}, failed: {result.failed}
          {result.errors.length > 0 && (
            <details className="inline-block ml-2">
              <summary className="cursor-pointer text-red-700">errors</summary>
              <ul className="list-disc pl-5">
                {result.errors.map((e, i) => (
                  <li key={i} className="font-mono">
                    {e}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// Per-row checkbox component.
export function RowCheckbox({
  id,
  selectedIds,
  onToggle,
}: {
  id: number;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={selectedIds.has(id)}
      onChange={() => onToggle(id)}
      className="cursor-pointer accent-emerald-600"
      aria-label={`Select SKU ${id}`}
    />
  );
}

// Header checkbox.
export function HeaderCheckbox({
  allSelected,
  anySelected,
  onToggle,
}: {
  allSelected: boolean;
  anySelected: boolean;
  onToggle: (all: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={allSelected}
      ref={(el) => {
        if (el) el.indeterminate = anySelected && !allSelected;
      }}
      onChange={(e) => onToggle(e.currentTarget.checked)}
      className="cursor-pointer accent-emerald-600"
      aria-label="Select all visible rows"
    />
  );
}
