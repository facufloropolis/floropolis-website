// Reusable box editor. Embeddable from Deal Builder and the boxes config screen.
// v1 | 2026-06-09 | Job_PM (CPO)
//
// Does NOT write canonical box_master data. POSTs to /api/admin/box-upsert,
// which writes a PROPOSAL to public.admin_proposals (BACKUP) -> approval queue.
// Shows a LIVE FedEx estimate (dim kg, chargeable kg, freight, cost/unit) using
// the same pure estimator the server recomputes. Self-contained + embeddable.

'use client';

import { useMemo, useState } from 'react';
import { estimateBoxCost } from '@/lib/deal/fedex-estimate';

type CapacityUnit = 'stems' | 'bunches' | 'grams';

interface ExistingBox {
  boxType: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  capacity?: number;
  capacityUnit?: string;
  realKg?: number;
}

interface Props {
  existing?: ExistingBox | null;
  onSaved?: (proposalId: string) => void;
  compact?: boolean;
}

function numOr0(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const UNIT_LABEL: Record<CapacityUnit, string> = {
  stems: 'tallo',
  bunches: 'bunch',
  grams: 'gramo',
};

export default function BoxUpsert({ existing = null, onSaved, compact = false }: Props) {
  const isUpdate = !!existing;

  const [boxType, setBoxType] = useState(existing?.boxType ?? '');
  const [lengthCm, setLengthCm] = useState(existing?.lengthCm != null ? String(existing.lengthCm) : '');
  const [widthCm, setWidthCm] = useState(existing?.widthCm != null ? String(existing.widthCm) : '');
  const [heightCm, setHeightCm] = useState(existing?.heightCm != null ? String(existing.heightCm) : '');
  const [capacity, setCapacity] = useState(existing?.capacity != null ? String(existing.capacity) : '');
  const [capacityUnit, setCapacityUnit] = useState<CapacityUnit>(
    (existing?.capacityUnit as CapacityUnit) ?? 'stems',
  );
  const [country, setCountry] = useState('');
  const [realKg, setRealKg] = useState(existing?.realKg != null ? String(existing.realKg) : '');
  const [availableToOthers, setAvailableToOthers] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const estimate = useMemo(
    () =>
      estimateBoxCost({
        lengthCm: numOr0(lengthCm),
        widthCm: numOr0(widthCm),
        heightCm: numOr0(heightCm),
        realKg: numOr0(realKg),
        capacity: numOr0(capacity),
      }),
    [lengthCm, widthCm, heightCm, realKg, capacity],
  );

  async function submit() {
    if (boxType.trim().length === 0) {
      setError('El tipo de caja es obligatorio.');
      return;
    }
    if (numOr0(lengthCm) <= 0 || numOr0(widthCm) <= 0 || numOr0(heightCm) <= 0) {
      setError('Las dimensiones (largo, ancho, alto) deben ser numeros mayores a cero.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/box-upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          boxType: boxType.trim(),
          lengthCm: numOr0(lengthCm),
          widthCm: numOr0(widthCm),
          heightCm: numOr0(heightCm),
          capacity: numOr0(capacity),
          capacityUnit,
          country: country.trim() || null,
          realKg: realKg.trim() === '' ? null : numOr0(realKg),
          availableToOthers,
          isUpdate,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.detail ? `${json.error}: ${json.detail}` : (json.error ?? `HTTP ${res.status}`));
      }
      setSavedId(json.proposalId);
      onSaved?.(json.proposalId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1';
  const inputCls =
    'w-full text-sm rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const gap = compact ? 'gap-2' : 'gap-3';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{isUpdate ? 'Editar caja' : 'Agregar caja'}</h3>
        <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
          Editor reusable &middot; mismo edit de config de boxes
        </span>
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${gap}`}>
        <div className="sm:col-span-2">
          <label className={labelCls}>Tipo de caja</label>
          <input
            type="text"
            value={boxType}
            onChange={(e) => setBoxType(e.target.value)}
            placeholder="ej. HB (Half Box)"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Largo (cm)</label>
          <input type="number" step="0.1" min="0" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} placeholder="0" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Ancho (cm)</label>
          <input type="number" step="0.1" min="0" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} placeholder="0" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Alto (cm)</label>
          <input type="number" step="0.1" min="0" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="0" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Peso real (kg)</label>
          <input type="number" step="0.1" min="0" value={realKg} onChange={(e) => setRealKg(e.target.value)} placeholder="0" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Capacidad</label>
          <input type="number" step="1" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="0" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Unidad de capacidad</label>
          <select value={capacityUnit} onChange={(e) => setCapacityUnit(e.target.value as CapacityUnit)} className={inputCls}>
            <option value="stems">stems</option>
            <option value="bunches">bunches</option>
            <option value="grams">grams</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Pais</label>
          <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="ej. Ecuador" className={inputCls} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={availableToOthers}
              onChange={(e) => setAvailableToOthers(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Disponible para otros
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Estimacion FedEx (live)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div>
            <div className="text-[10px] text-slate-400">dim kg</div>
            <div className="font-mono text-slate-700">{estimate.dimKg.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">chargeable kg</div>
            <div className="font-mono text-slate-700">{estimate.chargeableKg.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">flete caja (USD)</div>
            <div className="font-mono text-slate-700">{estimate.boxFreight.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">costo / {UNIT_LABEL[capacityUnit]} (USD)</div>
            <div className="font-mono font-semibold text-emerald-700">{estimate.costPerUnit.toFixed(4)}</div>
          </div>
        </div>
      </div>

      {error && <p className="text-[11px] text-red-600 font-mono whitespace-normal">{error}</p>}

      {savedId ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-800 flex items-center gap-1.5">
          <span aria-hidden>&#10003;</span> Propuesta enviada a la cola de aprobacion
          <span className="font-mono font-normal text-emerald-700"> ({savedId})</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="text-sm font-semibold px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Enviando...' : isUpdate ? 'Proponer cambio' : 'Proponer caja'}
          </button>
          <span className="text-[10px] text-slate-400">No escribe data canonica &mdash; va a la cola de aprobacion.</span>
        </div>
      )}
    </div>
  );
}
