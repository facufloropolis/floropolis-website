'use client';
// BatchPriceProposalPanel | v2 | 2026-05-27 | Job_PM [V8 SHADOW]
//
// Card Spec v2: every section has a copy-paste SQL Facu can run himself.
// No blind trust — per Claim Verification Mandate (CLAUDE.md).
// Five sections per card: SYMPTOM / ROOT CAUSE / FIX (dry-run) / DEPENDENCIES / DEPLOYMENT.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface DryRunRow {
  sku_id: number;
  actual: string;
  expected: string;
  dev_pct: string;
}

export interface BatchProposal {
  id: string;
  urgency_tier: string;
  source_rationale: string;
  before_value: {
    vendor?: string;
    cluster?: string;
    batch_size?: number;
    deviation_range?: string;
    avg_deviation_pct?: number;
    formula_version?: string;
    formula_version_mix?: string;
    total_price_gap_usd?: number;
    top_3_skus_by_impact?: Array<{ sku_id: number; actual: number; formula: number; dev_pct: number }>;
    dry_run_rows?: DryRunRow[];
    symptom_sql?: string;
    dependency_sql?: string;
  } | null;
  after_value: {
    rank?: number;
    action?: string;
    impact?: string;
    batch_size?: number;
    suggested_action?: string;
    execution_path?: string;
    dependency?: string;
    escalate_to?: string;
    question?: string;
  } | null;
}

interface Props {
  proposals: BatchProposal[];
  deployedSha?: string;
  deployedAt?: string;
}

const URGENCY_COLORS: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  urgent: 'bg-orange-500 text-white',
  routine: 'bg-slate-500 text-white',
};

const URGENCY_BORDERS: Record<string, string> = {
  critical: 'border-red-300',
  urgent: 'border-orange-300',
  routine: 'border-slate-200',
};

const URGENCY_BG: Record<string, string> = {
  critical: 'bg-red-50',
  urgent: 'bg-orange-50',
  routine: 'bg-slate-50',
};

function CopySQL({ sql, label }: { sql: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-950 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
          {label ?? 'Verify SQL'}
        </span>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(sql);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-[10px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="px-3 py-2 text-[11px] text-emerald-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">
        {sql}
      </pre>
    </div>
  );
}

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}

function DisagreementForm({
  proposalId,
  onClose,
}: {
  proposalId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (text.trim().length < 10) { setError('Please explain what you see differently (min 10 chars).'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/proposals/${proposalId}/frame-correction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correction: text.trim() }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) { setError(body.error ?? `HTTP ${res.status}`); setBusy(false); return; }
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-3 bg-amber-50 border-t border-amber-200">
      <p className="text-xs font-semibold text-amber-800 mb-2">What is incorrect and what should be true instead?</p>
      <textarea
        className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
        rows={3}
        placeholder="e.g. 'The expected_price formula is wrong for this cluster because... the correct fix is...'"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
          disabled={busy}
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="px-3 py-1.5 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50"
        >
          {busy ? 'Sending...' : 'Submit correction'}
        </button>
      </div>
    </div>
  );
}

