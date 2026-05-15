// Admin Catalog -- SKU Mapping
// v0.1 | 2026-05-15 | Job_PM [V8 SHADOW]
//
// SKU mapping review queue. Vendor's raw product name -> parent quality_family with
// confidence score. Low-conf (< 0.85) requires human review.

import AdminCatalogNav from '../_components/AdminCatalogNav';
import { SKU_MAPPINGS } from '../_constants/catalogQueue';
import { getVendor, getQualityFamily } from '../_constants/catalogMock';

export default function AdminCatalogMapping() {
  const pending = SKU_MAPPINGS.filter(m => m.status === 'pending');
  const accepted = SKU_MAPPINGS.filter(m => m.status === 'accepted');

  return (
    <div>
      <AdminCatalogNav active="mapping" />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-900">SKU Mapping Queue</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Vendor&apos;s raw name -&gt; parent quality_family + canonical SKU. Built by the
            {' '}<span className="font-medium text-slate-700">SKU Mapper</span> agent (proposed -- see proposals tab B4).
          </p>
        </div>

        {/* Counts */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <Tile label="Pending review" value={String(pending.length)} hint="Confidence < 0.85" tone="amber" />
          <Tile label="Accepted (lifetime)" value={String(accepted.length)} hint="Auto-applied or human-confirmed" tone="emerald" />
          <Tile label="Quality families" value="17" hint="Canonical parent SKUs" tone="slate" />
        </div>

        {/* Mapping cards */}
        <div className="space-y-3">
          {SKU_MAPPINGS.map(m => {
            const vendor = getVendor(m.vendor_id);
            const suggestedQf = m.suggested_quality_family_id ? getQualityFamily(m.suggested_quality_family_id) : null;
            const confCls =
              m.confidence >= 0.85 ? 'text-emerald-700'
            : m.confidence >= 0.65 ? 'text-amber-700'
                                   : 'text-red-700';

            return (
              <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  {/* LEFT: raw vendor input */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">From {vendor?.name}</div>
                    <div className="text-base font-semibold text-slate-900">{m.raw_name}</div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.raw_attributes.map(a => (
                        <span key={a.key} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {a.key}: <span className="font-mono">{a.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* ARROW */}
                  <div className="text-slate-400 self-center text-xl shrink-0">-&gt;</div>

                  {/* RIGHT: suggested quality_family */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[11px] text-slate-500 uppercase tracking-wide">Suggested match</div>
                      <span className={`text-xs font-semibold ${confCls}`}>conf {(m.confidence * 100).toFixed(0)}%</span>
                    </div>
                    {suggestedQf ? (
                      <>
                        <div className="text-base font-semibold text-slate-900">{suggestedQf.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {suggestedQf.category} . {suggestedQf.variety} . {suggestedQf.length_cm}cm . {suggestedQf.unit}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-slate-500 italic">{m.suggested_quality_family_name}</div>
                    )}
                  </div>

                  {/* ACTIONS */}
                  <div className="flex flex-col gap-1 shrink-0">
                    {m.status === 'pending' && (
                      <>
                        <button className="text-xs px-3 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-medium">
                          Accept
                        </button>
                        <button className="text-xs px-3 py-1 rounded text-slate-600 hover:bg-slate-100">
                          Remap
                        </button>
                        <button className="text-xs px-3 py-1 rounded text-slate-600 hover:bg-slate-100">
                          New family
                        </button>
                      </>
                    )}
                    {m.status === 'accepted' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">Accepted</span>
                    )}
                  </div>
                </div>

                {/* Alternatives */}
                {m.alternatives.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[11px] text-slate-500 mb-1.5">Alternatives</p>
                    <div className="flex flex-wrap gap-1.5">
                      {m.alternatives.map((alt, i) => (
                        <button key={i} className="text-[11px] px-2 py-1 rounded bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200">
                          {alt.quality_family_name}{alt.confidence > 0 ? <span className="text-slate-400 ml-1">{(alt.confidence * 100).toFixed(0)}%</span> : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Explainer */}
        <div className="mt-5 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-900 mb-2">How mapping works</p>
          <ol className="text-xs text-blue-800 ml-4 list-decimal space-y-0.5">
            <li>Ingestion Adapter parses raw vendor input -&gt; staged offer</li>
            <li>SKU Mapper compares raw name + attributes to existing quality families using LLM + rules</li>
            <li>Confidence &gt;= 0.85: auto-apply, SKU goes live (subject to other rules)</li>
            <li>Confidence 0.65-0.85: queue here for human review (accept / remap / new family)</li>
            <li>Confidence &lt; 0.65: queue with strong "create new family" suggestion</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: 'amber' | 'emerald' | 'slate' }) {
  const cls =
    tone === 'amber'   ? 'bg-amber-50 border-amber-200 text-amber-900'
  : tone === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                       : 'bg-white border-slate-200 text-slate-900';
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
      <div className="text-[11px] mt-0.5 opacity-70">{hint}</div>
    </div>
  );
}
