// DispatchDateControl — compact card for the CEO to reschedule the batch dispatch date.
// v1 | 2026-06-11 | Job_PM (CPO)
//
// Default date: today+1 (client-side, computed on mount). No extra fetch needed —
// the CEO sees "salida prevista manana" and can override to any date he wants.
//
// On POST /api/admin/samples/reschedule { date, reason } (no ids = whole batch):
//   - success: shows "Reprogramado a <date>" + reloads page so all panels refresh
//   - failure: shows inline error line (no crash)
//
// Style: emerald-600/slate, rounded-2xl, ASCII-clean Spanish.

'use client';

import { useState, useEffect } from 'react';

const REASONS = [
  'Vendor sin disponibilidad',
  'Solo un pedido ese dia',
  'Otro',
] as const;

type RescheduleReason = typeof REASONS[number];

function todayPlusOne(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function DispatchDateControl() {
  const [date, setDate] = useState<string>('');
  const [reason, setReason] = useState<RescheduleReason>(REASONS[0]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [confirmedDate, setConfirmedDate] = useState<string>('');

  // Compute default date on mount (client-side only, avoids SSR mismatch)
  useEffect(() => {
    setDate(todayPlusOne());
  }, []);

  async function handleReschedule() {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setStatus('error');
      setErrorMsg('Fecha invalida — usar formato YYYY-MM-DD');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/samples/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, reason }),
      });
      const json = (await res.json()) as { ok: boolean; updated?: number; error?: string };
      if (!res.ok || !json.ok) {
        setStatus('error');
        setErrorMsg(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setStatus('success');
      setConfirmedDate(date);
      // Brief pause so the user sees the confirmation, then reload
      setTimeout(() => {
        window.location.reload();
      }, 1400);
    } catch (err: unknown) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Error de red');
    }
  }

  // Format YYYY-MM-DD -> DD/MM/YYYY for display
  function fmtDisplay(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
            Fecha de envio del batch
          </p>
          {date && status !== 'success' && (
            <p className="text-2xl font-bold text-slate-800 leading-none">
              {fmtDisplay(date)}
            </p>
          )}
          {status === 'success' && confirmedDate && (
            <p className="text-2xl font-bold text-emerald-600 leading-none">
              {fmtDisplay(confirmedDate)}
            </p>
          )}
        </div>
        <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
          salida prevista
        </span>
      </div>

      {/* Success banner */}
      {status === 'success' && (
        <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs text-emerald-700 font-semibold">
          Reprogramado a {fmtDisplay(confirmedDate)} — recargando...
        </div>
      )}

      {/* Controls */}
      {status !== 'success' && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5">
          {/* Date input */}
          <div className="flex-1 min-w-0">
            <label className="block text-xs text-slate-500 mb-1">
              Nueva fecha
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setStatus('idle');
                setErrorMsg('');
              }}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              disabled={status === 'loading'}
            />
          </div>

          {/* Reason select */}
          <div className="flex-1 min-w-0">
            <label className="block text-xs text-slate-500 mb-1">
              Motivo
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as RescheduleReason)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
              disabled={status === 'loading'}
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Submit button */}
          <div className="shrink-0">
            <button
              onClick={handleReschedule}
              disabled={status === 'loading' || !date}
              className={[
                'w-full sm:w-auto text-sm font-semibold px-4 py-2 rounded-lg transition-colors',
                status === 'loading' || !date
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
              ].join(' ')}
            >
              {status === 'loading' ? 'Guardando...' : 'Reprogramar dispatch'}
            </button>
          </div>
        </div>
      )}

      {/* Error line */}
      {status === 'error' && errorMsg && (
        <p className="mt-2 text-xs text-red-600 font-medium">
          ! {errorMsg}
        </p>
      )}
    </div>
  );
}
