// ImageReviewPanel — /admin/supply queue where Facu approves/rejects sourced candidate images.
// v2 (supply-card-v2) | 2026-06-15 | Job_PM (CPO)
//
// ONE CARD PER VARIETY (not per SKU/size). A variety has N sizes (e.g. 'moody blues!' = 4 SKUs)
// but the SAME deduped candidate photos; the backend (/apply-image) applies a picked asset to ALL
// of the variety's image-gap SKUs via loop-ledger.closeAssetGate. So the UI collapses the per-SKU
// rows into ONE decision per variety, with the deduped candidate urls shown as selectable OPTIONS
// inside that single card — NOT 4-5 separate SkuCards (the v1 bug).
//
// Each card exposes the three v2 controls (the FeedbackPayload signal):
//   (a) reject-reason tag chips {wrong color, not tinted, low quality, check PROD, other}
//   (b) quality rating {weak, good, excellent} + a 'find better' toggle
//   (c) priority subir/bajar (steers the rank, clamped server-side to [-20,20])
//
// Route (REUSE the canonical v2 closer, do NOT fork):
//   POST /api/admin/supply/image-review (variety-fan-out):
//     PICK   { ids:[picked candidate ids], skuIds:[ALL variety size uuids], url, variety,
//              decision:'approve', rejectTags?, quality?, findBetter?, priorityDelta?, note? }
//              -> closeAssetGate(skuIds) closes the gate for EVERY size of the variety in ONE call,
//                 persists supply_solution_feedback (outcome='pick') + supply_recommendation_feedback
//                 (priorityDelta -> weight_delta, server-clamped [-20,20] -> getLearnedRerank).
//     REJECT { ids:[all candidate ids], skuIds, variety, decision:'reject', rejectTags?, quality?,
//              findBetter?, priorityDelta?, note? } -> records the reject (outcome='reject') so the
//              sourcing/ranker learns. find_better/low_quality flag re-sourcing.
//   PRIORITY (rank-only, no candidate decision) -> POST /api/admin/supply/decide
//     { variety, rec_type:'image', decision:'defer', priority_delta } -> weight_delta (clamped
//     [-20,20]) -> getLearnedRerank re-ranks the next load. Does NOT touch the candidate rows.
//
// The route returns warnings[] on ANY partial failure (non-uuid size skipped, ledger not advanced,
// feedback not written). NO DB error is swallowed: every response's warnings[] is shown in the card.
// Style: emerald-600 primary, slate scale, ASCII-clean Spanish (matches v1 / surrounding files).
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ImageReviewSku } from '@/lib/admin/image-review';

const SOURCE_BADGE: Record<string, string> = {
  prod_propagate: 'bg-emerald-100 text-emerald-700',
  prod_photo: 'bg-emerald-100 text-emerald-700',
  vendor: 'bg-sky-100 text-sky-700',
  free_stock: 'bg-indigo-100 text-indigo-700',
  ai_pollinations: 'bg-amber-100 text-amber-800',
};
const SOURCE_LABEL: Record<string, string> = {
  prod_propagate: 'PROD (ya pagada)',
  prod_photo: 'PROD (ya pagada)',
  vendor: 'vendor',
  free_stock: 'free stock',
  ai_pollinations: 'AI',
};

// ---- shared contract (FeedbackPayload) ------------------------------------
type RejectTag = 'wrong_color' | 'not_tinted' | 'low_quality' | 'check_prod' | 'other';
type Quality = 'weak' | 'good' | 'excellent';

const REJECT_TAGS: { id: RejectTag; label: string }[] = [
  { id: 'wrong_color', label: 'color equivocado' },
  { id: 'not_tinted', label: 'sin tintar' },
  { id: 'low_quality', label: 'mala calidad' },
  { id: 'check_prod', label: 'revisar PROD' },
  { id: 'other', label: 'otro' },
];
const QUALITY_OPTS: { id: Quality; label: string }[] = [
  { id: 'weak', label: 'floja' },
  { id: 'good', label: 'buena' },
  { id: 'excellent', label: 'excelente' },
];

