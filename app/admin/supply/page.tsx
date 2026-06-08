// Supply Engine — daily recommendations (the admin surface for the loop).
// v1 | 2026-06-08 | Job_PM (CPO)
//
// Where Facu reviews the supply-recommendation engine's output and responds.
// His response (approve/reject/defer/correct) writes to supply_recommendation_feedback,
// which feeds learned_delta back into v_supply_recommendations — re-ranking the
// NEXT load. That is the loop, in admin.
//
// Engine: v_supply_recommendations (sku-level). We AGGREGATE to variety-level
// (one row per variety per gap_type lever, with a SKU count), group by gap_type,
// order each lever by max priority_score desc, cap at top 15 + "+N more".
//
// PROVENANCE badge: joined from supply_importance_signal (variety_l, provenance).
//   assumed -> red, directional -> amber, verified|sourced -> green, none -> grey.
//   The badge is the point: Facu sees what is a guess vs what is sourced.
//
// Auth: mirrors /admin/desk + /admin/catalog/blocked (ADMIN_EMAILS or
//   client_profiles.status='admin'; non-admin -> redirect('/')).
//
// Style: emerald-600 primary, slate scale, rounded, uppercase micro-labels,
//   ASCII-clean copy. No new design language. Read-only-honest empty states.

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import RecDecision from './RecDecision';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export const metadata = {
  title: 'Supply Engine | Floropolis Admin',
  robots: { index: false, follow: false },
};

const LEVER_CAP = 15; // top N varieties shown per lever before "+N more"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecRow {
  sku_id: string;
  vendor: string | null;
  variety: string | null;
  category: string | null;
  size_cm: number | null;
  tier: string | null;
  gap_type: string | null;
  published: boolean | null;
  margin_status: string | null;
  image_count: number | null;
  gap_count: number | null;
  importance_base: number | string | null;
  learned_delta: number | string | null;
  priority_score: number | string | null;
  recommended_action: string | null;
}

interface SignalRow {
  variety_l: string | null;
  provenance: string | null;
  source: string | null;
  weight: number | string | null;
}

type Provenance = 'assumed' | 'directional' | 'verified' | 'sourced' | 'none';

// One aggregated variety row inside a lever.
interface VarietyRow {
  variety: string;
  vendor: string; // dominant / representative vendor for the variety
  gapType: string;
  skuCount: number;
  priorityScore: number; // max priority_score across the variety's SKUs in this lever
  recommendedAction: string;
  provenance: Provenance;
  provenanceSource: string | null;
}

