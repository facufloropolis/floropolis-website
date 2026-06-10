// Loop & Learning panel — the VISIBLE improvement curve of the Supply Engine.
// v1 | 2026-06-10 | Job_PM (CPO)
//
// HARD BAR (Facu): the engine must get BETTER proposal-by-proposal, not just
// apply a click. This server component renders the proof across the four reader-
// side improvement loops (all computed in _recData.ts, no Rose view change):
//
//   LOOP 1  LEARNING RE-RANK  -> "que esta aprendiendo el motor": which rec_types
//           it is prioritizing (net approve) vs deprioritizing (net reject) from
//           the decision log, with accept/reject/correct counts per type.
//   LOOP 2  LOOP-CLOSURE      -> the closure-rate per lever (closed / decided),
//           i.e. how often a worked solution actually MOVED the metric.
//   LOOP 3  GROUPING          -> how many recs were collapsed into batches and
//           how many varieties those batches cover (one action -> N varieties).
//   LOOP 4  (this panel)      -> assembles + renders 1-3 honestly.
//
// REAL data only; NULL-safe; honest "sin decisiones aun" / "sin loops cerrados
// aun" empty states. Style: emerald-600 / slate, ASCII-clean Spanish. Pure
// presentational server component (no fetch here — it takes a LoopReflection).

import type { LoopReflection, LeverReflection } from './_recData';

function pct(rate: number | null): string {
  if (rate == null) return '--';
  return `${Math.round(rate * 100)}%`;
}

// Pretty lever label for the panel (rec_type keys are engine-native).
const LEVER_LABEL: Record<string, string> = {
  image: 'Imagen',
  image_improve: 'Imagen (2da foto / A-B)',
  content: 'Contenido',
  fulfillment: 'Dims / Fulfillment',
  price: 'Precio',
  quality: 'Calidad',
};
function leverLabel(key: string): string {
  return LEVER_LABEL[key] ?? key;
}

