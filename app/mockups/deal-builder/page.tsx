// MOCKUP — Deal Builder (sales arma deals custom para standing orders).
// v2 | 2026-06-09 | Job_PM (CPO) — Stage 2 (MOCKUP) del build law.
//
// Professional redesign. No data wiring; numbers illustrative but realistic.
// Layout: top banner -> client picker + client-intel panel -> two-column body
//   LEFT  = build steps (variety lines, VarietyUpsert, packing, BoxUpsert, learning edit)
//   RIGHT = sticky rail (price slider to floor + GPM, approval state, approval queue)
// Keeps: reusable BoxUpsert + VarietyUpsert (tagged), live FedEx estimate,
//   price slider that cannot cross the floor (GPM 5%), the send-to-queue step.
'use client';

import { useMemo, useState } from 'react';
import {
  CLIENTS,
  HEAT_STYLE,
  INITIAL_LINES,
  BOX_PACKS,
  GPM_FLOOR,
  money,
  type Client,
  type VarietyLine,
} from './data';
import { VarietyUpsert, BoxUpsert, type NewVariety } from './editors';

// ===========================================================================
// Page
// ===========================================================================

export default function DealBuilderMockup() {
  const [clientId, setClientId] = useState<string>('c-vbf');
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingClient, setAddingClient] = useState(false);

  const [lines, setLines] = useState<VarietyLine[]>(INITIAL_LINES);
  const [price, setPrice] = useState(231.5);

  const client = CLIENTS.find((c) => c.id === clientId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CLIENTS;
    return CLIENTS.filter((c) => c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q));
  }, [search]);

  // Cost build-up from the box packing.
  const cost = useMemo(() => BOX_PACKS.reduce((s, b) => s + b.cost, 0), []);
  const totalStems = useMemo(() => BOX_PACKS.reduce((s, b) => s + b.used, 0), []);
  const floor = cost / (1 - GPM_FLOOR);
  const gpm = price > 0 ? (1 - cost / price) * 100 : 0;
  const belowFloor = price < floor;

  // Approval rule logic.
  const hasCanonical = lines.some((l) => l.disposition === 'tier');
  const needsFacu = hasCanonical || belowFloor;

  function addVariety(v: NewVariety) {
    const c = parseFloat(v.cost) || 0;
    const fl = +(c / (1 - GPM_FLOOR)).toFixed(2);
    setLines((prev) => [
      ...prev,
      {
        id: 'l' + (prev.length + 1) + '-' + Date.now(),
        variety: v.name,
        grade: '—',
        stems: 0,
        box: 'sin asignar',
        costPerStem: c,
        floorPerStem: fl,
        pricePerStem: +(fl * 1.18).toFixed(2),
        disposition: v.disposition,
        isNew: true,
      },
    ]);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top banner */}
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-amber-700">
        MOCKUP &mdash; no data wiring
      </div>

      <div className="mx-auto max-w-[1280px] px-4 py-7 sm:px-6">
        {/* Page header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[12px] font-medium text-emerald-700">Config &middot; Sales</div>
            <h1 className="mt-0.5 text-[28px] font-bold leading-tight text-slate-900">Deal Builder</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              JJ arma un deal custom con un cliente &mdash; sobre todo standing orders (recurring
              revenue). Empieza con los precios de catalogo y empuja el precio hasta el floor (GPM 5%)
              para ganar la recurrencia.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> draft
            </span>
          </div>
        </div>

        {/* Client picker */}
        <div className="relative mb-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cliente</div>
              <div className="relative min-w-[280px] flex-1">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-left text-sm shadow-sm transition hover:border-slate-400"
                >
                  <span className={client ? 'font-medium text-slate-800' : 'text-slate-400'}>
                    {client ? `${client.name} · ${client.city}` : 'Buscar cliente...'}
                  </span>
                  <span className="text-slate-400">&#9662;</span>
                </button>

                {pickerOpen && (
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    <div className="border-b border-slate-100 p-2">
                      <input
                        autoFocus
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por nombre o ciudad..."
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      />
                    </div>
                    <ul className="max-h-64 overflow-auto py-1">
                      {filtered.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setClientId(c.id);
                              setPickerOpen(false);
                              setSearch('');
                            }}
                            className={
                              'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-slate-50 ' +
                              (c.id === clientId ? 'bg-emerald-50/60' : '')
                            }
                          >
                            <span>
                              <span className="font-medium text-slate-800">{c.name}</span>
                              <span className="ml-2 text-[12px] text-slate-400">{c.city}</span>
                            </span>
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                              origen: {c.source}
                            </span>
                          </button>
                        </li>
                      ))}
                      {filtered.length === 0 && (
                        <li className="px-3 py-3 text-center text-[13px] text-slate-400">Sin resultados</li>
                      )}
                    </ul>
                    <div className="border-t border-slate-100 p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAddingClient(true);
                          setPickerOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                      >
                        <span className="text-lg leading-none">+</span> Agregar cliente nuevo
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setAddingClient(true)}
                className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
              >
                + Cliente nuevo
              </button>
            </div>

            {addingClient && <AddClientForm onClose={() => setAddingClient(false)} />}
          </div>
        </div>

        {/* Client intel panel */}
        {client && <ClientIntelPanel client={client} />}

        {/* Body: build steps (left) + sticky rail (right) */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_minmax(320px,360px)]">
          {/* LEFT — build steps */}
          <div className="space-y-5">
            {/* Deal type bar */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Meta label="Tipo de deal" value="Standing order" />
                <Meta label="Cadencia" value="Semanal (martes)" />
                <Meta label="Expira" value="2026-12-09" />
              </div>
            </div>

            {/* Step 1 — variety lines */}
            <Step n={1} title="Variedades del box" hint="Costo de catalogo -> precio que baja hasta el floor.">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <Th className="text-left">Variedad</Th>
                      <Th>Grade</Th>
                      <Th>Stems</Th>
                      <Th>Caja</Th>
                      <Th className="text-right">Costo/stem</Th>
                      <Th className="text-right">Floor/stem</Th>
                      <Th className="text-right">Precio/stem</Th>
                      <Th>Disposicion</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/60">
                        <Td className="text-left">
                          <span className={l.isNew ? 'font-medium text-emerald-700' : 'font-medium text-slate-800'}>
                            {l.variety}
                          </span>
                          {l.isNew && (
                            <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              nueva
                            </span>
                          )}
                        </Td>
                        <Td>{l.grade}</Td>
                        <Td className="tabular-nums">{l.stems || '—'}</Td>
                        <Td>{l.box}</Td>
                        <Td className="text-right tabular-nums">{money(l.costPerStem)}</Td>
                        <Td className="text-right tabular-nums text-slate-400">{money(l.floorPerStem)}</Td>
                        <Td className="text-right font-medium tabular-nums">{money(l.pricePerStem)}</Td>
                        <Td>
                          <DispChip d={l.disposition} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  + Variedad existente (catalogo)
                </button>
                <span className="self-center text-[12px] text-slate-400">
                  o crea una nueva abajo &darr; (aparece como linea aca)
                </span>
              </div>
            </Step>

            {/* Step 1b — VarietyUpsert (reusable) */}
            <VarietyUpsert onAdd={addVariety} />

            {/* Step 2 — packing */}
            <Step n={2} title="Packing en cajas" hint="Como entran los stems en las cajas actuales (optimizar) o en una nueva.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {BOX_PACKS.map((b) => {
                  const free = b.capacity - b.used;
                  const pct = Math.min(100, Math.round((b.used / b.capacity) * 100));
                  return (
                    <div key={b.name} className="rounded-xl border border-slate-200 bg-white p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">{b.name}</span>
                        <span className="text-[12px] text-slate-500">{b.contents.split(' + ').length} variedad(es)</span>
                      </div>
                      <div className="mt-1 text-[12px] text-slate-500">{b.contents}</div>
                      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={'h-full ' + (free === 0 ? 'bg-emerald-600' : 'bg-emerald-400')} style={{ width: pct + '%' }} />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">
                          {b.used} / {b.capacity} {b.unit}
                        </span>
                        <span className={free === 0 ? 'font-medium text-emerald-700' : 'text-amber-600'}>
                          {free === 0 ? 'lleno' : `${free} libres`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  Elegir caja existente
                </button>
                <span className="self-center text-[12px] text-slate-400">o sube una nueva abajo &darr;</span>
              </div>
            </Step>

            {/* Step 2b — BoxUpsert (reusable) */}
            <BoxUpsert />

            {/* Learning loop edit */}
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  Loop de aprendizaje
                </span>
                <span className="text-[12px] text-slate-400">editar capacidad de una caja existente</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
                Ej: Ecoroses hace un pack especial y entran <span className="font-medium text-slate-800">560 stems</span> (no 500)
                en HB-Std. Editas la capacidad &rarr; propuesta{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px] text-slate-700">box_master.update_capacity</code>{' '}
                &rarr; aprendemos cuantos stems de cada variedad entran en cada caja.
              </p>
              <button className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Editar capacidad (abre el mismo BoxUpsert)
              </button>
            </div>
          </div>

          {/* RIGHT — sticky rail */}
          <div className="lg:sticky lg:top-5 lg:self-start">
            <div className="space-y-4">
              {/* Approval state */}
              <ApprovalBanner needsFacu={needsFacu} hasCanonical={hasCanonical} belowFloor={belowFloor} />

              {/* Price + cost build-up */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-3.5">
                  <h3 className="text-sm font-semibold text-slate-800">Precio del deal</h3>
                  <p className="mt-0.5 text-[12px] text-slate-500">por entrega semanal &middot; {totalStems} stems</p>
                </div>

                <div className="px-5 py-4">
                  {/* Cost rows */}
                  <dl className="space-y-1.5 text-[13px]">
                    {BOX_PACKS.map((b) => (
                      <div key={b.name} className="flex items-center justify-between text-slate-500">
                        <dt>
                          {b.name} <span className="text-slate-400">({b.used} {b.unit})</span>
                        </dt>
                        <dd className="tabular-nums">{money(b.cost)}</dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 font-medium text-slate-700">
                      <dt>Costo armado total</dt>
                      <dd className="tabular-nums">{money(cost)}</dd>
                    </div>
                  </dl>

                  {/* Big price */}
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-end justify-between">
                      <span className="text-[12px] text-slate-500">Precio final</span>
                      <span className={'text-3xl font-bold tabular-nums ' + (belowFloor ? 'text-rose-600' : 'text-emerald-700')}>
                        {money(price)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{money(price / totalStems)}/stem</span>
                      <span className={'rounded-full border px-2 py-0.5 font-medium ' + (belowFloor ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
                        GPM {gpm.toFixed(1)}%
                      </span>
                    </div>

                    <input
                      type="range"
                      min={Math.floor(floor)}
                      max={320}
                      step={0.5}
                      value={price}
                      onChange={(e) => setPrice(+e.target.value)}
                      className="mt-3 w-full accent-emerald-600"
                    />
                    <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                      <span>Floor {money(floor)}</span>
                      <span>$320.00</span>
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-slate-400">
                      El floor = costo / (1 - 5%). El GPM 5% cubre la comision de ventas. El slider no baja del floor.
                    </p>
                    {belowFloor && (
                      <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                        Bajo el floor &mdash; bloqueado salvo override explicito de Facu.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Approval queue */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-3.5">
                  <h3 className="text-sm font-semibold text-slate-800">A mi approval queue</h3>
                  <p className="mt-0.5 text-[12px] text-slate-500">Propuestas generadas por este deal</p>
                </div>
                <ul className="divide-y divide-slate-100 px-5 py-2">
                  <QueueItem t="box_master.create" d="QB-Tall caja nueva — disponible para otros: SI" canonical />
                  <QueueItem t="catalog.add_variety" d="Playa Blanca — one_off (solo Virginia Beach)" />
                  <QueueItem t="deal.create" d={`Standing order semanal — ${totalStems} stems — ${money(price)} — GPM ${gpm.toFixed(0)}%`} />
                </ul>
                <div className="px-5 pb-5 pt-2">
                  <button
                    disabled={belowFloor}
                    className={
                      'w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition ' +
                      (belowFloor ? 'cursor-not-allowed bg-slate-300' : 'bg-emerald-600 hover:bg-emerald-700')
                    }
                  >
                    Enviar deal + propuestas a aprobacion
                  </button>
                  <p className="mt-2 text-center text-[11px] text-slate-400">
                    {needsFacu ? 'Va a Facu (canonico / override).' : 'JJ pre-aprueba dentro de guardrails.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Sections / atoms
// ===========================================================================

function AddClientForm({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">Agregar cliente nuevo</h4>
        <button onClick={onClose} className="text-[12px] text-slate-400 hover:text-slate-600">
          cerrar
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <LabeledInput label="Nombre" placeholder="ej. Sunset Floral" />
        <LabeledInput label="Ciudad" placeholder="ej. Tampa, FL" />
        <LabeledInput label="Business type" placeholder="ej. Retail florist" />
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Origen / provenance</span>
          <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100">
            <option value="sample_box">sample_box</option>
            <option value="manual">manual</option>
            <option value="referral">referral</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500">
          Se escribe a la DB con su <span className="font-medium text-slate-700">source/provenance</span> (ej. origen:
          sample_box / manual) &mdash; queda trazado de donde vino el cliente.
        </p>
        <button className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700">
          Guardar cliente
        </button>
      </div>
    </div>
  );
}

function LabeledInput({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

function ClientIntelPanel({ client }: { client: Client }) {
  const heat = HEAT_STYLE[client.intel.heat];
  const i = client.intel;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-slate-900">{client.name}</h2>
            <span className={'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ' + heat.chip}>
              <span className={'h-2 w-2 rounded-full ' + heat.dot} /> {heat.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-500">
              origen: {client.source}
            </span>
          </div>
          <div className="mt-0.5 text-[13px] text-slate-500">
            {client.city} &middot; {i.businessType}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Estado</div>
          <div className="text-[13px] font-medium text-slate-700">{i.estado}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-4 md:grid-cols-2">
        <IntelBlock label="Que le gusta">
          <ul className="flex flex-wrap gap-1.5">
            {i.likes.map((x) => (
              <li key={x} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-700">
                {x}
              </li>
            ))}
          </ul>
        </IntelBlock>
        <IntelBlock label="Que no le gusta">
          <ul className="flex flex-wrap gap-1.5">
            {i.dislikes.map((x) => (
              <li key={x} className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[12px] text-rose-700">
                {x}
              </li>
            ))}
          </ul>
        </IntelBlock>
        <IntelBlock label="Precios que paga hoy">
          <p className="text-[13px] text-slate-700">{i.paysToday}</p>
        </IntelBlock>
        <IntelBlock label="Current supplier">
          <p className="text-[13px] text-slate-700">{i.currentSupplier}</p>
        </IntelBlock>
        <div className="md:col-span-2">
          <IntelBlock label="Key quote">
            <blockquote className="border-l-2 border-emerald-300 pl-3 text-[13px] italic leading-relaxed text-slate-600">
              {i.keyQuote}
            </blockquote>
          </IntelBlock>
        </div>
      </div>
    </div>
  );
}

function IntelBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      {children}
    </div>
  );
}

function ApprovalBanner({
  needsFacu,
  hasCanonical,
  belowFloor,
}: {
  needsFacu: boolean;
  hasCanonical: boolean;
  belowFloor: boolean;
}) {
  const approver = needsFacu ? 'Facu' : 'JJ';
  const reason = belowFloor
    ? 'override del floor'
    : hasCanonical
    ? 'agrega items canonicos'
    : 'dentro de guardrails';
  return (
    <div
      className={
        'rounded-2xl border p-4 shadow-sm ' +
        (needsFacu ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50')
      }
    >
      <div className="flex items-center gap-2">
        <span className={'h-2.5 w-2.5 rounded-full ' + (needsFacu ? 'bg-amber-500' : 'bg-emerald-500')} />
        <span className={'text-sm font-semibold ' + (needsFacu ? 'text-amber-800' : 'text-emerald-800')}>
          Pendiente de aprobacion &mdash; {approver}
        </span>
      </div>
      <p className={'mt-1.5 text-[12px] leading-relaxed ' + (needsFacu ? 'text-amber-700' : 'text-emerald-700')}>
        El deal requiere <span className="font-medium">{approver}</span> ({reason}).
      </p>
      <div className="mt-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-600">Regla propuesta:</span> JJ pre-aprueba deals dentro de
        guardrails (precio &ge; floor, sin items canonicos nuevos). Facu requerido cuando el deal agrega items
        canonicos (variedad &rarr; tier, caja disponible para otros) o necesita override del floor.
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-3.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[13px] font-semibold text-white">
          {n}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">{hint}</p>
        </div>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={'px-3 py-2.5 text-center font-medium ' + (className ?? '')}>{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={'px-3 py-2.5 text-center ' + (className ?? '')}>{children}</td>;
}

function DispChip({ d }: { d: VarietyLine['disposition'] }) {
  const map: Record<string, string> = {
    catalogo: 'border-slate-200 bg-slate-50 text-slate-600',
    one_off: 'border-sky-200 bg-sky-50 text-sky-700',
    tier: 'border-amber-200 bg-amber-50 text-amber-700',
    temp_promo: 'border-violet-200 bg-violet-50 text-violet-700',
  };
  const labels: Record<string, string> = {
    catalogo: 'catalogo',
    one_off: 'one-off',
    tier: 'tier -> canonical',
    temp_promo: 'promo temporal',
  };
  return (
    <span className={'rounded-full border px-2 py-0.5 text-[11px] font-medium ' + (map[d] ?? map.catalogo)}>
      {labels[d] ?? d}
    </span>
  );
}

function QueueItem({ t, d, canonical }: { t: string; d: string; canonical?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 py-2">
      <code className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{t}</code>
      <span className="text-[13px] leading-snug text-slate-600">
        {d}
        {canonical && (
          <span className="ml-1.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            canonico &rarr; Facu
          </span>
        )}
      </span>
    </li>
  );
}
