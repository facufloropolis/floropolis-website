// PriceRail -- sticky right rail: cost build-up, price slider that CANNOT go below
// floor = totalCost / (1 - GPM_FLOOR), live GPM. Mirrors the server floor in save.ts.
// v1 | 2026-06-09 | Job_PM (CPO)
'use client';

import { GPM_FLOOR } from '@/lib/deal/types';
import type { DealLineVM } from './types';

function money(n: number) {
  return '$' + n.toFixed(2);
}

export default function PriceRail({
  lines,
  price,
  onPriceChange,
}: {
  lines: DealLineVM[];
  price: number;
  onPriceChange: (p: number) => void;
}) {
  const totalStems = lines.reduce((s, l) => s + l.stems, 0);
  const totalCost = lines.reduce((s, l) => s + l.stems * l.costPerStem, 0);
  const floor = totalCost / (1 - GPM_FLOOR);
  const gpm = price > 0 ? (1 - totalCost / price) * 100 : 0;
  const belowFloor = price < floor - 1e-9;

  // Slider bounds: floor at the bottom, generous headroom at the top.
  const sliderMin = Math.ceil(floor * 100) / 100;
  const sliderMax = Math.max(floor * 2.5, floor + 50, price + 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h3 className="text-sm font-semibold text-slate-800">Precio del deal</h3>
        <p className="mt-0.5 text-[12px] text-slate-500">por entrega &middot; {totalStems} stems</p>
      </div>

      <div className="px-5 py-4">
        {/* Cost build-up per line */}
        <dl className="space-y-1.5 text-[13px]">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between text-slate-500">
              <dt className="truncate pr-2">
                {l.variety} <span className="text-slate-400">({l.stems} stems)</span>
              </dt>
              <dd className="shrink-0 tabular-nums">{money(l.stems * l.costPerStem)}</dd>
            </div>
          ))}
          {lines.length === 0 && <div className="text-slate-400">Sin lineas todavia.</div>}
          <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 font-medium text-slate-700">
            <dt>Costo armado total</dt>
            <dd className="tabular-nums">{money(totalCost)}</dd>
          </div>
        </dl>

        {/* Big price + slider */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-end justify-between">
            <span className="text-[12px] text-slate-500">Precio final</span>
            <span className={'text-3xl font-bold tabular-nums ' + (belowFloor ? 'text-rose-600' : 'text-emerald-700')}>
              {money(price)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>{totalStems > 0 ? money(price / totalStems) + '/stem' : '--/stem'}</span>
            <span
              className={
                'rounded-full border px-2 py-0.5 font-medium ' +
                (belowFloor ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')
              }
            >
              GPM {gpm.toFixed(1)}%
            </span>
          </div>

          <input
            type="range"
            min={sliderMin}
            max={Math.ceil(sliderMax)}
            step={0.5}
            value={Math.max(price, sliderMin)}
            onChange={(e) => onPriceChange(Math.max(floor, +e.target.value))}
            className="mt-3 w-full accent-emerald-600"
            disabled={totalCost <= 0}
          />
          <div className="mt-1 flex justify-between text-[11px] text-slate-500">
            <span>Floor {money(floor)}</span>
            <span>{money(Math.ceil(sliderMax))}</span>
          </div>

          {/* Manual numeric entry, also clamped to floor */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Precio exacto</span>
            <input
              type="number"
              step={0.01}
              min={floor}
              value={price}
              onChange={(e) => onPriceChange(Math.max(floor, +e.target.value))}
              className="w-28 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            El floor = costo / (1 - {(GPM_FLOOR * 100).toFixed(0)}%). El GPM {(GPM_FLOOR * 100).toFixed(0)}% cubre la comision
            de ventas. El control no baja del floor; el server tambien lo valida.
          </p>
          {belowFloor && (
            <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              Bajo el floor -- bloqueado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
