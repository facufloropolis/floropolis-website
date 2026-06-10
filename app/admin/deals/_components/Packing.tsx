// Packing -- stems per box vs capacity, with EDITABLE box info (stems/box + chargeable
// kg) per box type. Freight = chargeable_kg x rate/kg; boxes = ceil(used / stems-per-box).
// Facu's edits override box_master defaults so the freight reflects how the box is REALLY
// packed (a half-full box still ships at full freight; fewer stems/box => more boxes).
// v2 | 2026-06-10 | Job_PM (CPO) — editable box info per Facu.
'use client';

import type { BoxType } from '@/lib/deal/types';
import type { DealLineVM } from './types';

interface PackSummary {
  boxType: string; // raw label (or 'sin asignar')
  used: number;
  varieties: string[];
}

type BoxOverride = { stemsPerBox?: number; chargeableKg?: number };

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const money = (n: number) => '$' + n.toFixed(2);

export default function Packing({
  lines,
  boxTypes,
  overrides = {},
  onOverride,
  freightRatePerKg = 6.5,
}: {
  lines: DealLineVM[];
  boxTypes: BoxType[];
  overrides?: Record<string, BoxOverride>;
  onOverride?: (boxLabel: string, patch: BoxOverride) => void;
  freightRatePerKg?: number;
}) {
  // box_master defaults, keyed by normalized label (prefer non-null when labels collide).
  const capDefault = new Map<string, number | null>();
  const kgDefault = new Map<string, number | null>();
  const boxByLabel = new Map<string, BoxType>();
  for (const b of boxTypes) {
    const k = norm(b.boxType);
    if (!k) continue;
    if (b.stemsPerBox != null || !capDefault.has(k)) capDefault.set(k, b.stemsPerBox ?? capDefault.get(k) ?? null);
    if (b.chargeableKg != null || !kgDefault.has(k)) kgDefault.set(k, b.chargeableKg ?? kgDefault.get(k) ?? null);
    // Prefer the row that has FedEx-verified dims when a label collides across vendors.
    const prev = boxByLabel.get(k);
    if (!prev || ((b.verifiedLabels ?? 0) > (prev.verifiedLabels ?? 0))) boxByLabel.set(k, b);
  }

  const byBox = new Map<string, PackSummary>();
  for (const l of lines) {
    const key = l.boxType ?? 'sin asignar';
    const cur = byBox.get(key) ?? { boxType: key, used: 0, varieties: [] };
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
            Stems por caja + flete (editable). El flete viaja por CAJA: {money(freightRatePerKg)}/kg chargeable.
          </p>
        </div>
      </header>

      <div className="px-5 py-4">
        {packs.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-slate-400">Asigna cajas a las variedades para ver el packing.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {packs.map((p) => {
              const unassigned = p.boxType === 'sin asignar';
              const k = norm(p.boxType);
              const ov = overrides[k] ?? {};
              const defCap = capDefault.get(k) ?? null;
              const defKg = kgDefault.get(k) ?? null;
              const effCap = ov.stemsPerBox ?? defCap;
              const effKg = ov.chargeableKg ?? defKg;

              const cap = effCap ?? 0;
              const free = cap > 0 ? cap - (p.used % cap || (p.used > 0 ? cap : 0)) : null;
              const lastFill = cap > 0 ? (p.used % cap === 0 ? cap : p.used % cap) : 0;
              const pct = cap > 0 ? Math.min(100, Math.round((lastFill / cap) * 100)) : 0;
              const nBoxes = cap > 0 ? Math.ceil(p.used / cap) : 0;
              const perBoxFreight = effKg != null && effKg > 0 ? effKg * freightRatePerKg : null;
              const groupFreight = perBoxFreight != null && nBoxes > 0 ? perBoxFreight * nBoxes : null;

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
                  ) : (
                    <>
                      {/* FedEx-VERIFIED dims + tag. Komet (K2K) dims were wrong and inflate
                          freight badly, so we surface exact dims + verified provenance. */}
                      {(() => {
                        const box = boxByLabel.get(k);
                        const dims =
                          box && box.lengthCm != null && box.widthCm != null && box.heightCm != null
                            ? `${box.lengthCm}×${box.widthCm}×${box.heightCm} cm`
                            : null;
                        const verified = (box?.verifiedLabels ?? 0) > 0 && dims != null;
                        // Komet dim weight wildly above the FedEx chargeable => the K2K dims are wrong.
                        const komet = box?.kometDimWeightKg ?? null;
                        const mismatch =
                          komet != null && effKg != null && effKg > 0 && komet > effKg * 1.4;
                        return (
                          <div className="mt-2 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="text-slate-500">
                                Dims: <span className="font-medium text-slate-700">{dims ?? 'sin dims'}</span>
                                {effKg != null && <span className="text-slate-400"> &middot; {effKg}kg</span>}
                              </span>
                              {verified ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"
                                  title={box?.fedexSource ?? 'FedEx labels'}
                                >
                                  &#10003; FedEx verificado{box?.verifiedLabels ? ` (${box.verifiedLabels})` : ''}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                  &#9888; sin verificar &mdash; revisar dims
                                </span>
                              )}
                            </div>
                            {mismatch && (
                              <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700">
                                &#9888; Komet (K2K) marca {komet!.toFixed(1)}kg vs FedEx {effKg}kg &mdash; las dims de Komet
                                estaban mal e inflan el flete. Se usa la verificada de FedEx.
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* EDITABLE box info */}
                      {onOverride && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-slate-50 px-2.5 py-2">
                          <label className="flex items-center gap-1 text-[11px] text-slate-500">
                            Stems/caja
                            <input
                              type="number"
                              min={1}
                              value={ov.stemsPerBox ?? ''}
                              placeholder={defCap != null ? String(defCap) : '--'}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                onOverride(p.boxType, { stemsPerBox: v === '' ? undefined : Math.max(1, Math.floor(+v)) });
                              }}
                              className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5 text-right text-[12px] tabular-nums outline-none focus:border-emerald-500"
                            />
                          </label>
                          <label className="flex items-center gap-1 text-[11px] text-slate-500">
                            Kg flete
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={ov.chargeableKg ?? ''}
                              placeholder={defKg != null ? String(defKg) : 'dims?'}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                onOverride(p.boxType, { chargeableKg: v === '' ? undefined : Math.max(0, +v) });
                              }}
                              className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5 text-right text-[12px] tabular-nums outline-none focus:border-emerald-500"
                            />
                          </label>
                          {(ov.stemsPerBox != null || ov.chargeableKg != null) && (
                            <button
                              type="button"
                              onClick={() => onOverride(p.boxType, { stemsPerBox: undefined, chargeableKg: undefined })}
                              className="text-[10px] text-slate-400 underline hover:text-slate-600"
                            >
                              reset
                            </button>
                          )}
                        </div>
                      )}

                      {effCap == null ? (
                        <p className="mt-2 text-[12px] text-slate-400">
                          {p.used} stems &middot; capacidad no esta en box_master &mdash; edita stems/caja arriba.
                        </p>
                      ) : (
                        <>
                          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full bg-emerald-500" style={{ width: pct + '%' }} />
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                            <span>
                              {p.used} stems &middot; {nBoxes} caja{nBoxes === 1 ? '' : 's'} de {cap}
                            </span>
                            <span className="tabular-nums">
                              {groupFreight != null
                                ? `flete ${money(groupFreight)}`
                                : effKg == null
                                  ? 'flete: falta kg'
                                  : '--'}
                            </span>
                          </div>
                          {perBoxFreight != null && (
                            <div className="mt-0.5 text-[10px] text-slate-400">
                              {money(perBoxFreight)}/caja &middot; {money(p.used > 0 ? (groupFreight ?? 0) / p.used : 0)}/stem
                            </div>
                          )}
                        </>
                      )}
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
