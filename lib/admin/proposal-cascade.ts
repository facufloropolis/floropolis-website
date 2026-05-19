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
import { getProdReadClient } from '@/lib/supabase/prod-server';

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
  // Rose v1.0 cascade (inbox 2026-05-20 00:10Z): join canonical_cost_sku_link
  // to floropolis_inventory on PROD project. PostgREST doesn't do COUNT(DISTINCT)
  // cleanly so we fetch sku_id list + headcount the live rows separately.
  if (
    t === 'approve_cost_row' ||
    t === 'reject_cost_row' ||
    t === 'delete_cost_row'
  ) {
    const costId =
      (input.payload.cost_id as number | string | undefined) ?? input.target_id;
    if (costId == null) return empty('missing cost_id in payload + target_id');
    const prod = getProdReadClient();
    if (!prod) return empty('prod_supabase_unset — set PROD_SUPABASE_SERVICE_KEY in Vercel');

    const { data: links, error: linkErr } = await prod
      .from('canonical_cost_sku_link')
      .select('sku_id')
      .eq('cost_id', costId);
    if (linkErr) return empty(`link_query_failed: ${linkErr.message}`);
    const skuIds = (links ?? [])
      .map((r) => (r as { sku_id?: number | null }).sku_id)
      .filter((v): v is number => typeof v === 'number');

    let liveCount = 0;
    if (skuIds.length > 0) {
      const { count, error: invErr } = await prod
        .from('floropolis_inventory')
        .select('id', { count: 'exact', head: true })
        .in('id', skuIds)
        .eq('live', true);
      if (invErr) return empty(`inventory_count_failed: ${invErr.message}`);
      liveCount = count ?? 0;
    }

    const warnings: string[] = [];
    if (skuIds.length === 0) warnings.push('no linked SKUs (likely PRELIMINARY cost row with sku_id=null)');
    if (liveCount > 0) warnings.push(`${liveCount} live inventory rows`);
    if (t === 'delete_cost_row' && skuIds.length > 0) {
      warnings.push(`WARN: deleting cost with ${skuIds.length} linked SKUs`);
    }

    return {
      affected_sku_count: skuIds.length,
      affected_skus_sample: skuIds.slice(0, 10),
      warnings,
      computed_at,
      computed_by: COMPUTED_BY,
    };
  }

  // ----- canonical_cost: resolve_conflict --------------------------------
  // Two conflicting cost_ids come in payload.before_cost_id + after_cost_id
  // (or payload.cost_ids[]). Show linked + live count per side so Facu picks.
  if (t === 'resolve_conflict') {
    const beforeId = input.payload.before_cost_id as number | undefined;
    const afterId = input.payload.after_cost_id as number | undefined;
    const listed = input.payload.cost_ids as unknown;
    const ids: number[] = Array.isArray(listed)
      ? listed.filter((v): v is number => typeof v === 'number')
      : [beforeId, afterId].filter((v): v is number => typeof v === 'number');
    if (ids.length < 2) return empty('missing both cost_ids for conflict');

    const prod = getProdReadClient();
    if (!prod) return empty('prod_supabase_unset — set PROD_SUPABASE_SERVICE_KEY in Vercel');

    const perSide: Array<{ cost_id: number; linked: number; live: number }> = [];
    for (const id of ids) {
      const { data: links, error: linkErr } = await prod
        .from('canonical_cost_sku_link')
        .select('sku_id')
        .eq('cost_id', id);
      if (linkErr) return empty(`link_query_failed cost_id=${id}: ${linkErr.message}`);
      const skuIds = (links ?? [])
        .map((r) => (r as { sku_id?: number | null }).sku_id)
        .filter((v): v is number => typeof v === 'number');
      let live = 0;
      if (skuIds.length > 0) {
        const { count } = await prod
          .from('floropolis_inventory')
          .select('id', { count: 'exact', head: true })
          .in('id', skuIds)
          .eq('live', true);
        live = count ?? 0;
      }
      perSide.push({ cost_id: id, linked: skuIds.length, live });
    }

    const total = perSide.reduce((s, r) => s + r.linked, 0);
    return {
      affected_sku_count: total,
      affected_skus_sample: [],
      warnings: perSide.map((r) => `cost_id=${r.cost_id}: ${r.linked} linked SKU(s), ${r.live} live`),
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
