// Cascade-impact pre-computation for admin_proposals.
// v1 | 2026-05-19 | Job_PM Phase C [V8 SHADOW]
//
// BRD UC-D-128: cascade impact (N SKUs affected) is computed AT
// proposal-creation time and stored on the row. The /admin/catalog/approval-queue
// read-side then just displays it -- no recomputation per render.
//
// Rules:
//   - This helper is best-effort. If we cannot count, we return 0 + a warning,
//     never throw. A proposal must still be insertable even if cascade compute
//     fails (we log via Sentry from the caller).
//   - Each new proposal type that has a cascade footprint adds a case here.
//     Types with no SKU footprint (refund.create, sku_mapping.confirm,
//     client_profiles.status_change) return { affected_sku_count: 0, warnings: ['no SKU footprint'] }.
//
// IMPORTANT: this file is intentionally separate from lib/admin/proposal-executors.ts
// (which is owned by another agent and we are blocked from touching during Phase C).

import type { SupabaseClient } from '@supabase/supabase-js';
// 2026-06-01: removed `getProdReadClient` import. Per Facu directive 2026-05-31
// (inbox 59f5b8db) — BACKUP(Sandbox) → PROD = NUNCA writes, and BACKUP deps on
// PROD must be minimized. Verifier confirmed there were no PROD writes in this
// file (only reads). Reads are now switched to BACKUP equivalents post catalog
// rebuild S-0: canonical_cost lives in BACKUP with sku_id uuid FK, and live
// counts come from floropolis_inventory_mirror (BACKUP) — sync cadence is
// Cleanup workstream lane.

export interface CascadeSummary {
  affected_sku_count: number;
  affected_skus_sample: Array<string | number>;
  warnings: string[];
  computed_at: string;
  computed_by: string;
}

interface ComputeInput {
  type: string;
  target_table: string;
  target_id: string | null;
  payload: Record<string, unknown>;
}

const COMPUTED_BY = 'api/admin/proposals POST (Phase C)';

function empty(warning: string): CascadeSummary {
  return {
    affected_sku_count: 0,
    affected_skus_sample: [],
    warnings: [warning],
    computed_at: new Date().toISOString(),
    computed_by: COMPUTED_BY,
  };
}

