// LabelsForTomorrow — panel showing approved-pending sample boxes + FedEx CSV download.
// v2 | 2026-06-10 | Job_PM (CPO)
//
// Fetches /api/admin/samples/labels?json=1 on mount, lists approved-pending boxes
// (recipient, REF, weight, dims, address) with a count, and a prominent
// "Descargar labels (CSV)" button that hits /api/admin/samples/labels to download
// a FedEx-ready 26-column CSV (opens in Google Sheets / uploads directly to FedEx).
//
// Honest empty state: "Sin cajas aprobadas todavia — aproba arriba y aparecen aca."
// Style: emerald-600 / slate, ASCII-clean Spanish, rounded-2xl.

'use client';

import { useEffect, useState } from 'react';
import type { SampleLabelRow } from '@/app/admin/samples/labelsBuild';

interface ApiResponse {
  rows: SampleLabelRow[];
  rowCount: number;
  error: string | null;
  filename: string;
  date: string;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

function AddressLine({ row }: { row: SampleLabelRow }) {
  if (row.notes.includes('ADDRESS MISSING') || row.notes.includes('NO ZOHO ID')) {
    return (
      <span className="text-amber-500 text-[12px]">
        {row.notes.includes('NO ZOHO ID') ? 'Sin Zoho ID — direccion pendiente' : 'Direccion pendiente'}
      </span>
    );
  }
  const parts = [row.ADR1, row.CITY, row.STATE, row.ZIPCODE].filter(Boolean);
  if (parts.length === 0) {
    return <span className="text-slate-400 text-[12px]">--</span>;
  }
  return (
    <span className="text-slate-600 text-[12px]">{parts.join(', ')}</span>
  );
}

function DimsBadge({ row }: { row: SampleLabelRow }) {
  if (!row.WEIGHT && !row.LENGTH) {
    return (
      <span className="text-[10px] text-amber-500 bg-amber-50 rounded px-1.5 py-0.5">
        DIMS PENDIENTE
      </span>
    );
  }
  const parts: string[] = [];
  if (row.WEIGHT) parts.push(`${row.WEIGHT}kg`);
  if (row.LENGTH && row.WIDTH && row.HEIGHT) parts.push(`${row.LENGTH}x${row.WIDTH}x${row.HEIGHT}cm`);
  return (
    <span className="text-[10px] text-slate-500 bg-slate-50 rounded px-1.5 py-0.5 font-mono">
      {parts.join(' · ')}
    </span>
  );
}

export default function LabelsForTomorrow() {
  const [status, setStatus] = useState<Status>('idle');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setStatus('loading');
    fetch('/api/admin/samples/labels?json=1', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => String(res.status));
          setFetchError(`Error ${res.status}: ${text.slice(0, 120)}`);
          setStatus('error');
          return;
        }
        const json = (await res.json()) as ApiResponse;
        setData(json);
        setStatus('done');
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });
  }, []);

  function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    // Trigger a real file download by navigating to the CSV endpoint.
    // The file is FedEx 26-column format, ready to upload directly to FedEx.
    const a = document.createElement('a');
    a.href = '/api/admin/samples/labels';
    a.download = data?.filename ?? 'floropolis-fedex-labels.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloading(false), 1500);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
        <div>
          <div className="text-[13px] font-semibold text-slate-700 uppercase tracking-wide">
            Labels para mandar
          </div>
          {status === 'done' && data && (
            <div className="text-[12px] text-slate-400 mt-0.5">
              {data.rowCount === 0
                ? 'Sin cajas aprobadas'
                : `${data.rowCount} caja${data.rowCount === 1 ? '' : 's'} aprobada${data.rowCount === 1 ? '' : 's'} — listas para label FedEx`}
            </div>
          )}
        </div>

        {/* Download button — always visible, disabled when no rows */}
        <button
          onClick={handleDownload}
          disabled={
            downloading ||
            status !== 'done' ||
            !data ||
            data.rowCount === 0
          }
          className={[
            'flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors',
            status === 'done' && data && data.rowCount > 0
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed',
          ].join(' ')}
        >
          {downloading ? (
            <>
              <span className="inline-block h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Descargando...
            </>
          ) : (
            'Descargar labels (CSV)'
          )}
        </button>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {/* Loading */}
        {status === 'loading' || status === 'idle' ? (
          <div className="flex items-center gap-2 py-6 justify-center text-slate-400 text-[13px]">
            <span className="inline-block h-4 w-4 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
            Cargando cajas aprobadas...
          </div>
        ) : null}

        {/* Fetch error */}
        {status === 'error' ? (
          <div className="py-6 text-center text-[13px] text-red-500">
            Error al cargar:{' '}
            <span className="font-mono text-[11px]">{fetchError ?? 'unknown'}</span>
          </div>
        ) : null}

        {/* Data error (from API but 200) */}
        {status === 'done' && data?.error ? (
          <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-700">
            Aviso del sistema: {data.error}
          </div>
        ) : null}

        {/* Empty state */}
        {status === 'done' && data && data.rowCount === 0 ? (
          <div className="py-8 text-center text-[13px] text-slate-400">
            Sin cajas aprobadas todavia &mdash; aproba arriba y aparecen aca.
          </div>
        ) : null}

        {/* Row list */}
        {status === 'done' && data && data.rowCount > 0 ? (
          <ul className="divide-y divide-slate-100">
            {data.rows.map((row, i) => (
              <li key={row.REF + '-' + i} className="py-3 flex items-start gap-3">
                {/* Index badge */}
                <div className="mt-0.5 flex-shrink-0 h-6 w-6 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold flex items-center justify-center">
                  {row.REC}
                </div>

                {/* Main info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-slate-800">
                      {row.recipient_name || '--'}
                    </span>
                    {row.flora_score != null && (
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5">
                        FLORA {row.flora_score}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 bg-slate-50 rounded px-1.5 py-0.5">
                      {row.box_type}
                    </span>
                    <DimsBadge row={row} />
                  </div>

                  {/* REF */}
                  <div className="mt-0.5">
                    <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">
                      REF: {row.REF}
                    </span>
                  </div>

                  {/* Address */}
                  <div className="mt-0.5">
                    <AddressLine row={row} />
                  </div>

                  {row.zoho_id && (
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Zoho: {row.zoho_id}
                    </div>
                  )}

                  {/* Notes / warnings */}
                  {row.notes && row.notes !== 'VALOR PENDIENTE' && (
                    <div className="text-[11px] text-amber-600 mt-0.5">
                      {row.notes}
                    </div>
                  )}
                </div>

                {/* Updated at */}
                {row.updated_at && (
                  <div className="text-[10px] text-slate-300 flex-shrink-0 mt-1">
                    {row.updated_at.slice(0, 10)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Footer note */}
      {status === 'done' && data && data.rowCount > 0 && (
        <div className="px-5 py-2 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-400">
          CSV FedEx 26 columnas: {data.filename} &mdash; abrilo con Google Sheets o subilo directo a FedEx Ship Manager.
          UNIT VALUE pendiente (requiere farm cost por stem de Rose).
        </div>
      )}
    </div>
  );
}
