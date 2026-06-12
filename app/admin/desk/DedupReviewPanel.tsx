// DedupReviewPanel — Desk surface for the doubtful dedup merges (Rose auto-merged the
// no-brainers; these need Facu). Ranked by commercial importance (worked_signals). Per group
// Facu picks: merge all / it's a chain / they're separate / pick the survivor. The decision
// POSTs to BACKUP dedup_decisions; Rose executes the reversible soft-merge.
// v1 | 2026-06-11 | Job_PM (CPO)
'use client';

import { useState } from 'react';
import type { DedupGroup } from '@/lib/admin/dedup-review';

const SUGGEST_LABEL: Record<string, string> = {
  MERGE_ALL: 'mergear todos',
  KEEP_CHAIN: 'es cadena (mantener)',
  KEEP_SEPARATE: 'son distintos (mantener)',
};

const REASON_LABEL: Record<string, string> = {
  shared_email_multi_city: 'mismo email, varias ciudades — ¿cadena o dup?',
  shared_email_multi_phone: 'mismo email, varios teléfonos',
  shared_email_no_phone: 'mismo email, sin teléfono',
};

function reasonText(raw: string | null): string {
  if (!raw) return 'revisar';
  const key = Object.keys(REASON_LABEL).find((k) => raw.includes(k));
  return key ? REASON_LABEL[key] : raw;
}

function SignalChips({ ws }: { ws: string | null }) {
  if (!ws) return <span className="text-slate-300">—</span>;
  const parts = ws.split(',').map((p) => p.trim()).filter(Boolean);
  const cls: Record<string, string> = {
    sample: 'bg-emerald-100 text-emerald-700',
    calls: 'bg-sky-100 text-sky-700',
    emails: 'bg-indigo-100 text-indigo-700',
    zoho: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className="inline-flex flex-wrap gap-1">
      {parts.map((p) => (
        <span key={p} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls[p] ?? 'bg-slate-100 text-slate-500'}`}>{p}</span>
      ))}
    </span>
  );
}

function GroupCard({ group }: { group: DedupGroup }) {
  const [decided, setDecided] = useState(group.decided);
  const [decision, setDecision] = useState<string | null>(group.decision);
  const [survivor, setSurvivor] = useState<number | null>(group.members[0]?.leadMasterId ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function decide(d: string, survivorLeadId: number | null) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/desk/dedup-decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ group_key: group.groupKey, decision: d, survivor_lead_id: survivorLeadId }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        setDecided(true);
        setDecision(d);
      } else {
        setErr(body.error ?? `http_${res.status}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-lg border ${decided ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'} p-3`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-[12px] text-slate-700">{group.groupKey}</div>
          <div className="text-[11px] text-slate-500">
            {group.groupSize} negocios · {reasonText(group.reviewReason)} · importancia {group.importance.toFixed(1)}
          </div>
        </div>
        {decided && (
          <span className="shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">decidido: {decision}</span>
        )}
      </div>

      <table className="mt-2 w-full text-left text-[12px]">
        <tbody>
          {group.members.map((m) => (
            <tr key={m.leadMasterId ?? m.businessName} className="border-t border-slate-100">
              <td className="py-1 pr-2">
                {!decided && (
                  <label className="flex items-center gap-1 text-[11px] text-slate-500">
                    <input
                      type="radio"
                      name={`survivor-${group.groupKey}`}
                      checked={survivor === m.leadMasterId}
                      onChange={() => setSurvivor(m.leadMasterId)}
                    />
                    survivor
                  </label>
                )}
              </td>
              <td className="py-1 pr-2 font-medium text-slate-800">{m.businessName}</td>
              <td className="py-1 pr-2 text-slate-500">{[m.city, m.state].filter(Boolean).join(', ') || '—'}</td>
              <td className="py-1"><SignalChips ws={m.workedSignals} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {!decided && group.suggestion && (
        <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          <span className="font-semibold">Sugerido: {SUGGEST_LABEL[group.suggestion.decision]}</span> — {group.suggestion.reason}
        </div>
      )}

      {!decided && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(() => { const sug = (d: string) => (group.suggestion?.decision === d ? ' ring-2 ring-amber-400' : ''); return (
          <>
          <button onClick={() => decide('MERGE_ALL', survivor)} disabled={busy}
            className={`rounded bg-rose-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-rose-700 disabled:opacity-50${sug('MERGE_ALL')}`}>
            Mergear todos {survivor != null ? '→ survivor' : ''}
          </button>
          <button onClick={() => decide('SURVIVOR', survivor)} disabled={busy || survivor == null}
            className="rounded border border-rose-300 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50">
            Mergear en el elegido
          </button>
          <button onClick={() => decide('KEEP_CHAIN', null)} disabled={busy}
            className={`rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50${sug('KEEP_CHAIN')}`}>
            Es cadena (mantener)
          </button>
          <button onClick={() => decide('KEEP_SEPARATE', null)} disabled={busy}
            className={`rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50${sug('KEEP_SEPARATE')}`}>
            Son distintos (mantener)
          </button>
          </>
          ); })()}
          {err && <span className="text-[11px] text-rose-600">{err}</span>}
        </div>
      )}
    </div>
  );
}

export default function DedupReviewPanel({ groups }: { groups: DedupGroup[] }) {
  const pending = groups.filter((g) => !g.decided);
  if (groups.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-slate-800">Dedup — dudas para resolver</h2>
        <span className="text-[12px] text-slate-500">{pending.length} pendientes · ordenadas por importancia</span>
      </div>
      <p className="mb-3 text-[12px] text-slate-500">
        Rose auto-mergeó los obvios; estos comparten email pero no son claros. Decidí: las llamadas/samples (chips) marcan
        cuáles son clientes activos. Tu decisión la ejecuta Rose (soft-merge reversible).
      </p>
      <div className="space-y-2">
        {groups.map((g) => (
          <GroupCard key={g.groupKey} group={g} />
        ))}
      </div>
    </section>
  );
}
