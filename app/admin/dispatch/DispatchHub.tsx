// DispatchHub — el hub de dispatch por periodo.
// v1 | 2026-06-11 | Job_PM (CPO)
//
// TWO sections driven by a period selector (DispatchPeriod):
//   - Planificadas: approved boxes NOT yet sent whose effective date is in [from, to].
//     Shows readiness chips, editable cards (ApprovedBoxesEditor), labels CSV
//     (LabelsForTomorrow), and a "Marcar enviada" button per box.
//   - Enviadas: boxes marked sent with sent_date in [from, to].
//     Shows business name + sent_date + honest "tracking: pendiente (Rose)" line.
//
// For V1, ApprovedBoxesEditor + LabelsForTomorrow self-fetch all boxes (no period
// param). The period filter is applied to DispatchSamplesPanel's readiness view and
// to the Enviadas list. A visible note explains the scope.
//
// Default period: tomorrow/tomorrow (today+1).
// Style: emerald-600/slate, ASCII-clean Spanish.

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BoxType } from '@/lib/deal/types';
import type { ApprovedBox } from '@/app/api/admin/samples/approved-boxes/route';
import DispatchPeriod from './DispatchPeriod';
import ApprovedBoxesEditor from '../samples/_components/ApprovedBoxesEditor';
import LabelsForTomorrow from '../samples/_components/LabelsForTomorrow';
import DispatchDateControl from './DispatchDateControl';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ---------------------------------------------------------------------------
// Readiness helpers (mirrors DispatchSamplesPanel)
// ---------------------------------------------------------------------------

function hasAddress(box: ApprovedBox): boolean {
  return (
    box.ship !== null &&
    box.ship.street.trim().length > 0 &&
    box.ship.city.trim().length > 0 &&
    box.ship.state.trim().length > 0 &&
    box.ship.zip.trim().length > 0
  );
}
function hasCaja(box: ApprovedBox): boolean {
  return box.boxType !== null && box.boxType.trim().length > 0;
}
function hasContenido(box: ApprovedBox): boolean {
  return box.contents.length > 0 && box.contents.some((c) => c.variety.trim().length > 0 && c.stems > 0);
}
function isReady(box: ApprovedBox): boolean {
  return hasAddress(box) && hasCaja(box) && hasContenido(box);
}
function getMissing(box: ApprovedBox): string[] {
  const m: string[] = [];
  if (!hasAddress(box)) m.push('direccion');
  if (!hasCaja(box)) m.push('caja');
  if (!hasContenido(box)) m.push('contenido');
  return m;
}

// ---------------------------------------------------------------------------
// ReadinessChip
// ---------------------------------------------------------------------------