function DirectionBadge({ d }: { d: LeverReflection['direction'] }) {
  const map: Record<LeverReflection['direction'], { cls: string; label: string }> = {
    priorizando: { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'priorizando' },
    despriorizando: { cls: 'bg-red-100 text-red-800 border-red-200', label: 'despriorizando' },
    neutral: { cls: 'bg-slate-100 text-slate-500 border-slate-200', label: 'neutral' },
  };
  const m = map[d];
  return (
    <span
      className={`inline-flex items-center text-[10px] leading-none px-2 py-1 rounded-full font-semibold uppercase tracking-wide border ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

export default function LoopLearningPanel({ reflection }: { reflection: LoopReflection }) {
  const {
    levers,
    totalDecisions,
    totalClosed,
    totalDecidedSolutions,
    overallClosureRate,
    batchedRecs,
    batchedVarieties,
    learnedDeltaDead,
  } = reflection;

  const noDecisions = totalDecisions === 0;
  const noClosures = totalDecidedSolutions === 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-slate-100">
        <h2 className="text-base font-semibold tracking-tight text-slate-900">Loop &amp; Learning</h2>
        <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
          La curva de mejora del motor: que aprende de cada decision, cuantos loops
          cierran de verdad (la metrica se movio) y cuantas recomendaciones se
          colapsan en acciones a escala. Todo computado en el reader (sin cambiar
          la vista de Rose).
        </p>
      </div>

      {/* Top-line tiles ------------------------------------------------------ */}
      <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Decisiones
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums leading-tight mt-0.5">
            {totalDecisions}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            feedback capturado (re-rankea)
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Loops cerrados
          </div>
          <div className="text-2xl font-bold text-emerald-700 tabular-nums leading-tight mt-0.5">
            {totalClosed}
            {totalDecidedSolutions > 0 && (
              <span className="text-sm text-slate-400 font-semibold"> / {totalDecidedSolutions}</span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            la metrica se movio de verdad
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Closure-rate
          </div>
          <div className="text-2xl font-bold text-emerald-700 tabular-nums leading-tight mt-0.5">
            {pct(overallClosureRate)}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            cerrados / decididos
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Batched
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums leading-tight mt-0.5">
            {batchedRecs}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            {batchedVarieties > 0
              ? `${batchedVarieties} variedades en ${batchedRecs} accion${batchedRecs === 1 ? '' : 'es'}`
              : 'sin recs colapsables aun'}
          </div>
        </div>
      </div>

      {/* Dead-loop honesty banner ------------------------------------------- */}
      {learnedDeltaDead && totalDecisions > 0 && (
        <div className="mx-5 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <div className="text-[11px] text-amber-800 leading-snug">
            <span className="font-semibold">Nota honesta:</span> la vista de Rose todavia
            publica <span className="font-mono">learned_delta = 0</span> en cada fila. El
            re-rank de abajo se computa en el reader (lane de Job) a partir del log de
            decisiones; cuando Rose adopte el delta, los dos coincidiran.
          </div>
        </div>
      )}

      {/* Per-lever: que esta aprendiendo el motor ---------------------------- */}
      <div className="px-5 pb-5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
          Que esta aprendiendo el motor (por lever)
        </div>

        {noDecisions && noClosures ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-6 text-center">
            <div className="text-sm font-semibold text-emerald-800">Sin decisiones aun</div>
            <p className="text-sm text-emerald-700 mt-1 max-w-md mx-auto leading-relaxed">
              Todavia no hay feedback ni loops cerrados. En cuanto apruebes, rechaces
              o corrijas una recomendacion, el motor empieza a re-rankear y esta curva
              se llena con data real.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-semibold">Lever</th>
                  <th className="px-3 py-2 font-semibold text-right">Decisiones</th>
                  <th className="px-3 py-2 font-semibold text-right">A / R / C</th>
                  <th className="px-3 py-2 font-semibold text-right">Peso neto</th>
                  <th className="px-3 py-2 font-semibold text-right">Loops</th>
                  <th className="px-3 py-2 font-semibold text-right">Closure</th>
                  <th className="px-3 py-2 font-semibold">Aprendizaje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {levers.map((l) => (
                  <tr key={l.lever} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-slate-800">{leverLabel(l.lever)}</span>
                      <span className="block font-mono text-[10px] text-slate-400">{l.lever}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {l.decisions}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      <span className="text-emerald-700">{l.approvals}</span>
                      <span className="text-slate-300"> / </span>
                      <span className="text-red-700">{l.rejections}</span>
                      <span className="text-slate-300"> / </span>
                      <span className="text-violet-700">{l.corrections}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span
                        className={
                          l.netWeight > 0
                            ? 'text-emerald-700 font-semibold'
                            : l.netWeight < 0
                              ? 'text-red-700 font-semibold'
                              : 'text-slate-400'
                        }
                      >
                        {l.netWeight > 0 ? '+' : ''}
                        {l.netWeight}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {l.decidedSolutions > 0 ? (
                        <>
                          <span className="text-emerald-700 font-semibold">{l.closed}</span>
                          <span className="text-slate-400"> / {l.decidedSolutions}</span>
                        </>
                      ) : (
                        <span className="text-slate-300">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {l.closureRate != null ? (
                        pct(l.closureRate)
                      ) : (
                        <span className="text-slate-300">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <DirectionBadge d={l.direction} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {noClosures && !noDecisions && (
          <p className="text-[11px] text-slate-400 mt-2 leading-snug">
            Sin loops cerrados aun: hay decisiones capturadas pero ninguna solucion
            aplicada movio la metrica todavia. El closure-rate se llena cuando una
            foto / dims / contenido aplicado saca un SKU de su gap.
          </p>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-400 px-5 pb-5 pt-1 border-t border-slate-100">
        Fuentes: supabase-backup supply_recommendation_feedback (decisiones -&gt;
        re-rank LOOP 1, A/R/C + peso neto) y supply_solution_feedback (outcomes
        reales -&gt; loop-closure LOOP 2, pick con metric_after &gt; metric_before =
        loop cerrado). Grouping (LOOP 3) colapsa recs por eje vendor x rec_type.
        A = approve, R = reject, C = correct/defer (framing, neutral). Todo
        computado en el reader; la vista de Rose no se modifica.
      </p>
    </section>
  );
}
