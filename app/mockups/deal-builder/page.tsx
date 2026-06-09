// MOCKUP — Deal Builder (sales arma deals custom para standing orders).
// v1 | 2026-06-09 | Job_PM (CPO) — Stage 2 (MOCKUP) del build law.
//
// Static visual target. No data wiring. Numbers are illustrative.
// Demonstrates: variety lines (cost from catalog -> price down to floor),
// box packing, the REUSABLE BoxUpsert + VarietyUpsert editors (same ones used
// from /admin/catalog edit + config/boxes), the clear box table, the price
// slider to the floor (GPM 5%), and the "send to my approval queue" step.
'use client';

import { useState } from 'react';

const EMER = 'text-emerald-700';

// FedEx estimate constants (real, from pricing_constants).
const DIM_DIVISOR = 6000;
const RATE_PER_KG = 6.5;

function money(n: number) {
  return '$' + n.toFixed(2);
}

export default function DealBuilderMockup() {
  // Price slider on the blended box price (down to floor).
  const cost = 182.4; // total cost of the composed box(es)
  const floor = cost / (1 - 0.05); // GPM 5% floor = the limit
  const [price, setPrice] = useState(231.5);
  const gpm = price > 0 ? (1 - cost / price) * 100 : 0;
  const belowFloor = price < floor;

  // New-box estimator (live).
  const [L, setL] = useState(100);
  const [W, setW] = useState(40);
  const [H, setH] = useState(40);
  const [cap, setCap] = useState(600);
  const [capUnit, setCapUnit] = useState('stems');
  const dimKg = (L * W * H) / DIM_DIVISOR;
  const realKg = 18; // mock actual weight
  const chargeableKg = Math.max(realKg, dimKg);
  const boxFreight = chargeableKg * RATE_PER_KG;
  const freightPerUnit = cap > 0 ? boxFreight / cap : 0;

  return (
    <div className="max-w-[1180px] mx-auto px-4 py-6 text-slate-800">
      <div className="text-[11px] uppercase tracking-wide text-amber-600 mb-1">
        MOCKUP — Deal Builder (no data wiring)
      </div>
      <h1 className="text-2xl font-semibold">Deal Builder</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">
        Sales arma un deal custom con un cliente. Empieza con los precios de catalogo y
        baja el precio hasta el floor (GPM 5%). Variedades/cajas nuevas o editadas usan los
        editores reusables (los mismos de catalogo + config de boxes) y van a la approval queue.
      </p>

      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase text-slate-400">Cliente</div>
          <div className="font-medium">Virginia Beach Florist</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-400">Tipo</div>
          <div className="font-medium">Standing order</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-400">Cadencia</div>
          <div className="font-medium">Semanal</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-400">Estado</div>
          <div className="font-medium text-amber-600">draft</div>
        </div>
      </div>

      {/* Variety lines */}
      <SectionTitle>1. Variedades del box</SectionTitle>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden mb-2">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <Th>Variedad</Th><Th>Grade</Th><Th>Stems</Th><Th>Caja</Th>
              <Th>Costo/stem</Th><Th>Floor/stem</Th><Th>Precio/stem</Th><Th>Disposicion</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <Row v="Freedom Red" g="40cm" s="300" box="HB-Std" c="0.22" fl="0.23" p="0.29" disp="catalogo" />
            <Row v="Mondial White" g="50cm" s="200" box="HB-Std" c="0.27" fl="0.28" p="0.34" disp="catalogo" />
            <Row v="Playa Blanca (NUEVA)" g="60cm" s="100" box="QB-Tall" c="0.31" fl="0.33" p="0.39" disp="one_off" isNew />
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 mb-5 text-sm">
        <button className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">+ Variedad existente</button>
        <button className="rounded-lg border border-emerald-300 text-emerald-700 px-3 py-1.5 hover:bg-emerald-50">+ Variedad nueva (input)</button>
      </div>

      {/* Reusable VarietyUpsert */}
      <ReusableTag>VarietyUpsert — el MISMO editor que abre "edit" en /admin/catalog</ReusableTag>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 mb-6 grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
        <Field label="Variedad"><input className={inp} defaultValue="Playa Blanca" /></Field>
        <Field label="Costo farm/stem"><input className={inp} defaultValue="0.31" /></Field>
        <Field label="Source"><input className={inp} defaultValue="vendor quote Ecoroses 06-09" /></Field>
        <Field label="Pais"><input className={inp} defaultValue="Ecuador" /></Field>
        <Field label="Disposicion">
          <select className={inp} defaultValue="one_off">
            <option value="one_off">one-off (solo este cliente)</option>
            <option value="tier">tier -&gt; canonical (mantener)</option>
            <option value="temp_promo">promo temporal (con expiry)</option>
          </select>
        </Field>
      </div>

      {/* Boxes */}
      <SectionTitle>2. Cajas (packing)</SectionTitle>
      <div className="rounded-xl border border-slate-200 bg-white p-4 mb-2 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BoxCard name="HB-Std" cap="500 stems" used="500" boxes="1" note="lleno" />
          <BoxCard name="QB-Tall" cap="120 stems" used="100" boxes="1" note="20 libres" />
        </div>
      </div>
      <div className="flex gap-2 mb-5 text-sm">
        <button className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">Elegir caja existente</button>
        <button className="rounded-lg border border-emerald-300 text-emerald-700 px-3 py-1.5 hover:bg-emerald-50">+ Subir caja nueva</button>
      </div>

      {/* Reusable BoxUpsert with live FedEx estimate */}
      <ReusableTag>BoxUpsert — el MISMO editor que abre "edit" en config de boxes</ReusableTag>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 mb-6 text-sm">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-3">
          <Field label="Largo cm"><input type="number" className={inp} value={L} onChange={(e) => setL(+e.target.value)} /></Field>
          <Field label="Ancho cm"><input type="number" className={inp} value={W} onChange={(e) => setW(+e.target.value)} /></Field>
          <Field label="Alto cm"><input type="number" className={inp} value={H} onChange={(e) => setH(+e.target.value)} /></Field>
          <Field label="Capacidad"><input type="number" className={inp} value={cap} onChange={(e) => setCap(+e.target.value)} /></Field>
          <Field label="Unidad">
            <select className={inp} value={capUnit} onChange={(e) => setCapUnit(e.target.value)}>
              <option>stems</option><option>bunches</option><option>grams</option>
            </select>
          </Field>
          <Field label="Pais"><input className={inp} defaultValue="Ecuador" /></Field>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 p-3 text-[13px] grid grid-cols-2 md:grid-cols-4 gap-2">
          <Est label="Peso dim" val={`${dimKg.toFixed(1)} kg`} sub="L*W*H / 6000" />
          <Est label="Kg cobrable" val={`${chargeableKg.toFixed(1)} kg`} sub="max(real, dim)" />
          <Est label="Costo caja FedEx" val={money(boxFreight)} sub="kg x $6.5" />
          <Est label={`Costo/${capUnit}`} val={money(freightPerUnit)} sub={`/ ${cap}`} hot />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <label className="text-[13px] text-slate-600 flex items-center gap-1.5">
            <input type="checkbox" defaultChecked /> Disponible para otros clientes (canonical)
          </label>
          <button className="ml-auto rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm hover:bg-emerald-700">
            Enviar a approval queue (box_master.create)
          </button>
        </div>
      </div>

      {/* Clear box table + price */}
      <SectionTitle>3. Resumen del box y precio</SectionTitle>
      <div className="rounded-xl border border-slate-200 bg-white p-4 mb-6 text-sm">
        <table className="w-full mb-4">
          <thead className="text-[11px] uppercase text-slate-500">
            <tr><Th>Caja</Th><Th>Contenido</Th><Th>Stems</Th><Th>Costo</Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr><Td>HB-Std</Td><Td>Freedom Red 300 + Mondial White 200</Td><Td>500</Td><Td>{money(118.0)}</Td></tr>
            <tr><Td>QB-Tall</Td><Td>Playa Blanca 100</Td><Td>100</Td><Td>{money(64.4)}</Td></tr>
            <tr className="font-medium"><Td>Total</Td><Td>2 cajas</Td><Td>600</Td><Td>{money(cost)}</Td></tr>
          </tbody>
        </table>

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] text-slate-600">Precio del deal (por entrega semanal)</div>
            <div className="text-right">
              <div className={`text-xl font-semibold ${belowFloor ? 'text-rose-600' : EMER}`}>{money(price)}</div>
              <div className="text-[11px] text-slate-500">{money(price / 600)}/stem · GPM {gpm.toFixed(1)}%</div>
            </div>
          </div>
          <input
            type="range" min={Math.floor(floor)} max={320} step={0.5} value={price}
            onChange={(e) => setPrice(+e.target.value)}
            className="w-full accent-emerald-600"
          />
          <div className="flex justify-between text-[11px] text-slate-500 mt-1">
            <span>Floor {money(floor)} (GPM 5% — cubre comision de ventas)</span>
            <span>Costo {money(cost)}</span>
          </div>
          {belowFloor && (
            <div className="text-[12px] text-rose-600 mt-2">
              Bajo el floor — bloqueado salvo override explicito de Facu.
            </div>
          )}
        </div>
      </div>

      {/* Edit existing (learning) */}
      <ReusableTag>Editar variedad/caja actual — mismo editor (loop de aprendizaje de stems-por-caja)</ReusableTag>
      <div className="rounded-xl border border-slate-200 bg-white p-4 mb-6 text-sm text-slate-600">
        Ej: Ecoroses hace un pack especial y entran 560 stems (no 500) en HB-Std →
        editas la capacidad → propuesta <code className="text-slate-800">box_master.update_capacity</code> →
        aprendemos cuantos stems de que variedad entran en cada caja.
      </div>

      {/* Approval queue */}
      <SectionTitle>4. A mi approval queue</SectionTitle>
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <ul className="space-y-2">
          <QueueItem t="box_master.create" d="QB-Tall caja nueva — disponible para otros: SI" />
          <QueueItem t="catalog.add_variety" d="Playa Blanca — disposicion: one_off (solo Virginia Beach)" />
          <QueueItem t="deal.create" d="Standing order semanal — 600 stems — $231.50 — GPM 18%" />
        </ul>
        <button className="mt-4 rounded-lg bg-emerald-600 text-white px-4 py-2 hover:bg-emerald-700">
          Enviar deal + propuestas a aprobacion
        </button>
      </div>
    </div>
  );
}

