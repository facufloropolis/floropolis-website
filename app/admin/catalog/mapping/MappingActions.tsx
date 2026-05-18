// Confirm / Reject / Reopen buttons for a sku_mappings row.
// v1 | 2026-05-18 | Job_PM admin-port X5 [V8 SHADOW]
//
// Confirm opens a small modal where Facu picks parent_sku_id (free text today;
// no canonical parent_sku table yet) and quality_family_id (dropdown from the
// quality_families list passed in via props). On submit it POSTs to
// /api/admin/proposals with type='sku_mapping.confirm'. The proposal then needs
// approval in /admin/catalog/approval-queue to actually flip status='mapped'.
//
// Reject POSTs straight to /api/admin/mapping/[id]/reject -- no proposal needed
// (rejection is reversible by flipping status back to awaiting_review later).
//
// On success: router.refresh() so the server component re-fetches.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface QualityFamilyOption {
  id: string;
  name: string;
  category: string;
}

interface Props {
  mappingId: string;
  vendorSkuText: string;
  suggestedQualityFamilyId: string | null;
  suggestedParentSkuId: string | null;
  qualityFamilies: QualityFamilyOption[];
  status: 'awaiting_review' | 'low_confidence' | 'mapped' | 'rejected';
}

export default function MappingActions({
  mappingId,
  vendorSkuText,
  suggestedQualityFamilyId,
  suggestedParentSkuId,
  qualityFamilies,
  status,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [parentSkuId, setParentSkuId] = useState(suggestedParentSkuId ?? '');
  const [qualityFamilyId, setQualityFamilyId] = useState(
    suggestedQualityFamilyId ?? '',
  );
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = status === 'awaiting_review' || status === 'low_confidence';
  const canReject = canConfirm;

  async function submitConfirm() {
    if (parentSkuId.trim().length === 0) {
      setError('parent_sku_id is required');
      return;
    }
    if (qualityFamilyId.trim().length === 0) {
      setError('quality_family_id is required');
      return;
    }
    setBusy('confirm');
    setError(null);
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'sku_mapping.confirm',
          target_table: 'sku_mappings',
          target_id: mappingId,
          payload: {
            mapping_id: mappingId,
            parent_sku_id: parentSkuId.trim(),
            quality_family_id: qualityFamilyId.trim(),
          },
          notes: `Confirm mapping for vendor SKU "${vendorSkuText}"`,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.detail
            ? `${body.error}: ${body.detail}`
            : (body.error ?? `HTTP ${res.status}`),
        );
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'confirm failed');
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (
      !confirm(
        'Reject this mapping? It will be flagged rejected; you can reopen it later.',
      )
    ) {
      return;
    }
    setBusy('reject');
    setError(null);
    try {
      const res = await fetch(`/api/admin/mapping/${mappingId}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.detail
            ? `${body.error}: ${body.detail}`
            : (body.error ?? `HTTP ${res.status}`),
        );
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reject failed');
    } finally {
      setBusy(null);
    }
  }

  if (status === 'mapped') {
    return (
      <span className="text-[10px] px-2 py-1 rounded bg-emerald-100 text-emerald-800 font-semibold">
        Mapped
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="text-[10px] px-2 py-1 rounded bg-slate-200 text-slate-700 font-semibold">
        Rejected
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 shrink-0">
      <button
        type="button"
        disabled={!canConfirm || busy !== null}
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        Confirm mapping
      </button>
      <button
        type="button"
        disabled={!canReject || busy !== null}
        onClick={reject}
        className="text-xs font-semibold text-red-700 border border-red-200 hover:border-red-400 hover:bg-red-50 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        {busy === 'reject' ? 'Rejecting...' : 'Reject'}
      </button>
      {error && (
        <span className="text-[11px] text-red-600 font-mono max-w-[180px] break-words">
          {error}
        </span>
      )}

      {open && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Confirm SKU mapping
            </h3>
            <p className="text-xs text-slate-500 mb-4 break-words">
              Vendor SKU: <span className="font-mono">{vendorSkuText}</span>
            </p>

            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Quality family
            </label>
            <select
              value={qualityFamilyId}
              onChange={(e) => setQualityFamilyId(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 mb-3 focus:outline-none focus:border-emerald-600"
            >
              <option value="">-- pick a quality family --</option>
              {qualityFamilies.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.id} -- {q.name} ({q.category})
                </option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Parent SKU id
            </label>
            <input
              type="text"
              value={parentSkuId}
              onChange={(e) => setParentSkuId(e.target.value)}
              placeholder="e.g. ROSE-RED-60-HV"
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 mb-1 focus:outline-none focus:border-emerald-600 font-mono"
            />
            <p className="text-[11px] text-slate-500 mb-4">
              Free text today -- the canonical parent_sku table is not yet live.
              Pick the id you want this vendor SKU to bind to.
            </p>

            {error && (
              <p className="text-xs text-red-600 mb-3 font-mono break-words">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy === 'confirm'}
                className="text-xs font-medium text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitConfirm}
                disabled={busy === 'confirm'}
                className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {busy === 'confirm'
                  ? 'Submitting...'
                  : 'Submit for Facu approval'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">
              This creates a proposal in admin_proposals. The mapping flips to
              &quot;mapped&quot; only after Facu approves it in
              /admin/catalog/approval-queue.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
