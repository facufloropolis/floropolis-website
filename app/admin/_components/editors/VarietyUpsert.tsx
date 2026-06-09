// Reusable variety editor. Embeddable from Deal Builder and /admin/catalog edit.
// v1 | 2026-06-09 | Job_PM (CPO)
//
// Does NOT write canonical catalog data. POSTs to /api/admin/variety-upsert,
// which writes a PROPOSAL to public.admin_proposals (BACKUP) -> approval queue.
// Self-contained: own loading/error/success state. Drop it anywhere.

'use client';

import { useState } from 'react';

type Disposition = 'one_off' | 'tier' | 'temp_promo';

interface ExistingVariety {
  variety: string;
  farmCost?: number;
  source?: string;
  country?: string;
  grade?: string;
}

interface Props {
  existing?: ExistingVariety | null;
  onSaved?: (proposalId: string) => void;
  compact?: boolean;
}

export default function VarietyUpsert({ existing = null, onSaved, compact = false }: Props) {
  const isUpdate = !!existing;

  const [variety, setVariety] = useState(existing?.variety ?? '');
  const [farmCost, setFarmCost] = useState(existing?.farmCost != null ? String(existing.farmCost) : '');
  const [source, setSource] = useState(existing?.source ?? '');
  const [country, setCountry] = useState(existing?.country ?? '');
  const [grade, setGrade] = useState(existing?.grade ?? '');
  const [disposition, setDisposition] = useState<Disposition>('one_off');
  const [tier, setTier] = useState<'T2' | 'T3'>('T2');
  const [promoExpiresAt, setPromoExpiresAt] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function submit() {
    if (variety.trim().length === 0) {
      setError('El nombre de la variedad es obligatorio.');
      return;
    }
    if (disposition === 'temp_promo' && promoExpiresAt.trim().length === 0) {
      setError('Defini la fecha de vencimiento de la promo temporal.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/variety-upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          variety: variety.trim(),
          farmCost: farmCost.trim() === '' ? null : Number(farmCost),
          source: source.trim() || null,
          country: country.trim() || null,
          grade: grade.trim() || null,
          disposition,
          tier: disposition === 'tier' ? tier : undefined,
          promoExpiresAt: disposition === 'temp_promo' ? promoExpiresAt : undefined,
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
        <h3 className="text-sm font-semibold text-slate-800">
          {isUpdate ? 'Editar variedad' : 'Agregar variedad'}
        </h3>
        <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
          Editor reusable &middot; mismo edit de /admin/catalog
        </span>
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${gap}`}>
        <div className="sm:col-span-2">
          <label className={labelCls}>Variedad</label>
          <input
            type="text"
            value={variety}
            onChange={(e) => setVariety(e.target.value)}
            placeholder="ej. Freedom Red Rose"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Costo de granja / tallo (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={farmCost}
            onChange={(e) => setFarmCost(e.target.value)}
            placeholder="0.00"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Grade</label>
          <input
            type="text"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="ej. 50cm / Select"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Source</label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="ej. Vendor X"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Pais</label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="ej. Ecuador"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Disposicion</label>
        <div className="flex flex-wrap gap-2">
          {(['one_off', 'tier', 'temp_promo'] as Disposition[]).map((d) => {
            const labels: Record<Disposition, string> = {
              one_off: 'One-off',
              tier: 'Tier',
              temp_promo: 'Promo temporal',
            };
            const active = disposition === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDisposition(d)}
                className={
                  'text-sm font-medium px-3 py-1.5 rounded-lg border ' +
                  (active
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50')
                }
              >
                {labels[d]}
              </button>
            );
          })}
        </div>
      </div>

      {disposition === 'tier' && (
        <div>
          <label className={labelCls}>Tier</label>
          <select value={tier} onChange={(e) => setTier(e.target.value as 'T2' | 'T3')} className={inputCls}>
            <option value="T2">T2</option>
            <option value="T3">T3</option>
          </select>
        </div>
      )}

      {disposition === 'temp_promo' && (
        <div>
          <label className={labelCls}>Vence el</label>
          <input
            type="date"
            value={promoExpiresAt}
            onChange={(e) => setPromoExpiresAt(e.target.value)}
            className={inputCls}
          />
        </div>
      )}

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
            {busy ? 'Enviando...' : isUpdate ? 'Proponer cambio' : 'Proponer variedad'}
          </button>
          <span className="text-[10px] text-slate-400">No escribe data canonica &mdash; va a la cola de aprobacion.</span>
        </div>
      )}
    </div>
  );
}
