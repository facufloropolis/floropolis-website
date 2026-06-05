// Facu's Desk — Zone 1 pulse server helper.
// v1 | 2026-06-04 | Job_PM (CPO)
//
// Spec: kb/facu_catalog_ux_reflection_2026-06-04.md, "Zone 1 — The pulse (10s)".
// fetchPulse(backup) reads the CURRENT catalog state numbers, reads the LATEST
// PRIOR snapshot (catalog_pulse_snapshots) to compute deltas "since last visit",
// derives the #1 limiter (top failing gate by SKU count + its in-flight repairs),
// and — throttled to once per ~20h — writes a fresh snapshot so the next visit
// has an anchor.
//
// GRACEFUL DEGRADATION (the table is a DRAFT migration, not yet applied):
//   - The snapshot SELECT and INSERT are each wrapped in try/catch. A missing
//     catalog_pulse_snapshots table => prior = null => deltas = null ("first
//     visit"), and the insert silently no-ops. The page never breaks.
//   - If a CURRENT-state query fails, that metric is returned as null and the
//     strip renders "source unavailable" / "—" for it — NEVER a fake zero.
//
// RACI: read-only against Rose's tables (catalog_classifications, dim_sku,
// admin_proposals) + Job's improvement_loop_state + plan_state. The only write
// is to Job's own catalog_pulse_snapshots (audit/derived, not canonical supply).

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single metric: value, or null when its source query failed. */
export type Metric = number | null;

export interface PulseLimiter {
  gateId: string;            // e.g. 'missing_contents_description'
  label: string;            // friendly label, falls back to humanized gate id
  count: number;            // SKUs failing this gate (the #1 limiter)
  owner: string | null;     // owner_agent from improvement_loop_state, if known
  inFlight: number | null;  // repairs in flight (routed|landed|re_scored) for it
}

/**
 * Plan adherence — Facu-visible drift detection. Computed live from plan_state +
 * improvement_loop_state on every render. NEVER cached in a snapshot: the
 * staleness counter MUST climb on its own when no batch closes.
 */
export interface PlanAdherence {
  // null when plan_state is unavailable / empty.
  currentPhase: number | null;
  phaseLabel: string | null;
  streakCount: number | null;
  // Whole days since MAX(verified_at) on verified rows. null === no verified
  // batch yet (rendered honestly as alert, never a fake green).
  daysSinceVerified: number | null;
}

export interface Pulse {
  // current state (null === source unavailable)
  published: Metric;
  blocked: Metric;
  quarantined: Metric;
  repairsOpen: Metric;
  repairsInFlight: Metric;
  repairsVerified: Metric;
  decisionsWaiting: Metric;

  // deltas vs the latest prior snapshot. null === no prior snapshot ("first
  // visit") OR the current/prior value was unavailable so a delta is meaningless.
  deltas: {
    published: number | null;
    blocked: number | null;
    quarantined: number | null;
    repairsVerified: number | null;
    decisionsWaiting: number | null;
  };
  /** true when there was no prior snapshot at all (table empty or missing). */
  firstVisit: boolean;

  limiter: PulseLimiter | null;

  /** plan phase + streak + verified-batch staleness (live, never snapshotted). */
  plan: PlanAdherence;

