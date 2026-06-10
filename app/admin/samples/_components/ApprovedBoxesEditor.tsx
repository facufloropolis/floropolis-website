// ApprovedBoxesEditor — editable layer for CEO-approved sample boxes, pre-dispatch.
// v1 | 2026-06-10 | Job_PM (CPO)
//
// Fetches GET /api/admin/samples/approved-boxes on mount.
// Each card exposes:
//   - DISPATCH-READINESS strip: Direccion / Caja / Contenido chips (green/red)
//   - box-type <select> (from boxTypes prop)
//   - CONTENTS editor: add/remove rows of { variety, stems }
//   - ADDRESS inputs: street / city / state / zip (pre-filled from GET, editable)
//   - NOTES textarea
//   - "Guardar" button per box -> POST /api/admin/samples/approved-boxes
// Style: emerald-600 / slate, ASCII-clean Spanish, rounded-2xl.

'use client';

import { useEffect, useState, useCallback } from 'react';
import type { BoxType } from '@/lib/deal/types';
import type { ApprovedBox } from '@/app/api/admin/samples/approved-boxes/route';

interface Props {
  boxTypes: BoxType[];
}

type FetchStatus = 'idle' | 'loading' | 'done' | 'error';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ContentRow {
  variety: string;
  stems: string; // string for input; parsed to number on save
}

interface BoxState {
  boxType: string;
  contents: ContentRow[];
  street: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  // from server
  addressSource: 'edited' | 'parsed' | 'missing';
}

function isAddressComplete(s: BoxState): boolean {
  return (
    s.street.trim().length > 0 &&
    s.city.trim().length > 0 &&
    s.state.trim().length > 0 &&
    s.zip.trim().length > 0
  );
}
function isBoxTypeSet(s: BoxState): boolean {
  return s.boxType.trim().length > 0;
}
function isContentsSet(s: BoxState): boolean {
  return s.contents.some((r) => r.variety.trim().length > 0 && Number(r.stems) > 0);
}
function isDispatchReady(s: BoxState): boolean {
  return isAddressComplete(s) && isBoxTypeSet(s) && isContentsSet(s);
}

function ReadinessChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-0.5 border',
        ok
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-red-50 text-red-600 border-red-200',
      ].join(' ')}
    >
      {ok ? '✓' : '✗'} {label}
    </span>
  );
}

