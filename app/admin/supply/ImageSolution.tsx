// Solution-first IMAGE card body: WORK the photo, don't flag the gap.
// v1 | 2026-06-10 | Job_PM (CPO)
//
// HARD BAR (Facu): show the WORKED solution as pickable OPTIONS, not the problem.
// On expand we fetch GET /api/admin/supply/image-candidates?variety=<v> and lay
// out the sourcing ladder as choices Facu picks from -> "cual ponemos?":
//   (a) PROD photo  -> the REAL CloudFront http url already on record (best, one
//       click applies it). Rendered as a real <img> thumbnail.
//   (b) free stock  -> verifiable SEARCH leads per provider (Unsplash/Pexels/...).
//       We open the search in a new tab; the human copies the chosen photo url
//       back into the "pegar url" field, which applies it (no fabricated photo).
//   (c) AI rung     -> honest availability flag (needs image API) — never a fake.
// Picking ANY option POSTs /api/admin/supply/apply-image -> the card shows the
// metric MOVE: "imagen aplicada -> image_count 0->1 (loop cerrado)". The loop is
// reported closed ONLY when the server confirms the gate cleared (loopClosed &&
// closed > 0) -- inform+confirm is never enough.
//
// "Ninguna me gusta" -> reason textarea -> POST reject+reason (learn WHY). If
// un-gettable, the ladder also offers ask_vendor / ask_next_client / send_sample
// which enqueue an open image_request_queue row.
//
// Style: emerald-600 primary, slate scale, ASCII-clean Spanish. NULL-safe; every
// empty rung degrades to an honest "pendiente" line, never a fabricated photo.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ProdPhoto {
  state: 'yes' | 'no' | 'unknown';
  url: string | null;
}
interface FreeCandidate {
  provider: string;
  searchUrl: string;
  license: string;
  note: string;
}
interface AiRung {
  available: boolean;
  provider: string | null;
  reason: string;
}
interface ProdPhotos {
  state: 'yes' | 'no' | 'unknown';
  urls: string[];
}
interface CandidatesResponse {
  variety: string;
  prodPhoto: ProdPhoto;
  prodPhotos?: ProdPhotos; // new: all available PROD photos for the gallery
  freeCandidates: FreeCandidate[];
  ai: AiRung;
  recommendedRung: string;
  ungettableQueueReasons: string[];
}

interface ApplyResult {
  applied: boolean;
  loopClosed?: boolean;
  rejected?: boolean;
  queued?: boolean;
  queueReason?: string | null;
  reason?: string;
  imageCountBefore?: number;
  imageCountAfter?: number;
  gapSkuCount?: number;
  imagesWritten?: number;
  gatesCleared?: number;
  closed?: number;
  nowPublishable?: number;
}

const QUEUE_LABELS: Record<string, string> = {
  ask_vendor: 'Pedir al vendor',
  ask_next_client: 'Pedir al proximo cliente',
  send_sample: 'Pedir sample',
};

interface Props {
  variety: string;
  // Whether the server already knows a real PROD photo exists (status badge).
  // Used only for the collapsed hint; the expand fetch is the source of truth.
  prodPhotoHint?: 'yes' | 'no' | 'unknown';
  // 'gap' (default) = the 'image' lever (no photo -> add 1st, clear missing_image
  // gate). 'improve' = the 'image_improve' lever (1 photo -> add a 2nd / A/B, the
  // SKU leaves the lever when image_count > 1). The mode is forwarded to the
  // apply route so the right metric actually moves (BLOCKER 1 fix).
  mode?: 'gap' | 'improve';
}

