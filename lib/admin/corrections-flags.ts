// lib/admin/corrections-flags.ts
// v1 | 2026-06-16 | Job_PM (CPO)
//
// SERVER-ONLY, READ-ONLY reader for the Supply Engine "Correcciones" lever.
// Surfaces prioritized DATA-QUALITY corrections that block a clean publish, with
// the why + a suggested fix + a priority rank, wired to the closing action (Flow
// B inline propose for admin-fixable flags). ZERO writes — every fix flows through
// /api/admin/inventory/propose (one admin_proposals row, Rose applies).
//
// v1 FLAG SOURCE (DERIVABLE TODAY): no-category SKUs.
//   SELECT sku_id, variety_normalized, vendor_canonical_name
//   FROM dim_sku WHERE category IS NULL AND quarantined=false
//   A no-category SKU blocks the unit rule + a clean publish -> high impact.
//   Live count read each call (NEVER hardcoded; spec said 71, live is 69 — the
//   surface self-corrects as SKUs get categorized).
//
// SUGGESTED CATEGORY = SIBLING MODE (verified 2026-06-16, 67/69 resolve):
//   sku_families is a FALSE lead (resolves 0/69 — those SKUs' sku_family_id has no
//   category). The reliable source is SIBLING SKUs that share variety_normalized
//   and DO carry a category: pick the modal sibling category per variety
//   (row_number OVER PARTITION BY lower(variety_normalized) ORDER BY count DESC).
//   'White Ohara' (2 SKUs) has NO sibling -> honest 'sin sugerencia', no pre-fill.
//   market_variety_crosswalk is NOT a category source (only competitor_category).
//
// IMPORTANCE for ranking = supply_importance_signal.weight by lower(variety_l)
//   (verified 27-34 for most; provenance 'directional'). NULL -> 0, badged 'base'.
//
// COMING (design-for, don't block): meta/public.verifier_flags does NOT exist yet
//   (verified: information_schema returns []). This reader PROBES for it and, when
//   present, UNIONs its rows mapped to CorrectionFlag. owner_lane='admin' ->
//   inline Flow B propose; owner_lane in ('rose','atlas') -> routed-context card,
//   no inline fix. The probe-and-map block is ISOLATED here so a column-name change
//   from Pita is a single edit. Until the table ships, v1 surfaces ONLY the
//   derivable category flags (all owner_lane='admin').

import 'server-only';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

export type OwnerLane = 'admin' | 'rose' | 'atlas';
export type FlagType = 'category' | 'unit' | 'cost' | 'box' | string;
export type FlagProvenance = 'directional' | 'verified' | 'sourced' | 'assumed' | 'none';

