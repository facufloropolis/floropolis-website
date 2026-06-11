'use client';
// PriceSnapshotPanel — alert + action when price_history is empty after a GPM change.
// v1 | 2026-06-11 | Job_PM
//
// Props:
//   priceHistoryCount  number   — rows currently in price_history (0 = loop dead)
//   currentGpm         number   — value_numeric of gpm_target from pricing_constants

import React, { useState } from 'react';

interface SnapshotResult {
  snapshotted: number;
  avg_price: number | null;
  gpm_used: number;
  captured_at: string;
  sample_rows: {
    sku_id: string;
    name: string | null;
    farm_cost: number | null;
    computed_price: number | null;
    gpm: number;
  }[];
  error?: string;
  detail?: string;
}

interface Props {
  priceHistoryCount: number;
  currentGpm: number | null;
}

export default function PriceSnapshotPanel({ priceHistoryCount, currentGpm }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SnapshotResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const loopDead = priceHistoryCount === 0;

  async function handleSnapshot() {
    setLoading(true);
    setApiError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/catalog/config/price-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = (await res.json()) as SnapshotResult;
      if (!res.ok) {
        setApiError(json.detail ?? json.error ?? `Error ${res.status}`);
      } else {
        setResult(json);
      }
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      setLoading(false);
    }
  }

  const gpmDisplay = currentGpm != null ? `${(currentGpm * 100).toFixed(0)}%` : '-';
  const countDisplay = priceHistoryCount === 0 ? '0' : String(priceHistoryCount);

  return (
    <div className="mb-5 space-y-3">
      {/* Alert banner */}
      {loopDead && !result && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <span className="mt-0.5 text-amber-600 text-base font-bold shrink-0">!</span>
          <div>
            <p className="text-sm font-semibold text-amber-900">
              GPM cambio a {gpmDisplay} el 08-jun -- price_history vacia ({countDisplay} snapshots). El loop de precio esta muerto.
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Sin snapshots, no hay baseline historico. Los cambios de GPM no tienen antes/despues verificable.
            </p>
          </div>
        </div>
      )}

      {/* Already has rows — informational only */}
      {!loopDead && !result && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="mt-0.5 text-emerald-600 text-base font-bold shrink-0">OK</span>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              price_history tiene {countDisplay} snapshots. GPM activo: {gpmDisplay}.
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Podes tomar un nuevo snapshot para capturar el estado actual con el GPM vigente.
            </p>
          </div>
        </div>
      )}

      {/* Action button */}
      {!result && (
        <button
          onClick={() => void handleSnapshot()}
          disabled={loading}
          className={
            'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ' +
            (loading
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800')
          }
        >
          {loading ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Tomando snapshot...
            </>
          ) : (
            'Tomar snapshot de precios ahora'
          )}
        </button>
      )}

      {/* Error */}
      {apiError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">Error:</span> {apiError}
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 space-y-3">
          <p className="text-sm font-semibold text-emerald-900">
            Snapshot tomado: {result.snapshotted} SKUs
            {result.avg_price != null ? ` · precio promedio $${result.avg_price.toFixed(2)}` : ''}
            {' · '}
            <span className="text-emerald-700">loop de precio VIVO</span>
          </p>
          <p className="text-xs text-emerald-700">
            GPM usado: {result.gpm_used != null ? `${(result.gpm_used * 100).toFixed(0)}%` : '-'} ·
            Capturado: {new Date(result.captured_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
          {result.sample_rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-emerald-200 rounded-lg overflow-hidden">
                <thead className="bg-emerald-100 text-emerald-800">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-semibold">SKU</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Nombre</th>
                    <th className="px-3 py-1.5 text-right font-semibold">farm_cost</th>
                    <th className="px-3 py-1.5 text-right font-semibold">precio</th>
                    <th className="px-3 py-1.5 text-right font-semibold">GPM</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-emerald-100">
                  {result.sample_rows.map((r) => (
                    <tr key={r.sku_id}>
                      <td className="px-3 py-1.5 font-mono text-slate-500">{r.sku_id.slice(0, 8)}...</td>
                      <td className="px-3 py-1.5 text-slate-700">{r.name ?? '-'}</td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {r.farm_cost != null ? `$${r.farm_cost.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-emerald-700">
                        {r.computed_price != null ? `$${r.computed_price.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {(r.gpm * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-emerald-600 mt-1">Mostrando {result.sample_rows.length} de {result.snapshotted} SKUs</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
