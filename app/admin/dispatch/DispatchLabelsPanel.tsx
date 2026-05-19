'use client';
// Labels & Confirmations panel for /admin/dispatch.
// v1 | 2026-05-19 | Job_PM Phase F [V8 SHADOW]
//
// Lets admin:
//   - Upload a FedEx label PDF for one dispatch (multipart -> dispatch-labels bucket).
//   - View the uploaded label via a signed URL.
//   - Flip driver_pickup_confirmed (with a wa.me deep link to text the driver).
//   - Flip fedex_confirmed (depot receipt).

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  dispatchId: string;
  labelStoragePath: string | null;
  labelSignedUrl: string | null;
  driverPickupConfirmed: boolean;
  driverPickupAt: string | null;
  fedexConfirmed: boolean;
  fedexAt: string | null;
  driverWhatsappPhone?: string | null; // E.164 without +; UI builds wa.me/<digits>
}

export default function DispatchLabelsPanel({
  dispatchId,
  labelStoragePath,
  labelSignedUrl,
  driverPickupConfirmed,
  driverPickupAt,
  fedexConfirmed,
  fedexAt,
  driverWhatsappPhone,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  async function upload() {
    if (!file) return;
    setBusy('upload');
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/admin/dispatch/${dispatchId}/label-upload`, {
        method: 'POST',
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.detail ? `${j.error}: ${j.detail}` : (j.error ?? `HTTP ${res.status}`));
      }
      setFile(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setBusy(null);
    }
  }

  async function confirm(kind: 'driver_pickup' | 'fedex', value: boolean) {
    setBusy(kind);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/dispatch/${dispatchId}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, value }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.detail ? `${j.error}: ${j.detail}` : (j.error ?? `HTTP ${res.status}`));
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'confirm failed');
    } finally {
      setBusy(null);
    }
  }

  const waDigits = (driverWhatsappPhone ?? '').replace(/\D/g, '');

  return (
    <div className="space-y-3">
      {/* FedEx label */}
      <div className="border border-slate-100 rounded p-2">
        <p className="text-xs font-semibold text-slate-700 mb-1">FedEx label</p>
        {labelStoragePath ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-slate-600 truncate" title={labelStoragePath}>
              {labelStoragePath.split('/').pop()}
            </span>
            {labelSignedUrl ? (
              <a
                href={labelSignedUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                Open PDF
              </a>
            ) : (
              <span className="text-xs text-slate-400 italic">signed URL pending</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-xs"
              disabled={busy !== null}
            />
            <button
              type="button"
              onClick={upload}
              disabled={!file || busy !== null}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-2 py-0.5 rounded disabled:opacity-50"
            >
              {busy === 'upload' ? 'Uploading...' : 'Upload PDF'}
            </button>
          </div>
        )}
      </div>

      {/* Driver pickup */}
      <div className="border border-slate-100 rounded p-2">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-xs font-semibold text-slate-700">Driver pickup</p>
          {waDigits && (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-emerald-700 hover:underline"
            >
              WhatsApp driver -&gt;
            </a>
          )}
        </div>
        {driverPickupConfirmed ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-emerald-700 font-semibold">
              + Confirmed{driverPickupAt ? ` at ${new Date(driverPickupAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
            </span>
            <button
              type="button"
              onClick={() => confirm('driver_pickup', false)}
              disabled={busy !== null}
              className="text-xs text-slate-500 hover:text-red-600 underline"
            >
              Undo
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => confirm('driver_pickup', true)}
            disabled={busy !== null}
            className="text-xs font-medium border border-slate-200 hover:border-slate-400 text-slate-700 px-2 py-0.5 rounded disabled:opacity-50"
          >
            {busy === 'driver_pickup' ? 'Saving...' : 'Mark picked up'}
          </button>
        )}
      </div>

      {/* FedEx confirmed */}
      <div className="border border-slate-100 rounded p-2">
        <p className="text-xs font-semibold text-slate-700 mb-1">FedEx depot received</p>
        {fedexConfirmed ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-emerald-700 font-semibold">
              + Confirmed{fedexAt ? ` at ${new Date(fedexAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
            </span>
            <button
              type="button"
              onClick={() => confirm('fedex', false)}
              disabled={busy !== null}
              className="text-xs text-slate-500 hover:text-red-600 underline"
            >
              Undo
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={fedexConfirmed}
              onChange={(e) => confirm('fedex', e.target.checked)}
              disabled={busy !== null}
            />
            FedEx confirmed receipt at depot
          </label>
        )}
      </div>

      {err && <p className="text-xs text-red-600 font-mono">{err}</p>}
    </div>
  );
}
