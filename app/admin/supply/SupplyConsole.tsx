// Lever filter shell for the Supply Engine console.
// v1 | 2026-06-10 | Job_PM (CPO)
//
// HARD BAR (Facu): Facu PICKS which lever to review. The five canonical levers
// (image / content / fulfillment / price / quality) are ALWAYS present as tabs
// so price + fulfillment (which the priority cascade used to mask) are now
// first-class and queryable. Each tab carries its real count + the MASKED
// backlog (SKUs whose failing_gates carry this lever but fire a higher-priority
// gap) so the hidden work is visible.
//
// The server renders each lever's solution-first body once and hands them in as
// `sections` (a lever -> ReactNode map). This client shell only switches which
// one is visible; it never re-fetches or re-renders the cards.
//
// Style: emerald-600 active tab, slate scale, ASCII-clean Spanish.

'use client';

import { useState, type ReactNode } from 'react';

export type SupplyLever = 'image' | 'content' | 'fulfillment' | 'price' | 'quality' | 'correcciones';

export interface LeverTab {
  lever: SupplyLever;
  label: string; // ASCII-clean Spanish label
  // Live count surfaced on the tab. `direct` = SKUs firing this lever now;
  // `masked` = SKUs carrying this lever's gate behind a higher-priority gap.
  direct: number;
  masked: number;
}

interface Props {
  tabs: LeverTab[];
  sections: Partial<Record<SupplyLever, ReactNode>>;
  initial: SupplyLever;
}

export default function SupplyConsole({ tabs, sections, initial }: Props) {
  const [active, setActive] = useState<SupplyLever>(initial);

  return (
    <div>
      {/* Lever filter bar */}
      <div className="mb-8 flex flex-wrap gap-2" role="tablist" aria-label="Levers">
        {tabs.map((t) => {
          const isActive = t.lever === active;
          const total = t.direct + t.masked;
          return (
            <button
              key={t.lever}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.lever)}
              className={`group inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`tabular-nums rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                  isActive ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {t.direct}
              </span>
              {t.masked > 0 && (
                <span
                  title={`${t.masked} SKU con este gate ocultos detras de un lever de mayor prioridad`}
                  className={`tabular-nums text-[10px] leading-none ${
                    isActive ? 'text-emerald-100' : 'text-amber-600'
                  }`}
                >
                  +{t.masked} oculto{t.masked === 1 ? '' : 's'}
                </span>
              )}
              {total === 0 && (
                <span className={`text-[10px] ${isActive ? 'text-emerald-100' : 'text-slate-400'}`}>
                  limpio
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active lever body */}
      <div role="tabpanel">
        {sections[active] ?? (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-8 text-center">
            <div className="text-sm font-semibold text-emerald-800">
              Nada que trabajar en este lever
            </div>
            <p className="text-sm text-emerald-700 mt-1 max-w-md mx-auto leading-relaxed">
              El motor no tiene recomendaciones abiertas aca ahora mismo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