  /** the captured_at of the prior snapshot used for deltas, ISO, if any. */
  priorAt: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Throttle: only write a new snapshot if the latest is older than this. Keeps
// "since last visit" meaningful across a burst session (60 loops in ~5h) instead
// of resetting the anchor on every page render.
const SNAPSHOT_MAX_AGE_HOURS = 20;

// Friendly labels for the limiter when catalog_quality_weights lookup is skipped
// or the gate has no display_label. Mirrors the gate ids seen in classifications.
const GATE_LABEL_FALLBACK: Record<string, string> = {
  missing_image: 'missing image',
  missing_contents_description: 'missing contents description',
  missing_units_or_bunch: 'missing units / stems per bunch',
  missing_box_dims: 'missing box dimensions',
  price_zero: 'price is zero',
  missing_cost_source: 'missing cost source',
  missing_vendor_name: 'missing vendor',
  missing_unit: 'missing unit',
};

function humanizeGate(gateId: string): string {
  return GATE_LABEL_FALLBACK[gateId] ?? gateId.replace(/_/g, ' ');
}

/** delta only when both sides are real numbers; else null. */
function delta(current: Metric, prior: number | null | undefined): number | null {
  if (typeof current !== 'number') return null;
  if (typeof prior !== 'number') return null;
  return current - prior;
}

// ---------------------------------------------------------------------------
// fetchPulse
// ---------------------------------------------------------------------------

export async function fetchPulse(backup: SupabaseClient): Promise<Pulse> {
  // --- current: classifications counts (published == 'publishable') ---------
  let published: Metric = null;
  let blocked: Metric = null;
  let classTotal: number | null = null;
  try {
    // Published = what a florist can actually buy (the publish authority),
    // not the spine's 'publishable' status (which ignores windows/overrides).
    const pub = await backup
      .from('v_catalog_admin')
      .select('sku_id', { count: 'exact', head: true });
    const blk = await backup
      .from('catalog_classifications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'blocked');
    const tot = await backup
      .from('catalog_classifications')
      .select('*', { count: 'exact', head: true });
    if (!pub.error) published = pub.count ?? null;
    if (!blk.error) blocked = blk.count ?? null;
    if (!tot.error) classTotal = tot.count ?? null;
  } catch (err) {
    console.error('[pulse] classifications counts threw:', err);
  }

  // --- current: quarantined = dim_sku total - classifications total ---------
  let quarantined: Metric = null;
  try {
    const dim = await backup
      .from('dim_sku')
      .select('*', { count: 'exact', head: true });
    if (!dim.error && typeof dim.count === 'number' && typeof classTotal === 'number') {
      quarantined = Math.max(0, dim.count - classTotal);
    }
  } catch (err) {
    console.error('[pulse] dim_sku count threw:', err);
  }

  // --- current: repair-state counts by loop position ------------------------
  let repairsOpen: Metric = null;
  let repairsInFlight: Metric = null;
  let repairsVerified: Metric = null;
  try {
    const open = await backup
      .from('improvement_loop_state')
      .select('*', { count: 'exact', head: true })
      .eq('state', 'open');
    const inflight = await backup
      .from('improvement_loop_state')
      .select('*', { count: 'exact', head: true })
      .in('state', ['routed', 'landed', 're_scored']);
    const verified = await backup
      .from('improvement_loop_state')
      .select('*', { count: 'exact', head: true })
      .eq('state', 'verified');
    if (!open.error) repairsOpen = open.count ?? null;
    if (!inflight.error) repairsInFlight = inflight.count ?? null;
    if (!verified.error) repairsVerified = verified.count ?? null;
  } catch (err) {
    console.error('[pulse] repair_state counts threw:', err);
  }

  // --- current: decisions waiting (admin_proposals awaiting_facu) -----------
  let decisionsWaiting: Metric = null;
  try {
    const dec = await backup
      .from('admin_proposals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'awaiting_facu');
    if (!dec.error) decisionsWaiting = dec.count ?? null;
  } catch (err) {
    console.error('[pulse] decisions count threw:', err);
  }

  // --- #1 limiter: top failing gate by SKU count from classifications -------
  const limiter = await fetchTopLimiter(backup);

  // --- plan adherence: phase + streak + verified-batch staleness ------------
  // Computed live every render; intentionally NOT folded into the snapshot so
  // the staleness counter keeps climbing on its own when no batch closes.
  const plan = await fetchPlanAdherence(backup);

  // --- prior snapshot (latest) for deltas; tolerate missing table -----------
  let prior: Record<string, number | string> | null = null;
  try {
    const { data, error } = await backup
      .from('catalog_pulse_snapshots')
      .select('published, blocked, quarantined, repairs_verified, decisions_waiting, captured_at')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) prior = data as Record<string, number | string>;
  } catch (err) {
    // missing table or any read failure => treat as first visit (deltas null)
    console.error('[pulse] prior snapshot read failed (table may not exist yet):', err);
    prior = null;
  }

  const priorAt = prior && typeof prior.captured_at === 'string' ? prior.captured_at : null;
  const firstVisit = prior === null;

  const deltas = {
    published: delta(published, prior?.published as number | undefined),
    blocked: delta(blocked, prior?.blocked as number | undefined),
    quarantined: delta(quarantined, prior?.quarantined as number | undefined),
    repairsVerified: delta(repairsVerified, prior?.repairs_verified as number | undefined),
    decisionsWaiting: delta(decisionsWaiting, prior?.decisions_waiting as number | undefined),
  };

  // --- throttled insert of a fresh snapshot; never breaks the page ----------
  // Only insert when all seven metrics are real (never persist a fake zero) and
  // the latest snapshot is older than the throttle window (or absent).
  const allReal =
    typeof published === 'number' &&
    typeof blocked === 'number' &&
    typeof quarantined === 'number' &&
    typeof repairsOpen === 'number' &&
    typeof repairsInFlight === 'number' &&
    typeof repairsVerified === 'number' &&
    typeof decisionsWaiting === 'number';

  const priorAgeMs = priorAt ? Date.now() - new Date(priorAt).getTime() : Infinity;
  const stale = priorAgeMs > SNAPSHOT_MAX_AGE_HOURS * 60 * 60 * 1000;

  if (allReal && stale) {
    try {
      await backup.from('catalog_pulse_snapshots').insert({
        published,
        blocked,
        quarantined,
        repairs_open: repairsOpen,
        repairs_in_flight: repairsInFlight,
        repairs_verified: repairsVerified,
        decisions_waiting: decisionsWaiting,
      });
    } catch (err) {
      // missing table or RLS denial => snapshot just doesn't persist this time.
      console.error('[pulse] snapshot insert failed (table may not exist yet):', err);
    }
  }

  return {
    published,
    blocked,
    quarantined,
    repairsOpen,
    repairsInFlight,
    repairsVerified,
    decisionsWaiting,
    deltas,
    firstVisit,
    limiter,
    plan,
    priorAt,
  };
}

// ---------------------------------------------------------------------------
// Plan adherence
// ---------------------------------------------------------------------------

async function fetchPlanAdherence(backup: SupabaseClient): Promise<PlanAdherence> {
  let currentPhase: number | null = null;
  let phaseLabel: string | null = null;
  let streakCount: number | null = null;

  // plan_state is a single-row table. Read it best-effort; any failure leaves
  // the phase/streak null and the chip degrades honestly.
  try {
    const { data, error } = await backup
      .from('plan_state')
      .select('current_phase, phase_label, streak_count')
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      if (typeof data.current_phase === 'number') currentPhase = data.current_phase;
      if (typeof data.phase_label === 'string') phaseLabel = data.phase_label;
      if (typeof data.streak_count === 'number') streakCount = data.streak_count;
    }
  } catch (err) {
    console.error('[pulse] plan_state read failed:', err);
  }

  // Staleness: whole days since the most recent verified batch. null verified =
  // honest "no verified batches yet" alert (never a fake green).
  let daysSinceVerified: number | null = null;
  try {
    const { data, error } = await backup
      .from('improvement_loop_state')
      .select('verified_at')
      .eq('state', 'verified')
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data && typeof data.verified_at === 'string') {
      const ms = Date.now() - new Date(data.verified_at).getTime();
      daysSinceVerified = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
    }
  } catch (err) {
    console.error('[pulse] verified-batch staleness read failed:', err);
  }

