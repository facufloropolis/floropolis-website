'use client';

// Facu-facing stage approver — the canonical-stage control for a tab's banner.
// v1 | 2026-06-10 | Job_PM (CPO)
//
// A row of 5 stage buttons (structure / mockup / alpha / mvp / ga). Clicking one
// POSTs { surfaceKey, stage } to /api/admin/surface-status, which sets
// stage_approved=true + approved_by/approved_at, then reloads so the pill above
// reflects the new canonical stage. The currently-approved stage is highlighted.

import { useState } from 'react';

type Stage = 'structure' | 'mockup' | 'alpha' | 'mvp' | 'ga';

const STAGES: Stage[] = ['structure', 'mockup', 'alpha', 'mvp', 'ga'];

const LABEL: Record<Stage, string> = {
  structure: 'Structure',
  mockup: 'Mockup',
  alpha: 'Alpha',
  mvp: 'MVP',
  ga: 'GA',
};

export default function StageApprove({
  surfaceKey,
  currentStage,
  approved,
}: {
  surfaceKey: string;
  currentStage: Stage | null;
  approved: boolean;
}) {
  const [busy, setBusy] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve(stage: Stage) {
    if (busy) return;
    setBusy(stage);
    setError(null);
    try {
      const res = await fetch('/api/admin/surface-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surfaceKey, stage }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `error ${res.status}`);
        setBusy(null);
        return;
      }
      // Reload so the canonical pill above re-renders from the DB.
      window.location.reload();
    } catch {
      setError('network');
      setBusy(null);
    }
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        Facu fija etapa canonica:
      </span>
      {STAGES.map((s) => {
        const isCurrent = approved && currentStage === s;
        return (
          <button
            key={s}
            type="button"
            disabled={busy !== null}
            onClick={() => approve(s)}
            className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
              isCurrent
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
            }`}
          >
            {busy === s ? '...' : LABEL[s]}
          </button>
        );
      })}
      {error && (
        <span className="text-[10px] text-red-600">{error}</span>
      )}
    </div>
  );
}
