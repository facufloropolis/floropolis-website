// DispatchSamplesPanel — surfaces approved sample boxes prepared for tomorrow,
// each with a readiness strip (Direccion / Caja / Contenido / validar vendor)
// and a notification line listing exactly what info is still missing.
// v1 | 2026-06-10 | Job_PM (CPO)
//
// Data source: GET /api/admin/samples/approved-boxes (existing endpoint, reused).
// Client component — fetches on mount, no SSR dependency.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ApprovedBox } from '@/app/api/admin/samples/approved-boxes/route';
import DispatchDateControl from '@/app/admin/dispatch/DispatchDateControl';

// ---------------------------------------------------------------------------
// Readiness helpers
// ---------------------------------------------------------------------------

function hasAddress(box: ApprovedBox): boolean {
  return (
    box.ship !== null &&
    box.ship.street.trim().length > 0 &&
    box.ship.city.trim().length > 0 &&
    box.ship.state.trim().length > 0 &&
    box.ship.zip.trim().length > 0
  );
}

function hasCaja(box: ApprovedBox): boolean {
  return box.boxType !== null && box.boxType.trim().length > 0;
}

function hasContenido(box: ApprovedBox): boolean {
  return (
    box.contents.length > 0 &&
    box.contents.some((c) => c.variety.trim().length > 0 && c.stems > 0)
  );
}

function getMissing(box: ApprovedBox): string[] {
  const missing: string[] = [];
  if (!hasAddress(box)) missing.push('direccion');
  if (!hasCaja(box)) missing.push('caja');
  if (!hasContenido(box)) missing.push('contenido');
  return missing;
}

function isReady(box: ApprovedBox): boolean {
  return hasAddress(box) && hasCaja(box) && hasContenido(box);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Chip({
  label,
  ok,
  amber,
}: {
  label: string;
  ok?: boolean;
  amber?: boolean;
}) {
  if (amber) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700">
        <span>~</span>
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
        ok
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-red-50 border-red-200 text-red-600',
      ].join(' ')}
    >
      <span>{ok ? 'v' : 'x'}</span>
      <span>{label}</span>
    </span>
  );
}

