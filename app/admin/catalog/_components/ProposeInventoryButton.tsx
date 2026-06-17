'use client';

// Standalone entry point for Flow B inventory control (the missing button).
// Mounts the VarietyUpsert propose surface (add / correct-identity / quarantine) as a
// toggle panel. POSTs to /api/admin/inventory/propose (runs the cost-verify gate, writes
// admin_proposals status=awaiting_facu, NEVER dim_sku). v1 | 2026-06-16 | Job_PM (CPO)
//
// - Catalog grid: <ProposeInventoryButton /> -> add_variety (no existing).
// - SKU detail:   <ProposeInventoryButton existing={{variety, farmCost, skuId}} allowIdentityActions />
//                 -> enables correct-identity + quarantine on that real SKU.

import { useState } from 'react';
import VarietyUpsert from '../../_components/editors/VarietyUpsert';

interface Existing {
  variety: string;
  farmCost?: number;
  source?: string;
  country?: string;
  grade?: string;
  skuId?: string;
}

interface Props {
  existing?: Existing | null;
  allowIdentityActions?: boolean;
  label?: string;
  // Pre-fill VarietyUpsert's category for a one-click correction (sibling-suggested
  // category on a no-category SKU). Default undefined -> existing callers unchanged.
  defaultCategory?: string;
  // Land VarietyUpsert directly on a given action (e.g. 'update_identity' for the
  // corrections lever). Default undefined -> add-only behavior preserved.
  defaultAction?: 'add_variety' | 'update_identity' | 'quarantine';
}

export default function ProposeInventoryButton({
  existing = null,
  allowIdentityActions = false,
  label = '+ Proponer variedad',
  defaultCategory,
  defaultAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
      >
        {open ? 'Cerrar' : label}
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <VarietyUpsert
            existing={existing}
            allowIdentityActions={allowIdentityActions}
            defaultCategory={defaultCategory}
            defaultAction={defaultAction}
            onSaved={(id) => setSavedId(id)}
          />
          {savedId && (
            <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Propuesta <span className="font-mono">{savedId.slice(0, 8)}</span> creada — quedó en la cola de aprobación (awaiting Facu) con su análisis de costo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
