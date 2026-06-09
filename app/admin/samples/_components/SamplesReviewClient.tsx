// SamplesReviewClient -- orchestrates the Facu sample-review surface: the quick
// list (left) + the deep-dive of the selected sample (right). Selection is local
// state; rows arrive fully hydrated (timeline included) from the server page.
// v1 | 2026-06-09 | Job_PM (CPO)
'use client';

import { useState } from 'react';
import type { SampleReviewRow } from './types';
import SampleReviewList from './SampleReviewList';
import SampleDeepDive from './SampleDeepDive';

export default function SamplesReviewClient({ rows }: { rows: SampleReviewRow[] }) {
  const firstId = rows.length > 0 ? rows[0].leadMasterId : null;
  const [selectedId, setSelectedId] = useState<number | null>(firstId);

  const selected =
    rows.find((r) => r.leadMasterId === selectedId) ?? (rows.length > 0 ? rows[0] : null);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
        <div className="text-slate-300 text-3xl mb-2" aria-hidden>
          &#9711;
        </div>
        <h2 className="text-base font-semibold text-slate-700">
          Sin samples en review hoy
        </h2>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
          El cohorte de hoy esta vacio (SB_READY = 0). No se fabrican tarjetas &mdash;
          cuando JJ proponga un sample para dispatch, aparece aca.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-4">
      <div className="min-w-0">
        <SampleReviewList rows={rows} onSelect={(id) => setSelectedId(id)} />
      </div>
      <div className="min-w-0">
        {selected ? (
          <SampleDeepDive row={selected} />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-400">
            Elegi un sample para ver el detalle.
          </div>
        )}
      </div>
    </div>
  );
}
