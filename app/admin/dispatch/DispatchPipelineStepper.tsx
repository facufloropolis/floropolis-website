'use client';
// Dispatch pipeline stepper — 9-step visual with click-to-show tooltips.
// v1 | 2026-05-21 | Job_PM [V8 SHADOW]
// Active step is derived server-side from dispatch data and passed as a prop.

import { useState } from 'react';

const STEPS = [
  { label: 'PREP',        owner: 'Rose', desc: 'dispatch_prep.py runs at 07:00. Google Sheet updated with Dispatch Prep + FedEx Input tabs.' },
  { label: 'REVIEW',      owner: 'Facu', desc: 'Review the Google Sheet; flag any issues before running FedEx Ship Manager.' },
  { label: 'DISPATCH',    owner: 'Facu', desc: 'Run FedEx Ship Manager from PC using the FedEx Input tab. Generate labels. (PC only)' },
  { label: 'LABELS',      owner: 'Facu', desc: 'Upload PDF labels after FedEx generates them.' },
  { label: 'READ',        owner: 'Rose', desc: 'label_reader.py parses PDFs, matches tracking to orders, triggers client email via n8n.' },
  { label: 'EMAILS',      owner: 'Rose', desc: 'dispatch_vendor_email_drafter.py creates Gmail drafts to farms with labels attached.' },
  { label: 'SEND',        owner: 'Facu', desc: 'Open Gmail drafts, review, send from facu@floropolis.com.' },
  { label: 'LOG',         owner: 'Rose', desc: 'dispatch_logger.py updates Supabase with tracking numbers after Facu confirms emails sent.' },
  { label: 'PRE-ARRIVAL', owner: 'Rose', desc: 'Day-before cron sends arrival reminder to client.' },
];

export default function DispatchPipelineStepper({ activeStep }: { activeStep: number }) {
  const [activeTip, setActiveTip] = useState<number | null>(null);
  const facuRemaining = STEPS.filter((s, i) => i >= activeStep && s.owner === 'Facu').length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="font-bold text-slate-900 text-sm">Pipeline de despacho de Rose</h2>
        <span className="text-xs text-slate-400">
          9 pasos &middot; {facuRemaining === 0 ? 'Todos los pasos de Facu listos' : `${facuRemaining} paso${facuRemaining === 1 ? '' : 's'} de Facu pendiente${facuRemaining === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="flex items-start overflow-x-auto pb-2">
        {STEPS.map((step, i) => {
          const isDone = i < activeStep;
          const isActive = i === activeStep;
          return (
            <div key={step.label} className="flex items-start flex-shrink-0">
              <div className="flex flex-col items-center w-[72px]">
                <button
                  type="button"
                  className={`relative w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    isDone    ? 'bg-emerald-500 border-emerald-500 text-white' :
                    isActive  ? 'bg-amber-500 border-amber-500 text-white ring-4 ring-amber-100' :
                                'bg-white border-slate-200 text-slate-400'
                  }`}
                  onClick={() => setActiveTip(activeTip === i ? null : i)}
                >
                  {isDone ? '✓' : i + 1}
                  {step.owner === 'Facu' && (
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-violet-500 rounded-full flex items-center justify-center pointer-events-none">
                      <span className="text-white text-[9px] font-bold">F</span>
                    </div>
                  )}
                </button>
                <p className={`text-[10px] font-semibold mt-1 text-center leading-tight ${
                  isDone ? 'text-emerald-700' : isActive ? 'text-amber-700' : 'text-slate-400'
                }`}>{step.label}</p>
                <p className="text-[9px] text-slate-400 text-center">{step.owner}</p>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-3 mt-[18px] flex-shrink-0 ${isDone ? 'bg-emerald-400' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>
      {activeTip !== null && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
          <strong className="text-slate-900">{STEPS[activeTip].label} ({STEPS[activeTip].owner}):</strong>{' '}
          {STEPS[activeTip].desc}
        </div>
      )}
      <p className="text-[10px] text-slate-400 mt-2">
        <span className="text-violet-600 font-semibold">F</span> = paso manual de Facu &middot; Toca cualquier paso para ver la descripcion
      </p>
    </div>
  );
}
