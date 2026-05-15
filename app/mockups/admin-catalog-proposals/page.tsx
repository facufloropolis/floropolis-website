// Admin Catalog -- Proposals (META screen)
// v0.1 | 2026-05-15 | Job_PM [V8 SHADOW]
//
// Tab A: 15 specializations Job_PM needs to do this role well. 6 full specs
//        (F2, F3, B1, B5, I1, I2 = cutover blockers). 9 summary cards.
// Tab B: Specs Job_PM has already proposed earlier in this session (agents, contracts,
//        tables, verifiers, flows).

'use client';

import { useState } from 'react';
import AdminCatalogNav from '../_components/AdminCatalogNav';
import { SPECIALIZATION_PROPOSALS, ALREADY_PROPOSED } from '../_constants/catalogQueue';

type Tab = 'specs_needed' | 'specs_proposed';

export default function AdminCatalogProposals() {
  const [tab, setTab] = useState<Tab>('specs_needed');
  return (
    <div>
      <AdminCatalogNav active="props" />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-900">Proposals (meta)</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Job_PM&apos;s CPO-level view: what specializations the platform needs, and what Job has already specced.
            This screen exists so Facu can approve / defer / reject each line as a single decision surface.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-violet-50 border border-violet-200 text-xs text-violet-900">
            <span className="font-semibold">Role expansion flag:</span>
            <span>Job_PM = Growth PM (Website) + Catalog Control Plane PM + Platform PM. Three roles in one.</span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-5 border-b border-slate-200">
          <button
            onClick={() => setTab('specs_needed')}
            className={
              tab === 'specs_needed'
                ? 'px-4 py-2 text-sm font-semibold text-violet-700 border-b-2 border-violet-600 -mb-px'
                : 'px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700'
            }
          >
            (A) Specializations I need ({SPECIALIZATION_PROPOSALS.length})
          </button>
          <button
            onClick={() => setTab('specs_proposed')}
            className={
              tab === 'specs_proposed'
                ? 'px-4 py-2 text-sm font-semibold text-violet-700 border-b-2 border-violet-600 -mb-px'
                : 'px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700'
            }
          >
            (B) Specs I&apos;ve proposed ({ALREADY_PROPOSED.length})
          </button>
        </div>

        {tab === 'specs_needed' ? <NeededTab /> : <ProposedTab />}
      </div>
    </div>
  );
}

function NeededTab() {
  const cutoverBlockers = SPECIALIZATION_PROPOSALS.filter(s => s.priority === 'cutover_blocker');
  const phase2 = SPECIALIZATION_PROPOSALS.filter(s => s.priority === 'phase_2');
  const phase3 = SPECIALIZATION_PROPOSALS.filter(s => s.priority === 'phase_3');

  return (
    <div>
      <Bucket title="Cutover blockers" subtitle="Required before checkout + payment system goes live" tone="red" specs={cutoverBlockers} />
      <Bucket title="Phase 2" subtitle="Unlocks scale beyond 5 vendors / single country" tone="amber" specs={phase2} />
      <Bucket title="Phase 3" subtitle="Unlocks 10x scale + platform maturity" tone="slate" specs={phase3} />
    </div>
  );
}

