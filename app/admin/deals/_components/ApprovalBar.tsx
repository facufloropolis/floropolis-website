// ApprovalBar -- "Pendiente de aprobacion -- JJ o Facu pueden aprobar".
// "Enviar deal" -> POST /api/admin/deals/save. 422 below_floor -> show error;
// ok -> show dealId + pending-approval confirmation.
// v1 | 2026-06-09 | Job_PM (CPO)
'use client';

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'ok'; dealId: number }
  | { kind: 'error'; message: string };

export default function ApprovalBar({
  belowFloor,
  hasLines,
  saveState,
  onSubmit,
}: {
  belowFloor: boolean;
  hasLines: boolean;
  saveState: SaveState;
  onSubmit: () => void;
}) {
  const disabled = belowFloor || !hasLines || saveState.kind === 'saving' || saveState.kind === 'ok';

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
        <span className="text-sm font-semibold text-amber-800">Pendiente de aprobacion</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-amber-700">
        <span className="font-medium">JJ o Facu pueden aprobar</span> este deal. Se envia a la queue con estado{' '}
        <span className="font-mono">pending_approval</span>.
      </p>

      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className={
          'mt-3 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition ' +
          (disabled ? 'cursor-not-allowed bg-slate-300' : 'bg-emerald-600 hover:bg-emerald-700')
        }
      >
        {saveState.kind === 'saving' ? 'Enviando...' : 'Enviar deal'}
      </button>

      {!hasLines && saveState.kind === 'idle' && (
        <p className="mt-2 text-center text-[11px] text-amber-600">Agrega al menos una variedad para enviar.</p>
      )}

      {saveState.kind === 'error' && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {saveState.message.startsWith('below_floor') || saveState.message.startsWith('line_below_floor')
            ? 'El precio quedo por debajo del floor (GPM 5%). Subi el precio y reenvia.'
            : 'No se pudo guardar el deal.'}
          <div className="mt-1 font-mono text-[10px] text-rose-500">{saveState.message}</div>
        </div>
      )}

      {saveState.kind === 'ok' && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
          Deal <span className="font-semibold">#{saveState.dealId}</span> creado -- pendiente de aprobacion (JJ o Facu).
        </div>
      )}
    </div>
  );
}

export type { SaveState };
