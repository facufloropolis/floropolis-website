// Admin Catalog -- Discount rules
// v0.1 | 2026-05-15 | Job_PM [V8 SHADOW]
//
// Discount rules by category / vendor / SKU / client with inline warnings panel.
// Job + Talin propose. Facu approves. Warnings shown at creation time + at approval time.

import AdminCatalogNav from '../_components/AdminCatalogNav';
import { DISCOUNT_RULES } from '../_constants/catalogQueue';

export default function AdminCatalogDiscounts() {
  const active = DISCOUNT_RULES.filter(d => d.status === 'active');
  const awaiting = DISCOUNT_RULES.filter(d => d.status === 'awaiting_facu');

  return (
    <div>
      <AdminCatalogNav active="discount" />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Discount Rules</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Scoped by category / vendor / SKU / client. Per-SKU price overrides discouraged
              {' '}-- use rules so they expire automatically.
            </p>
          </div>
          <button className="text-xs px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700 font-medium">
            + Propose discount
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <Tile label="Active rules" value={String(active.length)} hint="Currently applied" tone="emerald" />
          <Tile label="Awaiting Facu" value={String(awaiting.length)} hint="Proposed, not yet approved" tone="orange" />
          <Tile label="Below GPM floor" value={String([...active, ...awaiting].filter(d => d.warnings.some(w => w.severity === 'warn' || w.severity === 'critical')).length)} hint="Have margin warnings" tone="red" />
        </div>

        {/* Awaiting Facu */}
        {awaiting.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-orange-900 uppercase tracking-wide mb-2">Awaiting Facu</p>
            <div className="space-y-3">
              {awaiting.map(d => (
                <DiscountCard key={d.id} d={d} />
              ))}
            </div>
          </div>
        )}

        {/* Active */}
        <div>
          <p className="text-xs font-semibold text-emerald-900 uppercase tracking-wide mb-2">Active</p>
          <div className="space-y-3">
            {active.map(d => (
              <DiscountCard key={d.id} d={d} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscountCard({ d }: { d: typeof DISCOUNT_RULES[number] }) {
  const isAwaiting = d.status === 'awaiting_facu';
  return (
    <div className={
      'rounded-xl border p-4 ' +
      (isAwaiting ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200')
    }>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold uppercase">
              {d.scope_type}
            </span>
            <span className="font-semibold text-slate-900 text-sm">{d.scope_label}</span>
            <span className="text-base font-bold text-slate-900">{d.discount_pct}% off</span>
            {d.expires_at && (
              <span className="text-[11px] text-slate-500">
                expires {d.expires_at}
              </span>
            )}
          </div>
          {d.notes && (
            <p className="text-xs text-slate-600 mt-1.5 italic">{d.notes}</p>
          )}
          {d.warnings.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {d.warnings.map((w, i) => (
                <div key={i} className={
                  'text-[11px] flex items-start gap-1 ' +
                  (w.severity === 'critical' ? 'text-red-700' : w.severity === 'warn' ? 'text-amber-700' : 'text-slate-500')
                }>
                  <span className="font-bold">{w.severity === 'critical' ? '!!' : w.severity === 'warn' ? '!' : '.'}</span>
                  <span>{w.text}</span>
                </div>
              ))}
            </div>
          )}
          {d.approved_by && (
            <p className="text-[11px] text-slate-400 mt-2">Approved by {d.approved_by} on {d.approved_at}</p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {isAwaiting ? (
            <>
              <button className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-medium">
                Approve
              </button>
              <button className="text-xs px-3 py-1.5 rounded text-slate-600 hover:bg-slate-100">
                Reject
              </button>
            </>
          ) : (
            <>
              <button className="text-xs px-3 py-1 rounded text-violet-700 hover:bg-violet-50">Edit</button>
              <button className="text-xs px-3 py-1 rounded text-slate-500 hover:bg-slate-100">Expire</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: 'emerald' | 'orange' | 'red' }) {
  const cls =
    tone === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
  : tone === 'orange'  ? 'bg-orange-50 border-orange-200 text-orange-900'
                        : 'bg-red-50 border-red-200 text-red-900';
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
      <div className="text-[11px] mt-0.5 opacity-70">{hint}</div>
    </div>
  );
}
