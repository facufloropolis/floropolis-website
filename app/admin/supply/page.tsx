// Supply Engine — solution-first console for the daily supply loop.
// v2 | 2026-06-10 | Job_PM (CPO)
//
// RESHAPE (Facu's HARD BAR): WORK the solution, don't flag the problem. The loop
// closes ONLY when the metric MOVES (variety unblocked / image applied), never
// on inform+confirm. Solve at SCALE (vendor x box-type, category x box-type),
// NEVER SKU-by-SKU; batch repeats into ONE rec.
//
// Shape:
//   - LEVER FILTER (SupplyConsole): five canonical tabs (image / content /
//     fulfillment / price / quality), ALWAYS present, each with its live count +
//     the MASKED backlog the cascade hides. Facu picks which lever to review.
//     Counts come from getLeverBuckets() (reads v_supply_recommendations +
//     failing_gates jsonb), so price + fulfillment are first-class now.
//   - IMAGE lever -> solution-first cards (one per variety): ImageSolution fetches
//     candidate photos (PROD + free-stock leads + AI flag) as pickable OPTIONS;
//     picking applies + re-measures (image_count 0->1, loop cerrado). REAL photos
//     only; honest pending when none.
//   - CONTENT lever -> BATCH recs (category x box_type): ONE action covers N
//     varieties, with the inferred stems-per-unit + the sibling comparatives that
//     justify it (inferContentForVariety). Honest "sin referencia" when no sibling.
//   - FULFILLMENT lever -> BATCH recs (vendor x box_type): ONE action ("cargar
//     dims de Megaflor EB -> desbloquea N variedades"), probing box_master_mirror
//     to say factually whether dims are missing.
//   - PRICE / QUALITY levers -> variety cards with the market-price context, so
//     levers Facu never saw are surfaced. (Quality has no engine rows today.)
//
// Auth: mirrors /admin/desk + /admin/catalog/blocked. Style: emerald-600 / slate,
// ASCII-clean Spanish. PROD via getProdReadClient (in readers), BACKUP via
// getBackupServiceClient. REAL data only; NULL-safe; honest empty states.

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import SurfaceStatusBanner from '../_components/SurfaceStatusBanner';
import RecDecision from './RecDecision';
import ImageSolution from './ImageSolution';
import ContentSolution from './ContentSolution';
import FulfillmentSolution from './FulfillmentSolution';
import SupplyConsole, { type LeverTab, type SupplyLever } from './SupplyConsole';
import {
  getCompetitorContext,
  getProdPhotoStatus,
  getLearningByRecType,
  getLeverBuckets,
  SUPPLY_LEVERS,
  leverBucket,
  type CompetitorContext,
  type PhotoStatus,
  type LearningStat,
  type LeverBucketStat,
} from './_recData';
import {
  getFulfillmentBatchRecs,
  getContentBatchRecs,
  inferContentForVariety,
  type FulfillmentBatchRec,
  type ContentBatchRec,
  type ContentInference,
} from './_scaleReaders';

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

const LEVER_CAP = 15; // top N varieties shown per per-SKU lever before "+N more"

// ---------------------------------------------------------------------------
// Types (per-SKU levers: image / price / quality)
// ---------------------------------------------------------------------------

interface RecRow {
  sku_id: string;
  vendor: string | null;
  variety: string | null;
  gap_type: string | null;
  published: boolean | null;
  image_count: number | null;
  importance_base: number | string | null;
  priority_score: number | string | null;
  recommended_action: string | null;
}

interface SignalRow {
  variety_l: string | null;
  provenance: string | null;
  source: string | null;
}

type Provenance = 'assumed' | 'directional' | 'verified' | 'sourced' | 'none';

interface VarietyRow {
  variety: string;
  vendor: string;
  gapType: string;
  skuCount: number;
  priorityScore: number;
  recommendedAction: string;
  provenance: Provenance;
  provenanceSource: string | null;
  importanceBase: number;
  unpublishedSkus: number;
  minImageCount: number;
}

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

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

