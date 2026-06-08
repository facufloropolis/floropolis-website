'use client';
// DIRECTIONAL dispatch-priority panel — ranks WHAT to dispatch next across both
// planes, with a per-item bump / drop / correct feedback loop.
// v1 | 2026-06-08 | Job_PM dispatch-priority
//
// The score is a FIRST GUESS (see dispatchPriority.ts for the formula). Every
// row carries a 'directional' badge and the WHY breakdown. Facu corrects the
// ranking with bump/drop/correct, which POSTs to
// /api/admin/dispatch/priority-feedback (writes supply_recommendation_feedback,
// rec_type='dispatch_priority'). Same correction pattern as the supply engine.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type {
  DispatchPriorityItem,
  DispatchPriorityResult,
} from './dispatchPriority';

const SOURCE_BADGE: Record<
  DispatchPriorityItem['source'],
  { cls: string; label: string }
> = {
  sample_order: { cls: 'bg-violet-50 text-violet-800 border-violet-200', label: 'Sample order' },
  k2k_prebook: { cls: 'bg-blue-50 text-blue-800 border-blue-200', label: 'K2K prebook' },
  sample_box: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'Sample box' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return 'no date';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  });
}

function urgencyTone(days: number | null): string {
  if (days == null) return 'text-slate-500';
  if (days < 0) return 'text-red-700 font-semibold';
  if (days === 0) return 'text-red-600 font-semibold';
  if (days <= 2) return 'text-amber-700 font-semibold';
  return 'text-slate-600';
}

function urgencyText(days: number | null): string {
  if (days == null) return 'no ship date';
  if (days < 0) return `overdue ${Math.abs(days)}d`;
  if (days === 0) return 'ships today';
  if (days === 1) return 'ships tomorrow';
  return `in ${days}d`;
}