interface Lever {
  gapType: string;
  rows: VarietyRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function normProvenance(p: string | null | undefined): Provenance {
  const s = (p ?? '').trim().toLowerCase();
  if (s === 'assumed') return 'assumed';
  if (s === 'directional') return 'directional';
  if (s === 'verified') return 'verified';
  if (s === 'sourced') return 'sourced';
  return 'none';
}

// Human label for a gap_type lever.
const LEVER_LABELS: Record<string, string> = {
  image: 'Image — missing photography',
  image_improve: 'Image — improve existing photography',
  content: 'Content — copy / attributes',
  fulfillment: 'Fulfillment — box / yield / shipping',
  price: 'Price — unpriced',
  price_improve: 'Price — improve / review',
  quality_improve: 'Quality — close failing gates',
};

function leverLabel(gapType: string): string {
  return LEVER_LABELS[gapType] ?? gapType.replace(/[._]/g, ' ');
}

// Stable lever display order (known levers first, then any unknowns).
const LEVER_ORDER = [
  'image',
  'image_improve',
  'content',
  'fulfillment',
  'price',
  'price_improve',
  'quality_improve',
];

// ---------------------------------------------------------------------------
// Provenance badge
// ---------------------------------------------------------------------------

function ProvenanceBadge({ p, source }: { p: Provenance; source: string | null }) {
  const map: Record<Provenance, { cls: string; label: string; title: string }> = {
    assumed: {
      cls: 'bg-red-100 text-red-800 border-red-200',
      label: 'assumed',
      title: 'Importance weight is an assumption — no lead data behind it.',
    },
    directional: {
      cls: 'bg-amber-100 text-amber-800 border-amber-200',
      label: 'directional',
      title: 'Importance weight is directional — partial / inferred signal.',
    },
    verified: {
      cls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      label: 'verified',
      title: 'Importance weight is verified against real signal.',
    },
    sourced: {
      cls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      label: 'sourced',
      title: 'Importance weight is sourced from real signal.',
    },
    none: {
      cls: 'bg-slate-100 text-slate-500 border-slate-200',
      label: 'base score only',
      title: 'No importance signal on record — ranked on base score only.',
    },
  };
  const m = map[p];
  return (
    <span
      title={source ? `${m.title} (${source})` : m.title}
      className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SupplyEnginePage() {
  // Auth gate (mirrors desk/page.tsx + blocked/page.tsx) ---------------------
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect('/');

  const adminClient = getBackupServiceClient();
  const emailLc = (user.email ?? '').toLowerCase();
  if (!ADMIN_EMAILS.includes(emailLc)) {
    const { data: profile } = await adminClient
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!profile || profile.status !== 'admin') {
      redirect('/');
    }
  }

  const backup = getBackupServiceClient();

  // Engine rows --------------------------------------------------------------
  const { data: recRaw, error: recErr } = await backup
    .from('v_supply_recommendations')
    .select(
      'sku_id, vendor, variety, category, size_cm, tier, gap_type, published, margin_status, image_count, gap_count, importance_base, learned_delta, priority_score, recommended_action',
    )
    .order('priority_score', { ascending: false, nullsFirst: false })
    .limit(2000);
  if (recErr) console.error('[admin/supply] recommendations:', recErr);
  const recs = (recRaw ?? []) as unknown as RecRow[];

  // Provenance signals (small table) -> map by lowercased variety -----------
  const { data: sigRaw, error: sigErr } = await backup
    .from('supply_importance_signal')
    .select('variety_l, provenance, source, weight');
  if (sigErr) console.error('[admin/supply] importance signals:', sigErr);
  const signals = (sigRaw ?? []) as unknown as SignalRow[];
  const signalByVariety = new Map<string, SignalRow>();
  for (const s of signals) {
    if (s.variety_l) signalByVariety.set(s.variety_l.trim().toLowerCase(), s);
  }

  // Aggregate to variety-level within each gap_type lever --------------------
  // Key = gap_type + ' ' + lower(variety). Track sku count, max priority,
  // a representative recommended_action + vendor (from the highest-priority sku).
  interface Acc {
    variety: string;
    vendor: string;
    gapType: string;
    skuCount: number;
    priorityScore: number;
    recommendedAction: string;
    topPriorityForRep: number; // priority of the sku that owns the rep fields
  }
  const acc = new Map<string, Acc>();
  for (const r of recs) {
    const variety = (r.variety ?? '').trim();
    const gapType = (r.gap_type ?? '').trim();
    if (!variety || !gapType) continue; // honesty: skip rows with no lever/variety
    const key = `${gapType} ${variety.toLowerCase()}`;
    const ps = toNum(r.priority_score);
    const existing = acc.get(key);
    if (!existing) {
      acc.set(key, {
        variety,
        vendor: r.vendor ?? '--',
        gapType,
        skuCount: 1,
        priorityScore: ps,
        recommendedAction: r.recommended_action ?? '--',
        topPriorityForRep: ps,
      });
    } else {
      existing.skuCount += 1;
      if (ps > existing.priorityScore) existing.priorityScore = ps;
      // Representative vendor/action come from the highest-priority sku.
      if (ps >= existing.topPriorityForRep) {
        existing.topPriorityForRep = ps;
        existing.vendor = r.vendor ?? existing.vendor;
        existing.recommendedAction = r.recommended_action ?? existing.recommendedAction;
      }
    }
  }

  // Group aggregated rows into levers ----------------------------------------
  const leverMap = new Map<string, VarietyRow[]>();
  for (const a of acc.values()) {
    const sig = signalByVariety.get(a.variety.toLowerCase());
    const row: VarietyRow = {
      variety: a.variety,
      vendor: a.vendor,
      gapType: a.gapType,
      skuCount: a.skuCount,
      priorityScore: a.priorityScore,
      recommendedAction: a.recommendedAction,
      provenance: normProvenance(sig?.provenance),
      provenanceSource: sig?.source ?? null,
    };
    const arr = leverMap.get(a.gapType);
    if (arr) arr.push(row);
    else leverMap.set(a.gapType, [row]);
  }

  // Order levers (known first), order rows within a lever by priority desc.
  const knownLevers = LEVER_ORDER.filter((g) => leverMap.has(g));
  const unknownLevers = Array.from(leverMap.keys())
    .filter((g) => !LEVER_ORDER.includes(g))
    .sort();
  const orderedLeverKeys = [...knownLevers, ...unknownLevers];

  const levers: Lever[] = orderedLeverKeys.map((gapType) => {
    const rows = (leverMap.get(gapType) ?? []).sort(
      (a, b) => b.priorityScore - a.priorityScore,
    );
    return { gapType, rows };
  });

  const totalVarieties = acc.size;
  const totalSkus = recs.filter((r) => r.variety && r.gap_type).length;

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
        <Link href="/admin/catalog" className="hover:text-emerald-700">
          Catalog
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700 font-medium">Supply Engine</span>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Supply Engine — daily recommendations
          </h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Ranked by importance × deficit; your decisions train the next ranking
            (the loop). Each approve/reject/correct writes to
            supply_recommendation_feedback and feeds learned_delta back into the
            engine — re-ranking the next load.
          </p>
        </div>
        <Link
          href="/admin/catalog"
          className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
        >
          ← Back to catalog
        </Link>
      </div>

      <div className="text-xs text-slate-500 mb-6">
        {totalVarieties} variet{totalVarieties === 1 ? 'y' : 'ies'} across{' '}
        {levers.length} lever{levers.length === 1 ? '' : 's'} · {totalSkus} SKU
        {totalSkus === 1 ? '' : 's'} in scope
      </div>

      {levers.length === 0 ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-6 text-sm text-emerald-700 font-medium">
          No recommendations right now. The engine has nothing to surface — supply
          is clean, or v_supply_recommendations is empty.
        </div>
      ) : (
        <div className="space-y-10">
          {levers.map((lever) => {
            const shown = lever.rows.slice(0, LEVER_CAP);
            const more = lever.rows.length - shown.length;
            return (
              <section key={lever.gapType}>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-lg font-bold text-slate-900">
                    {leverLabel(lever.gapType)}
                  </h2>
                  <span className="text-xs text-slate-500">
                    {lever.rows.length} variet
                    {lever.rows.length === 1 ? 'y' : 'ies'}
                  </span>
                </div>

                <div className="space-y-3">
                  {shown.map((row) => (
                    <article
                      key={`${row.gapType}-${row.variety}`}
                      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                    >
                      <div className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-semibold text-slate-900">
                              {row.variety}
                            </h3>
                            <ProvenanceBadge
                              p={row.provenance}
                              source={row.provenanceSource}
                            />
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{row.vendor}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-mono">{row.gapType}</span>
                            <span className="text-slate-300">·</span>
                            <span>
                              {row.skuCount} SKU{row.skuCount === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="text-sm text-slate-700 mt-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mr-1.5">
                              Action
                            </span>
                            {row.recommendedAction}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Priority
                          </div>
                          <div className="text-lg font-bold text-emerald-700 tabular-nums">
                            {row.priorityScore.toFixed(1)}
                          </div>
                        </div>
                      </div>

                      {/* Inline decide -> /api/admin/supply/decide */}
                      <RecDecision
                        variety={row.variety}
                        recType={row.gapType}
                      />
                    </article>
                  ))}
                </div>

                {more > 0 && (
                  <p className="text-xs text-slate-400 mt-3">
                    +{more} more variet{more === 1 ? 'y' : 'ies'} in this lever
                    (showing top {LEVER_CAP} by priority).
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-10">
        Sources: supabase-backup v_supply_recommendations (engine, aggregated to
        variety × lever), supply_importance_signal (provenance badge),
        supply_recommendation_feedback (write target). Provenance: assumed = guess
        (red), directional = partial signal (amber), verified/sourced = real
        signal (green), none = base score only (grey).
      </p>
    </main>
  );
}
