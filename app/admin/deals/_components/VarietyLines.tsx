// VarietyLines -- editable table of deal lines + "add existing variety" search.
// Cols: variety, grade, stems (input), box (select), cost/stem, floor/stem,
// price/stem (input), disposition. price/stem is visually flagged below floor.
// "+ existing variety" hits /api/admin/deals/varieties?q=.
// v1 | 2026-06-09 | Job_PM (CPO)
'use client';

import { useEffect, useRef, useState } from 'react';
import type { BoxType, CatalogVariety } from '@/lib/deal/types';
import type { DealLineVM, LineDisposition } from './types';

function money(n: number) {
  return '$' + n.toFixed(2);
}

const DISP_STYLE: Record<LineDisposition, string> = {
  catalogo: 'border-slate-200 bg-slate-50 text-slate-600',
  one_off: 'border-sky-200 bg-sky-50 text-sky-700',
  tier: 'border-amber-200 bg-amber-50 text-amber-700',
  temp_promo: 'border-violet-200 bg-violet-50 text-violet-700',
};
const DISP_LABEL: Record<LineDisposition, string> = {
  catalogo: 'catalogo',
  one_off: 'one-off',
  tier: 'tier -> canonical',
  temp_promo: 'promo temporal',
};

export default function VarietyLines({
  lines,
  boxTypes,
  onChangeLine,
  onRemoveLine,
  onAddExisting,
}: {
  lines: DealLineVM[];
  boxTypes: BoxType[];
  onChangeLine: (id: string, patch: Partial<DealLineVM>) => void;
  onRemoveLine: (id: string) => void;
  onAddExisting: (v: CatalogVariety) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-3.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[13px] font-semibold text-white">
          1
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Variedades del box</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Costo de catalogo -&gt; precio que baja hasta el floor. El precio/stem no puede bajar del floor.
          </p>
        </div>
      </header>

      <div className="px-5 py-4">
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">Variedad</th>
                <th className="px-3 py-2.5 text-center font-medium">Tier</th>
                <th className="px-3 py-2.5 text-center font-medium">Grade</th>
                <th className="px-3 py-2.5 text-center font-medium">Stems</th>
                <th className="px-3 py-2.5 text-center font-medium">Caja</th>
                <th className="px-3 py-2.5 text-right font-medium">Costo/stem</th>
                <th className="px-3 py-2.5 text-right font-medium">Floor/stem</th>
                <th className="px-3 py-2.5 text-right font-medium">Precio/stem</th>
                <th className="px-3 py-2.5 text-center font-medium">Disposicion</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-[13px] text-slate-400">
                    Sin variedades. Agrega una existente o crea una nueva abajo.
                  </td>
                </tr>
              )}
              {lines.map((l) => {
                const below = l.pricePerStem < l.floorPerStem;
                return (
                  <tr key={l.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 text-left">
                      <span className={l.isNewVariety ? 'font-medium text-emerald-700' : 'font-medium text-slate-800'}>
                        {l.variety}
                      </span>
                      {l.isNewVariety && (
                        <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                          nueva
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {l.tier ? (
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">{l.tier}</span>
                      ) : (
                        <span className="text-slate-400">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-600">{l.grade || '--'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        min={0}
                        value={l.stems}
                        onChange={(e) => onChangeLine(l.id, { stems: Math.max(0, +e.target.value) })}
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <select
                        value={l.boxType ?? ''}
                        onChange={(e) => onChangeLine(l.id, { boxType: e.target.value || null })}
                        className="max-w-[140px] rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      >
                        <option value="">sin asignar</option>
                        {boxTypes.map((b) => (
                          <option key={b.boxType} value={b.boxType}>
                            {b.boxType}
                          </option>
                        ))}
                        {l.boxType && !boxTypes.some((b) => b.boxType === l.boxType) && (
                          <option value={l.boxType}>{l.boxType}</option>
                        )}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{money(l.costPerStem)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{money(l.floorPerStem)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={l.pricePerStem}
                        onChange={(e) => onChangeLine(l.id, { pricePerStem: Math.max(0, +e.target.value) })}
                        className={
                          'w-24 rounded-md border px-2 py-1 text-right text-sm tabular-nums outline-none focus:ring-2 ' +
                          (below
                            ? 'border-rose-300 bg-rose-50 text-rose-700 focus:border-rose-400 focus:ring-rose-100'
                            : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-100')
                        }
                      />
                      {below && <div className="mt-0.5 text-[10px] text-rose-600">bajo floor</div>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <select
                        value={l.disposition}
                        onChange={(e) => onChangeLine(l.id, { disposition: e.target.value as LineDisposition })}
                        className={
                          'rounded-full border px-2 py-0.5 text-[11px] font-medium outline-none ' +
                          DISP_STYLE[l.disposition]
                        }
                      >
                        {(Object.keys(DISP_LABEL) as LineDisposition[]).map((d) => (
                          <option key={d} value={d}>
                            {DISP_LABEL[d]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => onRemoveLine(l.id)}
                        aria-label="Quitar linea"
                        className="text-slate-300 transition hover:text-rose-500"
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3">
          {!searchOpen ? (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              + Variedad existente (catalogo)
            </button>
          ) : (
            <ExistingVarietySearch
              onPick={(v) => {
                onAddExisting(v);
                setSearchOpen(false);
              }}
              onClose={() => setSearchOpen(false)}
            />
          )}
          <span className="ml-2 self-center text-[12px] text-slate-400">o crea una nueva abajo (aparece como linea aca)</span>
        </div>
      </div>
    </section>
  );
}

function ExistingVarietySearch({
  onPick,
  onClose,
}: {
  onPick: (v: CatalogVariety) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CatalogVariety[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/deals/varieties?q=${encodeURIComponent(q.trim())}`);
        const data = res.ok ? ((await res.json()) as CatalogVariety[]) : [];
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  return (
    <div className="mt-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar variedad en catalogo..."
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
        <button type="button" onClick={onClose} className="px-2 text-[12px] text-slate-400 hover:text-slate-600">
          cerrar
        </button>
      </div>
      <ul className="mt-1 max-h-56 overflow-auto">
        {loading && <li className="px-2 py-2 text-center text-[13px] text-slate-400">Buscando...</li>}
        {!loading &&
          results.map((v, i) => (
            <li key={`${v.variety}-${v.grade ?? ''}-${i}`}>
              <button
                type="button"
                onClick={() => onPick(v)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-slate-50"
              >
                <span>
                  <span className="font-medium text-slate-800">{v.variety}</span>
                  {v.grade && <span className="ml-2 text-[12px] text-slate-400">{v.grade}</span>}
                </span>
                <span className="text-[11px] tabular-nums text-slate-500">
                  costo {v.farmCost != null ? money(v.farmCost) : '--'} &middot; floor{' '}
                  {v.priceFloor != null ? money(v.priceFloor) : '--'}
                </span>
              </button>
            </li>
          ))}
        {!loading && results.length === 0 && (
          <li className="px-2 py-2 text-center text-[13px] text-slate-400">Sin resultados</li>
        )}
      </ul>
    </div>
  );
}
