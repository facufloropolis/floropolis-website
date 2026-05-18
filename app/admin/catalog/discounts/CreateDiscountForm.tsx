// Client island -- create a discount_rule proposal.
// v1 | 2026-05-18 | Job_PM admin-port X6 [V8 SHADOW]
//
// Form POSTs to /api/admin/proposals with type='discount_rule.create' and
// payload { scope, scope_value, discount_pct, valid_from?, valid_until?,
// min_qty?, notes? }. Computes 3 warnings client-side BEFORE submit so Facu
// sees them inline:
//   - Low margin (amber): scope=sku|category AND discount_pct > 15.
//   - Below GPM target (red): scope=sku AND skuPrice provided AND (1 - cost/(price*(1-d/100))) < gpmTarget.
//     We approximate "cost" as price*(1 - gpmTarget) which lets us derive
//     post-discount GPM purely from inputs the page can fetch (price + gpmTarget).
//   - New client (amber): scope=client AND clientPaidOrders<3.
//
// The page passes context (vendors, categories, skus, clients, gpmTarget) so
// this island stays dumb -- it only renders + posts.

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type DiscountScope =
  | 'category'
  | 'vendor'
  | 'sku'
  | 'client'
  | 'client_category';

export interface ScopeOption {
  /** Stored scope_value (e.g. 'rose', 'v_andescolor', 'sku:1234', 'client:uuid'). */
  value: string;
  /** Human label shown in dropdown. */
  label: string;
  /** Optional context used to compute warnings inline. */
  unitPrice?: number | null;
  paidOrderCount?: number | null;
}

interface CreateDiscountFormProps {
  categories: ScopeOption[];
  vendors: ScopeOption[];
  skus: ScopeOption[];
  clients: ScopeOption[];
  /** From pricing_constants.gpm_target (fraction, e.g. 0.33). */
  gpmTarget: number;
}

type WarnSeverity = 'info' | 'warn' | 'critical';
interface Warning {
  severity: WarnSeverity;
  text: string;
}

const SCOPE_LABELS: Record<DiscountScope, string> = {
  category: 'Category',
  vendor: 'Vendor',
  sku: 'SKU',
  client: 'Client',
  client_category: 'Client category',
};

