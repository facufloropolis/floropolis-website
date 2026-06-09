// Packing -- summarize stems per box vs box capacity (stemsPerBox).
// Aggregates the deal lines by boxType, draws a fill bar against capacity.
// v1 | 2026-06-09 | Job_PM (CPO)
'use client';

import type { BoxType } from '@/lib/deal/types';
import type { DealLineVM } from './types';

interface PackSummary {
  boxType: string;
  used: number;
  capacity: number | null;
  varieties: string[];
}

export default function Packing({ lines, boxTypes }: { lines: DealLineVM[]; boxTypes: BoxType[] }) {
  const capByBox = new Map<string, number | null>();
  for (const b of boxTypes) capByBox.set(b.boxType, b.stemsPerBox);

  const byBox = new Map<string, PackSummary>();
  for (const l of lines) {
    const key = l.boxType ?? 'sin asignar';
    const cur = byBox.get(key) ?? {
      boxType: key,
      used: 0,
      capacity: key === 'sin asignar' ? null : capByBox.get(key) ?? null,
      varieties: [],
    };
    cur.used += l.stems;
    if (l.stems > 0 || l.variety) cur.varieties.push(`${l.variety}${l.stems ? ` ${l.stems}` : ''}`);
    byBox.set(key, cur);
  }
  const packs = Array.from(byBox.values());

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-3.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[13px] font-semibold text-white">
          2
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Packing en cajas</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Cuantos stems entran en cada caja vs su capacidad. Crea una caja nueva abajo si no entra.
          </p>
        </div>
      </header>

      <div className="px-5 py-4">
        {packs.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-slate-400">Asigna cajas a las variedades para ver el packing.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {packs.map((p) => {
              const cap = p.capacity ?? 0;
              const free = cap > 0 ? cap - p.used : null;
              const pct = cap > 0 ? Math.min(100, Math.round((p.used / cap) * 100)) : 0;
              const over = cap > 0 && p.used > cap;
              const unassigned = p.boxType === 'sin asignar';
              return (
                <div
                  key={p.boxType}
                  className={'rounded-xl border bg-white p-3.5 ' + (unassigned ? 'border-amber-200' : 'border-slate-200')}
                >
                  <div className="flex items-center justify-between">
                    <span className={'font-semibold ' + (unassigned ? 'text-amber-700' : 'text-slate-800')}>{p.boxType}</span>
                    <span className="text-[12px] text-slate-500">{p.varieties.length} variedad(es)</span>
                  </div>
                  <div className="mt-1 truncate text-[12px] text-slate-500">{p.varieties.join(' + ') || '--'}</div>
                  {unassigned ? (
                    <p className="mt-2 text-[12px] text-amber-600">Estas variedades no tienen caja asignada.</p>
                  ) : p.capacity === null ? (
                    <p className="mt-2 text-[12px] text-slate-400">
                      {p.used} stems &middot; capacidad de esta caja no esta en box_master (--)
                    </p>
                  ) : (
                    <>
                      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={'h-full ' + (over ? 'bg-rose-500' : free === 0 ? 'bg-emerald-600' : 'bg-emerald-400')}
                          style={{ width: pct + '%' }}
                        />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">
                          {p.used} / {cap} stems
                        </span>
                        <span
                          className={
                            over
                              ? 'font-medium text-rose-600'
                              : free === 0
                                ? 'font-medium text-emerald-700'
                                : 'text-amber-600'
                          }
                        >
                          {over ? `sobran ${p.used - cap}` : free === 0 ? 'lleno' : `${free} libres`}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