function BoxCard({
  box,
  boxTypes,
  onSaved,
}: {
  box: ApprovedBox;
  boxTypes: BoxType[];
  onSaved: (updated: Partial<ApprovedBox>) => void;
}) {
  const [state, setState] = useState<BoxState>(() => ({
    boxType: box.boxType ?? '',
    contents:
      box.contents.length > 0
        ? box.contents.map((c) => ({ variety: c.variety, stems: String(c.stems) }))
        : [{ variety: '', stems: '' }],
    street: box.ship?.street ?? '',
    city: box.ship?.city ?? '',
    state: box.ship?.state ?? '',
    zip: box.ship?.zip ?? '',
    notes: box.notes,
    addressSource: box.addressSource,
  }));

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const addContentRow = () => {
    setState((prev) => ({
      ...prev,
      contents: [...prev.contents, { variety: '', stems: '' }],
    }));
  };

  const removeContentRow = (idx: number) => {
    setState((prev) => ({
      ...prev,
      contents: prev.contents.filter((_, i) => i !== idx),
    }));
  };

  const updateContentRow = (idx: number, field: 'variety' | 'stems', val: string) => {
    setState((prev) => {
      const next = prev.contents.map((r, i) => (i === idx ? { ...r, [field]: val } : r));
      return { ...prev, contents: next };
    });
  };

  const handleSave = useCallback(async () => {
    if (saveStatus === 'saving') return;
    setSaveStatus('saving');
    setSaveError(null);

    // Build clean contents (skip empty rows)
    const contents = state.contents
      .filter((r) => r.variety.trim().length > 0 && Number(r.stems) > 0)
      .map((r) => ({ variety: r.variety.trim(), stems: Number(r.stems) }));

    const patch: Record<string, unknown> = {
      boxType: state.boxType.trim() || null,
      contents,
      ship: {
        street: state.street.trim(),
        city: state.city.trim(),
        state: state.state.trim(),
        zip: state.zip.trim(),
      },
      notes: state.notes,
    };

    try {
      const res = await fetch('/api/admin/samples/approved-boxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: box.id, patch }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; box?: Partial<ApprovedBox> };
      if (!res.ok || json.error) {
        setSaveStatus('error');
        setSaveError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setSaveStatus('saved');
      // Update addressSource to 'edited' after a successful save with address fields
      if (state.street.trim() || state.city.trim() || state.state.trim() || state.zip.trim()) {
        setState((prev) => ({ ...prev, addressSource: 'edited' }));
      }
      if (json.box) onSaved(json.box);
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }, [box.id, state, saveStatus, onSaved]);

  const ready = isDispatchReady(state);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-bold text-slate-800">{box.businessName || '--'}</span>
            {box.floraScore != null && (
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-full border border-emerald-200 px-2 py-0.5">
                FLORA {box.floraScore}
              </span>
            )}
            {box.zohoId && (
              <span className="text-[10px] text-slate-400 font-mono">Zoho: {box.zohoId}</span>
            )}
          </div>

          {/* Dispatch-readiness strip */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <ReadinessChip ok={isAddressComplete(state)} label="Direccion" />
            <ReadinessChip ok={isBoxTypeSet(state)} label="Caja" />
            <ReadinessChip ok={isContentsSet(state)} label="Contenido" />
            {ready && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-0.5 bg-emerald-600 text-white">
                Listo para dispatch
              </span>
            )}
          </div>

          {/* Address source note */}
          {!isAddressComplete(state) && state.addressSource === 'parsed' && (
            <p className="text-[11px] text-amber-600 mt-1">
              Direccion pre-cargada de FLORA (confirmar o editar abajo)
            </p>
          )}
          {state.addressSource === 'missing' && !isAddressComplete(state) && (
            <p className="text-[11px] text-red-500 mt-1">
              Sin direccion confirmada &mdash; ingresala abajo
            </p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-5">

        {/* Box type */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Tipo de caja
          </label>
          {boxTypes.length > 0 ? (
            <select
              value={state.boxType}
              onChange={(e) => setState((prev) => ({ ...prev, boxType: e.target.value }))}
              className="w-full sm:w-64 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">-- Elegir caja --</option>
              {boxTypes.map((bt) => (
                <option key={bt.boxType} value={bt.boxType}>
                  {bt.boxType}
                  {bt.stemsPerBox != null ? ` (${bt.stemsPerBox} tallos)` : ''}
                  {bt.vendor ? ` · ${bt.vendor}` : ''}
                  {bt.chargeableKg != null ? ` · ${bt.chargeableKg}kg` : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={state.boxType}
              onChange={(e) => setState((prev) => ({ ...prev, boxType: e.target.value }))}
              placeholder="Ej: QB, HB, SB..."
              className="w-full sm:w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          )}
          {/* Verified dims for selected box */}
          {state.boxType && (() => {
            const bt = boxTypes.find((b) => b.boxType === state.boxType);
            if (!bt) return null;
            const parts: string[] = [];
            if (bt.lengthCm && bt.widthCm && bt.heightCm) parts.push(`${bt.lengthCm}x${bt.widthCm}x${bt.heightCm}cm`);
            if (bt.chargeableKg) parts.push(`${bt.chargeableKg}kg chargeable`);
            if (bt.verifiedLabels && bt.verifiedLabels > 0) parts.push(`${bt.verifiedLabels} labels verificados`);
            return parts.length > 0 ? (
              <p className="text-[11px] text-emerald-700 mt-1 font-mono">{parts.join(' · ')}</p>
            ) : null;
          })()}
        </div>

        {/* Contents */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Contenido de la caja
            </label>
            <button
              type="button"
              onClick={addContentRow}
              className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold"
            >
              + Agregar variedad
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mb-2">
            Que va en la caja. Necesario para calcular el valor en aduana.
          </p>
          <div className="space-y-1.5">
            {state.contents.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={row.variety}
                  onChange={(e) => updateContentRow(idx, 'variety', e.target.value)}
                  placeholder="Variedad (ej: Freedom Red Rose)"
                  className="flex-1 min-w-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <input
                  type="number"
                  min={1}
                  value={row.stems}
                  onChange={(e) => updateContentRow(idx, 'stems', e.target.value)}
                  placeholder="Tallos"
                  className="w-20 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
                {state.contents.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeContentRow(idx)}
                    className="text-[12px] text-slate-400 hover:text-red-500 font-bold px-1"
                    title="Eliminar fila"
                  >
                    x
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Direccion de envio
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={state.street}
              onChange={(e) => setState((prev) => ({ ...prev, street: e.target.value }))}
              placeholder="Calle y numero"
              className="sm:col-span-2 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <input
              type="text"
              value={state.city}
              onChange={(e) => setState((prev) => ({ ...prev, city: e.target.value }))}
              placeholder="Ciudad"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={state.state}
                onChange={(e) => setState((prev) => ({ ...prev, state: e.target.value }))}
                placeholder="Estado (FL)"
                maxLength={2}
                className="w-20 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <input
                type="text"
                value={state.zip}
                onChange={(e) => setState((prev) => ({ ...prev, zip: e.target.value }))}
                placeholder="ZIP"
                maxLength={10}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Notas (opcional)
          </label>
          <textarea
            rows={2}
            value={state.notes}
            onChange={(e) => setState((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Comentarios para JJ o logistica..."
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 resize-y"
          />
        </div>

        {/* Save button + status */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={[
              'rounded-xl px-5 py-2 text-[13px] font-semibold transition-colors',
              saveStatus === 'saving'
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer',
            ].join(' ')}
          >
            {saveStatus === 'saving' ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                Guardando...
              </span>
            ) : 'Guardar'}
          </button>

          {saveStatus === 'saved' && (
            <span className="text-[12px] text-emerald-600 font-semibold">Guardado</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-[12px] text-red-500">
              Error: {saveError ?? 'desconocido'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ApprovedBoxesEditor({ boxTypes }: Props) {
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('idle');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<ApprovedBox[]>([]);

  useEffect(() => {
    setFetchStatus('loading');
    fetch('/api/admin/samples/approved-boxes', { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json()) as { boxes: ApprovedBox[]; error: string | null };
        setBoxes(json.boxes ?? []);
        if (json.error) setFetchError(json.error);
        setFetchStatus('done');
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : String(err));
        setFetchStatus('error');
      });
  }, []);

  const handleSaved = useCallback((id: string, updated: Partial<ApprovedBox>) => {
    setBoxes((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updated } : b)),
    );
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
        <div className="text-[13px] font-semibold text-slate-700 uppercase tracking-wide">
          Cajas aprobadas &mdash; completar para dispatch
        </div>
        {fetchStatus === 'done' && (
          <div className="text-[12px] text-slate-400 mt-0.5">
            {boxes.length === 0
              ? 'Sin cajas aprobadas todavia'
              : `${boxes.length} caja${boxes.length === 1 ? '' : 's'} aprobada${boxes.length === 1 ? '' : 's'} &mdash; agregar direccion, tipo y contenido`}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {/* Loading */}
        {(fetchStatus === 'idle' || fetchStatus === 'loading') && (
          <div className="flex items-center gap-2 py-6 justify-center text-slate-400 text-[13px]">
            <span className="inline-block h-4 w-4 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
            Cargando cajas aprobadas...
          </div>
        )}

        {/* Fetch error */}
        {fetchStatus === 'error' && (
          <div className="py-6 text-center text-[13px] text-red-500">
            Error al cargar:{' '}
            <span className="font-mono text-[11px]">{fetchError ?? 'unknown'}</span>
          </div>
        )}

        {/* API-level warning (200 but error field set) */}
        {fetchStatus === 'done' && fetchError && (
          <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-700">
            Aviso: {fetchError}
          </div>
        )}

        {/* Empty state */}
        {fetchStatus === 'done' && boxes.length === 0 && (
          <div className="py-8 text-center text-[13px] text-slate-400">
            Sin cajas aprobadas todavia &mdash; aproba una cuenta en el panel de arriba y aparece aca.
          </div>
        )}

        {/* Box cards */}
        {fetchStatus === 'done' && boxes.length > 0 && (
          <div className="space-y-4">
            {boxes.map((box) => (
              <BoxCard
                key={box.id}
                box={box}
                boxTypes={boxTypes}
                onSaved={(updated) => handleSaved(box.id, updated)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
