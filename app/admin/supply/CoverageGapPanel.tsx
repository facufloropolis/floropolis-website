// Coverage Gap panel — "que datos de competidor faltan y cuanto importan".
// v1 | 2026-06-16 | Job_PM (CPO)
//
// THE coverage loop, surfaced. When Job's cost lens has NO/weak competitor or
// peer reference for a variety, the cost verdict cannot lean on it honestly. We
// do NOT block the proposal ("sin referencia" is honest, short-term) — instead
// we record a PRIORITIZED coverage-gap on the improvement_loop_state spine
// (domain='benchmark_coverage') and surface it here, ranked by
// importance x frequency, routed to Rose/Talin to fill. The gap CLOSES when the
// benchmark data lands (state -> re_scored / verified, a SEPARATE detector).
//
// Pure presentational server component (no fetch here — it takes the recorded
// gaps + the live scan summary). REAL data only; honest empty states; ASCII-clean
// Spanish; emerald-600 / slate. Style mirrors LoopLearningPanel.

import type { CoverageGapRow } from '@/lib/admin/coverage-gap';
import type { CoverageGapScan } from './_recData';

function LensBadge({ lens }: { lens: 'competitor' | 'peer' }) {
  const m =
    lens === 'competitor'
      ? { cls: 'bg-amber-100 text-amber-800 border-amber-200', label: 'competidor' }
      : { cls: 'bg-violet-100 text-violet-800 border-violet-200', label: 'peer' };
  return (
    <span
      className={`inline-flex items-center text-[10px] leading-none px-2 py-1 rounded-full font-semibold uppercase tracking-wide border ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    open: { cls: 'bg-slate-100 text-slate-600 border-slate-200', label: 'abierto' },
    routed: { cls: 'bg-sky-100 text-sky-800 border-sky-200', label: 'ruteado -> Rose/Talin' },
    re_scored: { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 're-scored' },
    verified: { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'cerrado' },
  };
  const m = map[state] ?? map.open;
  return (
    <span
      className={`inline-flex items-center text-[10px] leading-none px-2 py-1 rounded-full font-semibold uppercase tracking-wide border ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

export default function CoverageGapPanel({
  gaps,
  scan,
  warnings,
}: {
  gaps: CoverageGapRow[];
  scan: CoverageGapScan;
  warnings: string[];
}) {
  const top = gaps.slice(0, 25);
  const more = gaps.length - top.length;
  const allWarnings = [...warnings, ...scan.warnings];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-slate-100">
        <h2 className="text-base font-semibold tracking-tight text-slate-900">
          Cobertura de benchmark &mdash; que datos de competidor faltan
        </h2>
        <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
          Cuando el analisis de costo no tiene referencia de competidor o peer para
          una variedad, no se bloquea la propuesta (&quot;sin referencia&quot; es
          honesto). Se registra un gap priorizado por <span className="font-semibold">importancia x
          frecuencia</span> y se rutea a Rose/Talin para llenarlo. Cierra cuando la
          data de benchmark aterriza.
        </p>
      </div>

      {/* Top-line tiles --------------------------------------------------- */}
      <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Variedades motor
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums leading-tight mt-0.5">
            {scan.engineVarieties}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">universo a referenciar</div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Sin referencia
          </div>
          <div className="text-2xl font-bold text-amber-700 tabular-nums leading-tight mt-0.5">
            {scan.absent}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            cero filas de competidor
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Referencia debil
          </div>
          <div className="text-2xl font-bold text-amber-700 tabular-nums leading-tight mt-0.5">
            {scan.weak}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            pocas filas / baja confianza
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Cubiertas
          </div>
          <div className="text-2xl font-bold text-emerald-700 tabular-nums leading-tight mt-0.5">
            {scan.covered}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 leading-snug">
            referencia fuerte de mercado
          </div>
        </div>
      </div>

      {/* DB warnings (surfaced, never swallowed) -------------------------- */}
      {allWarnings.length > 0 && (
        <div className="mx-5 mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5">
          <div className="text-[11px] font-semibold text-red-800 uppercase tracking-wide">
            Avisos de data
          </div>
          <ul className="text-[11px] text-red-700 mt-1 list-disc list-inside leading-snug">
            {allWarnings.map((w, i) => (
              <li key={i} className="font-mono">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Prioritized gap list --------------------------------------------- */}
      <div className="px-5 pb-5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
          Gaps abiertos priorizados ({gaps.length}) &mdash; importancia x frecuencia
        </div>

        {gaps.length === 0 ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-6 text-center">
            <div className="text-sm font-semibold text-emerald-800">Sin gaps de cobertura abiertos</div>
            <p className="text-sm text-emerald-700 mt-1 max-w-md mx-auto leading-relaxed">
              {scan.engineVarieties === 0
                ? 'El motor no devolvio variedades en este pase (no se registro ningun gap).'
                : 'Toda variedad del motor tiene referencia de competidor suficiente, o los gaps ya se cerraron.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-semibold">Variedad</th>
                  <th className="px-3 py-2 font-semibold">Lens faltante</th>
                  <th className="px-3 py-2 font-semibold text-right">Importancia</th>
                  <th className="px-3 py-2 font-semibold text-right">Frec.</th>
                  <th className="px-3 py-2 font-semibold text-right">Prioridad</th>
                  <th className="px-3 py-2 font-semibold text-right">Filas xw</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {top.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-slate-800">{g.variety}</span>
                      {g.decidedBy && (
                        <span className="block text-[10px] text-slate-400">
                          marcado por {g.decidedBy}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex gap-1 flex-wrap">
                        {g.missingLens.length > 0 ? (
                          g.missingLens.map((l) => <LensBadge key={l} lens={l} />)
                        ) : (
                          <span className="text-slate-300">--</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {g.importance > 0 ? (
                        <span className="text-slate-700">{g.importance.toFixed(0)}</span>
                      ) : (
                        <span
                          className="text-slate-400"
                          title={`sin peso de importancia (${g.importanceProvenance ?? 'sin signal'}) -> prioriza por frecuencia`}
                        >
                          sin ref
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {g.frequency}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">
                      {g.priority.toFixed(0)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {g.crosswalkRows > 0 ? (
                        g.crosswalkRows
                      ) : (
                        <span className="text-slate-300" title="cero filas de competidor (absent)">
                          0
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <StateBadge state={g.state} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {more > 0 && (
          <p className="text-[11px] text-slate-400 mt-2 leading-snug">
            +{more} gap{more === 1 ? '' : 's'} mas (top 25 por prioridad).
          </p>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-400 px-5 pb-5 pt-1 border-t border-slate-100">
        Fuentes: supabase-backup improvement_loop_state (spine, domain=
        <span className="font-mono">benchmark_coverage</span>, sku_id NULL, gate_id=
        <span className="font-mono">benchmark_coverage:&lt;variedad&gt;</span>) +
        scan en vivo de v_supply_recommendations x market_variety_crosswalk
        (referencia de competidor) x supply_importance_signal (peso). Prioridad =
        importancia x frecuencia (frecuencia sola cuando no hay peso). El gap abre
        en estado <span className="font-mono">open</span>, pasa a{' '}
        <span className="font-mono">routed</span> al rutear a Rose/Talin, y cierra
        a <span className="font-mono">re_scored / verified</span> cuando aterriza la
        data de benchmark (detector aparte). No se escribe dim_sku ni admin_proposals.
      </p>
    </section>
  );
}