function SampleRow({ box }: { box: ApprovedBox }) {
  const ready = isReady(box);
  const missing = getMissing(box);
  const addrOk = hasAddress(box);
  const cajaOk = hasCaja(box);
  const contenidoOk = hasContenido(box);

  // Manual vendor confirmation (JJ/Facu): the vendor confirmed they have the contents.
  const [vendorOk, setVendorOk] = useState(box.vendorConfirmed);
  const [vbusy, setVbusy] = useState(false);
  async function toggleVendor() {
    if (vbusy) return;
    setVbusy(true);
    const next = !vendorOk;
    try {
      const res = await fetch('/api/admin/samples/approved-boxes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: box.id, patch: { vendorConfirmed: next } }),
      });
      if (res.ok) setVendorOk(next);
    } catch {
      /* keep prior state on error */
    }
    setVbusy(false);
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white">
      {/* Top row: name + score + readiness badge */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-semibold text-slate-800 text-sm">
            {box.businessName || '—'}
          </span>
          {box.floraScore !== null && (
            <span className="text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">
              FLORA {box.floraScore}
            </span>
          )}
        </div>
        {ready ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 text-white px-2.5 py-1 rounded-full">
            Listo para enviar
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-red-50 border border-red-200 text-red-700 px-2.5 py-1 rounded-full">
            Info faltante
          </span>
        )}
      </div>

      {/* Readiness strip */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <Chip label="Direccion" ok={addrOk} />
        <Chip label="Caja" ok={cajaOk} />
        <Chip label="Contenido" ok={contenidoOk} />
        <button
          type="button"
          onClick={toggleVendor}
          disabled={vbusy}
          title={vendorOk ? 'Vendor confirmado — click para desmarcar' : 'Marcar que el vendor confirmo el contenido'}
          className={[
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50',
            vendorOk
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100',
          ].join(' ')}
        >
          {vbusy ? '...' : vendorOk ? 'v Vendor confirmo' : 'Marcar: vendor confirmo'}
        </button>
      </div>

      {/* Missing notification */}
      {missing.length > 0 && (
        <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <span className="text-red-600 text-xs font-semibold shrink-0 mt-0.5">!</span>
          <p className="text-xs text-red-700 leading-relaxed">
            <span className="font-semibold">Falta: {missing.join(', ')}</span>
            {' — '}
            <Link
              href="/admin/samples"
              className="underline hover:no-underline font-medium"
            >
              completar en /admin/samples
            </Link>
          </p>
        </div>
      )}

      {/* Address source hint (parsed/missing only) */}
      {addrOk && box.addressSource === 'parsed' && (
        <p className="text-[11px] text-slate-400 mt-2">
          Direccion inferida del perfil FLORA — confirmar en /admin/samples
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface FetchState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  boxes: ApprovedBox[];
  error: string | null;
}

export default function DispatchSamplesPanel() {
  const [state, setState] = useState<FetchState>({
    status: 'idle',
    boxes: [],
    error: null,
  });

  useEffect(() => {
    setState((s) => ({ ...s, status: 'loading' }));
    fetch('/api/admin/samples/approved-boxes', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          setState({ status: 'error', boxes: [], error: `HTTP ${res.status}` });
          return;
        }
        const json = (await res.json()) as { boxes: ApprovedBox[]; error: string | null };
        setState({
          status: 'ok',
          boxes: json.boxes ?? [],
          error: json.error ?? null,
        });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setState({ status: 'error', boxes: [], error: msg });
      });
  }, []);

  const { status, boxes, error } = state;

  const readyCount = boxes.filter(isReady).length;
  const missingCount = boxes.length - readyCount;

  return (
    <section className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6">
      {/* Dispatch date rescheduler — set / move the batch date before downloading labels */}
      <DispatchDateControl />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-base font-semibold text-slate-800">
          Samples preparadas para manana
        </h2>
        {status === 'ok' && (
          <span className="text-xs font-bold bg-emerald-600 text-white px-3 py-1 rounded-full">
            {boxes.length} sample{boxes.length === 1 ? '' : 's'}
          </span>
        )}
        {status === 'loading' && (
          <span className="text-xs text-slate-400 animate-pulse">Cargando...</span>
        )}
      </div>

      {/* Summary line */}
      {status === 'ok' && boxes.length > 0 && (
        <p className="text-xs text-slate-500 mb-4">
          <span className="font-semibold text-emerald-700">{readyCount} de {boxes.length} listas</span>
          {missingCount > 0 && (
            <>
              {' · '}
              <span className="font-semibold text-red-600">{missingCount} con info faltante</span>
            </>
          )}
        </p>
      )}

      {/* States */}
      {status === 'loading' && (
        <div className="text-sm text-slate-400 py-4 text-center">Cargando samples aprobadas...</div>
      )}

      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
          Error al cargar samples: {error ?? 'error desconocido'}
        </div>
      )}

      {status === 'ok' && boxes.length === 0 && (
        <div className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl">
          Sin samples aprobadas todavia —{' '}
          <Link href="/admin/samples" className="text-emerald-700 underline hover:no-underline font-medium">
            aproba en /admin/samples
          </Link>
        </div>
      )}

      {status === 'ok' && boxes.length > 0 && (
        <div className="flex flex-col gap-3">
          {boxes.map((box) => (
            <SampleRow key={box.id} box={box} />
          ))}
        </div>
      )}

      {/* Vendor note */}
      {status === 'ok' && boxes.length > 0 && (
        <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
          "Marcar: vendor confirmo" es manual (JJ o Facu) — confirma que el vendor tiene el contenido antes del envio. Queda registrado con quien y cuando.
        </p>
      )}
    </section>
  );
}
