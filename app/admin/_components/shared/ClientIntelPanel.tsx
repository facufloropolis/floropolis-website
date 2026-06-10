// ClientIntelPanel -- rich intel on the selected client. NULL-safe ("--").
// Renders: heat, status, interestScore, interactions, talk time, currentSupplier,
// pricesTheyPay, businessType, likes, objections, keyQuote, lastCallOutcome,
// converted + revenueL365, website, daysInFunnel.
// v1 | 2026-06-09 | Job_PM (CPO)
'use client';

import type { ClientIntel } from '@/lib/deal/types';

const DASH = '--';

function v(x: string | number | null | undefined): string {
  if (x === null || x === undefined) return DASH;
  const s = String(x).trim();
  return s === '' || s === DASH ? DASH : s;
}

function fmtTalk(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return DASH;
  return `${Math.round(seconds / 60)}m`;
}

function fmtMoney(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return DASH;
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function heatChip(heat: string | null): string {
  const h = (heat ?? '').toLowerCase();
  if (h.includes('hot') || h.includes('high')) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (h.includes('warm') || h.includes('med')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (h.includes('cold') || h.includes('low')) return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-slate-200 bg-slate-50 text-slate-500';
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-[13px] font-medium tabular-nums text-slate-800">{value}</div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      {children}
    </div>
  );
}

export default function ClientIntelPanel({ intel, loading }: { intel: ClientIntel | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-[13px] text-slate-400 shadow-sm">
        Cargando intel del cliente...
      </div>
    );
  }
  if (!intel) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-[13px] text-slate-400">
        Selecciona un cliente para ver su intel (o agrega uno nuevo).
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-bold text-slate-900">{v(intel.name)}</h2>
            <span className={'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ' + heatChip(intel.heat)}>
              {v(intel.heat)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-500">
              origen: {v(intel.source)}
            </span>
            {intel.converted === true && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                convertido
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[13px] text-slate-500">
            {[v(intel.city), v(intel.state)].filter((x) => x !== DASH).join(', ') || DASH} &middot; {v(intel.businessType)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Estado</div>
          <div className="text-[13px] font-medium text-slate-700">{v(intel.status)}</div>
        </div>
      </div>

      {/* Quant stats */}
      <div className="grid grid-cols-2 gap-2.5 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Interest score" value={v(intel.interestScore)} />
        <Stat label="Interacciones" value={v(intel.interactions)} />
        <Stat label="Talk time" value={fmtTalk(intel.talkSeconds)} />
        <Stat label="Dias en funnel" value={v(intel.daysInFunnel)} />
        <Stat label="Revenue L365" value={fmtMoney(intel.revenueL365)} />
        <Stat label="Convertido" value={intel.converted === null ? DASH : intel.converted ? 'Si' : 'No'} />
      </div>

      {/* Qualitative */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 border-t border-slate-100 px-5 py-4 md:grid-cols-2">
        <Block label="Que le gusta">
          <p className="text-[13px] leading-relaxed text-slate-700">{v(intel.likes)}</p>
        </Block>
        <Block label="Objeciones">
          <p className="text-[13px] leading-relaxed text-slate-700">{v(intel.objections)}</p>
        </Block>
        <Block label="Precios que paga hoy">
          <p className="text-[13px] text-slate-700">{v(intel.pricesTheyPay)}</p>
        </Block>
        <Block label="Current supplier">
          <p className="text-[13px] text-slate-700">{v(intel.currentSupplier)}</p>
        </Block>
        <Block label="Ultimo resultado de llamada">
          <p className="text-[13px] text-slate-700">{v(intel.lastCallOutcome)}</p>
        </Block>
        <Block label="Contacto">
          <p className="text-[13px] text-slate-700">
            {v(intel.email)} &middot; {v(intel.phone)}
          </p>
          <p className="mt-0.5 text-[12px] text-slate-500">
            {v(intel.address)} {intel.zip && intel.zip !== DASH ? `(${intel.zip})` : ''}
          </p>
          {intel.website && intel.website !== DASH && (
            <p className="mt-0.5 text-[12px] text-emerald-700">{intel.website}</p>
          )}
        </Block>
        <div className="md:col-span-2">
          <Block label="Key quote">
            <blockquote className="border-l-2 border-emerald-300 pl-3 text-[13px] italic leading-relaxed text-slate-600">
              {v(intel.keyQuote)}
            </blockquote>
          </Block>
        </div>
      </div>
    </div>
  );
}
