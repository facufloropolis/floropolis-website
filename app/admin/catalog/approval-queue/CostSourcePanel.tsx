'use client';
// CostSourcePanel | v1 | 2026-05-23 | Job_PM [V8 SHADOW]
//
// Surfaces cost source groups that need a Facu decision:
//   - CONFIRM: named pricelist exists, cost data present, needs in-system confirmation
//   - FLAG: source is synthetic or derived (benchmark, K2K back-calc) — accept or block
//   - PENDING: no cost data yet, vendor hasn't sent pricelist
//
// Each card generates a cost.source_confirm, cost.source_flag, or
// vendor.pricelist_request proposal → flows through approval queue → executor runs.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type CostSourceDecision = 'confirm' | 'flag' | 'pending';

export interface CostSourceGroup {
  vendor: string;
  tier: string;
  cost_source: string;
  sku_count: number;
  has_cost: number;        // SKUs with farm_cost > 0
  avg_cost: number | null;
  min_cost: number | null;
  max_cost: number | null;
  decision_type: CostSourceDecision;
  source_risk: 'trusted' | 'stale' | 'synthetic' | 'missing';
  risk_reason: string;     // human-readable explanation of the risk
}

interface Props {
  groups: CostSourceGroup[];
}

export default function CostSourcePanel({ groups }: Props) {
  if (groups.length === 0) return null;

  const confirm = groups.filter(g => g.decision_type === 'confirm');
  const flag = groups.filter(g => g.decision_type === 'flag');
  const pending = groups.filter(g => g.decision_type === 'pending');

  return (
    <div className="mb-6 space-y-3">
      {/* Synthetic / unreliable costs — most urgent */}
      {flag.length > 0 && (
        <Section
          title="Cost data is synthetic — your call"
          subtitle="These costs were NOT taken from a farm invoice or pricelist. They were derived from market prices or a benchmark spreadsheet. Publishing at these costs means you don't actually know your margin."
          tone="red"
          groups={flag}
          badge="DATA INTEGRITY"
        />
      )}
      {/* Named pricelists awaiting confirmation */}
      {confirm.length > 0 && (
        <Section
          title="Named pricelist — confirm it's still your basis"
          subtitle="Cost data and source name exist. This is a one-time per-farm confirmation that the pricelist is still current and is the basis you're using for pricing."
          tone="amber"
          groups={confirm}
          badge="NEEDS CONFIRMATION"
        />
      )}
      {/* Explicitly pending — no cost data */}
      {pending.length > 0 && (
        <Section
          title="Vendor hasn't sent pricelist — escalate"
          subtitle="These SKUs have no cost data at all. Someone needs to chase the vendor. Set a due date so it doesn't get lost."
          tone="slate"
          groups={pending}
          badge="PENDING VENDOR"
        />
      )}
    </div>
  );
}

function Section({
  title, subtitle, tone, groups, badge,
}: {
  title: string;
  subtitle: string;
  tone: 'red' | 'amber' | 'slate';
  groups: CostSourceGroup[];
  badge: string;
}) {
  const palette = {
    red:   { wrap: 'border-red-300 bg-red-50',   header: 'bg-red-100 border-red-200', badge: 'bg-red-700 text-white', title: 'text-red-900', sub: 'text-red-800' },
    amber: { wrap: 'border-amber-300 bg-amber-50', header: 'bg-amber-100 border-amber-200', badge: 'bg-amber-700 text-white', title: 'text-amber-900', sub: 'text-amber-800' },
    slate: { wrap: 'border-slate-300 bg-slate-50', header: 'bg-slate-100 border-slate-200', badge: 'bg-slate-600 text-white', title: 'text-slate-800', sub: 'text-slate-600' },
  }[tone];

  return (
    <div className={`rounded-xl border-2 overflow-hidden ${palette.wrap}`}>
      <div className={`px-4 py-3 border-b ${palette.header}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 uppercase tracking-wide ${palette.badge}`}>
            {badge}
          </span>
          <span className={`font-semibold text-sm ${palette.title}`}>{title}</span>
        </div>
        <p className={`text-xs max-w-2xl ${palette.sub}`}>{subtitle}</p>
      </div>
      <div className="divide-y divide-slate-200">
        {groups.map((g, i) => (
          <CostGroupCard key={i} group={g} tone={tone} />
        ))}
      </div>
    </div>
  );
}

