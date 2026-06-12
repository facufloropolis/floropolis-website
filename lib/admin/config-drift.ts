// config-drift.ts — the automatic "salvavidas": catches when a CODE constant that MIRRORS a
// canonical config value drifts from the live config. Built 2026-06-11 after the GPM episode:
// gpm_target was changed to 0.34 in pricing_constants but scattered hardcoded 0.33 in the bands
// made admin LOOK unchanged. This check flags that divergence so the SYSTEM catches it, not a
// human review. Extend MIRRORED as more config-driven constants appear.
//
// SERVER-ONLY (reads BACKUP pricing_constants via service role).

import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { GPM_TARGET } from '@/lib/admin/catalog-model';

export interface DriftRow {
  label: string;
  configKey: string;        // pricing_constants.id
  market: string;           // pricing_constants.market (e.g. 'US')
  codeValue: number;        // the constant baked into the app
  configValue: number | null; // the live canonical value
  drifted: boolean;         // true when they diverge (config is the source of truth)
}

// Registry: each entry is a CODE constant that must track a canonical config value.
// codeValue is read from the single-source-of-truth constant (not re-hardcoded here).
const MIRRORED: Array<{ label: string; configKey: string; market: string; codeValue: number }> = [
  { label: 'GPM target (price formula + bands)', configKey: 'gpm_target', market: 'US', codeValue: GPM_TARGET },
];

const EPS = 1e-6;

/** Compare each mirrored code constant against the live config. Returns one row per mirror.
 *  Degrades to [] on any failure (never throws) — a broken check must not break the page. */
export async function getConfigDrift(): Promise<DriftRow[]> {
  let svc;
  try {
    svc = getBackupServiceClient();
  } catch {
    return [];
  }
  const keys = Array.from(new Set(MIRRORED.map((m) => m.configKey)));
  const configByKeyMarket: Record<string, number> = {};
  try {
    const { data } = await svc
      .from('pricing_constants')
      .select('id, market, value_numeric')
      .in('id', keys);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const id = typeof r.id === 'string' ? r.id : null;
      const market = typeof r.market === 'string' ? r.market : '';
      const v = Number(r.value_numeric);
      if (id && Number.isFinite(v)) configByKeyMarket[`${id}:${market}`] = v;
    }
  } catch {
    return [];
  }
  return MIRRORED.map((m) => {
    const configValue = configByKeyMarket[`${m.configKey}:${m.market}`] ?? null;
    const drifted = configValue != null && Math.abs(configValue - m.codeValue) > EPS;
    return {
      label: m.label,
      configKey: m.configKey,
      market: m.market,
      codeValue: m.codeValue,
      configValue,
      drifted,
    };
  });
}
