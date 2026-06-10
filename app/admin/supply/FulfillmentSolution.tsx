// Solution-first FULFILLMENT card body: WORK the units fill, don't flag the gap.
// v1 | 2026-06-10 | Job_PM (CPO)
//
// HARD BAR (Facu): the loop closes ONLY when the metric MOVES. On live data the
// fulfillment lever is a missing_units_or_bunch gap (stems_per_unit null), so the
// worked solution is to SET units per vendor x box and clear the gate via
// /api/admin/supply/apply-fulfillment:
//   - all stem-sold -> stems_per_unit=1 is factual -> one-click apply.
//   - some non-stem  -> the human passes a real stemsPerUnit (no fabrication);
//     the stem-sold ones still apply in one click, non-stem need the value.
// box_dims gaps are routed to a manual note (box_master, outside this executor);
// we never offer a button that cannot move the metric.
//
// Style: emerald-600 primary, slate scale, ASCII-clean Spanish. NULL-safe.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  vendor: string;
  boxType: string;
  varieties: number;
  applyKind: 'units' | 'box_dims' | 'manual';
  allStemSold: boolean;
  needsValueCount: number;
}

interface ApplyResult {
  applied: boolean;
  loopClosed?: boolean;
  reason?: string;
  detail?: string;
  gapSkuCount?: number;
  unitsWritten?: number;
  gatesCleared?: number;
  needsValue?: number;
  closed?: number;
  nowPublishable?: number;
}

export default function FulfillmentSolution({
  vendor,
  boxType,
  varieties,
  applyKind,
  allStemSold,
  needsValueCount,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [stems, setStems] = useState('');

  async function apply(withValue: boolean) {
    setError(null);
    setBusy(true);
    try {
      const stemsPerUnit = withValue ? parseInt(stems.trim(), 10) : undefined;
      const res = await fetch('/api/admin/supply/apply-fulfillment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vendor,
          boxType,
          stemsPerUnit: Number.isFinite(stemsPerUnit as number) ? stemsPerUnit : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as ApplyResult & { error?: string };
      if (!res.ok) {
        throw new Error(json.detail ? `${json.error}: ${json.detail}` : json.error ?? `HTTP ${res.status}`);
      }
      setResult(json);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo aplicar');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const closed = result.closed ?? 0;
    if (result.applied && result.loopClosed && closed > 0) {
      return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
            <span aria-hidden>+</span> Loop cerrado
          </div>
          <div className="text-sm font-semibold text-emerald-800 mt-1 leading-snug">
            units cargadas -&gt; gate missing_units_or_bunch cerrado en {closed} SKU
            {closed === 1 ? '' : 's'} -&gt; +{result.nowPublishable ?? 0} publicable
            {(result.nowPublishable ?? 0) === 1 ? '' : 's'}
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          {result.reason === 'needs_units_value' ? 'Falta valor real' : 'Sin cierre de gate'}
        </div>
        <div className="text-sm text-amber-900 mt-1 leading-snug">
          {result.reason === 'needs_units_value'
            ? 'Estos SKU no se venden por stem -> carga stems_per_unit real (no se inventa).'
            : result.reason === 'no_units_gap_sku'
              ? 'Ya no hay SKU con el gate de units en este grupo. Nada que mover.'
              : result.reason === 'no_sku_for_group'
                ? 'Sin SKU para este grupo.'
                : `Cargado en ${result.unitsWritten ?? 0} SKU, gate sin cerrar (queda otro bloqueo).`}
        </div>
      </div>
    );
  }

  // box_dims / manual gaps: no executor button (would not move the metric here).
  if (applyKind !== 'units') {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {applyKind === 'box_dims' ? 'Dims de caja (box_master)' : 'Atributo manual'}
        </div>
        <div className="text-sm text-slate-600 mt-1 leading-snug">
          {applyKind === 'box_dims'
            ? 'El gap son dims FedEx de la caja: se cargan en box_master (fuera de este apply). Solo triage aca.'
            : 'Gap sin auto-apply: revisar/cargar manualmente. Solo triage aca.'}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Cargar units (1 accion -&gt; {varieties} variedad{varieties === 1 ? '' : 'es'})
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void apply(false)}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 rounded-xl shadow-sm transition-colors disabled:opacity-50"
        >
          {busy ? 'Aplicando...' : allStemSold ? 'Cargar stems_per_unit=1 (por stem)' : 'Cargar los por-stem (1 click)'}
        </button>
        {!allStemSold && (
          <>
            <input
              type="number"
              min={1}
              value={stems}
              onChange={(e) => setStems(e.target.value)}
              placeholder="stems/unit no-stem"
              className="w-36 text-sm rounded-lg border border-slate-200 px-2.5 py-2 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
            />
            <button
              type="button"
              disabled={busy || !Number.isFinite(parseInt(stems.trim(), 10)) || parseInt(stems.trim(), 10) <= 0}
              onClick={() => void apply(true)}
              className="text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 px-3.5 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              Cargar no-stem con valor
            </button>
          </>
        )}
      </div>
      <div className="text-[10px] text-slate-500 leading-snug">
        {allStemSold
          ? 'Venta por stem -> 1 stem por unidad es factual. Escribe dim_sku.stems_per_unit + cierra el gate.'
          : `${needsValueCount} SKU no-stem necesitan un valor real (no se inventa).`}
      </div>
      {error && <p className="text-[11px] text-red-600 font-mono break-words">{error}</p>}
    </div>
  );
}
