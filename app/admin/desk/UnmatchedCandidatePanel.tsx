// UnmatchedCandidatePanel — Desk surface for unmatched Zoho records that have a
// high-confidence candidate match in lead_master. Rose couldn't auto-link these
// because confidence was below the auto-merge threshold; Facu approves or skips.
// Ranked by match score DESC (score 1.0 = exact email/phone match).
// v1 | 2026-06-11 | Job_PM (CPO)
'use client';

import { useState } from 'react';
import type { UnmatchedCandidate } from '@/lib/admin/dedup-review';

function scoreBadge(score: number): string {
  if (score >= 0.95) return 'bg-emerald-100 text-emerald-700';
  if (score >= 0.7) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-500';
}

function basisLabel(basis: string | null): string {
  if (!basis) return '?';
  if (basis === 'email') return 'email';
  if (basis === 'phone') return 'tel';
  return basis.replace('_', ' ');
}

function CandidateRow({ item }: { item: UnmatchedCandidate }) {
  const [decided, setDecided] = useState(item.decided);
  const [decision, setDecision] = useState<string | null>(item.decision);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function decide(d: 'LINK' | 'SKIP') {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/desk/unmatched-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          decision: d,
          candidate_lead_master_id: d === 'LINK' ? item.candidateLeadMasterId : undefined,
        }),
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

  const name = item.entityDisplayName.includes('@')
    ? item.entityDisplayName.split('@')[0].trim()
    : item.entityDisplayName;

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${decided ? 'border-slate-100 bg-slate-50 opacity-60' : 'border-slate-200 bg-white'}`}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-slate-800">{name}</div>
        <div className="text-[11px] text-slate-400">{item.entityEmail ?? item.entityPhone ?? '—'}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[11px] text-slate-500">→ {item.candidateName ?? '?'}</div>
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${scoreBadge(item.candidateScore)}`}>
            {(item.candidateScore * 100).toFixed(0)}%
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{basisLabel(item.matchBasis)}</span>
        </div>
      </div>
      {decided ? (
        <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${decision === 'LINK' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {decision === 'LINK' ? 'linkeado' : 'skip'}
        </span>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => decide('LINK')}
            disabled={busy || item.candidateLeadMasterId == null}
            className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            Linkear
          </button>
          <button
            onClick={() => decide('SKIP')}
            disabled={busy}
            className="rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Skip
          </button>
          {err && <span className="text-[11px] text-rose-600">{err}</span>}
        </div>
      )}
    </div>
  );
}

export default function UnmatchedCandidatePanel({ items }: { items: UnmatchedCandidate[] }) {
  const pending = items.filter((i) => !i.decided);
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-slate-800">Sin match — candidatos sugeridos</h2>
        <span className="text-[12px] text-slate-500">{pending.length} pendientes</span>
      </div>
      <p className="mb-3 text-[12px] text-slate-500">
        Zoho records que no encontraron match automático, pero Rose encontró un candidato probable.
        Score 100% = match exacto por email/tel. Decidí: Linkear (une al candidato) o Skip (dejalo sin match).
      </p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <CandidateRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