export async function computeCascadeSummary(
  input: ComputeInput,
  service: SupabaseClient,
): Promise<CascadeSummary> {
  const t = input.type;
  const tid = input.target_id;
  const computed_at = new Date().toISOString();

  // ----- box_master.update -------------------------------------------------
  // Even though box_master.update is REMOVED at executor time per Rose v1.0,
  // we still cover the cascade compute in case the type re-enters scope or a
  // legacy proposal flows through. SKUs in floropolis_inventory_mirror with
  // that box_type are the blast radius.
  if (t === 'box_master.update' && tid) {
    const { data, error, count } = await service
      .from('floropolis_inventory_mirror')
      .select('id', { count: 'exact' })
      .eq('box_type', tid)
      .limit(10);
    if (error) return empty(`mirror_query_failed: ${error.message}`);
    const sample = (data ?? [])
      .map((r) => (r as { id?: string | number | null }).id ?? null)
      .filter((v): v is string | number => v !== null);
    return {
      affected_sku_count: count ?? 0,
      affected_skus_sample: sample,
      warnings:
        (count ?? 0) === 0
          ? ['no SKUs found for this box_type (mirror may be stale)']
          : [],
      computed_at,
      computed_by: COMPUTED_BY,
    };
  }

  // ----- pricing_constants.update ------------------------------------------
  // Single global pricing constant; the blast radius is every SKU in the mirror.
  if (t.startsWith('pricing_constants.')) {
    const { count, error } = await service
      .from('floropolis_inventory_mirror')
      .select('id', { count: 'exact', head: true });
    if (error) return empty(`mirror_count_failed: ${error.message}`);
    return {
      affected_sku_count: count ?? 0,
      affected_skus_sample: [],
      warnings: ['all SKUs (global pricing constant)'],
      computed_at,
      computed_by: COMPUTED_BY,
    };
  }

  // ----- discount_rule.create ---------------------------------------------
  // Footprint depends on scope. category -> SKUs in that category, vendor ->
  // SKUs from that vendor, sku -> the one SKU, client/client_category -> 0 SKUs
  // (it's a customer-side rule).
  if (t === 'discount_rule.create') {
    const scope = input.payload.scope;
    const scopeValue = input.payload.scope_value;
    if (typeof scope === 'string' && typeof scopeValue === 'string') {
      if (scope === 'category' || scope === 'vendor') {
        const col = scope === 'category' ? 'category' : 'vendor';
        const { data, error, count } = await service
          .from('floropolis_inventory_mirror')
          .select('id', { count: 'exact' })
          .eq(col, scopeValue)
          .limit(10);
        if (error) return empty(`mirror_query_failed: ${error.message}`);
        const sample = (data ?? [])
          .map((r) => (r as { id?: string | number | null }).id ?? null)
          .filter((v): v is string | number => v !== null);
        return {
          affected_sku_count: count ?? 0,
          affected_skus_sample: sample,
          warnings: [],
          computed_at,
          computed_by: COMPUTED_BY,
        };
      }
      if (scope === 'sku') {
        return {
          affected_sku_count: 1,
          affected_skus_sample: [scopeValue],
          warnings: [],
          computed_at,
          computed_by: COMPUTED_BY,
        };
      }
      // client / client_category -> customer-side, no SKU rows touched
      return {
        affected_sku_count: 0,
        affected_skus_sample: [],
        warnings: ['customer-scoped rule -- no SKU footprint'],
        computed_at,
        computed_by: COMPUTED_BY,
      };
    }
    return empty('invalid_scope_payload');
  }

  // ----- visibility_override.create + visibility_rule.create --------------
  if (t === 'visibility_override.create' || t === 'visibility_rule.create') {
    const skuId = input.payload.sku_id;
    if (typeof skuId === 'number' || typeof skuId === 'string') {
      return {
        affected_sku_count: 1,
        affected_skus_sample: [skuId],
        warnings: [],
        computed_at,
        computed_by: COMPUTED_BY,
      };
    }
    return empty('no sku_id in payload');
  }

  // ----- shipping_config.create -------------------------------------------
  // No direct SKU join key today. Document as TBD.
  if (t === 'shipping_config.create') {
    return empty('shipping_config has no SKU join key yet (TBD)');
  }

  // ----- canonical_cost: approve / reject / delete -----------------------
  // 2026-06-01: switched from PROD canonical_cost_sku_link + floropolis_inventory
  // to BACKUP canonical_cost.sku_id (uuid FK, backfilled per catalog rebuild S-0)
  // + floropolis_inventory_mirror (note: mirror sync cadence is Cleanup lane).
  // Semantics changed: BACKUP canonical_cost has 1-to-1 sku_id FK (vs PROD's
  // many-to-many sku_link table). Cascade impact is now 0 or 1 SKU per cost row.
  if (
    t === 'approve_cost_row' ||
    t === 'reject_cost_row' ||
    t === 'delete_cost_row'
  ) {
    const costId =
      (input.payload.cost_id as number | string | undefined) ?? input.target_id;
    if (costId == null) return empty('missing cost_id in payload + target_id');

    const { data: costRow, error: costErr } = await service
      .from('canonical_cost')
      .select('sku_id')
      .eq('id', costId)
      .maybeSingle();
    if (costErr) return empty(`canonical_cost_query_failed: ${costErr.message}`);

    const linkedSkuId = (costRow as { sku_id?: string | null } | null)?.sku_id ?? null;
    if (!linkedSkuId) {
      return {
        affected_sku_count: 0,
        affected_skus_sample: [],
        warnings: ['no linked SKU (canonical_cost.sku_id is NULL — likely PRELIMINARY row)'],
        computed_at,
        computed_by: COMPUTED_BY,
      };
    }

    const { count: liveCount, error: invErr } = await service
      .from('floropolis_inventory_mirror')
      .select('id', { count: 'exact', head: true })
      .eq('id', linkedSkuId)
      .eq('live', true);
    if (invErr) return empty(`mirror_count_failed: ${invErr.message}`);

    const warnings: string[] = [];
    if ((liveCount ?? 0) > 0) warnings.push(`${liveCount} live row in mirror (note: mirror sync cadence may be stale — Cleanup lane)`);
    if (t === 'delete_cost_row' && linkedSkuId) {
      warnings.push(`WARN: deleting cost linked to SKU ${linkedSkuId}`);
    }

    return {
      affected_sku_count: 1,
      affected_skus_sample: [linkedSkuId],
      warnings,
      computed_at,
      computed_by: COMPUTED_BY,
    };
  }

  // ----- canonical_cost: resolve_conflict --------------------------------
  // 2026-06-01: same migration as above. Each cost_id resolves to 0 or 1 sku
  // via BACKUP canonical_cost.sku_id FK. Live count from floropolis_inventory_mirror.
  if (t === 'resolve_conflict') {
    const beforeId = input.payload.before_cost_id as number | undefined;
    const afterId = input.payload.after_cost_id as number | undefined;
    const listed = input.payload.cost_ids as unknown;
    const ids: number[] = Array.isArray(listed)
      ? listed.filter((v): v is number => typeof v === 'number')
      : [beforeId, afterId].filter((v): v is number => typeof v === 'number');
    if (ids.length < 2) return empty('missing both cost_ids for conflict');

    const perSide: Array<{ cost_id: number; linked: number; live: number; sku_id: string | null }> = [];
    for (const id of ids) {
      const { data: costRow, error: costErr } = await service
        .from('canonical_cost')
        .select('sku_id')
        .eq('id', id)
        .maybeSingle();
      if (costErr) return empty(`canonical_cost_query_failed cost_id=${id}: ${costErr.message}`);
      const skuId = (costRow as { sku_id?: string | null } | null)?.sku_id ?? null;

      let live = 0;
      if (skuId) {
        const { count } = await service
          .from('floropolis_inventory_mirror')
          .select('id', { count: 'exact', head: true })
          .eq('id', skuId)
          .eq('live', true);
        live = count ?? 0;
      }
      perSide.push({ cost_id: id, linked: skuId ? 1 : 0, live, sku_id: skuId });
    }

    const total = perSide.reduce((s, r) => s + r.linked, 0);
    return {
      affected_sku_count: total,
      affected_skus_sample: perSide
        .map((r) => r.sku_id)
        .filter((s): s is string => s !== null),
      warnings: perSide.map((r) => `cost_id=${r.cost_id}: ${r.linked} linked SKU, ${r.live} live (mirror)`),
      computed_at,
      computed_by: COMPUTED_BY,
    };
  }

  // ----- refund.create / sku_mapping.confirm / client_profiles.status_change
  // No SKU footprint.
  if (
    t === 'refund.create' ||
    t === 'sku_mapping.confirm' ||
    t === 'client_profiles.status_change'
  ) {
    return {
      affected_sku_count: 0,
      affected_skus_sample: [],
      warnings: ['no SKU footprint'],
      computed_at,
      computed_by: COMPUTED_BY,
    };
  }

  // Unknown type. Compute nothing; warn.
  return empty(`unknown_type: ${t}`);
}
