// Canonical per-tab STATUS BANNER for the Floropolis admin.
// v1 | 2026-06-10 | Job_PM (CPO)
//
// Every admin tab shows (a) its OBJECTIVE and (b) its STAGE. The stage is
// CANONICAL only when Facu approved it (admin_surface_status.stage_approved =
// true). Until then the pill renders outlined/amber + "PENDIENTE de validacion
// de Facu" so a not-yet-canonical stage is never mistaken for ground truth.
//
// DATA: public.admin_surface_status (pk surface_key), read via the backup
// service client. NULL-safe: no row -> minimal "sin objetivo definido", never
// throws (a banner must never take a tab down).
//
// Facu approves the canonical stage from the tab itself: the <StageApprove>
// sub-component POSTs { surfaceKey, stage } to /api/admin/surface-status, which
// sets stage_approved=true + records approved_by/approved_at, then reloads.

import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import StageApprove from './StageApprove';
import SurfaceIdeas, { type SurfaceIdea } from './SurfaceIdeas';

type Stage = 'structure' | 'mockup' | 'alpha' | 'mvp' | 'ga';

interface SurfaceRow {
  surface_key: string;
  label: string | null;
  objective: string | null;
  stage: string | null;
  stage_approved: boolean | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  honest_status: string | null;
  improve_notes: string | null;
}

const STAGE_ORDER: Stage[] = ['structure', 'mockup', 'alpha', 'mvp', 'ga'];

const STAGE_LABEL: Record<Stage, string> = {
  structure: 'Structure',
  mockup: 'Mockup',
  alpha: 'Alpha',
  mvp: 'MVP',
  ga: 'GA',
};

// Solid (canonical) pill colors when the stage is approved by Facu.
const STAGE_SOLID_CLS: Record<Stage, string> = {
  structure: 'bg-slate-100 text-slate-700 border border-slate-300',
  mockup: 'bg-violet-100 text-violet-700 border border-violet-300',
  alpha: 'bg-amber-100 text-amber-800 border border-amber-300',
  mvp: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  ga: 'bg-emerald-700 text-white border border-emerald-800',
};

function normStage(v: string | null | undefined): Stage | null {
  const s = (v ?? '').trim().toLowerCase();
  return (STAGE_ORDER as string[]).includes(s) ? (s as Stage) : null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default async function SurfaceStatusBanner({
  surfaceKey,
}: {
  surfaceKey: string;
}) {
  let row: SurfaceRow | null = null;
  let ideas: SurfaceIdea[] = [];
  try {
    const svc = getBackupServiceClient();
    const { data } = await svc
      .from('admin_surface_status')
      .select(
        'surface_key, label, objective, stage, stage_approved, approved_by, approved_at, notes, honest_status, improve_notes',
      )
      .eq('surface_key', surfaceKey)
      .maybeSingle();
    row = (data as SurfaceRow | null) ?? null;

    const { data: ideaRows } = await svc
      .from('admin_surface_ideas')
      .select('id, author, idea, resolved, created_at')
      .eq('surface_key', surfaceKey)
      .order('created_at', { ascending: false })
      .limit(50);
    ideas = Array.isArray(ideaRows) ? (ideaRows as SurfaceIdea[]) : [];
  } catch {
    // Never throw from a banner — a status strip must not take a tab down.
    row = null;
  }

  // No row -> minimal placeholder, never nothing-misleading.
  if (!row) {
    return (
      <div className="mb-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">
        sin objetivo definido
      </div>
    );
  }

  const stage = normStage(row.stage);
  const approved = row.stage_approved === true;
  const objective = (row.objective ?? '').trim();
  const honestStatus = (row.honest_status ?? '').trim();
  const improve = (row.improve_notes ?? '').trim();

  const pillCls = approved && stage
    ? STAGE_SOLID_CLS[stage]
    : 'bg-amber-50 text-amber-800 border border-dashed border-amber-400';

  const stageText = stage ? STAGE_LABEL[stage] : '(sin etapa)';
  const approvalText = approved
    ? `aprobado por ${row.approved_by ?? 'Facu'} ${fmtDate(row.approved_at)}`.trim()
    : 'PENDIENTE de validacion de Facu';

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Objective */}
        <div className="min-w-0 flex items-baseline gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 shrink-0">
            Objetivo
          </span>
          <span className="text-[13px] text-slate-700 leading-snug">
            {objective || 'sin objetivo definido'}
          </span>
        </div>

        {/* Stage pill */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${pillCls}`}
            title={approved ? 'Etapa canonica (aprobada por Facu)' : 'Etapa propuesta, aun no aprobada por Facu'}
          >
            {stageText}
            <span className={approved ? 'font-normal opacity-80' : 'font-semibold'}>
              &middot; {approvalText}
            </span>
          </span>
        </div>
      </div>

      {/* Honest status + what we can improve */}
      {(honestStatus || improve) && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {honestStatus && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Status honesto
              </span>
              <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{honestStatus}</p>
            </div>
          )}
          {improve && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-2.5 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                Que podemos mejorar
              </span>
              <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{improve}</p>
            </div>
          )}
        </div>
      )}

      {/* Facu approves the canonical stage from here */}
      <StageApprove
        surfaceKey={row.surface_key}
        currentStage={stage}
        approved={approved}
      />

      {/* Editable ideas — Facu AND JJ */}
      <SurfaceIdeas surfaceKey={row.surface_key} initialIdeas={ideas} />
    </div>
  );
}