export default function ImageSolution({ variety, prodPhotoHint, mode = 'gap' }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cand, setCand] = useState<CandidatesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // apply / reject flow
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteSource, setPasteSource] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  async function expand() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (cand || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/supply/image-candidates?variety=${encodeURIComponent(variety)}`,
      );
      const json = (await res.json().catch(() => ({}))) as CandidatesResponse & {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCand(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudieron cargar candidatos');
    } finally {
      setLoading(false);
    }
  }

  async function apply(imageUrl: string, source: string | null) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/supply/apply-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ variety, imageUrl, source: source ?? undefined, mode }),
      });
      const json = (await res.json().catch(() => ({}))) as ApplyResult & {
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        throw new Error(json.detail ? `${json.error}: ${json.detail}` : json.error ?? `HTTP ${res.status}`);
      }
      setResult(json);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo aplicar');
    } finally {
      setBusy(false);
    }
  }

  async function reject(reason: string, queueReason: string | null) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/supply/apply-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          variety,
          reject: true,
          reason: reason.trim() || undefined,
          queueReason: queueReason ?? undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as ApplyResult & {
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        throw new Error(json.detail ? `${json.error}: ${json.detail}` : json.error ?? `HTTP ${res.status}`);
      }
      setResult(json);
      setShowReject(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo registrar');
    } finally {
      setBusy(false);
    }
  }

  // ---- RESULT state: the metric MOVED (or honest non-move) ----
  if (result) {
    if (result.rejected) {
      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Registrado
          </div>
          <div className="text-sm text-slate-700 mt-1 leading-snug">
            {result.queued
              ? `Ninguna candidata sirvio -> encolado: ${QUEUE_LABELS[result.queueReason ?? ''] ?? result.queueReason} (image_request_queue). El motor aprende el rechazo.`
              : 'Ninguna candidata sirvio -> registrado el motivo (el motor aprende). Sin foto aplicada.'}
          </div>
        </div>
      );
    }
    const before = result.imageCountBefore ?? 0;
    const after = result.imageCountAfter ?? 0;
    const closed = result.closed ?? 0;
    const loopClosed = result.loopClosed === true && closed > 0;
    if (!result.applied) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            Sin movimiento
          </div>
          <div className="text-sm text-amber-900 mt-1 leading-snug">
            {result.reason === 'no_image_gap_sku'
              ? 'Esta variedad ya no tiene SKU en gap de imagen (ya tienen foto). Nada que mover.'
              : result.reason === 'no_improve_sku'
                ? 'Esta variedad ya tiene mas de una foto en todos sus SKU. Nada que mejorar.'
                : result.reason === 'photo_already_present'
                  ? 'Esa foto ya estaba cargada -> image_count no se movio. Elegi otra distinta.'
                  : result.reason === 'no_sku_for_variety'
                    ? 'Sin SKU para esta variedad.'
                    : 'No se movio la metrica.'}
          </div>
        </div>
      );
    }
    if (loopClosed) {
      return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
            <span aria-hidden>+</span> {mode === 'improve' ? 'Foto A/B aplicada' : 'Loop cerrado'}
          </div>
          {mode === 'improve' ? (
            <>
              <div className="text-sm font-semibold text-emerald-800 mt-1 leading-snug">
                2da foto aplicada -&gt; image_count {before}-&gt;{after} -&gt; {closed} SKU
                {closed === 1 ? '' : 's'} salio del lever image_improve
              </div>
              <div className="text-[10px] text-emerald-700 mt-1 leading-snug">
                Re-medido en el motor (image_count &gt; 1 ya no dispara image_improve).
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-emerald-800 mt-1 leading-snug">
                imagen aplicada -&gt; image_count {before}-&gt;{after} -&gt; breadth +{closed} publicable
                {closed === 1 ? '' : 's'}
              </div>
              <div className="text-[10px] text-emerald-700 mt-1 leading-snug">
                {closed} SKU{closed === 1 ? '' : 's'} salio del lever de imagen (gate missing_image
                cerrado, re-medido en el motor)
              </div>
            </>
          )}
        </div>
      );
    }
    // Photo written but lever not confirmed left -> honest partial move.
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          {mode === 'improve' ? 'Foto aplicada -- lever sin cerrar' : 'Foto aplicada -- gate sin cerrar'}
        </div>
        <div className="text-sm font-semibold text-amber-900 mt-1 tabular-nums">
          image_count {before}-&gt;{after}
        </div>
        <div className="text-[10px] text-amber-800 mt-1 leading-snug">
          {mode === 'improve'
            ? `${result.imagesWritten ?? 0} SKU con 2da foto, pero el motor aun lo cuenta en image_improve.`
            : `${result.imagesWritten ?? 0} SKU con foto, pero el gate missing_image no se cerro. No es publicable todavia.`}
        </div>
      </div>
    );
  }

  // ---- COLLAPSED / EXPAND trigger ----
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {mode === 'improve' ? 'Solucion: 2da foto (A/B)' : 'Solucion: imagen'}
          </div>
          <div className="text-sm text-slate-700 mt-0.5 leading-snug">
            {mode === 'improve'
              ? 'Agregar una 2da foto (image_count 1->2 saca el SKU del lever)'
              : prodPhotoHint === 'yes'
                ? 'Foto PROD real disponible -> aplicar en un click'
                : 'Elegir foto de candidatas (PROD / stock libre / AI)'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void expand()}
          className="shrink-0 text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 px-3 py-1.5 rounded-xl transition-colors"
        >
          {open ? 'Ocultar' : 'Cual ponemos?'}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {loading && (
            <div className="text-xs text-slate-400">Buscando candidatas...</div>
          )}
          {error && (
            <p className="text-[11px] text-red-600 font-mono break-words">{error}</p>
          )}

          {cand && (
            <>
              {/* (a) PROD photos — gallery of all available real thumbnails */}
              {(() => {
                // Prefer the new prodPhotos array; fall back to the single-photo shape.
                const hasGallery =
                  cand.prodPhotos?.state === 'yes' && (cand.prodPhotos.urls?.length ?? 0) > 0;
                const hasSingle = !hasGallery && cand.prodPhoto.state === 'yes' && !!cand.prodPhoto.url;

                if (hasGallery && cand.prodPhotos) {
                  const urls = cand.prodPhotos.urls;
                  return (
                    <div className="rounded-xl border border-emerald-200 bg-white p-3">
                      <div className="flex items-baseline justify-between mb-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                          PROD (fotos reales en registro)
                        </div>
                        {urls.length > 1 && (
                          <div className="text-[10px] text-slate-400">
                            {urls.length} fotos disponibles &mdash; la mejor primera
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {urls.map((url, idx) => (
                          <div key={url} className="flex flex-col items-center gap-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`${variety} PROD foto ${idx + 1}`}
                              className="h-20 w-20 object-cover rounded-lg border border-slate-200"
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void apply(url, 'prod_photo')}
                              className="text-[10px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                            >
                              {busy ? '...' : 'Poner esta'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (hasSingle && cand.prodPhoto.url) {
                  // Backward-compat: server returned only the single-photo shape.
                  return (
                    <div className="rounded-xl border border-emerald-200 bg-white p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 mb-2">
                        PROD (foto real en registro)
                      </div>
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={cand.prodPhoto.url}
                          alt={`${variety} (PROD)`}
                          className="h-20 w-20 object-cover rounded-lg border border-slate-200"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] text-slate-400 font-mono break-all">
                            {cand.prodPhoto.url}
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void apply(cand.prodPhoto.url as string, 'prod_photo')}
                            className="mt-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 rounded-xl shadow-sm transition-colors disabled:opacity-50"
                          >
                            {busy ? 'Aplicando...' : 'Poner esta'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                // No PROD photo available.
                return (
                  <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-[11px] text-slate-400">
                    {cand.prodPhoto.state === 'unknown'
                      ? 'PROD no verificable ahora -> usar stock libre o pedir'
                      : 'Sin foto PROD real -> elegir de stock libre o pedir'}
                  </div>
                );
              })()}

              {/* (b) free stock leads — open search, paste chosen url back */}
              {cand.freeCandidates.length > 0 && (
                <div className="rounded-xl border border-slate-100 bg-white p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
                    Stock libre (buscar, verificar, pegar url)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cand.freeCandidates.map((c) => (
                      <a
                        key={c.provider}
                        href={c.searchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setPasteSource(c.provider.toLowerCase())}
                        title={c.license}
                        className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 px-3 py-1.5 rounded-xl transition-colors"
                      >
                        {c.provider} ↗
                      </a>
                    ))}
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <input
                      type="url"
                      value={pasteUrl}
                      onChange={(e) => setPasteUrl(e.target.value)}
                      placeholder="Pegar url de la foto elegida (https://...)"
                      className="flex-1 text-sm rounded-lg border border-slate-200 px-2.5 py-2 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    />
                    <button
                      type="button"
                      disabled={busy || !/^https?:\/\//i.test(pasteUrl.trim())}
                      onClick={() => void apply(pasteUrl.trim(), pasteSource ?? 'free_stock')}
                      className="shrink-0 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 rounded-xl shadow-sm transition-colors disabled:opacity-50"
                    >
                      {busy ? 'Aplicando...' : 'Poner'}
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1.5 leading-snug">
                    Verificar que la foto ES la variedad y la licencia antes de aplicar (no se
                    inventa una foto).
                  </div>
                </div>
              )}

              {/* (c) AI rung — honest availability */}
              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  AI
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  {cand.ai.available
                    ? `Disponible (${cand.ai.provider})`
                    : cand.ai.reason}
                </div>
              </div>

              {/* Ninguna me gusta -> reject + reason, or un-gettable queue */}
              {!showReject ? (
                <button
                  type="button"
                  onClick={() => setShowReject(true)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 underline underline-offset-2"
                >
                  Ninguna me gusta
                </button>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Por que ninguna sirve (el motor aprende)
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    placeholder="Ej: ninguna es la variedad correcta / calidad pobre..."
                    className="w-full text-sm rounded-lg border border-slate-200 px-2.5 py-2 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || rejectReason.trim().length < 3}
                      onClick={() => void reject(rejectReason, null)}
                      className="text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
                    >
                      Solo registrar motivo
                    </button>
                    <span className="text-[10px] text-slate-400">o pedir la foto:</span>
                    {(cand.ungettableQueueReasons ?? []).map((qr) => (
                      <button
                        key={qr}
                        type="button"
                        disabled={busy || rejectReason.trim().length < 3}
                        onClick={() => void reject(rejectReason, qr)}
                        className="text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
                      >
                        {QUEUE_LABELS[qr] ?? qr}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Motivo requerido (min 3 caracteres) para registrar o encolar.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
