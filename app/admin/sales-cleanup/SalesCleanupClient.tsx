'use client';

// SalesCleanupClient — interactive queue + history for /admin/sales-cleanup.
// v1 | 2026-05-22 | Job_PM [V8 SHADOW]
//
// Design decisions (Facu 2026-05-22):
//   - Refresh button (no polling — burst session model)
//   - Desktop only (JJ uses desktop; mobile deferred)
//   - JJ = full admin (same resolve power as Facu — both in ADMIN_EMAILS)
//   - Route: /admin/sales-cleanup (peer of catalog)

import { useState, useCallback, useTransition } from 'react';
import type {
  OrphanRow,
  SuggestedAction,
} from '@/lib/admin/sales-cleanup-model';
import {
  identitySummary,
  txnSummary,
  crossSourceSummary,
  topAction,
} from '@/lib/admin/sales-cleanup-model';

interface ListResponse {
  rows: OrphanRow[];
  total_count: number;
  total_pending_usd: number;
}

interface Props {
  initial: ListResponse;
}

type Tab = 'pending' | 'history';

export default function SalesCleanupClient({ initial }: Props) {
  const [tab, setTab] = useState<Tab>('pending');
  const [data, setData] = useState<ListResponse>(initial);
  const [historyData, setHistoryData] = useState<ListResponse | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [otherAction, setOtherAction] = useState<{ id: string; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const refresh = useCallback(() => {
    startTransition(async () => {
      const status = tab === 'pending' ? 'pending' : 'resolved';
      const res = await fetch(`/api/admin/sales-cleanup/list?status=${status}&sort=impact_desc&limit=100`);
      if (res.ok) {
        const json = await res.json() as ListResponse;
        if (tab === 'pending') setData(json);
        else setHistoryData(json);
      }
    });
  }, [tab]);

  const switchTab = useCallback((t: Tab) => {
    setTab(t);
    setExpandedId(null);
    if (t === 'history' && !historyData) {
      startTransition(async () => {
        const res = await fetch('/api/admin/sales-cleanup/list?status=resolved&sort=detected_desc&limit=100');
        if (res.ok) setHistoryData(await res.json() as ListResponse);
      });
    }
  }, [historyData]);

  const resolve = useCallback(async (id: string, action: string, note?: string) => {
    setResolving(id);
    try {
      const res = await fetch(`/api/admin/sales-cleanup/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_action: action, resolution_note: note }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(`Error: ${json.error ?? 'resolve failed'}`);
        return;
      }
      showToast(
        json.cascade_resolved_count > 0
          ? `Resolved. Pattern auto-resolved ${json.cascade_resolved_count} additional orphan(s).`
          : `Resolved by ${json.resolved_by}.`
      );
      // Remove from pending list optimistically
      setData(prev => ({
        ...prev,
        rows: prev.rows.filter(r => r.id !== id),
        total_count: Math.max(0, prev.total_count - 1),
      }));
      setExpandedId(null);
      setOtherAction(null);
    } finally {
      setResolving(null);
    }
  }, []);

  const rows = tab === 'pending' ? data.rows : (historyData?.rows ?? []);

  return (
    <div className="flex flex-col gap-4">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-700 text-white text-sm px-4 py-3 rounded shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Sales Cleanup</h1>
          <p className="text-sm text-gray-500">
            {data.total_count} pending &middot; ${data.total_pending_usd.toFixed(2)} at stake
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={isPending}
          className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
        >
          <span>{isPending ? '...' : '↻'}</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200">
        {(['pending', 'history'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`pb-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
            {t === 'pending' && data.total_count > 0 && (
              <span className="ml-1.5 bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full">
                {data.total_count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Row list */}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          {tab === 'pending' ? 'No pending orphans.' : 'No resolved orphans yet.'}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {rows.map(row => (
            <OrphanRowItem
              key={row.id}
              row={row}
              tab={tab}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
              onResolve={resolve}
              resolving={resolving === row.id}
              otherAction={otherAction?.id === row.id ? otherAction.text : undefined}
              onOtherActionChange={(text) =>
                setOtherAction(text ? { id: row.id, text } : null)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single orphan row
// ---------------------------------------------------------------------------

function OrphanRowItem({
  row, tab, expanded, onToggle, onResolve, resolving, otherAction, onOtherActionChange,
}: {
  row: OrphanRow;
  tab: Tab;
  expanded: boolean;
  onToggle: () => void;
  onResolve: (id: string, action: string, note?: string) => void;
  resolving: boolean;
  otherAction?: string;
  onOtherActionChange: (text: string) => void;
}) {
  const top = topAction(row);
  const actions = row.suggested_actions?.actions ?? [];
  const cross = crossSourceSummary(row);

  return (
    <div className={`${expanded ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'}`}>
      {/* Collapsed row — 2 lines */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-start justify-between gap-4"
      >
        <div className="flex-1 min-w-0">
          {/* Line 1: identity + amount */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-gray-900 truncate">
              {row.identity_signals.business_name ?? '—'}
            </span>
            <span className="text-xs text-gray-400">
              {row.identity_signals.email ?? row.identity_signals.phone_normalized ?? ''}
            </span>
            <span className="ml-auto text-sm font-semibold text-gray-800">
              ${(row.transaction_signals.total_amount ?? 0).toFixed(2)}
            </span>
            <span className="text-xs text-gray-400">{row.transaction_signals.kind}</span>
            <span className="text-xs text-gray-400">{txnAgeLabel(row.detected_at)}</span>
          </div>
          {/* Line 2: top suggestion + cross source */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {top && (
              <span className="text-xs text-emerald-700 font-medium">
                {top.description} ({(top.confidence * 100).toFixed(0)}%)
              </span>
            )}
            {cross && (
              <span className="text-xs text-gray-400 truncate">{cross}</span>
            )}
            {tab === 'history' && row.resolved_by && (
              <span className="text-xs text-gray-400">
                &bull; resolved by {row.resolved_by} &bull; {row.resolution_action}
              </span>
            )}
          </div>
        </div>
        <span className="text-gray-300 text-sm flex-shrink-0 mt-0.5">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4 border-t border-gray-100">
          {/* Signal blocks */}
          <div className="grid grid-cols-3 gap-4 mt-3">
            <SignalBlock title="Identity" signals={row.identity_signals as unknown as Record<string, unknown>} />
            <SignalBlock title="Transaction" signals={flattenTxn(row.transaction_signals)} />
            <SignalBlock title="Cross-source" signals={flattenCross(row.cross_source_signals)} />
          </div>

          {/* Fuzzy candidates */}
          {(row.cross_source_signals?.lead_master_candidates_fuzzy?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Fuzzy lead matches</p>
              <div className="flex flex-col gap-1">
                {row.cross_source_signals!.lead_master_candidates_fuzzy.map(c => (
                  <div key={c.lead_master_id} className="text-xs text-gray-600 flex gap-2">
                    <span className="font-medium">{c.matched_value}</span>
                    <span className="text-gray-400">({c.match_field}, {(c.similarity_score * 100).toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons — only in pending tab */}
          {tab === 'pending' && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-gray-500">Actions</p>
              <div className="flex flex-wrap gap-2">
                {actions.slice(0, 3).map(a => (
                  <ActionButton
                    key={a.id}
                    action={a}
                    disabled={resolving}
                    onClick={() => onResolve(row.id, a.id)}
                  />
                ))}
                {/* Other */}
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Other action..."
                    value={otherAction ?? ''}
                    onChange={e => onOtherActionChange(e.target.value)}
                    className="text-xs border border-gray-200 rounded px-2 py-1.5 w-44 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  {otherAction && (
                    <button
                      disabled={resolving}
                      onClick={() => onResolve(row.id, otherAction)}
                      className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50"
                    >
                      Submit
                    </button>
                  )}
                </div>
                {/* Skip 24h */}
                <button
                  disabled={resolving}
                  onClick={() => onResolve(row.id, 'deferred_24h', 'Skipped by user')}
                  className="text-xs text-gray-500 border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                >
                  Skip 24h
                </button>
              </div>
              {resolving && (
                <p className="text-xs text-emerald-600 animate-pulse">Saving...</p>
              )}
            </div>
          )}

          {/* History: show resolution detail */}
          {tab === 'history' && (
            <div className="text-xs text-gray-500 flex flex-col gap-1">
              <div><span className="font-medium">Action:</span> {row.resolution_action}</div>
              {row.resolution_note && <div><span className="font-medium">Note:</span> {row.resolution_note}</div>}
              <div><span className="font-medium">Resolved by:</span> {row.resolved_by}</div>
              <div><span className="font-medium">Resolved at:</span> {row.resolved_at ? new Date(row.resolved_at).toLocaleString() : '—'}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({ action, disabled, onClick }: { action: SuggestedAction; disabled: boolean; onClick: () => void }) {
  const pct = (action.confidence * 100).toFixed(0);
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
    >
      <span>{action.description}</span>
      <span className="opacity-70">({pct}%)</span>
    </button>
  );
}

function SignalBlock({ title, signals }: { title: string; signals: Record<string, unknown> }) {
  const entries = Object.entries(signals).filter(([, v]) => v != null && v !== '');
  return (
    <div className="bg-white border border-gray-100 rounded p-3 text-xs">
      <p className="font-medium text-gray-500 mb-2">{title}</p>
      <div className="flex flex-col gap-1">
        {entries.length === 0 && <span className="text-gray-300">—</span>}
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-1">
            <span className="text-gray-400 shrink-0">{k}:</span>
            <span className="text-gray-700 font-mono break-all">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function flattenTxn(s: OrphanRow['transaction_signals']): Record<string, unknown> {
  return {
    kind: s.kind,
    source: s.txn_source,
    total: `$${(s.total_amount ?? 0).toFixed(2)}`,
    phase: s.current_phase,
    freight: s.freight_amount != null ? `$${s.freight_amount.toFixed(2)}` : null,
    confidence: s.confidence,
  };
}

function flattenCross(c: OrphanRow['cross_source_signals'] | null): Record<string, unknown> {
  if (!c) return {};
  return {
    same_komet_txns: c.other_txns_same_komet_id || null,
    same_email_txns: c.other_txns_same_email || null,
    same_phone_txns: c.other_txns_same_phone || null,
    calls_same_phone: c.calls_with_same_phone || null,
    msgs_same_phone: c.messages_with_same_phone || null,
    fuzzy_matches: c.lead_master_candidates_fuzzy.length || null,
  };
}

function txnAgeLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}