const inp = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-slate-700 mb-2 mt-1">{children}</h2>;
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-3 py-2">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className ?? ''}`}>{children}</td>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase text-slate-400">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}
function Est({ label, val, sub, hot }: { label: string; val: string; sub: string; hot?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-slate-400">{label}</div>
      <div className={`font-semibold ${hot ? 'text-emerald-700' : ''}`}>{val}</div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  );
}
function ReusableTag({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] text-emerald-700 bg-emerald-50 inline-block rounded px-2 py-0.5 mb-1.5 border border-emerald-200">
      ♺ reusable · {children}
    </div>
  );
}
function Row({ v, g, s, box, c, fl, p, disp, isNew }: { v: string; g: string; s: string; box: string; c: string; fl: string; p: string; disp: string; isNew?: boolean }) {
  return (
    <tr>
      <Td><span className={isNew ? 'text-emerald-700 font-medium' : ''}>{v}</span></Td>
      <Td>{g}</Td><Td>{s}</Td><Td>{box}</Td>
      <Td>${c}</Td><Td className="text-slate-400">${fl}</Td><Td>${p}</Td>
      <Td><span className="text-[11px] rounded px-1.5 py-0.5 bg-slate-100">{disp}</span></Td>
    </tr>
  );
}
function BoxCard({ name, cap, used, boxes, note }: { name: string; cap: string; used: string; boxes: string; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="font-medium">{name}</div>
      <div className="text-[12px] text-slate-500">cap {cap} · usados {used} · {boxes} caja(s)</div>
      <div className="text-[11px] text-emerald-700 mt-1">{note}</div>
    </div>
  );
}
function QueueItem({ t, d }: { t: string; d: string }) {
  return (
    <li className="flex items-start gap-2">
      <code className="text-[11px] bg-slate-100 rounded px-1.5 py-0.5 shrink-0">{t}</code>
      <span className="text-slate-600">{d}</span>
    </li>
  );
}