function CostGroupCard({ group, tone }: { group: CostSourceGroup; tone: 'red' | 'amber' | 'slate' }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<'confirm' | 'flag' | 'pending' | null>(null);
  const [rationale, setRationale] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submitProposal(type: string, extra: Record<string, unknown> = {}) {
    if (rationale.trim().length < 5) { setError('Rationale required (min 5 chars)'); return; }
    setBusy(type);
    setError(null);
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          target_table: 'floropolis_inventory_mirror',
          target_id: null,
          payload: {
            vendor: group.vendor,
            cost_source: group.cost_source,
            tier: group.tier,
            sku_count: group.sku_count,
            risk: group.source_risk,
            ...extra,
          },
          source_agent: 'Job_PM',
          source_rationale: rationale,
          notes: rationale,
        }),
      });
      const body = await res.json() as { ok?: boolean; error?: string; id?: string };
      if (!res.ok || !body.ok) { setError(body.error ?? `HTTP ${res.status}`); setBusy(null); return; }
      setDone(type);
      setShowModal(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div className="px-4 py-3 text-xs text-emerald-700 bg-emerald-50">
        ✓ Proposal submitted — awaiting your approval in the queue.
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-semibold text-slate-900 text-sm">{group.vendor}</span>
            <span className="text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 font-semibold">{group.tier}</span>
            <span className="text-xs text-slate-500 font-mono">{group.cost_source}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
            <span><strong>{group.sku_count}</strong> SKUs</span>
            {group.has_cost < group.sku_count && (
              <span className="text-red-600 font-semibold">{group.sku_count - group.has_cost} have NO cost data</span>
            )}
            {group.avg_cost != null && (
              <span>avg ${group.avg_cost.toFixed(3)}/stem · range ${group.min_cost?.toFixed(2)}–${group.max_cost?.toFixed(2)}</span>
            )}
          </div>
          <p className={`text-[11px] mt-1 ${tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-500'}`}>
            {group.risk_reason}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {group.decision_type === 'confirm' && (
            <>
              <button
                onClick={() => { setShowModal('confirm'); setRationale(''); setError(null); }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                Confirm — still valid
              </button>
              <button
                onClick={() => { setShowModal('flag'); setRationale(''); setError(null); }}
                className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold border border-red-200"
              >
                Needs revalidation
              </button>
            </>
          )}
          {group.decision_type === 'flag' && (
            <>
              <button
                onClick={() => { setShowModal('flag'); setRationale(''); setError(null); }}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                Flag as unreliable
              </button>
              <button
                onClick={() => { setShowModal('confirm'); setRationale(''); setError(null); }}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200"
              >
                Accept for now
              </button>
            </>
          )}
          {group.decision_type === 'pending' && (
            <button
              onClick={() => { setShowModal('pending'); setRationale(''); setDueDate(''); setError(null); }}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold"
            >
              Log chase request
            </button>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="font-bold text-slate-900 text-base mb-1">
              {showModal === 'confirm' && `Confirm cost source — ${group.vendor} (${group.tier})`}
              {showModal === 'flag' && `Flag as unreliable — ${group.vendor} (${group.tier})`}
              {showModal === 'pending' && `Chase ${group.vendor} for pricelist`}
            </h3>
            <p className="text-xs text-slate-500 mb-3 font-mono">{group.cost_source} · {group.sku_count} SKUs</p>
            {showModal === 'flag' && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-xs text-red-800">
                This will prepend <code>FLAGGED_</code> to the cost_source on all {group.sku_count} matching rows, clearing cost_verified_at. The cost_unverified gate will re-fire and these SKUs will be blocked from publishing until real costs are obtained.
              </div>
            )}
            {showModal === 'pending' && (
              <>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Due date (when to follow up)</label>
                <input
                  type="date"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              </>
            )}
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Rationale <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
              rows={3}
              placeholder={
                showModal === 'confirm' ? 'e.g. Confirmed with farm — March pricelist still our current basis' :
                showModal === 'flag' ? 'e.g. This was back-calculated from K2K price, not a real invoice' :
                'e.g. Reached out to MF on May 23, awaiting response'
              }
              value={rationale}
              onChange={e => setRationale(e.target.value)}
            />
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowModal(null)} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100" disabled={!!busy}>
                Cancel
              </button>
              <button
                onClick={() => {
                  if (showModal === 'confirm') submitProposal('cost.source_confirm');
                  else if (showModal === 'flag') submitProposal('cost.source_flag', { reason: rationale });
                  else submitProposal('vendor.pricelist_request', { pending_sku_count: group.sku_count, due_date: dueDate || undefined });
                }}
                disabled={!!busy}
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${
                  showModal === 'flag' ? 'bg-red-600 hover:bg-red-700' :
                  showModal === 'confirm' ? 'bg-emerald-600 hover:bg-emerald-700' :
                  'bg-slate-700 hover:bg-slate-800'
                }`}
              >
                {busy ? 'Submitting...' : showModal === 'confirm' ? 'Submit for approval' : showModal === 'flag' ? 'Submit flag' : 'Submit chase request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