const LEVER_TAB_LABEL: Record<SupplyLever, string> = {
  image: 'Imagen',
  content: 'Contenido',
  fulfillment: 'Dims / Fulfillment',
  price: 'Precio',
  quality: 'Calidad',
};

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
      className={`inline-flex items-center text-[10px] leading-none px-2 py-1 rounded-full font-semibold uppercase tracking-wide border ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

// Small market-price context line (REAL competitor data; honest "sin referencia").
function MarketLine({ comp }: { comp: CompetitorContext | null }) {
  if (comp && comp.found && comp.avgPerStem != null) {
    return (
      <div className="text-sm text-slate-700 mt-1 leading-relaxed">
        <span className="font-semibold text-slate-900 tabular-nums">
          ~{usd(comp.avgPerStem)}/stem
        </span>{' '}
        <span className="text-slate-500">
          ({comp.rowCount} precio{comp.rowCount === 1 ? '' : 's'},{' '}
          {comp.minPerStem != null && comp.maxPerStem != null
            ? `${usd(comp.minPerStem)}–${usd(comp.maxPerStem)}, `
            : ''}
          {comp.sources.length} fuente{comp.sources.length === 1 ? '' : 's'}:{' '}
          {comp.sources.join(', ')})
        </span>
      </div>
    );
  }
  return <div className="text-sm text-slate-400 mt-1">sin referencia de mercado</div>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SupplyEnginePage() {
  // Auth gate ----------------------------------------------------------------
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

  // Engine rows (per-SKU levers: image / price / quality) --------------------
  const { data: recRaw, error: recErr } = await backup
    .from('v_supply_recommendations')
    .select(
      'sku_id, vendor, variety, gap_type, published, image_count, importance_base, priority_score, recommended_action',
    )
    .order('priority_score', { ascending: false, nullsFirst: false })
    .limit(2000);
  if (recErr) console.error('[admin/supply] recommendations:', recErr);
  const recs = (recRaw ?? []) as unknown as RecRow[];

  // Provenance signals -------------------------------------------------------
  const { data: sigRaw, error: sigErr } = await backup
    .from('supply_importance_signal')
    .select('variety_l, provenance, source');
  if (sigErr) console.error('[admin/supply] importance signals:', sigErr);
  const signals = (sigRaw ?? []) as unknown as SignalRow[];
  const signalByVariety = new Map<string, SignalRow>();
  for (const s of signals) {
    if (s.variety_l) signalByVariety.set(s.variety_l.trim().toLowerCase(), s);
  }

  // Aggregate per-SKU levers to variety-level, bucketed to canonical lever ----
  interface Acc {
    variety: string;
    vendor: string;
    gapType: string;
    bucket: SupplyLever;
    skuCount: number;
    priorityScore: number;
    recommendedAction: string;
    topPriorityForRep: number;
    importanceBase: number;
    unpublishedSkus: number;
    minImageCount: number;
  }
  const acc = new Map<string, Acc>();
  for (const r of recs) {
    const variety = (r.variety ?? '').trim();
    const gapType = (r.gap_type ?? '').trim();
    if (!variety || !gapType) continue;
    const bucket = leverBucket(gapType);
    // Only image / price / quality render as per-variety cards here. content +
    // fulfillment are handled by the SCALE batch readers below.
    if (bucket !== 'image' && bucket !== 'price' && bucket !== 'quality') continue;
    // For the image bucket, key by the RAW gap_type so 'image' (add 1st photo,
    // clears missing_image) and 'image_improve' (add 2nd photo / A/B) render as
    // DISTINCT cards with the right apply mode — merging them would dead-end the
    // improve slice on the gap apply path (BLOCKER 1). price/quality key by bucket.
    const key =
      bucket === 'image'
        ? `${gapType.toLowerCase()} ${variety.toLowerCase()}`
        : `${bucket} ${variety.toLowerCase()}`;
    const ps = toNum(r.priority_score);
    const ib = toNum(r.importance_base);
    const isUnpublished = r.published === false;
    const imgc = r.image_count == null ? Number.POSITIVE_INFINITY : toNum(r.image_count);
    const existing = acc.get(key);
    if (!existing) {
      acc.set(key, {
        variety,
        vendor: r.vendor ?? '--',
        gapType,
        bucket,
        skuCount: 1,
        priorityScore: ps,
        recommendedAction: r.recommended_action ?? '--',
        topPriorityForRep: ps,
        importanceBase: ib,
        unpublishedSkus: isUnpublished ? 1 : 0,
        minImageCount: imgc,
      });
    } else {
      existing.skuCount += 1;
      if (ps > existing.priorityScore) existing.priorityScore = ps;
      if (ib > existing.importanceBase) existing.importanceBase = ib;
      if (isUnpublished) existing.unpublishedSkus += 1;
      if (imgc < existing.minImageCount) existing.minImageCount = imgc;
      if (ps >= existing.topPriorityForRep) {
        existing.topPriorityForRep = ps;
        existing.vendor = r.vendor ?? existing.vendor;
        existing.recommendedAction = r.recommended_action ?? existing.recommendedAction;
      }
    }
  }

  const bucketRows = new Map<SupplyLever, VarietyRow[]>();
  for (const lever of ['image', 'price', 'quality'] as SupplyLever[]) bucketRows.set(lever, []);
  for (const a of acc.values()) {
    const sig = signalByVariety.get(a.variety.toLowerCase());
    bucketRows.get(a.bucket)!.push({
      variety: a.variety,
      vendor: a.vendor,
      gapType: a.gapType,
      skuCount: a.skuCount,
      priorityScore: a.priorityScore,
      recommendedAction: a.recommendedAction,
      provenance: normProvenance(sig?.provenance),
      provenanceSource: sig?.source ?? null,
      importanceBase: a.importanceBase,
      unpublishedSkus: a.unpublishedSkus,
      minImageCount: Number.isFinite(a.minImageCount) ? a.minImageCount : 0,
    });
  }
  for (const rows of bucketRows.values()) rows.sort((x, y) => y.priorityScore - x.priorityScore);

  // SCALE batch readers (content x cat-box, fulfillment x vendor-box) ---------
  // + the lever bucket stats (all 5, with masked backlog) for the filter tabs.
  const [buckets, fulfillmentRecs, contentRecs] = await Promise.all([
    getLeverBuckets(),
    getFulfillmentBatchRecs(),
    getContentBatchRecs(),
  ]);

  // Enrichment: competitor price for displayed image/price varieties; PROD photo
  // status for displayed image varieties; learning per rec_type; content
  // inference for each displayed content batch group's sample variety.
  const imageVarieties = (bucketRows.get('image') ?? [])
    .slice(0, LEVER_CAP)
    .map((r) => r.variety.trim().toLowerCase());
  const priceVarieties = (bucketRows.get('price') ?? [])
    .slice(0, LEVER_CAP)
    .map((r) => r.variety.trim().toLowerCase());
  const compVarieties = Array.from(new Set([...imageVarieties, ...priceVarieties]));
  const contentSamples = contentRecs
    .map((c) => c.sampleVariety)
    .filter((v): v is string => !!v);

  const [competitorByVariety, photoByVariety, learningByRecType, contentInferences] =
    await Promise.all([
      getCompetitorContext(compVarieties),
      getProdPhotoStatus(imageVarieties),
      getLearningByRecType(),
      Promise.all(contentSamples.map((v) => inferContentForVariety(v))),
    ]);
  const inferenceByVariety = new Map<string, ContentInference>();
  for (const inf of contentInferences) {
    inferenceByVariety.set((inf.variety ?? '').trim().toLowerCase(), inf);
  }

  // Lever tabs (all five, always) with live counts + masked backlog -----------
  const tabs: LeverTab[] = SUPPLY_LEVERS.map((lever) => {
    const b: LeverBucketStat = buckets.get(lever) ?? {
      lever,
      skuCount: 0,
      varieties: 0,
      subTypes: {},
      maxPriority: 0,
      maskedSkus: 0,
    };
    return {
      lever,
      label: LEVER_TAB_LABEL[lever],
      direct: b.skuCount,
      masked: b.maskedSkus,
    };
  });

  // Pick the initial active lever: highest direct count.
  const initial: SupplyLever =
    tabs.reduce((best, t) => (t.direct > best.direct ? t : best), tabs[0]).lever;

  const learnLabel = (gapType: string): string => {
    const learn: LearningStat | null = learningByRecType.get(gapType) ?? null;
    return learn && learn.decisions > 0
      ? `${learn.decisions} decidida${learn.decisions === 1 ? '' : 's'}, ${learn.positive} con accion positiva (rec: ${gapType})`
      : 'sin decisiones aun';
  };

  // ---- Build solution-first card for an image/price/quality variety row ----
  function VarietyCard({ row, lever }: { row: VarietyRow; lever: SupplyLever }) {
    const vKey = row.variety.trim().toLowerCase();
    const comp = competitorByVariety.get(vKey) ?? null;
    const photo: PhotoStatus | null = lever === 'image' ? photoByVariety.get(vKey) ?? null : null;
    return (
      <article className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md">
        <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold tracking-tight text-slate-900">
                {row.variety}
              </h3>
              <ProvenanceBadge p={row.provenance} source={row.provenanceSource} />
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
              <span>{row.vendor}</span>
              <span className="text-slate-300">·</span>
              <span className="font-mono text-slate-400">{row.gapType}</span>
              <span className="text-slate-300">·</span>
              <span className="tabular-nums">
                {row.skuCount} SKU{row.skuCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Priority
            </div>
            <div className="text-2xl font-bold text-emerald-700 tabular-nums leading-tight mt-0.5">
              {row.priorityScore.toFixed(1)}
            </div>
          </div>
        </div>

        {/* Breadth + importance (what moving this unblocks) */}
        <div className="px-5 pb-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Breadth
            </div>
            <div className="text-sm font-semibold text-slate-800 mt-1">
              {row.unpublishedSkus > 0 ? (
                <span className="text-emerald-700">
                  +{row.unpublishedSkus} publicable{row.unpublishedSkus === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 mt-1 leading-snug">
              SKU hoy no publicados que esto desbloquea
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Importance
            </div>
            <div className="text-sm font-semibold text-slate-800 mt-1 tabular-nums">
              {row.importanceBase > 0 ? (
                row.importanceBase.toFixed(0)
              ) : (
                <span className="text-slate-300">--</span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 mt-1 leading-snug">
              demanda x ventaja competitiva (peso)
            </div>
          </div>
        </div>

        {/* Market price context (REAL) */}
        <div className="px-5 pb-3">
          <div className="rounded-xl border border-slate-100 bg-white px-3.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Mercado
            </div>
            <MarketLine comp={comp} />
          </div>
        </div>

        {/* THE WORKED SOLUTION */}
        <div className="px-5 pb-3">
          {lever === 'image' ? (
            <ImageSolution
              variety={row.variety}
              prodPhotoHint={photo?.state}
              mode={row.gapType.trim().toLowerCase() === 'image_improve' ? 'improve' : 'gap'}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {lever === 'price' ? 'Precio' : 'Calidad'}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                  solo triage / rank
                </span>
              </div>
              <div className="text-sm text-slate-700 mt-1 leading-relaxed">
                {row.recommendedAction}
              </div>
              <div className="text-[10px] text-slate-500 mt-1.5 leading-snug">
                {lever === 'price'
                  ? 'El precio lo produce Rose (no se calcula aca). Approve/Correct re-rankea + captura el motivo; no cierra el gate de precio.'
                  : 'Calidad sin executor: Approve/Correct re-rankea + captura el motivo; no cierra gates aca todavia.'}
              </div>
            </div>
          )}
        </div>

        {/* Loop indicator (per rec_type feedback) */}
        <div className="px-5 pb-3">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Loop
            </span>
            {learnLabel(row.gapType)}
          </div>
        </div>

        <RecDecision variety={row.variety} recType={row.gapType} />
      </article>
    );
  }

  // ---- Sections per lever --------------------------------------------------
  function PerVarietySection({ lever }: { lever: SupplyLever }) {
    const rows = bucketRows.get(lever) ?? [];
    const shown = rows.slice(0, LEVER_CAP);
    const more = rows.length - shown.length;
    if (rows.length === 0) {
      return (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-8 text-center">
          <div className="text-sm font-semibold text-emerald-800">
            {LEVER_TAB_LABEL[lever]}: nada que trabajar
          </div>
          <p className="text-sm text-emerald-700 mt-1 max-w-md mx-auto leading-relaxed">
            El motor no tiene recomendaciones de {LEVER_TAB_LABEL[lever].toLowerCase()} abiertas ahora.
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {shown.map((row) => (
          <VarietyCard key={`${lever}-${row.gapType}-${row.variety}`} row={row} lever={lever} />
        ))}
        {more > 0 && (
          <p className="text-xs text-slate-400 mt-2 pl-1">
            +{more} variedad{more === 1 ? '' : 'es'} mas en este lever (top {LEVER_CAP} por prioridad).
          </p>
        )}
      </div>
    );
  }

  function FulfillmentSection() {
    if (fulfillmentRecs.length === 0) {
      return (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-8 text-center">
          <div className="text-sm font-semibold text-emerald-800">
            Dims / Fulfillment: nada que trabajar
          </div>
          <p className="text-sm text-emerald-700 mt-1">Ningun vendor x box con gap de dims.</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {fulfillmentRecs.map((b: FulfillmentBatchRec) => (
          <article
            key={`${b.vendor}-${b.boxType}`}
            className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
          >
            <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold tracking-tight text-slate-900">
                  {b.vendor} · {b.boxType.toUpperCase()}
                </h3>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                  <span className="tabular-nums">{b.varieties} variedades</span>
                  <span className="text-slate-300">·</span>
                  <span className="tabular-nums">{b.skuCount} SKU</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono text-amber-700">{b.gate}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Priority
                </div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums leading-tight mt-0.5">
                  {b.priorityScore.toFixed(1)}
                </div>
              </div>
            </div>
            <div className="px-5 pb-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Gap real (failing_gates) -&gt; {b.varieties} variedad{b.varieties === 1 ? '' : 'es'}
                </div>
                <div className="text-sm text-slate-700 mt-1 leading-snug">{b.action}</div>
              </div>
            </div>
            {/* THE WORKED SOLUTION: set units per vendor x box -> clears the gate */}
            <div className="px-5 pb-4">
              <FulfillmentSolution
                vendor={b.vendor}
                boxType={b.boxType}
                varieties={b.varieties}
                applyKind={b.applyKind}
                allStemSold={b.allStemSold}
                needsValueCount={b.needsValueCount}
              />
            </div>
            <div className="px-5 pb-3">
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Loop
                </span>
                {learnLabel('fulfillment')}
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function ContentSection() {
    if (contentRecs.length === 0) {
      return (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-8 text-center">
          <div className="text-sm font-semibold text-emerald-800">
            Contenido: nada que trabajar
          </div>
          <p className="text-sm text-emerald-700 mt-1">Ninguna categoria x box con gap de contenido.</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {contentRecs.map((c: ContentBatchRec) => {
          const inf = c.sampleVariety
            ? inferenceByVariety.get(c.sampleVariety.trim().toLowerCase()) ?? null
            : null;
          return (
            <article
              key={`${c.category}-${c.boxType}`}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold tracking-tight text-slate-900">
                    {c.category} · {c.boxType.toUpperCase()}
                  </h3>
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span className="tabular-nums">{c.varieties} variedades</span>
                    <span className="text-slate-300">·</span>
                    <span className="tabular-nums">{c.skuCount} SKU</span>
                    {c.missingStems > 0 && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-amber-700 tabular-nums">
                          {c.missingStems} sin stems
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Priority
                  </div>
                  <div className="text-2xl font-bold text-emerald-700 tabular-nums leading-tight mt-0.5">
                    {c.priorityScore.toFixed(1)}
                  </div>
                </div>
              </div>

              {/* Inferred content + comparative siblings (the WORKED value) */}
              <div className="px-5 pb-3">
                <div className="rounded-xl border border-slate-100 bg-white px-3.5 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Contenido inferido (sugerencia editable)
                  </div>
                  {inf && inf.inferredStems != null ? (
                    <>
                      <div className="text-sm text-slate-800 mt-1 leading-snug">
                        <span className="font-semibold tabular-nums">~{inf.inferredStems} stems</span>{' '}
                        <span className="text-slate-500">
                          ({inf.method === 'sibling_mode' ? 'moda' : 'promedio'} de {inf.siblingCount}{' '}
                          hermano{inf.siblingCount === 1 ? '' : 's'})
                        </span>
                      </div>
                      {inf.examples.length > 0 && (
                        <div className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                          Ejemplos:{' '}
                          {inf.examples.map((e) => `${e.variety} (${e.stems})`).join(', ')}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-slate-400 mt-1 leading-snug">
                      {inf?.note ?? 'sin hermano con stems cargado -> sin referencia (pendiente, no se inventa)'}
                    </div>
                  )}
                </div>
              </div>

              {/* THE WORKED SOLUTION: author the note -> writes + clears the gate */}
              <div className="px-5 pb-4">
                <ContentSolution
                  category={c.category}
                  boxType={c.boxType}
                  varieties={c.varieties}
                  suggestedNote={
                    inf && inf.inferredStems != null
                      ? `${c.category} en ${c.boxType.toUpperCase()}: ramo de ~${inf.inferredStems} stems.`
                      : null
                  }
                />
              </div>

              <div className="px-5 pb-3">
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Loop
                  </span>
                  {learnLabel('content')}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  const sections: Partial<Record<SupplyLever, React.ReactNode>> = {
    image: <PerVarietySection lever="image" />,
    content: <ContentSection />,
    fulfillment: <FulfillmentSection />,
    price: <PerVarietySection lever="price" />,
    quality: <PerVarietySection lever="quality" />,
  };

  const totalDirect = tabs.reduce((s, t) => s + t.direct, 0);

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <nav className="text-xs text-slate-500 mb-3" aria-label="Breadcrumb">
        <Link href="/admin/catalog" className="hover:text-emerald-700 transition-colors">
          Catalog
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-700 font-medium">Supply Engine</span>
      </nav>

      <SurfaceStatusBanner surfaceKey="supply" />

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Supply Engine</h1>
          <p className="text-sm font-medium text-emerald-700 mt-0.5">
            Soluciones diarias (no flags)
          </p>
          <p className="text-slate-500 text-sm mt-2 max-w-2xl leading-relaxed">
            Elegi un lever. Cada tarjeta muestra la solucion trabajada (imagen
            aplicable, dims a escala, contenido inferido), no el problema. El loop
            cierra solo cuando la metrica se mueve. Imagen y precio se resuelven por
            variedad; contenido y fulfillment a escala (categoria/vendor x box).
          </p>
        </div>
        <Link
          href="/admin/catalog"
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 transition-colors"
        >
          <span aria-hidden>←</span> Catalog
        </Link>
      </div>

      <div className="mb-6 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-900 tabular-nums">{totalDirect}</span>
        <span>SKU con gap directo</span>
        <span className="text-slate-300">·</span>
        <span className="font-semibold text-slate-900 tabular-nums">{SUPPLY_LEVERS.length}</span>
        <span>levers</span>
      </div>

      <SupplyConsole tabs={tabs} sections={sections} initial={initial} />

      <p className="text-[11px] leading-relaxed text-slate-400 mt-12 pt-6 border-t border-slate-200">
        Fuentes: supabase-backup v_supply_recommendations (motor) bucketed a 5
        levers via getLeverBuckets (cuenta directa + backlog enmascarado leyendo
        failing_gates jsonb). Imagen: candidatas de /api/admin/supply/image-candidates
        (PROD floropolis_inventory.images = foto real http; leads de stock libre
        verificables; AI flag honesto), aplicadas via /api/admin/supply/apply-image
        (escribe product_chrome.images, limpia missing_image en
        catalog_classifications, re-mide el motor -&gt; loop cerrado solo si el gate
        cerro). Imagen image_improve: 2da foto (A/B) via apply-image mode=improve
        (image_count 1-&gt;2 saca el SKU del lever). Fulfillment: batch vendor x box
        guiado por el failing_gates real (missing_units_or_bunch -&gt; carga
        dim_sku.stems_per_unit, no probe de dims) via apply-fulfillment. Contenido:
        batch categoria x box, escribe product_chrome.description + cierra
        missing_contents_description via apply-content; stems inferidos de hermanos
        (dim_sku). Precio/Calidad: solo triage/rank (sin executor; precio lo
        produce Rose). Mercado: PROD competitor_prices por variedad, match por
        palabra completa. Provenance: assumed (rojo),
        directional (ambar), verified/sourced (verde), none (gris).
      </p>
    </main>
  );
}
