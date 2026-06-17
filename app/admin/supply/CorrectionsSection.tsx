// app/admin/supply/CorrectionsSection.tsx
// v1 | 2026-06-16 | Job_PM (CPO)
//
// The "Correcciones" lever body for the Supply Engine console. Renders the ranked
// DATA-QUALITY correction cards from getCorrectionFlags():
//   - variety + vendor, the WHY ('sin categoria -> bloquea la regla de unidad +
//     publish limpio'), the suggested fix, and a priority rank
//     (importance x impact x readiness).
//   - admin-fixable card (owner_lane='admin') -> inline Flow B propose via
//     ProposeInventoryButton(existing={{variety, skuId}} allowIdentityActions),
//     pre-filling category = sibling-suggested category. ZERO writes to dim_sku —
//     it POSTs /api/admin/inventory/propose -> ONE admin_proposals row.
//   - routed card (owner_lane='rose'/'atlas') -> 'routed to Rose/Atlas' context
//     chip, no inline fix.
//   - no-sibling card (e.g. White Ohara) -> honest 'sin sugerencia automatica',
//     no inline pre-fill (the propose still opens, category empty for manual pick).
//   - honest emerald empty-state when no flags.
//
// SCALE NOTE (v1, stated, not silent): the propose route is one-SKU-per-call
// (targetSkuId). A card groups every no-category SKU of a variety, but the inline
// one-click propose is scoped to ONE REPRESENTATIVE SKU (the card's repSkuId). The
// card states "corrige 1 de N (representativo)" so it never implies all N are fixed
// in one POST. (Batch-all-N = N POSTs is a follow-up once the apply executor lands.)

'use client';

import ProposeInventoryButton from '../catalog/_components/ProposeInventoryButton';
import type { CorrectionFlag, FlagProvenance } from '@/lib/admin/corrections-flags';

interface Props {
  flags: CorrectionFlag[];
  liveNoCategoryCount: number;
  verifierFlagsPresent: boolean;
  warnings: string[];
}

const PROVENANCE_BADGE: Record<FlagProvenance, { cls: string; label: string; title: string }> = {
  directional: {
    cls: 'bg-amber-100 text-amber-800 border-amber-200',
    label: 'directional',
    title: 'Peso de importancia direccional — senal parcial / inferida.',
  },
  verified: {
    cls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    label: 'verified',
    title: 'Peso de importancia verificado contra senal real.',
  },
  sourced: {
    cls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    label: 'sourced',
    title: 'Peso de importancia sourced de senal real.',
  },
  assumed: {
    cls: 'bg-red-100 text-red-800 border-red-200',
    label: 'assumed',
    title: 'Peso de importancia asumido — sin lead detras.',
  },
  none: {
    cls: 'bg-slate-100 text-slate-500 border-slate-200',
    label: 'base only',
    title: 'Sin senal de importancia — rankeado por base + soporte hermano.',
  },
};

