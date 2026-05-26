'use client';
// CostSourcePanel | v2 | 2026-05-26 | Job_PM [V8 SHADOW]
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
  priorCorrectionCount: number;      // how many times any cost correction has been submitted before
  daysSinceFirstSurfaced: number;    // 0 = first time; >0 = recurring
}

export default function CostSourcePanel({ groups, priorCorrectionCount, daysSinceFirstSurfaced }: Props) {
  if (groups.length === 0) return null;

  const confirm = groups.filter(g => g.decision_type === 'confirm');
  const flag = groups.filter(g => g.decision_type === 'flag');
  const pending = groups.filter(g => g.decision_type === 'pending');

  return (
    <div className="mb-6 space-y-3">
      {priorCorrectionCount > 0 && (
        <div className="px-4 py-2 bg-amber-900/10 border-b border-amber-200 flex items-center gap-2">
          <span className="text-[10px] font-bold bg-amber-900 text-white rounded-full px-2 py-0.5 uppercase tracking-wide">
            Recurring x {priorCorrectionCount} — {daysSinceFirstSurfaced}d open
          </span>
          <span className="text-xs text-amber-900">
            Cost source corrections have been submitted {priorCorrectionCount} time{priorCorrectionCount !== 1 ? 's' : ''} without being resolved.
          </span>
        </div>
      )}
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

// Pre-filled belief text per source_risk category
function getCorrectionPrefill(group: CostSourceGroup): string {
  if (group.source_risk === 'synthetic') {
    return `The cost_source ${group.cost_source} is synthetic/back-calculated. The real farm cost is different from what the system shows.`;
  }
  if (group.source_risk === 'stale') {
    return `The ${group.cost_source} pricelist is stale/no longer current. We have a more recent basis.`;
  }
  if (group.source_risk === 'missing') {
    return `I know the ${group.vendor} pricelist status — `;
  }
  return `I have additional context about the ${group.cost_source} cost source for ${group.vendor} (${group.tier}).`;
}

function CostGroupCard({ group, tone }: { group: CostSourceGroup; tone: 'red' | 'amber' | 'slate' }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<'confirm' | 'flag' | 'pending' | null>(null);
  const [rationale, setRationale] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Third-path correction state
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionDone, setCorrectionDone] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [whatIBelieve, setWhatIBelieve] = useState('');
  const [why, setWhy] = useState('');
  const [correctionPriority, setCorrectionPriority] = useState<'P0' | 'P1' | 'P2'>('P1');

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
      const body = await res.json() as { proposal?: unknown; error?: string };
      if (!res.ok) { setError(body.error ?? `HTTP ${res.status}`); setBusy(null); return; }
      setDone(type);
      setShowModal(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setBusy(null);
    }
  }

  async function sendCostCorrection() {
    if (whatIBelieve.trim().length < 5) { setCorrectionError('Fill in what you believe (min 5 chars)'); return; }
    if (why.trim().length < 5) { setCorrectionError('Fill in why (min 5 chars)'); return; }
    setCorrectionBusy(true);
    setCorrectionError(null);
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cost_source.facu_correction',
          target_table: 'floropolis_inventory_mirror',
          target_id: null,
          payload: {
            vendor: group.vendor,
            tier: group.tier,
            cost_source: group.cost_source,
            sku_count: group.sku_count,
            source_risk: group.source_risk,
            what_i_believe: whatIBelieve.trim(),
            why: why.trim(),
            priority: correctionPriority,
          },
          source_agent: 'Job_PM',
          source_rationale: why.trim(),
          notes: whatIBelieve.trim(),
        }),
      });
      const body = await res.json() as { proposal?: unknown; error?: string };
      if (!res.ok) { setCorrectionError(body.error ?? `HTTP ${res.status}`); setCorrectionBusy(false); return; }
      setCorrectionDone(true);
      setShowCorrection(false);
      router.refresh();
    } catch (e) {
      setCorrectionError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setCorrectionBusy(false);
    }
  }

  if (done) {
    return (
      <div className="px-4 py-3 text-xs text-emerald-700 bg-emerald-50">
        Proposal submitted — awaiting your approval in the queue.
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
              <span>avg ${group.avg_cost.toFixed(3)}/stem · range ${group.min_cost?.toFixed(2)}-${group.max_cost?.toFixed(2)}</span>
            )}
          </div>
          <p className={`text-[11px] mt-1 ${tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-500'}`}>
            {group.risk_reason}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
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
          {/* Third path — always available */}
          {correctionDone ? (
            <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
              Correction sent
            </span>
          ) : (
            <button
              onClick={() => {
                setShowCorrection(s => !s);
                setCorrectionError(null);
                if (!showCorrection) setWhatIBelieve(getCorrectionPrefill(group));
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                showCorrection
                  ? 'bg-emerald-200 text-emerald-900 border-emerald-300'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
              }`}
            >
              I see this differently
            </button>
          )}
        </div>
      </div>

      {/* Inline correction form — third path */}
      {showCorrection && !correctionDone && (
        <div className="mt-3 border border-emerald-200 rounded-xl bg-white px-4 py-4">
          <h3 className="font-bold text-slate-900 text-sm mb-1">Correction record for Rose</h3>
          <p className="text-xs text-slate-500 mb-4">
            Pre-filled from the cost source context. Edit any field.
            The <strong>why</strong> field is where you add what the system does not know.
            This becomes a machine-readable correction record — not just a routing action.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                What I believe is true about this cost source
              </label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-50/40"
                rows={2}
                value={whatIBelieve}
                onChange={e => setWhatIBelieve(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-700 mb-1">
                Why — what do you know that changes this picture?
              </label>
              <textarea
                className="w-full border border-emerald-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-emerald-50/30"
                rows={2}
                placeholder="e.g. Ecoroses gave us an FOB pricelist in April that supersedes the March one. Or: the benchmark spreadsheet costs are actually close enough for T3 pricing."
                value={why}
                onChange={e => setWhy(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                <div className="flex gap-2">
                  {(['P0', 'P1', 'P2'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setCorrectionPriority(p)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        correctionPriority === p
                          ? p === 'P0' ? 'bg-red-700 text-white border-red-700'
                            : p === 'P1' ? 'bg-orange-600 text-white border-orange-600'
                            : 'bg-slate-600 text-white border-slate-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex justify-end gap-2 items-end">
                {correctionError && <p className="text-xs text-red-600">{correctionError}</p>}
                <button
                  onClick={() => { setShowCorrection(false); setCorrectionError(null); }}
                  className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
                  disabled={correctionBusy}
                >
                  Cancel
                </button>
                <button
                  onClick={sendCostCorrection}
                  disabled={correctionBusy}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                  {correctionBusy ? 'Sending...' : 'Send correction to Rose'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
