// Reusable variety editor. Embeddable from Deal Builder and /admin/catalog edit.
// v2 | 2026-06-16 | Job_PM (CPO)
//
// Does NOT write canonical catalog data. Three actions (Flow B: admin proposes,
// Rose applies):
//   add_variety     -> propose a new product
//   update_identity -> correct an existing SKU's identity
//   quarantine      -> pull an existing SKU
// All three POST to /api/admin/inventory/propose, which runs the cost-verify gate
// (SENSE / UNITS / COST 3-lens) and writes a PROPOSAL to admin_proposals (verdict in
// payload.verification) -> approval queue. ZERO writes to dim_sku / mirrors.
//
// BACKWARD-COMPAT: the Deal Builder mounts <VarietyUpsert onSaved={...} /> in
// add-only mode. The default action is 'add_variety', so the Deal Builder keeps
// compiling + working unchanged (it just gets the verification gate for free).
// Self-contained: own loading/error/success state. Drop it anywhere.

'use client';

import { useState } from 'react';

type Disposition = 'one_off' | 'tier' | 'temp_promo';
type Action = 'add_variety' | 'update_identity' | 'quarantine';

interface ExistingVariety {
  variety: string;
  farmCost?: number;
  source?: string;
  country?: string;
  grade?: string;
  skuId?: string; // dim_sku.sku_id — required to correct/quarantine an existing SKU
}

interface Props {
  existing?: ExistingVariety | null;
  onSaved?: (proposalId: string) => void;
  compact?: boolean;
  // When true, expose the identity-correction + quarantine actions (needs `existing`
  // with a skuId). Deal Builder leaves this off -> add-only, unchanged behavior.
  allowIdentityActions?: boolean;
  // Optional pre-fill for the category field (one-click correction: a no-category
  // SKU's sibling-suggested category). Default undefined -> existing callers
  // (catalog grid, SKU detail, Deal Builder) keep an empty category, unchanged.
  defaultCategory?: string;
  // Optional default action so a caller can land directly on 'update_identity'
  // (the corrections lever). Default 'add_variety' -> existing callers unchanged.
  defaultAction?: Action;
}

export default function VarietyUpsert({ existing = null, onSaved, compact = false, allowIdentityActions = false, defaultCategory, defaultAction }: Props) {
  const [action, setAction] = useState<Action>(defaultAction ?? 'add_variety');
  const [variety, setVariety] = useState(existing?.variety ?? '');
  const [category, setCategory] = useState(defaultCategory ?? '');
  const [boxType, setBoxType] = useState('');
  const [pack, setPack] = useState('');
  const [farmCost, setFarmCost] = useState(existing?.farmCost != null ? String(existing.farmCost) : '');
  const [source, setSource] = useState(existing?.source ?? '');
  const [country, setCountry] = useState(existing?.country ?? '');
  const [grade, setGrade] = useState(existing?.grade ?? '');
  const [disposition, setDisposition] = useState<Disposition>('one_off');
  const [tier, setTier] = useState<'T2' | 'T3'>('T2');
  const [promoExpiresAt, setPromoExpiresAt] = useState('');
  const [reason, setReason] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);

  async function submit() {
    if (action === 'add_variety' && variety.trim().length === 0) {
      setError('El nombre de la variedad es obligatorio.');
      return;
    }
    if (action !== 'add_variety' && !existing?.skuId) {
      setError('Para corregir o cuarentenar se necesita un SKU existente.');
      return;
    }
    if (disposition === 'temp_promo' && promoExpiresAt.trim().length === 0) {
      setError('Defini la fecha de vencimiento de la promo temporal.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/inventory/propose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          variety: variety.trim() || null,
          category: category.trim() || null,
          boxType: boxType.trim() || null,
          pack: pack.trim() === '' ? null : Number(pack),
          farmCost: farmCost.trim() === '' ? null : Number(farmCost),
          source: source.trim() || null,
          country: country.trim() || null,
          grade: grade.trim() || null,
          targetSkuId: existing?.skuId ?? null,
          reason: reason.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.detail ? `${json.error}: ${json.detail}` : (json.error ?? `HTTP ${res.status}`));
      }
      setSavedId(json.proposalId);
      setVerdict(typeof json.verdict === 'string' ? json.verdict : null);
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
          {action === 'add_variety' ? 'Agregar variedad' : action === 'update_identity' ? 'Corregir identidad' : 'Cuarentenar SKU'}
        </h3>
        <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
          Verifica antes de Facu &middot; no escribe dim_sku
        </span>
      </div>

      {allowIdentityActions && (
        <div>
          <label className={labelCls}>Accion</label>
          <div className="flex flex-wrap gap-2">
            {(['add_variety', 'update_identity', 'quarantine'] as Action[]).map((a) => {
              const labels: Record<Action, string> = {
                add_variety: 'Agregar',
                update_identity: 'Corregir identidad',
                quarantine: 'Cuarentenar',
              };
              const disabled = a !== 'add_variety' && !existing?.skuId;
              const active = action === a;
              return (
                <button
                  key={a}
                  type="button"
                  disabled={disabled}
                  onClick={() => setAction(a)}
                  className={
                    'text-sm font-medium px-3 py-1.5 rounded-lg border ' +
                    (active
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50') +
                    (disabled ? ' opacity-40 cursor-not-allowed' : '')
                  }
                >
                  {labels[a]}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
        <div>
          <label className={labelCls}>Categoria</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="ej. Bouquet"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Tipo de caja</label>
          <input
            type="text"
            value={boxType}
            onChange={(e) => setBoxType(e.target.value)}
            placeholder="ej. QB / HB / EB"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Tallos en la caja</label>
          <input
            type="number"
            min="0"
            value={pack}
            onChange={(e) => setPack(e.target.value)}
            placeholder="ej. 125"
            className={inputCls}
          />
        </div>
      </div>

      {action !== 'add_variety' && (
        <div>
          <label className={labelCls}>{action === 'quarantine' ? 'Motivo de cuarentena' : 'Motivo de la correccion'}</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={action === 'quarantine' ? 'ej. calidad inconsistente' : 'ej. variedad mal normalizada'}
            className={inputCls}
          />
        </div>
      )}

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
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-800 flex flex-wrap items-center gap-1.5">
          <span aria-hidden>&#10003;</span> Propuesta verificada y enviada a la cola de aprobacion
          <span className="font-mono font-normal text-emerald-700"> ({savedId})</span>
          {verdict && (
            <span
              className={
                'ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ' +
                (verdict === 'decente'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : verdict === 'caro'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : verdict === 'sospechoso'
                      ? 'bg-red-100 text-red-800 border-red-300'
                      : 'bg-slate-100 text-slate-700 border-slate-300')
              }
            >
              costo: {verdict}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="text-sm font-semibold px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy
              ? 'Verificando...'
              : action === 'add_variety'
                ? 'Verificar y proponer variedad'
                : action === 'update_identity'
                  ? 'Verificar y proponer correccion'
                  : 'Proponer cuarentena'}
          </button>
          <span className="text-[10px] text-slate-400">No escribe data canonica &mdash; verifica costo/unidad y va a la cola.</span>
        </div>
      )}
    </div>
  );
}