function Bucket({ title, subtitle, tone, specs }: {
  title: string;
  subtitle: string;
  tone: 'red' | 'amber' | 'slate';
  specs: typeof SPECIALIZATION_PROPOSALS;
}) {
  const headerCls =
    tone === 'red'   ? 'text-red-900 bg-red-50 border-red-200'
  : tone === 'amber' ? 'text-amber-900 bg-amber-50 border-amber-200'
                     : 'text-slate-900 bg-slate-50 border-slate-200';
  return (
    <div className="mb-6">
      <div className={`rounded-t-xl border px-4 py-2 ${headerCls}`}>
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs opacity-80">{subtitle}</p>
      </div>
      <div className="space-y-3 mt-3">
        {specs.map(s => (
          <SpecCard key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
}

function SpecCard({ s }: { s: typeof SPECIALIZATION_PROPOSALS[number] }) {
  const areaBadge =
    s.area === 'frontend' ? 'bg-blue-100 text-blue-800'
  : s.area === 'backend'  ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-violet-100 text-violet-800';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">{s.id}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${areaBadge}`}>{s.area}</span>
            <span className="font-semibold text-slate-900 text-sm">{s.title}</span>
            {s.detail_specced && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-semibold">FULL SPEC</span>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{s.why}</p>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-medium">
            Approve
          </button>
          <button className="text-xs px-3 py-1.5 rounded text-slate-600 hover:bg-slate-100">
            Defer
          </button>
        </div>
      </div>

      {s.detail_specced && (
        <div className="border-t border-slate-100 pt-3 space-y-3">
          {/* Scope */}
          <div>
            <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-1">Scope</p>
            <ul className="text-xs text-slate-700 ml-4 list-disc space-y-0.5">
              {s.scope.map((line, i) => (<li key={i}>{line}</li>))}
            </ul>
          </div>

          {/* Two columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md bg-slate-50 border border-slate-200 p-2.5">
              <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-1">RACI</p>
              <div className="text-xs text-slate-700 space-y-0.5">
                <div><span className="font-semibold">R:</span> {s.raci.r}</div>
                <div><span className="font-semibold">A:</span> {s.raci.a}</div>
                <div><span className="font-semibold">C:</span> {s.raci.c}</div>
                <div><span className="font-semibold">I:</span> {s.raci.i}</div>
              </div>
            </div>
            <div className="rounded-md bg-slate-50 border border-slate-200 p-2.5">
              <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-1">Contracts</p>
              <div className="text-xs text-slate-700">
                <div className="text-[11px] text-slate-500">In:</div>
                <ul className="ml-3 mb-1 list-disc">
                  {s.inbound_contracts.map((c, i) => (<li key={i} className="text-[11px]">{c}</li>))}
                </ul>
                <div className="text-[11px] text-slate-500">Out:</div>
                <ul className="ml-3 list-disc">
                  {s.outbound_contracts.map((c, i) => (<li key={i} className="text-[11px]">{c}</li>))}
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2.5">
            <p className="text-[10px] uppercase font-semibold text-emerald-700 tracking-wide mb-0.5">Cost estimate</p>
            <p className="text-xs text-emerald-900">{s.cost_estimate}</p>
          </div>
        </div>
      )}

      {!s.detail_specced && (
        <div className="border-t border-slate-100 pt-2 mt-2 text-[11px] text-slate-500">
          <span className="font-medium">Cost estimate:</span> {s.cost_estimate}
        </div>
      )}
    </div>
  );
}

function ProposedTab() {
  const byCategory: Record<string, typeof ALREADY_PROPOSED> = {
    agent:     [],
    contract:  [],
    flow:      [],
    table:     [],
    verifier:  [],
  };
  for (const p of ALREADY_PROPOSED) byCategory[p.category].push(p);

  const order: { key: keyof typeof byCategory; label: string; subtitle: string }[] = [
    { key: 'agent',    label: 'Agents',    subtitle: 'New specialized agents to build or extend' },
    { key: 'table',    label: 'Tables',    subtitle: 'New Supabase tables for the override layer + multi-country' },
    { key: 'contract', label: 'Contracts', subtitle: 'Views and tables that flow between agents' },
    { key: 'flow',     label: 'Flows',     subtitle: 'Process flows that govern the override layer' },
    { key: 'verifier', label: 'Verifiers', subtitle: 'Pipeline Law -- one verifier per layer' },
  ];

  return (
    <div>
      {order.map(o => (
        <div key={o.key} className="mb-5">
          <p className="text-sm font-bold text-slate-900">{o.label}</p>
          <p className="text-xs text-slate-500 mt-0.5 mb-2">{o.subtitle}</p>
          <div className="space-y-2">
            {byCategory[o.key].map(p => (
              <div key={p.id} className="bg-white border border-slate-200 rounded-lg px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{p.summary}</p>
                  </div>
                  <span className={
                    'text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ml-3 ' +
                    (p.status === 'accepted'    ? 'bg-emerald-100 text-emerald-800'
                    : p.status === 'in_progress' ? 'bg-blue-100 text-blue-800'
                                                  : 'bg-orange-100 text-orange-800')
                  }>
                    {p.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
