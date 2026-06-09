// Deep-dive for one sample: full qualification + engagement + comms timeline +
// win-hypothesis + quality read + proposed composition + external-profile panel +
// the dataNote banner. Hosts <DecisionBar> and <HypothesisFeedback>.
// v1 | 2026-06-09 | Job_PM (CPO)
//
// Style copied from app/admin/cohort-review (MicroLabel, rounded cards, slate scale).

'use client';

import type { SampleReviewRow } from './types';
import { fmtTalk, fmtDate, qualityBadge, commsIcon } from './format';
import DecisionBar from './DecisionBar';
import HypothesisFeedback from './HypothesisFeedback';

interface Props {
  row: SampleReviewRow;
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
      {children}
    </div>
  );
}

// Single label/value intel cell; "--" when null.
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <MicroLabel>{label}</MicroLabel>
      <p className="text-[13px] text-slate-800">{value && value.trim() ? value : '--'}</p>
    </div>
  );
}

export default function SampleDeepDive({ row }: Props) {
  const q = qualityBadge(row.qualityRead.verdict);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-5 space-y-5">
        {/* Identity */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">{row.businessName}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                {row.status}
              </span>
            </div>
            <div className="text-[12px] text-slate-500 mt-0.5">
              {row.businessType || '--'}
              {row.cohortDate ? ` · cohorte ${fmtDate(row.cohortDate)}` : ''}
            </div>
          </div>
          <span className="font-bold rounded-md border tabular-nums shrink-0 text-xs px-2.5 py-1 bg-slate-50 text-slate-700 border-slate-200">
            JJ {row.jjScore ?? '--'}
          </span>
        </div>

        {/* JJ reasoning */}
        <section>
          <MicroLabel>Reasoning de JJ</MicroLabel>
          {row.jjReasoning ? (
            <p className="text-sm text-slate-700 leading-relaxed">{row.jjReasoning}</p>
          ) : (
            <p className="text-[13px] text-slate-400">--</p>
          )}
        </section>

        {/* Full qualification intel */}
        <section>
          <MicroLabel>Cualificación &mdash; lo que sabemos</MicroLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Proveedor actual" value={row.currentSupplier} />
            <Field label="Precios que paga" value={row.pricesTheyPay} />
            <Field label="Productos de interés" value={row.productsInterest} />
            <Field label="Objeción" value={row.objection} />
            <Field label="Qué resonó del pitch" value={row.pitchResonated} />
            <Field label="Tipo de negocio" value={row.businessType} />
          </div>
          {row.keyQuote && row.keyQuote.trim() ? (
            <blockquote className="mt-3 border-l-2 border-emerald-300 pl-3 text-[13px] italic text-slate-600">
              &ldquo;{row.keyQuote}&rdquo;
            </blockquote>
          ) : null}
        </section>

        {/* Engagement detail */}
        <section>
          <MicroLabel>Engagement &mdash; touchpoints</MicroLabel>
          <div className="flex items-center gap-2 flex-wrap text-[13px] text-slate-700">
            <span className="font-medium">
              {row.callsCount} {row.callsCount === 1 ? 'llamada' : 'llamadas'}
              <span className="text-slate-400"> ({fmtTalk(row.talkSeconds)})</span>
            </span>
            <span className="text-slate-300">&middot;</span>
            <span>{row.emailsCount} emails</span>
            <span className="text-slate-300">&middot;</span>
            <span>{row.messagesCount} mensajes</span>
          </div>
        </section>

        {/* Comms timeline */}
        <section>
          <MicroLabel>Timeline de comunicaciones</MicroLabel>
          {row.timeline && row.timeline.length > 0 ? (
            <ol className="space-y-2.5">
              {row.timeline.map((c, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-[12px] text-slate-600 flex-wrap">
                    <span aria-hidden>{commsIcon(c.type)}</span>
                    <span className="font-semibold text-slate-700">{c.type}</span>
                    <span className="text-slate-300">&middot;</span>
                    <span>{fmtDate(c.at)}</span>
                    {c.direction ? (
                      <>
                        <span className="text-slate-300">&middot;</span>
                        <span>{c.direction}</span>
                      </>
                    ) : null}
                    {c.durationSeconds != null ? (
                      <>
                        <span className="text-slate-300">&middot;</span>
                        <span>{fmtTalk(c.durationSeconds)}</span>
                      </>
                    ) : null}
                  </div>
                  {c.summary ? (
                    <p className="text-[13px] text-slate-700 mt-1 leading-relaxed">{c.summary}</p>
                  ) : null}
                  {c.analysis ? (
                    <p className="text-[12px] text-slate-500 mt-1 italic leading-relaxed">
                      {c.analysis}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-slate-400">sin comunicaciones registradas</p>
          )}
        </section>

        {/* Win hypothesis (full) */}
        <section>
          <MicroLabel>Win-hypothesis</MicroLabel>
          <p className="text-sm text-slate-700 leading-relaxed">{row.winHypothesis}</p>
          <p className="text-[10px] text-slate-400 mt-1">
            Direccional, anclada a evidencia &mdash; no es una predicción cerrada.
          </p>
        </section>

        {/* Quality read */}
        <section>
          <MicroLabel>Lectura de calidad</MicroLabel>
          <div className="flex items-start gap-2">
            <span
              className={
                'inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md border shrink-0 ' +
                q.cls
              }
            >
              {q.label}
            </span>
            <p className="text-[13px] text-slate-700 leading-relaxed">
              {row.qualityRead.why || '--'}
            </p>
          </div>
        </section>

        {/* Proposed composition */}
        <section>
          <MicroLabel>Composición propuesta</MicroLabel>
          {row.proposedComposition && row.proposedComposition.trim() ? (
            <p className="text-[13px] text-slate-800">{row.proposedComposition}</p>
          ) : (
            <p className="text-[13px] text-slate-400">sin señal de productos de interés</p>
          )}
        </section>

        {/* External profile -> pending-research panel when null */}
        <section>
          <MicroLabel>Perfil externo</MicroLabel>
          {row.externalProfile ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Web"
                value={
                  row.externalProfile.hasWebsite
                    ? row.externalProfile.websiteUrl ?? 'sí'
                    : row.externalProfile.hasWebsite === false
                      ? 'no'
                      : null
                }
              />
              <Field
                label="Reviews"
                value={
                  row.externalProfile.reviewsRating != null
                    ? `${row.externalProfile.reviewsRating}${
                        row.externalProfile.reviewsCount != null
                          ? ` · ${row.externalProfile.reviewsCount} rev`
                          : ''
                      }`
                    : null
                }
              />
              <Field label="Socials" value={row.externalProfile.socials} />
              <Field
                label="Ads"
                value={
                  row.externalProfile.runsAds == null
                    ? null
                    : row.externalProfile.runsAds
                      ? 'sí'
                      : 'no'
                }
              />
              <Field label="Vende" value={row.externalProfile.sells} />
              <Field label="Rango de precios" value={row.externalProfile.priceRange} />
              <div className="sm:col-span-2 text-[10px] text-slate-400">
                provenance: {row.externalProfile.provenance}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 p-3">
              <p className="text-[11px] text-slate-500 mb-2">
                Investigación externa pendiente &mdash; aún sin datos.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {['Web', 'Reviews', 'Socials', 'Ads', 'Vende', 'Rango de precios'].map((lbl) => (
                  <div key={lbl} className="text-slate-300">
                    <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5">
                      {lbl}
                    </div>
                    <p className="text-[13px]">--</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Data note banner */}
        <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-800">
          {row.dataNote || 'Direccional — pendiente de las vistas certificadas de Rose.'}
        </div>

        {/* Learning loop */}
        <HypothesisFeedback row={row} />
      </div>

      {/* Facu's decision (sticky child) */}
      <DecisionBar row={row} />
    </article>
  );
}
