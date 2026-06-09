// NewVarietyLineCapture -- after the canonical VarietyUpsert sends a PROPOSAL to the
// approval queue (it returns only a proposalId), this thin form lets the seller drop
// that just-created variety into the deal as a LINE (brief req 4: "appends as a line").
// Cost/source/disposition are captured here for the line economics; the canonical
// proposal is the authority for the catalog write.
// v1 | 2026-06-09 | Job_PM (CPO)
'use client';

import { useState } from 'react';
import { GPM_FLOOR } from '@/lib/deal/types';
import type { LineDisposition } from './types';

export interface NewVarietyLine {
  variety: string;
  grade: string | null;
  costPerStem: number;
  floorPerStem: number;
  source: string | null;
  disposition: LineDisposition;
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 ' +
  'shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';

export default function NewVarietyLineCapture({ onAddLine }: { onAddLine: (l: NewVarietyLine) => void }) {
  const [variety, setVariety] = useState('');
  const [grade, setGrade] = useState('');
  const [cost, setCost] = useState('');
  const [source, setSource] = useState('');
  const [disposition, setDisposition] = useState<LineDisposition>('one_off');

  const costNum = parseFloat(cost);
  const costValid = Number.isFinite(costNum) && costNum > 0;
  const ready = variety.trim() !== '' && costValid;
  const floorPerStem = costValid ? +(costNum / (1 - GPM_FLOOR)).toFixed(4) : 0;

  function add() {
    if (!ready) return;
    onAddLine({
      variety: variety.trim(),
      grade: grade.trim() || null,
      costPerStem: costNum,
      floorPerStem,
      source: source.trim() || null,
      disposition,
    });
    setVariety('');
    setGrade('');
    setCost('');
    setSource('');
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/40 p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
        Agregar esa variedad como linea del deal
      </div>
      <p className="mb-2 mt-0.5 text-[11px] text-slate-500">
        El editor de arriba manda la propuesta a la cola. Aca la sumas como linea de este deal (costo + disposicion).
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        <input className={inputCls} value={variety} onChange={(e) => setVariety(e.target.value)} placeholder="Variedad" />
        <input className={inputCls} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade" />
        <input
          className={inputCls}
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="Costo/stem"
          inputMode="decimal"
        />
        <input className={inputCls} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source" />
        <select className={inputCls} value={disposition} onChange={(e) => setDisposition(e.target.value as LineDisposition)}>
          <option value="one_off">one-off</option>
          <option value="tier">tier -&gt; canonical</option>
          <option value="temp_promo">promo temporal</option>
        </select>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[11px] text-slate-500">
          {costValid ? (
            <>
              Floor: <span className="font-medium tabular-nums text-slate-700">${floorPerStem.toFixed(2)}</span>/stem
            </>
          ) : (
            'Ingresa el costo/stem para calcular el floor.'
          )}
        </span>
        <button
          type="button"
          onClick={add}
          disabled={!ready}
          className={
            'rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-sm transition ' +
            (ready ? 'bg-emerald-600 hover:bg-emerald-700' : 'cursor-not-allowed bg-slate-300')
          }
        >
          Agregar linea &rarr;
        </button>
      </div>
    </div>
  );
}