  return { currentPhase, phaseLabel, streakCount, daysSinceVerified };
}

// ---------------------------------------------------------------------------
// #1 limiter
// ---------------------------------------------------------------------------

async function fetchTopLimiter(backup: SupabaseClient): Promise<PulseLimiter | null> {
  // Count failing gates across all classifications. failing_gates is a jsonb
  // array of gate ids per SKU. We tally client-side (no SQL function dependency)
  // so this stays a plain table read.
  let rows: { failing_gates: unknown }[] = [];
  try {
    const { data, error } = await backup
      .from('catalog_classifications')
      .select('failing_gates')
      .eq('status', 'blocked');
    if (error) {
      console.error('[pulse] limiter classifications error:', error);
      return null;
    }
    rows = (data ?? []) as { failing_gates: unknown }[];
  } catch (err) {
    console.error('[pulse] limiter classifications threw:', err);
    return null;
  }

  // Only BLOCKING-tier gates count as "the limiter on sellable supply":
  // publishable_gap gates (e.g. missing description) degrade quality but do NOT
  // block a sale. Doctrine: the limiter is what BLOCKS.
  const BLOCKING_GATES = new Set([
    'missing_image', 'price_zero', 'missing_box_dims',
    'missing_cost_source', 'missing_vendor_name', 'missing_unit',
  ]);
  const tally = new Map<string, number>();
  for (const r of rows) {
    const gates = Array.isArray(r.failing_gates) ? r.failing_gates : [];
    for (const g of gates) {
      if (typeof g === 'string' && BLOCKING_GATES.has(g)) tally.set(g, (tally.get(g) ?? 0) + 1);
    }
  }
  if (tally.size === 0) return null;

  let topGate = '';
  let topCount = -1;
  for (const [gate, n] of tally) {
    if (n > topCount) {
      topGate = gate;
      topCount = n;
    }
  }
  if (!topGate) return null;

  // Friendly label from catalog_quality_weights (best effort).
  let label = humanizeGate(topGate);
  try {
    const { data, error } = await backup
      .from('catalog_quality_weights')
      .select('display_label')
      .eq('gate_id', topGate)
      .maybeSingle();
    if (!error && data && typeof data.display_label === 'string' && data.display_label.trim()) {
      label = data.display_label;
    }
  } catch {
    // keep humanized fallback
  }

  // owner + in-flight count for this gate from the repair-state loop.
  let owner: string | null = null;
  let inFlight: number | null = null;
  try {
    const ownerRow = await backup
      .from('improvement_loop_state')
      .select('owner_agent')
      .eq('gate_id', topGate)
      .neq('state', 'verified')
      .limit(1)
      .maybeSingle();
    if (!ownerRow.error && ownerRow.data && typeof ownerRow.data.owner_agent === 'string') {
      owner = ownerRow.data.owner_agent;
    }
    const flight = await backup
      .from('improvement_loop_state')
      .select('*', { count: 'exact', head: true })
      .eq('gate_id', topGate)
      .in('state', ['routed', 'landed', 're_scored']);
    if (!flight.error) inFlight = flight.count ?? null;
  } catch (err) {
    console.error('[pulse] limiter repair-state lookup threw:', err);
  }

  return { gateId: topGate, label, count: topCount, owner, inFlight };
}
