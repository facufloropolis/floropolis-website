'use client';
// StructuralBlockersPanel — muestra bloqueadores estructurales fuera del motor
// v1 | 2026-06-15 | Job_PM (CPO)
//
// Dos tipos de bloqueador:
//   1. Magic Flowers 1/8 box: clave de caja incorrecta -> 19 SKUs sin precio
//   2. Flodecol Gypsophila: capacity_unit_mismatch=true -> 33 SKUs sin precio
//
// Visible solo cuando hay bloqueadores. No renderiza nada si ambos son null.

import { useState } from 'react';

interface MagicFlowersBlocker {
  skuCount: number;
  currentStemsPerBox: number;
  boxKey: string;
}

interface FlodecolBlocker {
  skuCount: number;
  noImageCount: number;
  skuIds: string[];
}

interface Props {
  magicFlowers: MagicFlowersBlocker | null;
  flodecol: FlodecolBlocker | null;
}

type FixState = 'idle' | 'loading' | 'done' | 'error';

interface MFResult {
  updatedRows: number;
  skusNowPriced: number | null;
}

export default function StructuralBlockersPanel({ magicFlowers, flodecol }: Props) {
  // Nothing to show if both blockers are absent.
  if (!magicFlowers && !flodecol) return null;

  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
          Bloqueadores estructurales
        </span>
        <span className="text-[10px] tabular-nums text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
          fuera del motor
        </span>
      </div>

      {magicFlowers && <MagicFlowersCard blocker={magicFlowers} />}
      {flodecol && <FlodecolCard blocker={flodecol} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Magic Flowers card
// ---------------------------------------------------------------------------

function MagicFlowersCard({ blocker }: { blocker: MagicFlowersBlocker }) {
  const [stems, setStems] = useState<number | ''>(blocker.currentStemsPerBox);
  const [state, setState] = useState<FixState>('idle');
  const [result, setResult] = useState<MFResult | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function handleApply() {
    if (stems === '' || stems < 1 || stems > 500) return;
    setState('loading');
    setErrMsg(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/supply/fix-magic-flowers-box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stemsPerBox: stems }),
      });
      const json = (await res.json()) as { ok?: boolean; updatedRows?: number; skusNowPriced?: number | null; error?: string; detail?: string };
      if (!res.ok || !json.ok) {
        setErrMsg(json.detail ?? json.error ?? 'Error desconocido');
        setState('error');
        return;
      }
      setResult({ updatedRows: json.updatedRows ?? 0, skusNowPriced: json.skusNowPriced ?? null });
      setState('done');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Error de red');
      setState('error');
    }
  }

  return (
    <article className="rounded-2xl border border-red-200 bg-red-50/40 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            Magic Flowers: caja 1/8 -- clave incorrecta
          </h3>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-red-800 bg-red-100 border border-red-200 rounded-full px-2 py-0.5">
            {blocker.skuCount} SKU sin precio
          </span>
        </div>
        <p className="text-sm text-slate-700 mt-2 leading-relaxed">
          Magic Flowers: {blocker.skuCount} SKUs sin precio porque{' '}
          <code className="text-xs bg-slate-100 border border-slate-200 rounded px-1 py-0.5">
            box_type=&apos;1/8&apos;
          </code>{' '}
          no matchea{' '}
          <code className="text-xs bg-slate-100 border border-slate-200 rounded px-1 py-0.5">
            legacy_box_type=&apos;{blocker.boxKey}&apos;
          </code>{' '}
          en{' '}
          <code className="text-xs bg-slate-100 border border-slate-200 rounded px-1 py-0.5">
            box_master_mirror
          </code>
          . El join falla, no hay dims, precio queda null.
        </p>
        <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
          Ademas{' '}
          <code className="text-xs bg-slate-100 border border-slate-200 rounded px-1 py-0.5">
            stems_per_box={blocker.currentStemsPerBox}
          </code>{' '}
          -- valor actual sospechoso. Ingresar la cantidad real confirmada con Facu/Alvar:
        </p>
      </div>

      <div className="px-5 pb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label
              htmlFor="mf-stems"
              className="text-xs font-semibold text-slate-600 whitespace-nowrap"
            >
              stems por caja:
            </label>
            <input
              id="mf-stems"
              type="number"
              min={1}
              max={500}
              step={1}
              value={stems}
              disabled={state === 'loading' || state === 'done'}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setStems(Number.isFinite(v) ? v : '');
              }}
              className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>
          <button
            type="button"
            disabled={
              state === 'loading' ||
              state === 'done' ||
              stems === '' ||
              stems < 1 ||
              stems > 500
            }
            onClick={() => { void handleApply(); }}
            className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state === 'loading' ? 'Aplicando...' : 'Aplicar correccion'}
          </button>
        </div>

        {state === 'done' && result && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
            Corregido -- {result.updatedRows} fila{result.updatedRows === 1 ? '' : 's'} actualizada{result.updatedRows === 1 ? '' : 's'}.
            {result.skusNowPriced !== null && (
              <> {result.skusNowPriced} SKU{result.skusNowPriced === 1 ? '' : 's'} de Magic Flowers ahora con precio.</>
            )}
          </div>
        )}

        {state === 'error' && errMsg && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
            Error: {errMsg}
          </div>
        )}
      </div>

      <div className="px-5 pb-3 border-t border-red-100">
        <p className="text-[11px] text-slate-500 mt-2 leading-snug">
          Fix: UPDATE box_master_mirror SET legacy_box_type=&apos;1/8&apos;, stems_per_box=N WHERE vendor=&apos;Magic Flowers&apos; AND legacy_box_type=&apos;1/8-MF&apos;.
          Despues del fix el join funciona, dims disponibles, precio computable, {blocker.skuCount} SKUs se desbloquean.
        </p>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Flodecol card