export default function CreateDiscountForm(props: CreateDiscountFormProps) {
  const router = useRouter();

  const [scope, setScope] = useState<DiscountScope>('category');
  const [scopeValue, setScopeValue] = useState<string>('');
  const [discountPctStr, setDiscountPctStr] = useState<string>('');
  const [validFrom, setValidFrom] = useState<string>('');
  const [validUntil, setValidUntil] = useState<string>('');
  const [minQtyStr, setMinQtyStr] = useState<string>('1');
  const [notes, setNotes] = useState<string>('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const scopeOptions: ScopeOption[] = useMemo(() => {
    switch (scope) {
      case 'category':
        return props.categories;
      case 'vendor':
        return props.vendors;
      case 'sku':
        return props.skus;
      case 'client':
        return props.clients;
      case 'client_category':
        return [];
      default:
        return [];
    }
  }, [scope, props]);

  const selectedOpt: ScopeOption | undefined = scopeOptions.find(
    (o) => o.value === scopeValue,
  );

  const warnings: Warning[] = useMemo(() => {
    const out: Warning[] = [];
    const d = Number(discountPctStr);
    if (!Number.isFinite(d) || d <= 0) return out;

    // Low margin (amber) -- discount > 15% on a SKU or category.
    if ((scope === 'sku' || scope === 'category') && d > 15) {
      out.push({
        severity: 'warn',
        text: `Discount > 15% on a ${scope} may erode margin -- double-check vendor cost`,
      });
    }

    // Below GPM target (critical) -- only if we have a unit price on the
    // selected SKU. We treat cost = price * (1 - gpmTarget), then post-discount
    // GPM = 1 - cost / (price * (1 - d/100)).
    if (scope === 'sku' && selectedOpt?.unitPrice && selectedOpt.unitPrice > 0) {
      const price = selectedOpt.unitPrice;
      const cost = price * (1 - props.gpmTarget);
      const discountedPrice = price * (1 - d / 100);
      if (discountedPrice <= 0) {
        out.push({
          severity: 'critical',
          text: 'Discount drives price to zero or negative',
        });
      } else {
        const postGpm = 1 - cost / discountedPrice;
        if (postGpm < props.gpmTarget) {
          const pct = (postGpm * 100).toFixed(1);
          const tgt = (props.gpmTarget * 100).toFixed(1);
          out.push({
            severity: 'critical',
            text: `Post-discount GPM ${pct}% is below target ${tgt}%`,
          });
        }
      }
    }

    // New client (amber) -- < 3 paid orders.
    if (scope === 'client' && selectedOpt) {
      const orders = selectedOpt.paidOrderCount ?? 0;
      if (orders < 3) {
        out.push({
          severity: 'warn',
          text: `New client: ${orders} paid order${orders === 1 ? '' : 's'} on file (< 3) -- no proven history`,
        });
      }
    }

    return out;
  }, [scope, scopeValue, discountPctStr, selectedOpt, props.gpmTarget]);

  async function submit() {
    setError(null);
    setOkMsg(null);

    const d = Number(discountPctStr);
    if (!Number.isFinite(d) || d <= 0 || d > 100) {
      setError('discount_pct must be a number in (0, 100]');
      return;
    }
    if (!scopeValue.trim() && scope !== 'client_category') {
      setError('pick a scope value');
      return;
    }
    if (scope === 'client_category' && !scopeValue.trim()) {
      setError('enter the client category');
      return;
    }
    const minQty = Number(minQtyStr);
    if (!Number.isFinite(minQty) || minQty < 1 || !Number.isInteger(minQty)) {
      setError('min_qty must be an integer >= 1');
      return;
    }

    const payload: Record<string, unknown> = {
      scope,
      scope_value: scopeValue.trim(),
      discount_pct: d,
      min_qty: minQty,
    };
    if (validFrom.trim()) payload.valid_from = validFrom.trim();
    if (validUntil.trim()) payload.valid_until = validUntil.trim();
    if (notes.trim()) payload.notes = notes.trim();

    const body = {
      type: 'discount_rule.create',
      target_table: 'discount_rules',
      payload,
      warnings: warnings.map((w) => ({
        code: w.severity === 'critical' ? 'below_gpm' : 'low_margin_or_new_client',
        severity: w.severity,
        detail: w.text,
      })),
      notes: notes.trim() || null,
    };

    setBusy(true);
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (j as { detail?: string; error?: string }).detail
            ? `${(j as { error?: string }).error}: ${(j as { detail?: string }).detail}`
            : ((j as { error?: string }).error ?? `HTTP ${res.status}`),
        );
        setBusy(false);
        return;
      }
      setOkMsg('Proposal submitted -- awaiting Facu approval below.');
      // Reset form
      setScopeValue('');
      setDiscountPctStr('');
      setValidFrom('');
      setValidUntil('');
      setMinQtyStr('1');
      setNotes('');
      setBusy(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error');
      setBusy(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-5 bg-slate-50">
      <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">
        Propose new rule
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Scope type */}
        <div className="flex flex-col">
          <label className="text-[10px] uppercase text-slate-500 tracking-wide mb-1">
            Scope
          </label>
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as DiscountScope);
              setScopeValue('');
            }}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white"
          >
            {(Object.keys(SCOPE_LABELS) as DiscountScope[]).map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {/* Scope value */}
        <div className="flex flex-col">
          <label className="text-[10px] uppercase text-slate-500 tracking-wide mb-1">
            {SCOPE_LABELS[scope]} value
          </label>
          {scope === 'client_category' ? (
            <input
              type="text"
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
              placeholder="e.g. wedding-planner, event-florist"
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
            />
          ) : (
            <select
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white"
            >
              <option value="">-- pick one --</option>
              {scopeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Discount pct */}
        <div className="flex flex-col">
          <label className="text-[10px] uppercase text-slate-500 tracking-wide mb-1">
            Discount %
          </label>
          <input
            type="number"
            inputMode="decimal"
            min={0.1}
            max={100}
            step={0.5}
            value={discountPctStr}
            onChange={(e) => setDiscountPctStr(e.target.value)}
            placeholder="e.g. 10"
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
          />
        </div>

        {/* Min qty */}
        <div className="flex flex-col">
          <label className="text-[10px] uppercase text-slate-500 tracking-wide mb-1">
            Min qty (stems)
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={minQtyStr}
            onChange={(e) => setMinQtyStr(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
          />
        </div>

        {/* Valid range */}
        <div className="flex flex-col">
          <label className="text-[10px] uppercase text-slate-500 tracking-wide mb-1">
            Valid from
          </label>
          <input
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] uppercase text-slate-500 tracking-wide mb-1">
            Valid until
          </label>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
          />
        </div>

        {/* Notes */}
        <div className="flex flex-col sm:col-span-2">
          <label className="text-[10px] uppercase text-slate-500 tracking-wide mb-1">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="why this discount, expected impact, etc."
            rows={2}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
          />
        </div>
      </div>

      {/* Live warnings panel */}
      {warnings.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            Warnings (shown to Facu at approval)
          </div>
          {warnings.map((w, i) => {
            const pillCls =
              w.severity === 'critical'
                ? 'bg-red-100 text-red-800 border-red-200'
                : w.severity === 'warn'
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200';
            return (
              <div
                key={i}
                className={`text-xs px-2.5 py-1.5 rounded-md border ${pillCls}`}
              >
                <span className="font-semibold mr-1">
                  {w.severity === 'critical' ? '!!' : w.severity === 'warn' ? '!' : '.'}
                </span>
                {w.text}
              </div>
            );
          })}
        </div>
      )}

      {/* Actions + status */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-md"
        >
          {busy ? 'Submitting...' : 'Submit proposal'}
        </button>
        {error && (
          <span className="text-xs text-red-700 font-mono">{error}</span>
        )}
        {okMsg && (
          <span className="text-xs text-emerald-700">{okMsg}</span>
        )}
      </div>

      <p className="text-[11px] text-slate-400 mt-3">
        Submitting writes a row to admin_proposals (status=awaiting_facu).
        Facu approves below; the rule activates on approval.
      </p>
    </div>
  );
}