// The structured signal (rejectTags / quality / findBetter / note) is sent to the route AS-IS;
// the route's lib/admin/supply-feedback helper serializes it into the feedback tables (rejectTags
// -> reason_tags(text[]); quality/findBetter folded into the reason text) — no jsonb column exists.

// ---- variety-collapsed shape (GroupedVarietyCard) -------------------------
interface GroupedVarietyCard {
  variety: string;
  vendor: string | null;
  skuIds: string[]; // all sizes of the variety (uuids -> closeAssetGate fans out to all)
  // deduped photo OPTIONS (by url); ids = the candidate review-row ids carrying this url.
  candidates: { url: string; source: string; tier: number | null; ids: number[] }[];
}

/** Collapse per-SKU review rows into ONE card per VARIETY, deduping candidate urls. */
function collapseToVariety(skus: ImageReviewSku[]): GroupedVarietyCard[] {
  const byVariety = new Map<string, GroupedVarietyCard>();
  for (const s of skus) {
    const variety = (s.variety ?? '').trim();
    if (!variety) continue; // variety-based card needs a variety; skip orphan rows
    const key = variety.toLowerCase();
    let card = byVariety.get(key);
    if (!card) {
      card = { variety, vendor: s.vendor ?? null, skuIds: [], candidates: [] };
      byVariety.set(key, card);
    }
    if (s.skuId && !card.skuIds.includes(s.skuId)) card.skuIds.push(s.skuId);
    if (!card.vendor && s.vendor) card.vendor = s.vendor;
    for (const c of s.candidates) {
      const existing = card.candidates.find((x) => x.url === c.url);
      if (existing) {
        if (!existing.ids.includes(c.id)) existing.ids.push(c.id);
        // keep the best (lowest) tier label
        if ((c.tier ?? 9) < (existing.tier ?? 9)) existing.tier = c.tier;
      } else {
        card.candidates.push({ url: c.url, source: c.source, tier: c.tier, ids: [c.id] });
      }
    }
  }
  // best-source-first within a card, then varieties by cheapest tier, then name.
  const cards = Array.from(byVariety.values());
  for (const c of cards) c.candidates.sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9));
  cards.sort((a, b) => {
    const at = Math.min(...a.candidates.map((c) => c.tier ?? 9), 9);
    const bt = Math.min(...b.candidates.map((c) => c.tier ?? 9), 9);
    if (at !== bt) return at - bt;
    return a.variety.localeCompare(b.variety);
  });
  return cards;
}

// Shape of the canonical /api/admin/supply/image-review response (v2).
interface DecideResult {
  ok?: boolean;
  error?: string;
  detail?: string;
  decision?: 'approve' | 'reject';
  skusClosed?: number;
  propagated?: boolean;
  loopClosed?: boolean;
  gatesCleared?: number;
  nowPublishable?: number;
  ledgersWritten?: number;
  weightDelta?: number;
  reSource?: boolean;
  warnings?: string[];
}