function BatchCard({
  proposal,
  deployedSha,
  deployedAt,
}: {
  proposal: BatchProposal;
  deployedSha?: string;
  deployedAt?: string;
}) {
  const router = useRouter();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showDisagree, setShowDisagree] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const bv = proposal.before_value ?? {};
  const av = proposal.after_value ?? {};
  const rank = av.rank ?? '?';
  const urgency = proposal.urgency_tier ?? 'routine';
  const batchSize = bv.batch_size ?? av.batch_size ?? 0;
  const gap = bv.total_price_gap_usd;
  const dryRunRows = bv.dry_run_rows ?? [];
  const symptomSql = bv.symptom_sql ?? '';
  const depSql = bv.dependency_sql ?? '';
  const isBlocked = av.action === 'price.formula_validation_required';

  async function handleApprove() {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/proposals/${proposal.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: `Batch ${rank}/7 approved` }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) { setError(body.error ?? `HTTP ${res.status}`); setApproving(false); return; }
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
      setApproving(false);
    }
  }

  async function handleReject() {
    if (rejectReason.trim().length < 5) { setError('Reason required (min 5 chars)'); return; }
    setRejecting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/proposals/${proposal.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) { setError(body.error ?? `HTTP ${res.status}`); setRejecting(false); return; }
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
      setRejecting(false);
    }
  }

  if (done) return null;

  return (
    <div className={`mb-5 rounded-xl border-2 ${URGENCY_BORDERS[urgency] ?? 'border-slate-200'} ${URGENCY_BG[urgency] ?? 'bg-slate-50'} overflow-hidden`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3 flex-wrap border-b border-slate-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 uppercase tracking-wide ${URGENCY_COLORS[urgency] ?? 'bg-slate-500 text-white'}`}>
            {urgency}
          </span>
          <span className="text-xs font-bold text-slate-500">BATCH {rank}/7</span>
          <span className="font-semibold text-slate-800 text-sm">
            {bv.cluster ?? 'price.formula_review.batch'}
          </span>
          <span className="text-xs text-slate-500">
            {batchSize} SKUs
            {gap != null ? ` · $${gap.toFixed(2)} gap` : ''}
            {bv.deviation_range ? ` · ${bv.deviation_range}` : ''}
          </span>
        </div>
        {isBlocked && (
          <span className="text-[10px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-full px-2 py-0.5 uppercase">
            Blocked — awaiting SEQ3 validation
          </span>
        )}
      </div>

      {/* Rationale summary */}
      <div className="px-4 py-2 bg-white border-b border-slate-100">
        <p className="text-xs text-slate-600">{proposal.source_rationale}</p>
      </div>

      {/* SYMPTOM */}
      <Section title="1. Symptom">
        <p className="text-xs text-slate-700">
          {batchSize} SKUs with <strong>{bv.deviation_range ?? 'unknown'}</strong> deviation from formula price.
          Source: <code className="bg-slate-100 px-1 rounded">ops.price_audit_log</code> audit_date 2026-05-27.
        </p>
        {symptomSql && <CopySQL sql={symptomSql} label="Run to verify symptom" />}
      </Section>

      {/* ROOT CAUSE */}
      <Section title="2. Root Cause">
        <p className="text-xs text-slate-700">
          {av.action === 'price.formula_validation_required'
            ? 'Formula version SEQ3_v1_2026-05-13 flagged as potentially erroneous. Expected prices computed from this version cannot be trusted until Rose validates it.'
            : bv.formula_version_mix
              ? `Formula mix in affected SKUs: ${bv.formula_version_mix}. K2K market price was copied at ingest time instead of computing formula price.`
              : bv.formula_version
                ? `Formula version: ${bv.formula_version}. Price at ingest diverged from expected.`
                : 'Actual price diverged from formula-computed expected price.'}
        </p>
        <CopySQL
          sql={`SELECT version, is_active, created_at FROM pricing_formula_versions ORDER BY created_at DESC LIMIT 5;`}
          label="Verify formula versions"
        />
      </Section>

      {/* FIX — DRY RUN */}
      <Section title="3. Fix — Dry Run Preview" badge={
        <span className="text-[10px] bg-emerald-100 text-emerald-800 rounded-full px-2 py-0.5 font-semibold">
          first {dryRunRows.length} of {batchSize} rows
        </span>
      }>
        <p className="text-xs text-slate-700 mb-2">
          {av.suggested_action ?? 'Reset prices to formula expected_price.'}
        </p>
        {dryRunRows.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200 mb-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-2 py-1.5 font-semibold text-slate-500 text-[10px] uppercase">SKU</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-red-600 text-[10px] uppercase">Current</th>
                  <th className="text-center px-1 py-1.5 text-slate-400 text-[10px]">→</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-emerald-700 text-[10px] uppercase">Formula</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-slate-500 text-[10px] uppercase">Dev%</th>
                </tr>
              </thead>
              <tbody>
                {dryRunRows.map((r) => {
                  const current = parseFloat(r.actual);
                  const formula = parseFloat(r.expected);
                  const change = formula - current;
                  return (
                    <tr key={r.sku_id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-2 py-1 font-mono text-slate-700">{r.sku_id}</td>
                      <td className="px-2 py-1 text-right text-red-700 font-mono">${r.actual}</td>
                      <td className="px-1 py-1 text-center text-slate-400">→</td>
                      <td className="px-2 py-1 text-right text-emerald-700 font-mono">${r.expected}</td>
                      <td className={`px-2 py-1 text-right font-mono font-semibold text-[11px] ${
                        parseFloat(r.dev_pct) < 0 ? 'text-amber-700' : 'text-red-700'
                      }`}>
                        {parseFloat(r.dev_pct) > 0 ? '+' : ''}{r.dev_pct}%
                        <span className="ml-1 text-slate-400 font-normal">
                          ({change > 0 ? '+' : ''}${change.toFixed(2)})
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">Dry-run rows loading...</p>
        )}
        {symptomSql && (
          <CopySQL
            sql={symptomSql.replace('LIMIT 10', 'LIMIT 10')}
            label="Run same query to verify preview"
          />
        )}
      </Section>

      {/* DEPENDENCIES */}
      <Section title="4. Dependencies">
        {av.dependency ? (
          <p className="text-xs text-slate-700 mb-2">{av.dependency}</p>
        ) : av.escalate_to ? (
          <p className="text-xs text-slate-700 mb-2">
            <strong>Blocked.</strong> Requires {av.escalate_to} to validate formula before execution.
            {av.question ? ` Question: ${av.question}` : ''}
          </p>
        ) : (
          <p className="text-xs text-slate-700 mb-2">No blocking dependencies. Formula version is clean.</p>
        )}
        {depSql && <CopySQL sql={depSql} label="Check dependency state" />}
      </Section>

      {/* DEPLOYMENT VERIFICATION */}
      <Section title="5. Deployment Verification">
        <p className="text-xs text-slate-700">
          {deployedSha
            ? <>Card schema deployed in commit <code className="bg-slate-100 px-1 rounded">{deployedSha.slice(0, 8)}</code>, built {deployedAt ?? 'unknown'}.</>
            : 'Deployed commit SHA loading from /api/__version.'}
        </p>
        <CopySQL sql="curl https://www.floropolis.com/api/__version" label="Verify deployed commit" />
      </Section>

      {/* Actions */}
      <div className="px-4 py-3 bg-white border-t border-slate-100">
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

        {!showRejectForm && !showDisagree && (
          <div className="flex flex-wrap gap-2">
            {!isBlocked && (
              <button
                onClick={handleApprove}
                disabled={approving}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {approving ? 'Approving...' : `Approve ${batchSize} SKUs`}
              </button>
            )}
            <button
              onClick={() => { setShowRejectForm(true); setError(null); }}
              className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold border border-red-200"
            >
              Reject
            </button>
            <button
              onClick={() => { setShowDisagree(true); setError(null); }}
              className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-200"
            >
              I see this differently
            </button>
          </div>
        )}

        {showRejectForm && (
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-1">Reject reason <span className="text-red-500">*</span></p>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
              rows={2}
              placeholder="e.g. Need Rose to confirm farm costs first"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowRejectForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg" disabled={rejecting}>
                Cancel
              </button>
              <button onClick={handleReject} disabled={rejecting} className="px-3 py-1.5 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50">
                {rejecting ? 'Rejecting...' : 'Confirm reject'}
              </button>
            </div>
          </div>
        )}
      </div>

      {showDisagree && (
        <DisagreementForm proposalId={proposal.id} onClose={() => setShowDisagree(false)} />
      )}
    </div>
  );
}

export default function BatchPriceProposalPanel({ proposals, deployedSha, deployedAt }: Props) {
  if (!proposals.length) return null;

  const criticalCount = proposals.filter(p => p.urgency_tier === 'critical').length;
  const urgentCount = proposals.filter(p => p.urgency_tier === 'urgent').length;
  const totalSkus = proposals.reduce((sum, p) => sum + (p.before_value?.batch_size ?? p.after_value?.batch_size ?? 0), 0);
  const totalGap = proposals.reduce((sum, p) => sum + (p.before_value?.total_price_gap_usd ?? 0), 0);

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4 px-1">
        <div>
          <h2 className="text-base font-bold text-slate-900">Price formula corrections</h2>
          <p className="text-xs text-slate-500">
            {proposals.length} batches · {totalSkus.toLocaleString()} SKUs · ${totalGap.toFixed(2)} total gap ·
            {criticalCount > 0 && <span className="ml-1 text-red-600 font-semibold">{criticalCount} critical</span>}
            {urgentCount > 0 && <span className="ml-1 text-orange-600 font-semibold"> {urgentCount} urgent</span>}
          </p>
        </div>
        <div className="ml-auto text-[10px] text-slate-400">
          Source: <code>ops.price_audit_log</code> 2026-05-27 · proposed by Job_PM (Phase 3.3)
        </div>
      </div>

      {proposals
        .sort((a, b) => {
          const tier = { critical: 0, urgent: 1, routine: 2 };
          const ta = tier[a.urgency_tier as keyof typeof tier] ?? 3;
          const tb = tier[b.urgency_tier as keyof typeof tier] ?? 3;
          if (ta !== tb) return ta - tb;
          return (a.after_value?.rank ?? 99) - (b.after_value?.rank ?? 99);
        })
        .map(p => (
          <BatchCard key={p.id} proposal={p} deployedSha={deployedSha} deployedAt={deployedAt} />
        ))}
    </div>
  );
}