function PriorityRow({ item, rank }: { item: DispatchPriorityItem; rank: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'bump' | 'drop' | 'correct'>(null);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showCorrect, setShowCorrect] = useState(false);
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState(false);

  const badge = SOURCE_BADGE[item.source];

  async function send(decision: 'bump' | 'drop' | 'correct', noteText?: string) {
    setBusy(decision);
    setErr(null);
    try {
      const res = await fetch('/api/admin/dispatch/priority-feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ref: item.ref,
          key: item.key,
          client: item.client,
          decision,
          note: noteText ?? null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.detail ? `${j.error}: ${j.detail}` : j.error ?? `HTTP ${res.status}`);
      }
      setDone(
        decision === 'bump'
          ? 'Marked higher'
          : decision === 'drop'
            ? 'Marked lower'
            : 'Correction saved',
      );
      setShowCorrect(false);
      setNote('');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex items-start gap-3">
          <div className="shrink-0 w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-sm font-bold flex items-center justify-center">
            {rank}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-semibold text-slate-700">{item.ref}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${badge.cls}`}>
                {badge.label}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-200">
                directional
              </span>
              {item.isStrategicBet && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  conversion bet
                </span>
              )}
            </div>
            <p className="text-sm text-slate-800 font-medium mt-1 truncate">{item.client}</p>
            <div className="flex items-center gap-3 text-xs mt-1 flex-wrap">
              <span className={urgencyTone(item.daysUntilShip)}>
                {urgencyText(item.daysUntilShip)}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">
                ship target {fmtDate(item.shipTargetSnapped ?? item.shipTargetDate)}
              </span>
              {item.value > 0 && (
                <>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600">
                    ${item.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold text-slate-900 leading-none">{item.score}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-0.5">priority</div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-slate-500 hover:text-slate-800 mt-1"
          >
            {expanded ? 'hide why' : 'why?'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 ml-11 border-t border-slate-100 pt-2 space-y-1">
          {item.factors.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between text-xs">
              <span className="text-slate-600">
                {f.label} <span className="text-slate-400">— {f.detail}</span>
              </span>
              <span
                className={`font-mono font-semibold ${
                  f.points > 0 ? 'text-slate-800' : 'text-slate-400'
                }`}
              >
                {f.points > 0 ? `+${f.points}` : f.points}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Feedback loop */}
      <div className="mt-3 ml-11 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-slate-400">Correct the ranking:</span>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => send('bump')}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-2 py-0.5 rounded disabled:opacity-50"
        >
          {busy === 'bump' ? '...' : '↑ Higher'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => send('drop')}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 hover:border-slate-500 px-2 py-0.5 rounded disabled:opacity-50"
        >
          {busy === 'drop' ? '...' : '↓ Lower'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => setShowCorrect((v) => !v)}
          className="text-xs font-semibold text-violet-700 hover:text-violet-900 border border-violet-300 hover:border-violet-500 px-2 py-0.5 rounded disabled:opacity-50"
        >
          I see this differently
        </button>
        {done && <span className="text-xs text-emerald-700">{done}</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>

      {showCorrect && (
        <div className="mt-2 ml-11 border border-violet-200 bg-violet-50 rounded p-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="What's the right priority and why? (e.g. 'this client churns if late — top it')"
            className="w-full text-xs border border-slate-300 rounded px-2 py-1"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCorrect(false);
                setNote('');
              }}
              disabled={busy !== null}
              className="text-xs px-3 py-1 rounded border border-slate-200 text-slate-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => send('correct', note.trim() || undefined)}
              disabled={busy !== null || !note.trim()}
              className="text-xs px-3 py-1 rounded bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50"
            >
              {busy === 'correct' ? 'Saving...' : 'Save correction'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DispatchPriorityPanel({ data }: { data: DispatchPriorityResult }) {
  const { items, planes } = data;

  const planeNotes: string[] = [];
  if (!planes.k2kPrebooks.configured && !planes.sampleBoxes.configured) {
    planeNotes.push('Production read client not configured — K2K + sample-box planes hidden.');
  }
  if (planes.sampleOrders.error) planeNotes.push(`Sample orders: ${planes.sampleOrders.error}`);
  if (planes.k2kPrebooks.error) planeNotes.push(`K2K prebooks: ${planes.k2kPrebooks.error}`);
  if (planes.sampleBoxes.error) planeNotes.push(`Sample boxes: ${planes.sampleBoxes.error}`);

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <span className="text-amber-600 text-lg shrink-0">🧭</span>
        <div className="text-sm text-amber-900">
          <strong>Directional priority — your call corrects it.</strong> This ranks what to
          dispatch next across web sample orders, K2K prebooks, and ready sample boxes, by
          ship-window urgency + value + cohort. It&apos;s a starting guess, not a rule. Use
          ↑ Higher / ↓ Lower / &quot;I see this differently&quot; on any row and it&apos;s captured for
          the loop.
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
        <span>
          <strong className="text-slate-700">{items.length}</strong> dispatchable
        </span>
        <span>
          Sample orders: <strong className="text-slate-700">{planes.sampleOrders.count}</strong>
        </span>
        <span>
          K2K prebooks: <strong className="text-slate-700">{planes.k2kPrebooks.count}</strong>
        </span>
        <span>
          Sample boxes: <strong className="text-slate-700">{planes.sampleBoxes.count}</strong>
        </span>
      </div>

      {planeNotes.length > 0 && (
        <div className="text-xs text-slate-400 space-y-0.5">
          {planeNotes.map((n, i) => (
            <p key={i}>· {n}</p>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <p className="font-semibold text-slate-600">Nothing dispatchable right now</p>
          <p className="text-sm mt-1">
            No sample orders in a ship-ready state, no K2K prebooks with a truck date, and no
            sample boxes marked ready.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <PriorityRow key={item.key} item={item} rank={i + 1} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Formula (directional): ship-window urgency (0-60, snapped to FedEx ship days Mon/Tue/Thu/Fri,
        sooner = higher) + order value (0-30, $/100 capped) + strategic cohort (+25 for sample bets).
        Corrections write to supply_recommendation_feedback (rec_type=&apos;dispatch_priority&apos;).
      </p>
    </div>
  );
}