function ProvenanceBadge({ p }: { p: FlagProvenance }) {
  const m = PROVENANCE_BADGE[p];
  return (
    <span
      title={m.title}
      className={`inline-flex items-center text-[10px] leading-none px-2 py-1 rounded-full font-semibold uppercase tracking-wide border ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function CorrectionCard({ flag }: { flag: CorrectionFlag }) {
  const isAdmin = flag.ownerLane === 'admin';
  const hasSuggestion = flag.suggestedCategory != null;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold tracking-tight text-slate-900">{flag.variety}</h3>
            <ProvenanceBadge p={flag.importanceProvenance} />
            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wide">{flag.flagType}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <span>{flag.vendor}</span>
            <span className="text-slate-300">·</span>
            <span className="tabular-nums">
              {flag.skuCount} SKU{flag.skuCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Priority</div>
          <div className="text-2xl font-bold text-emerald-700 tabular-nums leading-tight mt-0.5">
            {flag.rankScore.toFixed(1)}
          </div>
          <div
            title={`importance ${flag.importance.toFixed(0)} + sibling ${flag.siblingSupport} + readiness`}
            className="text-[10px] tabular-nums mt-0.5 leading-none text-slate-400"
          >
            imp {flag.importance.toFixed(0)} · herm {flag.siblingSupport}
          </div>
        </div>
      </div>

      {/* What's wrong */}
      <div className="px-5 pb-3">
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Que esta mal</div>
          <div className="text-sm text-slate-800 mt-1 leading-snug">{flag.whatsWrong}</div>
        </div>
      </div>

      {/* Suggested fix */}
      <div className="px-5 pb-3">
        <div className="rounded-xl border border-slate-100 bg-white px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Fix sugerido</div>
          <div className="text-sm text-slate-700 mt-1 leading-snug">{flag.suggestedFix}</div>
          {hasSuggestion && (
            <div className="text-[11px] text-emerald-700 mt-1.5 leading-snug">
              Categoria sugerida:{' '}
              <span className="font-semibold">{flag.suggestedCategory}</span>{' '}
              <span className="text-slate-400">(pre-cargada en el propose)</span>
            </div>
          )}
        </div>
      </div>

      {/* The closing action */}
      <div className="px-5 pb-4">
        {isAdmin ? (
          <>
            <ProposeInventoryButton
              existing={{ variety: flag.variety, skuId: flag.repSkuId ?? undefined }}
              allowIdentityActions
              defaultAction="update_identity"
              defaultCategory={flag.suggestedCategory ?? undefined}
              label={hasSuggestion ? 'Corregir categoria (1-click)' : 'Corregir categoria'}
            />
            {flag.skuCount > 1 && (
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                Corrige 1 de {flag.skuCount} (SKU representativo). El executor aplica 1 propuesta por SKU; el resto de la
                variedad se corrige repitiendo la accion (batch-all = follow-up).
              </p>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 bg-violet-100 border border-violet-200 rounded-full px-2 py-0.5">
                routed -&gt; {flag.routedTo}
              </span>
              <span className="text-[10px] text-slate-500">sin fix inline (fuera de la lane del admin)</span>
            </div>
            <div className="text-sm text-slate-700 mt-1.5 leading-snug">{flag.suggestedFix}</div>
          </div>
        )}
      </div>
    </article>
  );
}

export default function CorrectionsSection({
  flags,
  liveNoCategoryCount,
  verifierFlagsPresent,
  warnings,
}: Props) {
  if (flags.length === 0) {
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-8 text-center">
        <div className="text-sm font-semibold text-emerald-800">Correcciones: nada que trabajar</div>
        <p className="text-sm text-emerald-700 mt-1 max-w-md mx-auto leading-relaxed">
          No hay SKU sin categoria ni flags del verificador abiertos ahora mismo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-600 leading-relaxed">
        <span className="font-semibold text-slate-900 tabular-nums">{liveNoCategoryCount}</span> SKU sin categoria (conteo
        vivo: <span className="font-mono">dim_sku WHERE category IS NULL AND quarantined=false</span>), agrupados por
        variedad. La categoria sugerida sale de hermanos (misma variedad con categoria). Cada correccion va a la cola de
        aprobacion (admin_proposals) via Flow B — no escribe dim_sku.
        {!verifierFlagsPresent && (
          <span className="block mt-1 text-slate-400">
            meta/public.verifier_flags aun no existe: v1 muestra solo las correcciones de categoria derivables. Cuando
            Pita lo publique, los flags de unidad/costo/caja aparecen aca automaticamente (owner_lane decide inline vs
            routed).
          </span>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] text-amber-800">
          <span className="font-semibold uppercase tracking-wide">Warnings:</span> {warnings.join(' · ')}
        </div>
      )}

      {flags.map((flag) => (
        <CorrectionCard key={flag.key} flag={flag} />
      ))}
    </div>
  );
}
