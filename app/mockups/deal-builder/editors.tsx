// MOCKUP — Reusable editors (BoxUpsert + VarietyUpsert) for the Deal Builder.
// These are the SAME editors invoked from /admin/catalog edit and config/boxes.
// v2 | 2026-06-09 | Job_PM (CPO). No data wiring.
'use client';

import { useState } from 'react';
import { DIM_DIVISOR, RATE_PER_KG, money } from './data';

// ---------------------------------------------------------------------------
// Shared atoms (house style: emerald-600 primary, slate scale, rounded)
// ---------------------------------------------------------------------------

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 ' +
  'shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';

export function ReusableBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
      <span aria-hidden className="text-emerald-500">&#9851;</span>
      Editor reusable
      <span className="font-normal text-emerald-600/80">&middot; {children}</span>
    </span>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

function EstCell({
  label,
  value,
  sub,
  hot,
}: {
  label: string;
  value: string;
  sub: string;
  hot?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={'mt-0.5 text-base font-semibold tabular-nums ' + (hot ? 'text-emerald-700' : 'text-slate-800')}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-slate-400">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VarietyUpsert — create / edit a variety (cost + source + disposition)
// ---------------------------------------------------------------------------

export interface NewVariety {
  name: string;
  cost: string;
  source: string;
  country: string;
  disposition: 'one_off' | 'tier' | 'temp_promo';
  tier: string;
  expiry: string;
}

export function VarietyUpsert({
  onAdd,
}: {
  onAdd: (v: NewVariety) => void;
}) {
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [source, setSource] = useState('');
  const [country, setCountry] = useState('Ecuador');
  const [disposition, setDisposition] = useState<NewVariety['disposition']>('one_off');
  const [tier, setTier] = useState('T2');
  const [expiry, setExpiry] = useState('2026-07-15');

  const ready = name.trim() !== '' && cost.trim() !== '' && source.trim() !== '';

  function submit() {
    if (!ready) return;
    onAdd({ name, cost, source, country, disposition, tier, expiry });
    setName('');
    setCost('');
    setSource('');
  }

  const canonical = disposition === 'tier';

  return (
    <section className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/70 to-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 px-5 py-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Crear variedad</h3>
            <ReusableBadge>el mismo &ldquo;edit&rdquo; de /admin/catalog</ReusableBadge>
          </div>
          <p className="mt-1 text-[12px] text-slate-500">
            La variedad creada aca aparece como una linea en el box (paso 2). Todo costo necesita SOURCE.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Variedad">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. Playa Blanca" />
        </Field>
        <Field label="Costo farm / stem" hint="costo de catalogo">
          <input className={inputCls} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.31" inputMode="decimal" />
        </Field>
        <Field label="Source / provenance" hint="disciplina del source-ladder">
          <input className={inputCls} value={source} onChange={(e) => setSource(e.target.value)} placeholder="vendor quote Ecoroses 06-09" />
        </Field>
        <Field label="Pais">
          <input className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} />
        </Field>
      </div>

      <div className="px-5 pb-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Disposicion</div>
        <p className="mb-2 mt-0.5 text-[11px] text-slate-400">Hay que ser explicito. Define que pasa con este precio nuevo.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([
            ['one_off', 'one-off', 'Solo este cliente. Vive en el deal — lo escribe JJ.'],
            ['tier', 'tier -> canonical', 'Se agrega a la pricing canonica. Propuesta a Rose.'],
            ['temp_promo', 'promo temporal', 'Promocion con fecha de expiracion.'],
          ] as const).map(([val, title, desc]) => {
            const active = disposition === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => setDisposition(val)}
                className={
                  'rounded-xl border px-3 py-2.5 text-left transition ' +
                  (active
                    ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100'
                    : 'border-slate-200 bg-white hover:border-slate-300')
                }
              >
                <div className={'text-[13px] font-semibold ' + (active ? 'text-emerald-700' : 'text-slate-700')}>{title}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{desc}</div>
              </button>
            );
          })}
        </div>

        {disposition === 'tier' && (
          <div className="mt-3 w-40">
            <Field label="Tier destino">
              <select className={inputCls} value={tier} onChange={(e) => setTier(e.target.value)}>
                <option>T1</option>
                <option>T2</option>
                <option>T3</option>
              </select>
            </Field>
          </div>
        )}
        {disposition === 'temp_promo' && (
          <div className="mt-3 w-48">
            <Field label="Expira">
              <input type="date" className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="text-[12px] text-slate-500">
            {canonical ? (
              <span className="text-amber-600">Canonico &mdash; requiere aprobacion de Facu (propuesta a Rose).</span>
            ) : (
              <span>one-off / promo &mdash; dentro de los guardrails de JJ.</span>
            )}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!ready}
            className={
              'rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition ' +
              (ready ? 'bg-emerald-600 hover:bg-emerald-700' : 'cursor-not-allowed bg-slate-300')
            }
          >
            Agregar variedad al box &rarr;
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// BoxUpsert — create / edit a box with LIVE FedEx cost estimate
// ---------------------------------------------------------------------------

export function BoxUpsert() {
  const [L, setL] = useState(100);
  const [W, setW] = useState(40);
  const [H, setH] = useState(40);
  const [cap, setCap] = useState(600);
  const [unit, setUnit] = useState('stems');
  const [country, setCountry] = useState('Ecuador');
  const [available, setAvailable] = useState(true);

  const realKg = 18; // mock measured weight
  const dimKg = (L * W * H) / DIM_DIVISOR;
  const chargeableKg = Math.max(realKg, dimKg);
  const boxFreight = chargeableKg * RATE_PER_KG;
  const freightPerUnit = cap > 0 ? boxFreight / cap : 0;

  return (
    <section className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/70 to-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 px-5 py-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Subir caja nueva</h3>
            <ReusableBadge>el mismo &ldquo;edit&rdquo; de config de boxes</ReusableBadge>
          </div>
          <p className="mt-1 text-[12px] text-slate-500">
            Dimensiones + capacidad &rarr; estimo el costo/unidad con la config FedEx en vivo.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Largo cm">
          <input type="number" className={inputCls} value={L} onChange={(e) => setL(+e.target.value)} />
        </Field>
        <Field label="Ancho cm">
          <input type="number" className={inputCls} value={W} onChange={(e) => setW(+e.target.value)} />
        </Field>
        <Field label="Alto cm">
          <input type="number" className={inputCls} value={H} onChange={(e) => setH(+e.target.value)} />
        </Field>
        <Field label="Capacidad">
          <input type="number" className={inputCls} value={cap} onChange={(e) => setCap(+e.target.value)} />
        </Field>
        <Field label="Unidad">
          <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option>stems</option>
            <option>bunches</option>
            <option>grams</option>
          </select>
        </Field>
        <Field label="Pais">
          <input className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} />
        </Field>
      </div>

      <div className="px-5">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Estimacion FedEx en vivo
        </div>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <EstCell label="Peso dim" value={`${dimKg.toFixed(1)} kg`} sub="L x W x H / 6000" />
          <EstCell label="Kg cobrable" value={`${chargeableKg.toFixed(1)} kg`} sub={`max(real ${realKg}, dim)`} />
          <EstCell label="Costo caja" value={money(boxFreight)} sub="kg x $6.5" />
          <EstCell label={`Costo / ${unit}`} value={money(freightPerUnit)} sub={`/ ${cap} ${unit}`} hot />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-slate-700">
          <button
            type="button"
            role="switch"
            aria-checked={available}
            onClick={() => setAvailable((v) => !v)}
            className={
              'relative h-5 w-9 rounded-full transition ' + (available ? 'bg-emerald-600' : 'bg-slate-300')
            }
          >
            <span
              className={
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ' +
                (available ? 'left-[18px]' : 'left-0.5')
              }
            />
          </button>
          Disponible para otros clientes <span className="text-slate-400">(canonico)</span>
        </label>
        <button
          type="button"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
        >
          Enviar a approval queue &middot; <span className="font-mono text-[12px]">box_master.create</span>
        </button>
      </div>
    </section>
  );
}