function VarietyCard({ card }: { card: GroupedVarietyCard }) {
  const router = useRouter();
  const [selectedUrl, setSelectedUrl] = useState<string | null>(card.candidates[0]?.url ?? null);
  const [rejectTags, setRejectTags] = useState<RejectTag[]>([]);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [findBetter, setFindBetter] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // 'apply' | 'reject' | 'prio'
  const [err, setErr] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const title = card.variety || '(variedad)';

  function toggleTag(t: RejectTag) {
    setRejectTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  // Shared POST to the canonical variety-fan-out route. Sends ALL the variety's size uuids in
  // skuIds so closeAssetGate closes EVERY size in one call, plus the FeedbackPayload signal.
  async function post(
    decision: 'approve' | 'reject',
    extra: { url?: string; ids?: number[]; priorityDelta?: number },
  ): Promise<DecideResult | null> {
    const res = await fetch('/api/admin/supply/image-review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision,
        variety: card.variety,
        skuIds: card.skuIds, // ALL sizes -> one close call (loop-ledger.closeAssetGate)
        ids: extra.ids,
        url: extra.url,
        // FeedbackPayload — the route's supply-feedback helper serializes these into the feedback
        // tables (rejectTags -> reason_tags(text[]); quality/findBetter -> reason text). No jsonb.
        rejectTags,
        quality: quality ?? undefined,
        findBetter,
        note: note.trim() || undefined,
        priorityDelta: extra.priorityDelta,
      }),
    });
    const b = (await res.json().catch(() => ({}))) as DecideResult;
    // No-swallow: always surface warnings[], even on ok responses.
    setWarnings(Array.isArray(b.warnings) ? b.warnings : []);
    if (!res.ok) {
      setErr(b.detail ? `${b.error}: ${b.detail}` : b.error ?? `http_${res.status}`);
      return null;
    }
    return b;
  }

  // APPROVE: the picked url closes the missing_image gate for ALL of the variety's sizes.
  async function applyPick() {
    if (!selectedUrl) {
      setErr('elegi una foto primero');
      return;
    }
    setBusy('apply');
    setErr(null);
    setWarnings([]);
    const picked = card.candidates.find((c) => c.url === selectedUrl);
    try {
      const b = await post('approve', { url: selectedUrl, ids: picked?.ids });
      if (!b) return;
      const closed = b.skusClosed ?? 0;
      const pub = b.nowPublishable ?? 0;
      if (b.loopClosed && b.propagated) {
        setDone(
          `desbloqueado · ${closed} tamaño${closed === 1 ? '' : 's'} cerrado${closed === 1 ? '' : 's'}` +
            (pub > 0 ? ` · ${pub} publicable${pub === 1 ? '' : 's'}` : ''),
        );
      } else if (b.propagated) {
        setDone(`foto aplicada a ${closed} tamaño${closed === 1 ? '' : 's'} (gate sin cerrar)`);
      } else {
        setDone('registrado · sin movimiento de metrica');
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(null);
    }
  }

  // REJECT: none of the candidates fit. Records the reject (outcome='reject') so the sourcing/
  // ranker learns; find_better/low_quality flag re-sourcing on the route side.
  async function rejectAll() {
    setBusy('reject');
    setErr(null);
    setWarnings([]);
    const allIds = Array.from(new Set(card.candidates.flatMap((c) => c.ids)));
    try {
      const b = await post('reject', { ids: allIds });
      if (!b) return;
      setDone(b.reSource ? 'rechazadas · re-sourcing pedido (el motor aprende)' : 'rechazadas · el motor aprende el motivo');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(null);
    }
  }

  // PRIORITY: steer the rank for this variety's image rec WITHOUT deciding the candidates. Goes to
  // the dedicated /decide route (decision:'defer' is neutral; priority_delta carries the signal ->
  // supply_recommendation_feedback.weight_delta, server-clamped to [-20,20] -> getLearnedRerank
  // re-ranks the next load). We send in-band nudges so the UI label matches the stored effect.
  async function priority(delta: number) {
    setBusy('prio');
    setErr(null);
    setWarnings([]);
    try {
      const res = await fetch('/api/admin/supply/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          variety: card.variety,
          rec_type: 'image',
          decision: 'defer', // neutral on content; priority_delta is the signal
          priority_delta: delta,
          reason: note.trim() || undefined,
        }),
      });
      const b = (await res.json().catch(() => ({}))) as DecideResult;
      setWarnings(Array.isArray(b.warnings) ? b.warnings : []);
      if (!res.ok) {
        setErr(b.detail ? `${b.error}: ${b.detail}` : b.error ?? `http_${res.status}`);
        return;
      }
      setDone(delta > 0 ? 'prioridad subida · re-rankea el proximo load' : 'prioridad bajada · re-rankea el proximo load');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-3 ${done ? 'opacity-70' : ''}`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[14px] font-semibold text-slate-800">{title}</div>
          <div className="text-[11px] text-slate-500">
            {card.vendor ?? '—'} · {card.skuIds.length} tamaño{card.skuIds.length === 1 ? '' : 's'} · {card.candidates.length} opción{card.candidates.length === 1 ? '' : 'es'}
          </div>
        </div>
        {done && <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{done}</span>}
      </div>

      {!done && (
        <>
          {/* deduped candidate urls as selectable OPTIONS inside the one card */}
          <div className="flex flex-wrap gap-3">
            {card.candidates.map((c: GroupedVarietyCard['candidates'][number]) => {
              const sel = c.url === selectedUrl;
              return (
                <button
                  type="button"
                  key={c.url}
                  onClick={() => setSelectedUrl(c.url)}
                  className={`w-[150px] rounded border p-1 text-left transition-colors ${sel ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt={title} className="h-[140px] w-full rounded object-cover" />
                  <div className="mt-1 flex items-center justify-between">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_BADGE[c.source] ?? 'bg-slate-100 text-slate-600'}`}>
                      {SOURCE_LABEL[c.source] ?? c.source}
                    </span>
                    {sel && <span className="text-[10px] font-semibold text-emerald-600">elegida ✓</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* (a) reject-reason tag chips */}
          <div className="mt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Motivo (si algo no va)</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {REJECT_TAGS.map((t) => {
                const on = rejectTags.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggleTag(t.id)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${on ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* (b) quality rating + find-better toggle */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Calidad</span>
            {QUALITY_OPTS.map((q) => {
              const on = quality === q.id;
              return (
                <button
                  type="button"
                  key={q.id}
                  onClick={() => setQuality(on ? null : q.id)}
                  className={`rounded-lg border px-2 py-0.5 text-[11px] transition-colors ${on ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {q.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setFindBetter((v) => !v)}
              className={`ml-1 rounded-lg border px-2 py-0.5 text-[11px] transition-colors ${findBetter ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {findBetter ? '✓ ' : ''}buscar mejor
            </button>
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="nota libre (opcional) — entrena el proximo batch"
            className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-[12px]"
          />

          {/* actions: pick / reject-all */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void applyPick()}
              disabled={busy !== null || !selectedUrl}
              className="rounded bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy === 'apply' ? 'Aplicando...' : 'Aplicar elegida (toda la variedad)'}
            </button>
            <button
              type="button"
              onClick={() => void rejectAll()}
              disabled={busy !== null}
              className="rounded border border-slate-300 px-3 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === 'reject' ? '...' : 'Ninguna sirve'}
            </button>

            {/* (c) priority subir / bajar */}
            <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Prioridad</span>
            <button
              type="button"
              onClick={() => void priority(8)}
              disabled={busy !== null}
              className="rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              ↑ subir
            </button>
            <button
              type="button"
              onClick={() => void priority(-6)}
              disabled={busy !== null}
              className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            >
              ↓ bajar
            </button>
          </div>

          {err && <div className="mt-1 text-[11px] text-rose-600">{err}</div>}
          {warnings.length > 0 && (
            <div className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              {warnings.map((w, i) => (
                <div key={i}>aviso: {w}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ImageReviewPanel({ skus }: { skus: ImageReviewSku[] }) {
  const cards = useMemo(() => collapseToVariety(skus), [skus]);
  if (cards.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-slate-800">Imágenes — candidatas para aprobar</h2>
        <span className="text-[12px] text-slate-500">{cards.length} variedades · cero costo (PROD/vendor/free/AI)</span>
      </div>
      <p className="mb-3 text-[12px] text-slate-500">
        Una tarjeta por variedad (aplica a todos sus tamaños). Elegí la mejor foto de las opciones,
        marcá calidad/motivo, y aplicá — desbloquea todos los SKU en gap de imagen de la variedad. El
        motivo entrena el próximo batch.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((c) => (
          <VarietyCard key={c.variety.toLowerCase()} card={c} />
        ))}
      </div>
    </section>
  );
}