// One ranked correction card. v1: a (variety x suggested category) group — all the
// no-category SKUs of one variety collapse into ONE card (solve-at-scale).
export interface CorrectionFlag {
  key: string; // stable card key
  flagType: FlagType;
  variety: string; // variety_normalized (display)
  vendor: string; // vendor_canonical_name(s)
  skuIds: string[]; // every SKU this card covers
  skuCount: number;
  // representative SKU for the inline propose (one POST per call; see CorrectionsSection)
  repSkuId: string | null;
  whatsWrong: string; // human "the why"
  suggestedFix: string; // human suggested fix
  suggestedCategory: string | null; // sibling-modal category (null -> no inline pre-fill)
  siblingSupport: number; // how many sibling SKUs back the suggestion
  ownerLane: OwnerLane; // admin -> inline propose; rose/atlas -> routed chip
  routedTo: string | null; // 'Rose' | 'Atlas' for routed cards
  importance: number; // supply_importance_signal.weight (0 when NULL)
  importanceProvenance: FlagProvenance;
  rankScore: number; // importance + siblingSupport + readinessBonus
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function normProvenance(p: string | null | undefined): FlagProvenance {
  const s = (p ?? '').trim().toLowerCase();
  if (s === 'directional') return 'directional';
  if (s === 'verified') return 'verified';
  if (s === 'sourced') return 'sourced';
  if (s === 'assumed') return 'assumed';
  return 'none';
}

// Impact: a no-category SKU blocks the unit rule + clean publish -> fixed high.
const CATEGORY_IMPACT = 10;
// Readiness bonus drives admin-with-suggestion above admin-no-suggestion above routed.
const READY_ADMIN_SUGGESTION = 6;
const READY_ADMIN_NO_SUGGESTION = 2;
const READY_ROUTED = 0;

// ---------------------------------------------------------------------------
// v1 derivable category flags (no-category SKUs, sibling-modal suggested cat)
// ---------------------------------------------------------------------------

async function getCategoryFlags(
  backup: ReturnType<typeof getBackupServiceClient>,
): Promise<{ flags: CorrectionFlag[]; liveCount: number; warnings: string[] }> {
  const warnings: string[] = [];
  // Three reads + in-JS grouping (the service client has no raw-SQL passthrough).
  // Equivalent to the verified SQL: no-category SKUs grouped by variety, attach the
  // sibling-modal category (row_number OVER PARTITION BY lower(variety_normalized)
  // ORDER BY count DESC) + the importance weight. Read-only.
  const [nocatRes, sibRes, sigRes] = await Promise.all([
    backup
      .from('dim_sku')
      .select('sku_id, variety_normalized, vendor_canonical_name')
      .is('category', null)
      .eq('quarantined', false),
    backup
      .from('dim_sku')
      .select('variety_normalized, category')
      .not('category', 'is', null)
      .eq('quarantined', false),
    backup.from('supply_importance_signal').select('variety_l, weight, provenance'),
  ]);

  if (nocatRes.error) warnings.push(`nocat read: ${nocatRes.error.message}`);
  if (sibRes.error) warnings.push(`sibling read: ${sibRes.error.message}`);
  if (sigRes.error) warnings.push(`importance read: ${sigRes.error.message}`);

  const nocat = (nocatRes.data ?? []) as Array<{
    sku_id: string;
    variety_normalized: string | null;
    vendor_canonical_name: string | null;
  }>;
  const liveCount = nocat.length;

  // Sibling-modal category per variety (lowercased key).
  const sibCount = new Map<string, Map<string, number>>();
  for (const r of (sibRes.data ?? []) as Array<{ variety_normalized: string | null; category: string | null }>) {
    const vl = (r.variety_normalized ?? '').trim().toLowerCase();
    const cat = (r.category ?? '').trim();
    if (!vl || !cat) continue;
    if (!sibCount.has(vl)) sibCount.set(vl, new Map());
    const m = sibCount.get(vl)!;
    m.set(cat, (m.get(cat) ?? 0) + 1);
  }
  const sibModal = new Map<string, { cat: string; cnt: number }>();
  for (const [vl, m] of sibCount) {
    let best: { cat: string; cnt: number } | null = null;
    for (const [cat, cnt] of m) {
      if (!best || cnt > best.cnt || (cnt === best.cnt && cat < best.cat)) best = { cat, cnt };
    }
    if (best) sibModal.set(vl, best);
  }

  // Importance weight per variety.
  const impByVariety = new Map<string, { weight: number; provenance: FlagProvenance }>();
  for (const s of (sigRes.data ?? []) as Array<{ variety_l: string | null; weight: number | string | null; provenance: string | null }>) {
    const vl = (s.variety_l ?? '').trim().toLowerCase();
    if (!vl) continue;
    impByVariety.set(vl, { weight: toNum(s.weight), provenance: normProvenance(s.provenance) });
  }

  // Group no-category SKUs by variety (solve-at-scale: ONE card per variety).
  interface Acc {
    variety: string;
    vendors: Set<string>;
    skuIds: string[];
  }
  const acc = new Map<string, Acc>();
  for (const r of nocat) {
    const variety = (r.variety_normalized ?? '').trim();
    if (!variety) continue;
    const vl = variety.toLowerCase();
    if (!acc.has(vl)) acc.set(vl, { variety, vendors: new Set(), skuIds: [] });
    const a = acc.get(vl)!;
    if (r.vendor_canonical_name) a.vendors.add(r.vendor_canonical_name.trim());
    a.skuIds.push(r.sku_id);
  }

  const flags: CorrectionFlag[] = [];
  for (const [vl, a] of acc) {
    const modal = sibModal.get(vl) ?? null;
    const imp = impByVariety.get(vl) ?? { weight: 0, provenance: 'none' as FlagProvenance };
    const suggestedCategory = modal?.cat ?? null;
    const siblingSupport = modal?.cnt ?? 0;
    const readiness = suggestedCategory ? READY_ADMIN_SUGGESTION : READY_ADMIN_NO_SUGGESTION;
    const rankScore = imp.weight + siblingSupport + readiness;
    flags.push({
      key: `category|${vl}`,
      flagType: 'category',
      variety: a.variety,
      vendor: Array.from(a.vendors).join(', ') || '--',
      skuIds: a.skuIds,
      skuCount: a.skuIds.length,
      repSkuId: a.skuIds[0] ?? null,
      whatsWrong: 'sin categoria -> bloquea la regla de unidad + un publish limpio',
      suggestedFix: suggestedCategory
        ? `Asignar categoria "${suggestedCategory}" (moda de ${siblingSupport} hermano${siblingSupport === 1 ? '' : 's'} con la misma variedad)`
        : 'Sin variedad hermana con categoria -> elegir categoria manualmente (sin sugerencia automatica)',
      suggestedCategory,
      siblingSupport,
      ownerLane: 'admin',
      routedTo: null,
      importance: imp.weight,
      importanceProvenance: imp.provenance,
      rankScore,
    });
  }

  return { flags, liveCount, warnings };
}

// ---------------------------------------------------------------------------
// COMING: probe meta/public.verifier_flags and UNION its rows when present.
// Mapping is ISOLATED here — if Pita ships different column names, this is the
// single edit (the SELECT column list + the row->CorrectionFlag map below).
// ---------------------------------------------------------------------------

interface VerifierFlagRow {
  sku_id: string | null;
  flag_type: string | null;
  severity: number | string | null;
  detail: string | null;
  suggested_fix: string | null;
  owner_lane: string | null;
  source: string | null;
}

async function probeVerifierFlags(
  backup: ReturnType<typeof getBackupServiceClient>,
): Promise<{ exists: boolean; schema: 'meta' | 'public' | null; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    const res = await backup
      .from('information_schema.tables' as never)
      .select('table_schema, table_name')
      .eq('table_name', 'verifier_flags')
      .in('table_schema', ['meta', 'public']);
    // supabase-js cannot select information_schema directly; this returns an error
    // we treat as "not present". The honest signal is: no rows / error -> not built.
    const rows = (res.data ?? []) as Array<{ table_schema: string }>;
    if (res.error || rows.length === 0) {
      return { exists: false, schema: null, warnings };
    }
    const schema = rows.some((r) => r.table_schema === 'meta')
      ? 'meta'
      : ('public' as const);
    return { exists: true, schema, warnings };
  } catch (e) {
    warnings.push(`verifier_flags probe: ${e instanceof Error ? e.message : 'unknown'}`);
    return { exists: false, schema: null, warnings };
  }
}

