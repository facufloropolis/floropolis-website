// Inline "Recuperar imagen" action for an image-lever card whose variety has a
// REAL PROD photo (self-contained loop).
// v2 | 2026-06-09 | Job_PM (CPO)
//
// Posts { variety } to POST /api/admin/supply/recover-image. The route writes
// the recovered PROD photo into BACKUP product_chrome.images for the variety's
// image-GAP SKUs (append/dedupe), CLEARS the missing_image failing gate in
// catalog_classifications, then RE-READS the engine to confirm the lever
// actually stopped firing.
//
// HONESTY RULE (the fix): we only label the result "Loop cerrado" / report
// "publicable" / "breadth +N" when the server confirms the blocking gate
// cleared AND the SKU became publishable (loopClosed && closed > 0). If the
// photo was written but the gate did NOT clear, we report ONLY the honest
// "image_count 0->1 (gate sin cerrar)" -- never a fabricated closure. If the
// server reports recovered:false (no real photo / unreachable / no image gap),
// we fall back to the honest ladder text.
//
// Style: emerald-600 primary, slate scale, ASCII-clean Spanish-leaning copy.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  variety: string;
  // The PROD photo url discovered on the server (shown as the recover source).
  prodUrl: string | null;
}

interface RecoverResult {
  recovered: boolean;
  loopClosed?: boolean;
  reason?: string;
  imageCountBefore?: number;
  imageCountAfter?: number;
  gapSkuCount?: number;
  imagesWritten?: number;
  gatesCleared?: number;
  gateErrors?: number; // SKUs whose gate update failed
  closed?: number; // SKUs whose image lever stopped firing AND are publishable
  nowPublishable?: number;
  url?: string;
}

export default function RecoverImage({ variety, prodUrl }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecoverResult | null>(null);
  const [softFail, setSoftFail] = useState<string | null>(null);

  async function recover() {
    setError(null);
    setSoftFail(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/supply/recover-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ variety }),
      });
      const json = (await res.json().catch(() => ({}))) as RecoverResult & {
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        throw new Error(json.detail ? `${json.error}: ${json.detail}` : json.error ?? `HTTP ${res.status}`);
      }
      if (!json.recovered) {
        // Honest soft-fail: no real PROD photo / unreachable / no image gap.
        setSoftFail(
          json.reason === 'prod_unreachable'
            ? 'PROD no verificable ahora -- sin recuperar'
            : json.reason === 'no_sku_for_variety'
              ? 'sin SKU para esta variedad'
              : json.reason === 'no_image_gap_sku'
                ? 'sin SKU en gap de imagen (ya tienen foto)'
                : 'sin foto PROD real -- usar ladder',
        );
        return;
      }
      setResult(json);
      router.refresh(); // next load re-ranks with the (now possibly cleared) gate
    } catch (e) {
      setError(e instanceof Error ? e.message : 'recover failed');
    } finally {
      setBusy(false);
    }
  }

  // RESULT state.
  if (result) {
    const before = result.imageCountBefore ?? 0;
    const after = result.imageCountAfter ?? 1;
    const closed = result.closed ?? 0;
    const written = result.imagesWritten ?? 0;
    const loopClosed = result.loopClosed === true && closed > 0;

    if (loopClosed) {
      // HONEST CLOSURE: the blocking gate actually cleared AND the SKU(s) became
      // publishable -- confirmed by re-reading the engine. Only here do we say
      // "Loop cerrado" / "breadth".
      return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
            <span aria-hidden>✓</span> Loop cerrado
          </div>
          <div className="text-sm font-semibold text-emerald-800 mt-1 leading-snug">
            imagen recuperada -&gt; image_count {before}-&gt;{after} -&gt; breadth +{closed} publicable
            {closed === 1 ? '' : 's'}
          </div>
          <div className="text-[10px] text-emerald-700 mt-1 leading-snug">
            {closed} SKU{closed === 1 ? '' : 's'} salio del lever de imagen y paso a publicable
            (gate missing_image cerrado, re-medido en el motor)
          </div>
        </div>
      );
    }

    // PHOTO WRITTEN BUT GATE NOT CLEARED: do NOT claim "publicable" / "breadth".
    // Report only the honest image_count change.
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          Foto escrita -- gate sin cerrar
        </div>
        <div className="text-sm font-semibold text-amber-900 mt-1 tabular-nums">
          image_count {before}-&gt;{after}
        </div>
        <div className="text-[10px] text-amber-800 mt-1 leading-snug">
          {written} SKU{written === 1 ? '' : 's'} con foto, pero el gate missing_image no se cerro
          {(result.gateErrors ?? 0) > 0 ? ` (${result.gateErrors} con error de gate)` : ''}.
          No es publicable todavia.
        </div>
      </div>
    );
  }

  // RECOVERABLE state: a real PROD photo exists -> offer the self-contained action.
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
        Solucion verificada
      </div>
      <div className="text-sm font-medium text-emerald-800 mt-1 leading-snug">
        Foto PROD disponible -&gt; recuperar (self-contained)
      </div>
      {prodUrl && (
        <div className="text-[10px] text-slate-400 mt-1 font-mono break-all">
          {prodUrl}
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy}
          onClick={() => void recover()}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 rounded-xl shadow-sm transition-colors disabled:opacity-50"
        >
          {busy ? 'Recuperando...' : 'Recuperar imagen'}
        </button>
        {softFail && (
          <span className="text-[11px] text-slate-500">{softFail}</span>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600 font-mono mt-1.5 break-words">{error}</p>}
    </div>
  );
}
