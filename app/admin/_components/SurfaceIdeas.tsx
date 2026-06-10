'use client';

// SurfaceIdeas -- the editable ideas box on a tab's status banner. Facu AND JJ can
// drop ideas/feedback per surface; each is attributed to the logged-in admin and
// can be marked resolved. POSTs to /api/admin/surface-status/idea.
// v1 | 2026-06-10 | Job_PM (CPO)

import { useState } from 'react';

export interface SurfaceIdea {
  id: string;
  author: string;
  idea: string;
  resolved: boolean;
  created_at: string;
}

function shortAuthor(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export default function SurfaceIdeas({
  surfaceKey,
  initialIdeas,
}: {
  surfaceKey: string;
  initialIdeas: SurfaceIdea[];
}) {
  const [ideas, setIdeas] = useState<SurfaceIdea[]>(initialIdeas);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(initialIdeas.some((i) => !i.resolved));

  async function add() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/surface-status/idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', surfaceKey, idea: text }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; idea?: SurfaceIdea; error?: string };
      if (!res.ok || !j.ok || !j.idea) {
        setError(j.error ?? `error ${res.status}`);
        setBusy(false);
        return;
      }
      setIdeas((prev) => [j.idea as SurfaceIdea, ...prev]);
      setDraft('');
    } catch {
      setError('network');
    }
    setBusy(false);
  }

  async function toggleResolved(id: string, next: boolean) {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, resolved: next } : i)));
    try {
      await fetch('/api/admin/surface-status/idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', ideaId: id, resolved: next }),
      });
    } catch {
      // optimistic; revert on failure
      setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, resolved: !next } : i)));
    }
  }

  const openCount = ideas.filter((i) => !i.resolved).length;

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-emerald-700"
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        Ideas &amp; feedback (Facu / JJ)
        {ideas.length > 0 && (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            {openCount > 0 ? `${openCount} abiertas` : `${ideas.length}`}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2">
          <div className="flex items-start gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add();
              }}
              rows={2}
              placeholder="Deja una idea o feedback para esta pestana... (Cmd+Enter para enviar)"
              className="min-w-0 flex-1 resize-y rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-700 placeholder:text-slate-300 focus:border-emerald-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={add}
              disabled={busy || draft.trim().length === 0}
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
            >
              {busy ? '...' : 'Agregar'}
            </button>
          </div>
          {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}

          {ideas.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {ideas.map((i) => (
                <li
                  key={i.id}
                  className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] ${
                    i.resolved ? 'border-slate-100 bg-slate-50 text-slate-400' : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={i.resolved}
                    onChange={(e) => toggleResolved(i.id, e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-600"
                    title={i.resolved ? 'Marcar como abierta' : 'Marcar como resuelta'}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={i.resolved ? 'line-through' : ''}>{i.idea}</span>
                    <span className="ml-1.5 text-[10px] text-slate-400">
                      &mdash; {shortAuthor(i.author)} {fmtDate(i.created_at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] italic text-slate-400">
              Sin ideas todavia. Dejá la primera.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