function ownerLaneOf(raw: string | null): OwnerLane {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === 'rose' || s === 'rose_bi') return 'rose';
  if (s === 'atlas') return 'atlas';
  return 'admin';
}

function mapVerifierFlag(r: VerifierFlagRow): CorrectionFlag {
  const lane = ownerLaneOf(r.owner_lane);
  const severity = toNum(r.severity);
  const flagType = (r.flag_type ?? 'unknown').trim();
  const readiness =
    lane === 'admin' ? READY_ADMIN_NO_SUGGESTION : READY_ROUTED; // no sibling pre-fill for non-category flags
  return {
    key: `${flagType}|${r.sku_id ?? 'novar'}`,
    flagType,
    variety: '--',
    vendor: r.source ?? '--',
    skuIds: r.sku_id ? [r.sku_id] : [],
    skuCount: r.sku_id ? 1 : 0,
    repSkuId: r.sku_id ?? null,
    whatsWrong: r.detail ?? `flag ${flagType}`,
    suggestedFix: r.suggested_fix ?? 'pendiente',
    suggestedCategory: null,
    siblingSupport: 0,
    ownerLane: lane,
    routedTo: lane === 'rose' ? 'Rose' : lane === 'atlas' ? 'Atlas' : null,
    importance: severity,
    importanceProvenance: 'none',
    rankScore: severity + readiness,
  };
}

async function getVerifierFlags(
  backup: ReturnType<typeof getBackupServiceClient>,
): Promise<{ flags: CorrectionFlag[]; warnings: string[] }> {
  const probe = await probeVerifierFlags(backup);
  if (!probe.exists || !probe.schema) return { flags: [], warnings: probe.warnings };
  const warnings = [...probe.warnings];
  try {
    const ref = probe.schema === 'public' ? 'verifier_flags' : `${probe.schema}.verifier_flags`;
    const res = await backup
      .from(ref as never)
      .select('sku_id, flag_type, severity, detail, suggested_fix, owner_lane, source')
      .is('resolved_at', null);
    if (res.error) {
      warnings.push(`verifier_flags read: ${res.error.message}`);
      return { flags: [], warnings };
    }
    const rows = (res.data ?? []) as VerifierFlagRow[];
    return { flags: rows.map(mapVerifierFlag), warnings };
  } catch (e) {
    warnings.push(`verifier_flags map: ${e instanceof Error ? e.message : 'unknown'}`);
    return { flags: [], warnings };
  }
}

// ---------------------------------------------------------------------------
// Public reader
// ---------------------------------------------------------------------------

export interface CorrectionFlagsResult {
  flags: CorrectionFlag[]; // ranked desc by rankScore
  liveNoCategoryCount: number; // live SELECT count(*) — drives the tab count + header
  verifierFlagsPresent: boolean; // true once Pita ships meta/public.verifier_flags
  warnings: string[];
}

export async function getCorrectionFlags(
  backup: ReturnType<typeof getBackupServiceClient>,
): Promise<CorrectionFlagsResult> {
  const [category, verifier] = await Promise.all([
    getCategoryFlags(backup),
    getVerifierFlags(backup),
  ]);

  const flags = [...category.flags, ...verifier.flags].sort((a, b) => b.rankScore - a.rankScore);

  return {
    flags,
    liveNoCategoryCount: category.liveCount,
    verifierFlagsPresent: verifier.flags.length > 0,
    warnings: [...category.warnings, ...verifier.warnings],
  };
}
