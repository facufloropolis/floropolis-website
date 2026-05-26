'use client';
// ContentDescriptionPanel | v2 | 2026-05-26 | Job_PM [V8 SHADOW]
//
// 301 SKUs across Megaflor, Flodecol, Magic Flowers are missing contents_note.
// This gate is needed for 'perfect' status (publishable_gap tier — not blocking).
//
// Shows one row per variety × vendor × tier. Pre-fills a drafted description.
// Facu reviews/edits the text, clicks "Approve for N SKUs" → creates one
// contents_description.batch_approve proposal → executor writes contents_note
// on all matching rows.
//
// 0 sole-blockers in this gate — these go from publishable → perfect, not
// blocked → publishable. Still essential for the premium catalog standard.

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface DescriptionVariety {
  variety: string;
  vendor: string;
  tier: string;
  sku_count: number;
  default_description: string;
}

interface Props {
  varieties: DescriptionVariety[];
  totalCount: number;
  priorCorrectionCount: number;
  daysSinceFirstSurfaced: number;
}

interface VarietyState {
  text: string;
  editing: boolean;
  done: boolean;
  busy: boolean;
  error: string | null;
}

export default function ContentDescriptionPanel({ varieties, totalCount, priorCorrectionCount, daysSinceFirstSurfaced }: Props) {
  const router = useRouter();

  // Panel-level correction state (structural correction for Rose)
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionDone, setCorrectionDone] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  const [correctionPriority, setCorrectionPriority] = useState<'P0' | 'P1' | 'P2'>('P1');

  async function sendDescriptionCorrection() {
    if (correctionText.trim().length < 10) {
      setCorrectionError('Describe what is wrong (min 10 chars)');
      return;
    }
    setCorrectionBusy(true);
    setCorrectionError(null);
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'contents_description.facu_correction',
          target_table: 'floropolis_inventory_mirror',
          target_id: null,
          payload: {
            variety_count: varieties.length,
            total_sku_count: totalCount,
            what_is_wrong: correctionText.trim(),
            priority: correctionPriority,
          },
          source_agent: 'Job_PM',
          source_rationale: correctionText.trim(),
          notes: correctionText.trim(),
        }),
      });
      const body = await res.json() as { proposal?: unknown; error?: string };
      if (!res.ok) { setCorrectionError(body.error ?? `HTTP ${res.status}`); setCorrectionBusy(false); return; }
      setCorrectionDone(true);
      setShowCorrection(false);
    } catch (e) {
      setCorrectionError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setCorrectionBusy(false);
    }
  }

  const [states, setStates] = useState<Record<string, VarietyState>>(() =>
    Object.fromEntries(
      varieties.map(v => [
        `${v.vendor}||${v.variety}||${v.tier}`,
        { text: v.default_description, editing: false, done: false, busy: false, error: null },
      ]),
    ),
  );

  const key = (v: DescriptionVariety) => `${v.vendor}||${v.variety}||${v.tier}`;

  const update = useCallback((k: string, patch: Partial<VarietyState>) => {
    setStates(prev => ({ ...prev, [k]: { ...prev[k], ...patch } }));
  }, []);

  async function submitVariety(v: DescriptionVariety) {
    const k = key(v);
    const text = states[k].text.trim();
    if (text.length < 10) { update(k, { error: 'Description too short (min 10 chars)' }); return; }
    update(k, { busy: true, error: null });
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'contents_description.batch_approve',
          target_table: 'floropolis_inventory_mirror',
          target_id: null,
          payload: {
            vendor: v.vendor,
            variety: v.variety,
            tier: v.tier,
            sku_count: v.sku_count,
            description_text: text,
          },
          source_agent: 'Job_PM',
          source_rationale: `Batch description for ${v.variety} (${v.vendor} ${v.tier}) — ${v.sku_count} SKUs`,
          notes: text,
        }),
      });
      const body = await res.json() as { proposal?: unknown; error?: string };
      if (!res.ok) { update(k, { error: body.error ?? `HTTP ${res.status}`, busy: false }); return; }
      update(k, { done: true, busy: false });
      router.refresh();
    } catch (e) {
      update(k, { error: e instanceof Error ? e.message : 'request failed', busy: false });
    }
  }

  // Group by vendor for display
  const byVendor = varieties.reduce<Record<string, DescriptionVariety[]>>((acc, v) => {
    if (!acc[v.vendor]) acc[v.vendor] = [];
    acc[v.vendor].push(v);
    return acc;
  }, {});

  const doneCount = Object.values(states).filter(s => s.done).length;
  if (doneCount === varieties.length) return null;

  const vendorOrder = ['Megaflor', 'Flodecol', 'Magic Flowers'];
  const sortedVendors = [
    ...vendorOrder.filter(v => byVendor[v]),
    ...Object.keys(byVendor).filter(v => !vendorOrder.includes(v)).sort(),
  ];

  return (
    <div className="mb-6 rounded-xl border-2 border-violet-300 bg-violet-50 overflow-hidden">
      <div className="px-4 py-3 bg-violet-100 border-b border-violet-200">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold bg-violet-700 text-white rounded-full px-2 py-0.5 uppercase tracking-wide">
            Missing Descriptions
          </span>
          {priorCorrectionCount > 0 && (
            <span className="text-[10px] font-bold bg-violet-900 text-white rounded-full px-2 py-0.5 uppercase tracking-wide">
              Recurring x {priorCorrectionCount} — {daysSinceFirstSurfaced}d open
            </span>
          )}
          <span className="font-semibold text-violet-900 text-sm">
            {totalCount} SKUs across {varieties.length} varieties — needed for perfect catalog status
          </span>
        </div>
        <p className="text-xs text-violet-800 max-w-2xl">
          Each variety needs a <code className="bg-violet-200 px-1 rounded">contents_note</code> description.
          Draft text is pre-filled — review and edit, then approve per variety.
          Descriptions are shared across all lengths of a variety from the same vendor.
          This is a <strong>publishable_gap</strong> gate (not blocking), but required for perfect catalog quality.
          {doneCount > 0 && (
            <span className="ml-2 text-violet-700 font-semibold">{doneCount} / {varieties.length} approved this session.</span>
          )}
        </p>
        <div className="flex items-center gap-2 mt-2">
          {!correctionDone ? (
            <button
              onClick={() => { setShowCorrection(s => !s); setCorrectionError(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                showCorrection
                  ? 'bg-violet-200 text-violet-800 border border-violet-300'
                  : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-200'
              }`}
            >
              {showCorrection ? 'Collapse' : 'I see this differently'}
            </button>
          ) : (
            <span className="text-xs text-emerald-700 font-semibold">Correction sent</span>
          )}
        </div>
      </div>
      {showCorrection && (
        <div className="border-t border-violet-200 bg-white px-4 py-4">
          <h3 className="font-bold text-slate-900 text-sm mb-1">Structural correction for Rose</h3>
          <p className="text-xs text-slate-500 mb-3">
            Use this when a variety name, vendor assignment, or tier grouping is wrong in the system —
            not to edit a description, but to flag a data structure problem.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-emerald-700 mb-1">
                What is wrong — variety name, vendor, tier, or grouping issue?
              </label>
              <textarea
                className="w-full border border-emerald-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-emerald-50/30"
                rows={3}
                placeholder="e.g. Tinted from Flodecol is not a variety name — it is a process. The real variety names are Romantique, Serene, etc. The descriptions should reference the actual variety."
                value={correctionText}
                onChange={e => setCorrectionText(e.target.value)}
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
                  onClick={() => setShowCorrection(false)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
                  disabled={correctionBusy}
                >
                  Cancel
                </button>
                <button
                  onClick={sendDescriptionCorrection}
                  disabled={correctionBusy}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-700 hover:bg-violet-800 disabled:opacity-50"
                >
                  {correctionBusy ? 'Sending...' : 'Send correction to Rose'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sortedVendors.map(vendor => {
        const vendorVarieties = byVendor[vendor] ?? [];
        const allDone = vendorVarieties.every(v => states[key(v)]?.done);
        if (allDone) return null;

        return (
          <div key={vendor} className="border-b border-violet-200 last:border-b-0">
            <div className="px-4 py-2 bg-violet-50/80 border-b border-violet-100">
              <span className="text-xs font-bold text-violet-800 uppercase tracking-wide">{vendor}</span>
              <span className="text-xs text-violet-600 ml-2">
                {vendorVarieties.filter(v => !states[key(v)]?.done).length} varieties remaining
              </span>
            </div>
            <div className="divide-y divide-violet-100">
              {vendorVarieties.map(v => {
                const k = key(v);
                const st = states[k];
                if (!st || st.done) return null;

                return (
                  <div key={k} className="px-4 py-3">
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="font-semibold text-slate-900 text-sm">{v.variety}</span>
                          <span className="text-[10px] bg-violet-100 text-violet-700 rounded px-1.5 py-0.5 font-semibold">{v.tier}</span>
                          <span className="text-xs text-slate-500">{v.sku_count} SKU{v.sku_count !== 1 ? 's' : ''}</span>
                        </div>
                        {st.editing ? (
                          <textarea
                            className="w-full border border-violet-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                            rows={3}
                            value={st.text}
                            onChange={e => update(k, { text: e.target.value })}
                            autoFocus
                          />
                        ) : (
                          <p
                            className="text-xs text-slate-600 leading-relaxed cursor-pointer hover:text-slate-900 transition-colors"
                            onClick={() => update(k, { editing: true })}
                            title="Click to edit"
                          >
                            {st.text}
                          </p>
                        )}
                        {st.error && <p className="text-xs text-red-600 mt-1">{st.error}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0 mt-0.5">
                        {st.editing ? (
                          <button
                            onClick={() => update(k, { editing: false })}
                            className="px-2.5 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100 border border-slate-200"
                          >
                            Done editing
                          </button>
                        ) : (
                          <button
                            onClick={() => update(k, { editing: true })}
                            className="px-2.5 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-violet-100 border border-violet-200"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => submitVariety(v)}
                          disabled={st.busy}
                          className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {st.busy ? 'Submitting...' : `Approve for ${v.sku_count} SKUs`}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