// ---------------------------------------------------------------------------

type FlodecolState = 'idle' | 'loading' | 'done' | 'error';

function FlodecolCard({ blocker }: { blocker: FlodecolBlocker }) {
  const [state, setState] = useState<FlodecolState>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function handleNotifyRose() {
    setState('loading');
    setErrMsg(null);
    try {
      const res = await fetch('/api/admin/catalog/config/flag-rose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_id: 'BATCH:Flodecol:Gypsophila',
          reason_code: 'data_quality',
          reason_text:
            `BATCH ${blocker.skuCount} SKUs Flodecol Gypsophila Tinted: capacity_unit_mismatch=true porque size_grams IS NOT NULL + selling_unit=stem. ` +
            `Facu confirma que se venden por stem. Corregir: clear size_grams en dim_sku para vendor=Flodecol category=Gypsophila. ` +
            `Desbloquearia ${blocker.skuCount} SKUs (${blocker.noImageCount} sin imagen = publicables inmediato).`,
        }),
      });
      const json = (await res.json()) as { row?: unknown; error?: string; detail?: string };
      if (!res.ok || !json.row) {
        setErrMsg(json.detail ?? json.error ?? 'Error desconocido');
        setState('error');
        return;
      }
      setState('done');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Error de red');
      setState('error');
    }
  }

  return (
    <article className="rounded-2xl border border-amber-200 bg-amber-50/40 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            Flodecol Gypsophila Tinted -- mismatch de unidad de capacidad
          </h3>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
            {blocker.skuCount} SKU sin precio
          </span>
          {blocker.noImageCount > 0 && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
              {blocker.noImageCount} sin imagen
            </span>
          )}
        </div>
        <p className="text-sm text-slate-700 mt-2 leading-relaxed">
          {blocker.skuCount} SKUs ({blocker.noImageCount} sin imagen) bloqueados porque tienen{' '}
          <code className="text-xs bg-slate-100 border border-slate-200 rounded px-1 py-0.5">
            size_grams IS NOT NULL
          </code>{' '}
          y{' '}
          <code className="text-xs bg-slate-100 border border-slate-200 rounded px-1 py-0.5">
            selling_unit=&apos;stem&apos;
          </code>
          , lo que activa{' '}
          <code className="text-xs bg-slate-100 border border-slate-200 rounded px-1 py-0.5">
            capacity_unit_mismatch=true
          </code>{' '}
          en la vista y hace precio null.
        </p>
        <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
          Si se venden por stem (igual que el resto de Gypsophila), Rose puede corregir{' '}
          <code className="text-xs bg-slate-100 border border-slate-200 rounded px-1 py-0.5">
            dim_sku.size_grams
          </code>{' '}
          -- limpiar ese campo desbloquea los {blocker.skuCount} SKUs. Confirmar para notificar a Rose:
        </p>
      </div>

      <div className="px-5 pb-4">
        <button
          type="button"
          disabled={state === 'loading' || state === 'done'}
          onClick={() => { void handleNotifyRose(); }}
          className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state === 'loading'
            ? 'Enviando...'
            : 'Si, se vende por stem -- notificar a Rose'}
        </button>

        {state === 'done' && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
            Rose notificada. Cuando corrija, {blocker.skuCount} SKUs se desbloquean
            {blocker.noImageCount > 0 && ` (${blocker.noImageCount} sin imagen seran publicables de inmediato)`}.
          </div>
        )}

        {state === 'error' && errMsg && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
            Error: {errMsg}
          </div>
        )}
      </div>

      <div className="px-5 pb-3 border-t border-amber-100">
        <p className="text-[11px] text-slate-500 mt-2 leading-snug">
          Fix (Rose): clear size_grams en dim_sku WHERE vendor=&apos;Flodecol&apos; AND category=&apos;Gypsophila&apos;.
          El motor lo detecta en el siguiente ciclo y remueve capacity_unit_mismatch=true.
        </p>
      </div>
    </article>
  );
}
