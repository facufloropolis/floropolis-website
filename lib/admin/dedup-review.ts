// dedup-review.ts — data layer for the Desk dedup-review queue (Facu decides the doubtful
// merges Rose couldn't auto-resolve). Reads PROD v_dedup_review_queue (anon-readable, built by
// Rose: 73 groups / 202 leads, grouped by shared_email with a review_reason). Ranks groups by
// COMMERCIAL IMPORTANCE (worked_signals: sample > calls > emails > zoho) so Facu sees the
// active/valuable clients first and dead stubs last. Decisions are written to BACKUP
// dedup_decisions (Job's plane); Rose ingests + executes the reversible soft-merge on PROD.
// v1 | 2026-06-11 | Job_PM (CPO)
//
// SERVER-ONLY.

import { getProdReadClient } from '@/lib/supabase/prod-server';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

export interface DedupMember {
  leadMasterId: number | null;
  businessName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  workedSignals: string | null;
  signalScore: number; // commercial weight of THIS lead
}

export interface DedupSuggestion {
  decision: 'MERGE_ALL' | 'KEEP_CHAIN' | 'KEEP_SEPARATE';
  reason: string;
}

export interface DedupGroup {
  groupKey: string; // shared_email
  reviewReason: string | null;
  groupSize: number;
  importance: number; // sum of member signal scores — higher = more active/valuable
  members: DedupMember[];
  decided: boolean; // already decided (in BACKUP dedup_decisions)
  decision: string | null;
  suggestion: DedupSuggestion | null; // pre-analyzed recommendation (Facu confirms/overrides)
}

// Commercial weight of a lead's worked_signals. A sample sent = real prospect (strongest);
// calls + emails = active; zoho-only = a CRM record with little engagement.
function signalScore(ws: string | null): number {
  if (!ws) return 0;
  const s = ws.toLowerCase();
  let score = 0;
  if (s.includes('sample')) score += 4;
  if (s.includes('call')) score += 2;
  if (s.includes('email')) score += 1;
  if (s.includes('zoho')) score += 0.5;
  return score;
}

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

function nameTokens(name: string): Set<string> {
  return new Set(
    name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 3),
  );
}

// Pre-analyze a group → a suggested decision Facu confirms or overrides. Heuristics from the
// real data patterns: same city = likely DBA/same business; shared brand token across cities =
// chain; different names + cities = separate. The protocol's intelligence layer.
function suggestDecision(members: DedupMember[]): DedupSuggestion | null {
  if (members.length < 2) return null;
  const cities = new Set(members.map((m) => (m.city ?? '').trim().toLowerCase()).filter(Boolean));
  // Shared brand token present in EVERY member's name.
  let common: Set<string> | null = null;
  for (const m of members) {
    const t = nameTokens(m.businessName);
    if (common === null) {
      common = t;
    } else {
      const next = new Set<string>();
      for (const x of common) if (t.has(x)) next.add(x);
      common = next;
    }
  }
  const brand = common && common.size > 0 ? Array.from(common)[0] : null;

  if (cities.size === 1) {
    return { decision: 'MERGE_ALL', reason: 'misma ciudad — probable mismo negocio o DBA' };
  }
  if (cities.size > 1) {
    return brand
      ? { decision: 'KEEP_CHAIN', reason: `mismo brand "${brand}" en varias ciudades — cadena` }
      : { decision: 'KEEP_SEPARATE', reason: 'nombres y ciudades distintos — probablemente negocios distintos' };
  }
  // No city data: lean on a shared brand if any.
  return brand ? { decision: 'MERGE_ALL', reason: `mismo brand "${brand}", sin conflicto de ciudad` } : null;
}

interface QueueRaw {
  lead_master_id: number | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  worked_signals: string | null;
  shared_email: string | null;
  group_size: number | null;
  review_reason: string | null;
}

/** Read the dedup-review queue, grouped + ranked by commercial importance. Undecided groups
 *  first (importance desc), then already-decided. NULL-safe: degrades to [] on any failure. */
export async function getDedupReviewQueue(): Promise<DedupGroup[]> {
  const prod = getProdReadClient();
  if (!prod) return [];

  let rows: QueueRaw[] = [];
  try {
    const { data, error } = await prod
      .from('v_dedup_review_queue')
      .select(
        'lead_master_id, business_name, email, phone, city, state, worked_signals, shared_email, group_size, review_reason',
      )
      .limit(2000);
    if (error || !Array.isArray(data)) return [];
    rows = data as unknown as QueueRaw[];
  } catch {
    return [];
  }

  // Which group_keys are already decided (BACKUP, best-effort).
  const decidedByKey = new Map<string, string>();
  try {
    const svc = getBackupServiceClient();
    const { data } = await svc.from('dedup_decisions').select('group_key, decision');
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const k = str(r.group_key);
      if (k && !decidedByKey.has(k)) decidedByKey.set(k, str(r.decision) ?? 'decided');
    }
  } catch {
    /* no decided markers */
  }

  // Group by shared_email.
  const byKey = new Map<string, DedupGroup>();
  for (const r of rows) {
    const key = str(r.shared_email);
    if (!key) continue;
    const member: DedupMember = {
      leadMasterId: typeof r.lead_master_id === 'number' ? r.lead_master_id : null,
      businessName: str(r.business_name) ?? '(sin nombre)',
      email: str(r.email),
      phone: str(r.phone),
      city: str(r.city),
      state: str(r.state),
      workedSignals: str(r.worked_signals),
      signalScore: signalScore(str(r.worked_signals)),
    };
    let g = byKey.get(key);
    if (!g) {
      g = {
        groupKey: key,
        reviewReason: str(r.review_reason),
        groupSize: typeof r.group_size === 'number' ? r.group_size : 0,
        importance: 0,
        members: [],
        decided: decidedByKey.has(key),
        decision: decidedByKey.get(key) ?? null,
        suggestion: null,
      };
      byKey.set(key, g);
    }
    g.members.push(member);
    g.importance += member.signalScore;
  }

  // Sort each group's members by signal (the most-worked lead first = likely survivor) and
  // compute the suggested decision (undecided groups only).
  for (const g of byKey.values()) {
    g.members.sort((a, b) => b.signalScore - a.signalScore);
    g.suggestion = g.decided ? null : suggestDecision(g.members);
  }

  // Undecided first, then by importance desc.
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.decided !== b.decided) return a.decided ? 1 : -1;
    return b.importance - a.importance;
  });
}
