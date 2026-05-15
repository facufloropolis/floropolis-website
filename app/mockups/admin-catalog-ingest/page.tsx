// Admin Catalog -- Ingest (staging)
// v0.1 | 2026-05-15 | Job_PM [V8 SHADOW]
//
// Vendor ingestion staging. K2K API + email + WhatsApp + CSV + manual.
// Mocks the "Vendor Ingestion Adapter" agent output. Review/approve/reject staged offers.

import AdminCatalogNav from '../_components/AdminCatalogNav';
import { INGEST_STAGING } from '../_constants/catalogQueue';
import { getVendor } from '../_constants/catalogMock';

const SOURCE_ICON: Record<string, string> = {
  api:      'API',
  email:    'Email',
  whatsapp: 'WhatsApp',
  csv:      'CSV',
  manual:   'Manual',
};

const SOURCE_CLS: Record<string, string> = {
  api:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  email:    'bg-blue-50 text-blue-700 border-blue-200',
  whatsapp: 'bg-green-50 text-green-700 border-green-200',
  csv:      'bg-slate-50 text-slate-700 border-slate-200',
  manual:   'bg-amber-50 text-amber-700 border-amber-200',
};

export default function AdminCatalogIngest() {
  const totalParsed = INGEST_STAGING.reduce((s, x) => s + x.parsed_offers, 0);
  const totalMapped = INGEST_STAGING.reduce((s, x) => s + x.mapped_sku_count, 0);
  const totalUnmapped = INGEST_STAGING.reduce((s, x) => s + x.unmapped_count, 0);
  const pendingReview = INGEST_STAGING.filter(x => x.status === 'pending_review' || x.status === 'partial_mapped').length;

  return (
    <div>
      <AdminCatalogNav active="ingest" />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Vendor Ingestion Staging</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Raw vendor offers parsed by the <span className="font-medium text-slate-700">Vendor Ingestion Adapter</span> agent.
              {' '}Auto-applied at &gt;= 0.85 confidence, queued for review below.
            </p>
          </div>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Tile label="Inbound (24h)"   value={String(INGEST_STAGING.length)} hint={`${pendingReview} pending review`} />
          <Tile label="Total offers"    value={String(totalParsed)}            hint="Across all sources" />
          <Tile label="Auto-mapped"     value={String(totalMapped)}            hint={`${((totalMapped / totalParsed) * 100).toFixed(0)}% of inbound`} />
          <Tile label="Unmapped"        value={String(totalUnmapped)}          hint="Sent to mapping queue" />
        </div>

        {/* Staging table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <p className="text-xs text-slate-500">Recent inbound (last 48h)</p>
          </div>
          <div className="divide-y divide-slate-100">
            {INGEST_STAGING.map(s => {
              const vendor = getVendor(s.vendor_id);
              const confCls =
                s.mapping_confidence_avg >= 0.85 ? 'text-emerald-700'
              : s.mapping_confidence_avg >= 0.65 ? 'text-amber-700'
                                                  : 'text-red-700';
              const statusCls =
                s.status === 'auto_applied'    ? 'bg-emerald-100 text-emerald-800'
              : s.status === 'partial_mapped'  ? 'bg-amber-100 text-amber-800'
              : s.status === 'pending_review'  ? 'bg-orange-100 text-orange-800'
                                                : 'bg-red-100 text-red-800';
              return (
                <div key={s.id} className="px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${SOURCE_CLS[s.source]}`}>
                          {SOURCE_ICON[s.source]}
                        </span>
                        <span className="font-medium text-slate-900 text-sm">{vendor?.name}</span>
                        <span className="text-[11px] text-slate-400">. {s.received_at.replace('T', ' ').replace('Z', ' UTC')}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${statusCls}`}>
                          {s.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed line-clamp-2" title={s.raw_input_preview}>
                        {s.raw_input_preview}
                      </p>
                      <div className="flex gap-4 mt-2 text-[11px] text-slate-500">
                        <span><span className="text-slate-700 font-medium">{s.parsed_offers}</span> parsed</span>
                        <span><span className="text-emerald-700 font-medium">{s.mapped_sku_count}</span> mapped</span>
                        {s.unmapped_count > 0 && (
                          <span><span className="text-amber-700 font-medium">{s.unmapped_count}</span> need mapping</span>
                        )}
                        <span>conf <span className={`font-medium ${confCls}`}>{(s.mapping_confidence_avg * 100).toFixed(0)}%</span></span>
                        <span className="text-slate-400">. parser: {s.parser_agent}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {(s.status === 'pending_review' || s.status === 'partial_mapped') && (
                        <>
                          <button className="text-xs px-2.5 py-1 rounded bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">
                            Review
                          </button>
                          <button className="text-xs px-2.5 py-1 rounded text-slate-600 hover:bg-slate-100">
                            Reject
                          </button>
                        </>
                      )}
                      {s.status === 'auto_applied' && (
                        <span className="text-[10px] text-slate-400 italic">No action needed</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Adapter explainer */}
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-900 mb-2">Vendor Ingestion Adapter -- mock</p>
          <p className="text-xs text-blue-800 leading-relaxed">
            This agent (not yet built -- see <span className="font-mono">/admin-catalog-proposals</span> tab B3) ingests in 4 paths:
          </p>
          <ul className="text-xs text-blue-800 mt-1.5 ml-4 list-disc space-y-0.5">
            <li><strong>API</strong> (K2K): structured, auto-applied at &gt;= 0.85 confidence</li>
            <li><strong>Email</strong>: PDF or inline text parsed via LLM; mapping confidence varies</li>
            <li><strong>WhatsApp</strong>: voice notes transcribed, photos OCR&apos;d, prices parsed from natural language</li>
            <li><strong>CSV</strong> upload: manual admin fallback</li>
          </ul>
          <p className="text-xs text-blue-800 mt-2">
            Low-confidence offers flow to the <a href="/mockups/admin-catalog-mapping" className="underline">SKU mapping queue</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-3">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-0.5">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>
    </div>
  );
}