function Chip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
        ok
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-red-50 border-red-200 text-red-600',
      ].join(' ')}
    >
      {ok ? 'v' : 'x'} {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PlannedBoxRow — readiness strip + "Marcar enviada" button
// ---------------------------------------------------------------------------

function PlannedBoxRow({
  box,
  onSent,
}: {
  box: ApprovedBox;
  onSent: () => void;
}) {
  const ready = isReady(box);
  const missing = getMissing(box);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  async function handleMarkSent() {
    if (marking) return;
    setMarking(true);
    setMarkError(null);
    try {
      const res = await fetch('/api/admin/samples/approved-boxes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: box.id, patch: { sent: true } }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) {
        setMarkError(json.error ?? `HTTP ${res.status}`);
        setMarking(false);
        return;
      }
      onSent();
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : 'Error de red');
      setMarking(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-semibold text-slate-800 text-sm">{box.businessName || '--'}</span>
          {box.floraScore !== null && (
            <span className="text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">
              FLORA {box.floraScore}
            </span>
          )}
          {box.dispatchDate && (
            <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
              {fmtDate(box.dispatchDate)}
            </span>
          )}
        </div>
        {ready ? (
          <span className="text-xs font-semibold bg-emerald-600 text-white px-2.5 py-1 rounded-full">
            Listo para enviar
          </span>
        ) : (
          <span className="text-xs font-semibold bg-red-50 border border-red-200 text-red-700 px-2.5 py-1 rounded-full">
            Info faltante
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <Chip label="Direccion" ok={hasAddress(box)} />
        <Chip label="Caja" ok={hasCaja(box)} />
        <Chip label="Contenido" ok={hasContenido(box)} />
        {box.vendorConfirmed && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-emerald-50 border-emerald-200 text-emerald-700">
            v Vendor confirmo
          </span>
        )}
      </div>

      {missing.length > 0 && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
          <span className="font-semibold">Falta: {missing.join(', ')}</span>
          {' — completar en '}
          <a href="/admin/samples" className="underline hover:no-underline font-medium">
            /admin/samples
          </a>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleMarkSent}
          disabled={marking}
          className={[
            'text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors',
            marking
              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
              : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 cursor-pointer',
          ].join(' ')}
        >
          {marking ? 'Guardando...' : 'Marcar enviada'}
        </button>
        {markError && (
          <span className="text-xs text-red-500">! {markError}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SentBoxRow — sent box card with honest tracking state
// ---------------------------------------------------------------------------

function SentBoxRow({ box }: { box: ApprovedBox }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-semibold text-slate-800 text-sm">{box.businessName || '--'}</span>
          {box.floraScore !== null && (
            <span className="text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">
              FLORA {box.floraScore}
            </span>
          )}
        </div>
        <span className="text-xs font-semibold bg-emerald-600 text-white px-2.5 py-1 rounded-full">
          Enviada
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-slate-500">
        {box.sentDate && (
          <span>
            Enviada: <span className="font-medium text-slate-700">{fmtDate(box.sentDate)}</span>
          </span>
        )}
        {box.ship && (
          <span className="text-slate-400">
            {[box.ship.street, box.ship.city, box.ship.state].filter(Boolean).join(', ')}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <span className="inline-flex items-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-0.5">
          Tracking: pendiente (Rose)
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DispatchHub
// ---------------------------------------------------------------------------

interface Props {
  boxTypes: BoxType[];
}

interface FetchState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  boxes: ApprovedBox[];
  error: string | null;
}

export default function DispatchHub({ boxTypes }: Props) {
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  // Compute defaults on client to avoid SSR mismatch
  useEffect(() => {
    const tmr = tomorrowIso();
    setFrom(tmr);
    setTo(tmr);
  }, []);

  const [plannedState, setPlannedState] = useState<FetchState>({ status: 'idle', boxes: [], error: null });
  const [sentState, setSentState] = useState<FetchState>({ status: 'idle', boxes: [], error: null });

  const fetchPlanned = useCallback((f: string, t: string) => {
    if (!f || !t) return;
    setPlannedState((s) => ({ ...s, status: 'loading' }));
    fetch(`/api/admin/samples/approved-boxes?phase=planned&from=${f}&to=${t}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json()) as { boxes: ApprovedBox[]; error: string | null };
        setPlannedState({ status: 'ok', boxes: json.boxes ?? [], error: json.error ?? null });
      })
      .catch((err: unknown) => {
        setPlannedState({ status: 'error', boxes: [], error: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  const fetchSent = useCallback((f: string, t: string) => {
    if (!f || !t) return;
    setSentState((s) => ({ ...s, status: 'loading' }));
    fetch(`/api/admin/samples/approved-boxes?phase=sent&from=${f}&to=${t}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json()) as { boxes: ApprovedBox[]; error: string | null };
        setSentState({ status: 'ok', boxes: json.boxes ?? [], error: json.error ?? null });
      })
      .catch((err: unknown) => {
        setSentState({ status: 'error', boxes: [], error: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  // Fetch when period changes
  useEffect(() => {
    if (from && to) {
      fetchPlanned(from, to);
      fetchSent(from, to);
    }
  }, [from, to, fetchPlanned, fetchSent]);

  function handlePeriodChange(newFrom: string, newTo: string) {
    setFrom(newFrom);
    setTo(newTo);
  }

  function handleSent(boxId: string) {
    // Move the box from planned to sent by re-fetching both
    fetchPlanned(from, to);
    fetchSent(from, to);
    // Also remove from local planned state optimistically
    setPlannedState((s) => ({ ...s, boxes: s.boxes.filter((b) => b.id !== boxId) }));
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <DispatchPeriod
        from={from}
        to={to}
        onFromChange={(v) => handlePeriodChange(v, to)}
        onToChange={(v) => handlePeriodChange(from, v)}
      />

      {/* ------------------------------------------------------------------ */}
      {/* PLANIFICADAS                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Planificadas para el periodo
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Aprobadas, no enviadas, con fecha de salida en el periodo seleccionado.
            </p>
          </div>
          {plannedState.status === 'ok' && (
            <span className="text-xs font-bold bg-emerald-600 text-white px-3 py-1 rounded-full">
              {plannedState.boxes.length} caja{plannedState.boxes.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {/* Readiness strip for period-filtered planned boxes */}
        {plannedState.status === 'loading' && (
          <div className="text-sm text-slate-400 py-4 text-center animate-pulse">Cargando planificadas...</div>
        )}
        {plannedState.status === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
            Error: {plannedState.error ?? 'desconocido'}
          </div>
        )}
        {plannedState.status === 'ok' && plannedState.boxes.length === 0 && (
          <div className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl">
            Sin cajas planificadas para este periodo.{' '}
            <a href="/admin/samples" className="text-emerald-700 underline hover:no-underline font-medium">
              Aprobar en /admin/samples
            </a>
          </div>
        )}
        {plannedState.status === 'ok' && plannedState.boxes.length > 0 && (
          <div className="flex flex-col gap-3 mb-4">
            {plannedState.boxes.map((box) => (
              <PlannedBoxRow key={box.id} box={box} onSent={() => handleSent(box.id)} />
            ))}
          </div>
        )}

        {/* Reschedule batch date */}
        <DispatchDateControl />

        {/* Editable box details (all approved — note explains scope) */}
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Nota</span>
          <span className="text-xs text-slate-500">
            Edicion y labels muestran todas las cajas aprobadas (no filtradas por periodo). Filtro por periodo proximo.
          </span>
        </div>
        <div className="mb-4">
          <ApprovedBoxesEditor boxTypes={boxTypes} />
        </div>
        <LabelsForTomorrow />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* ENVIADAS                                                             */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Enviadas en el periodo
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Cajas marcadas como enviadas con fecha de envio dentro del periodo.
            </p>
          </div>
          {sentState.status === 'ok' && (
            <span className="text-xs font-bold bg-slate-700 text-white px-3 py-1 rounded-full">
              {sentState.boxes.length} enviada{sentState.boxes.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {sentState.status === 'loading' && (
          <div className="text-sm text-slate-400 py-4 text-center animate-pulse">Cargando enviadas...</div>
        )}
        {sentState.status === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
            Error: {sentState.error ?? 'desconocido'}
          </div>
        )}
        {sentState.status === 'ok' && sentState.boxes.length === 0 && (
          <div className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl">
            Sin cajas enviadas en este periodo.
          </div>
        )}
        {sentState.status === 'ok' && sentState.boxes.length > 0 && (
          <div className="flex flex-col gap-3">
            {sentState.boxes.map((box) => (
              <SentBoxRow key={box.id} box={box} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
