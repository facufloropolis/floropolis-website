'use client';
// DispatchTodayPanel — full 3-column today layout matching /mockups/admin-dispatch.
// v2 | 2026-05-28 | Job_PM dispatch-v1-refactor [V8 SHADOW]
//
// Client component so the left column cards can expand/collapse and right/middle
// can run API calls without full-page navigation.
//
// v2 (2026-05-28): FedEx clarification banner moved out of this component — it
// now lives in /admin/dispatch page header so it shows on Today / Queued /
// Historical views. The Yesterday's Arrivals card (server-fetched) is passed
// in via the `yesterdayArrivalsSlot` prop so the middle column renders it
// without breaking the client/server boundary.

import { useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import DispatchPipelineStepper from './DispatchPipelineStepper';

// ── Serialisable prop types (server → client) ─────────────────────────────

export interface TodayComm {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  recipient: string | null;
  sent_at: string | null;
  notes: string | null;
}

export interface TodaySku {
  name: string;
  qty: number;
}

export interface TodayRow {
  orderId: number;
  orderNumber: string;
  businessName: string;
  city: string | null;
  state: string | null;
  farm: string;
  boxesCount: number;
  totalQty: number;
  dispatchId: string | null;
  status: string;
  trackingNumber: string | null;
  labelUrl: string | null;
  labelSignedUrl: string | null;
  driverPickupConfirmed: boolean;
  driverPickupAt: string | null;
  fedexConfirmed: boolean;
  fedexAt: string | null;
  whatsappPhone: string | null;
  comms: TodayComm[];
  skus: TodaySku[];
}

export interface TodayProspect {
  id: string | number;
  business_name: string;
  contact_name: string | null;
  city: string | null;
  state: string | null;
}

interface Props {
  rows: TodayRow[];
  totalBoxes: number;
  todayLabel: string;
  activePipelineStep: number;
  prospects: TodayProspect[];
  defaultDispatchId: string | null;
  /** Server-rendered Yesterday's Arrivals card. Optional: omitted on
   *  Queued / Historical day-blocks where yesterday context is irrelevant. */
  yesterdayArrivalsSlot?: ReactNode;
  /** Optional date label rendered above the stats line (used by Queued /
   *  Historical multi-day grouping). When omitted the panel renders without
   *  a date header (Today view). */
  dayHeading?: string | null;
}

// ── Status helpers ────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  awaiting_pack: { cls: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Awaiting pack' },
  packed:        { cls: 'bg-blue-50 text-blue-800 border-blue-200',     label: 'Packed' },
  label_printed: { cls: 'bg-violet-50 text-violet-800 border-violet-200', label: 'Label printed' },
  picked_up:     { cls: 'bg-amber-50 text-amber-800 border-amber-200',  label: 'Picked up' },
  in_transit:    { cls: 'bg-indigo-50 text-indigo-800 border-indigo-200', label: 'In transit' },
  delivered:     { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'Delivered' },
  exception:     { cls: 'bg-red-50 text-red-800 border-red-200',        label: 'Exception' },
};

function boxStatus(row: TodayRow): 'confirmed' | 'pending' | 'needs_followup' {
  if (row.status === 'exception') return 'needs_followup';
  if (row.trackingNumber) return 'confirmed';
  return 'pending';
}

function farmEmailSent(comms: TodayComm[]): boolean {
  return comms.some((c) => c.channel === 'email' && c.direction === 'outbound');
}

// ── Main component ────────────────────────────────────────────────────────

export default function DispatchTodayPanel({
  rows,
  totalBoxes,
  todayLabel,
  activePipelineStep,
  prospects,
  yesterdayArrivalsSlot,
  dayHeading,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<number>>(
    new Set(rows.length > 0 ? [rows[0].orderId] : []),
  );
  const [sampleBoxModal, setSampleBoxModal] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  const [labelFiles, setLabelFiles] = useState<Record<string, File | null>>({});
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const below2Box = totalBoxes < 2;
  const uniqueFarms = new Set(rows.map((r) => r.farm)).size;

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function setBusy1(key: string, val: boolean) {
    setBusy((p) => ({ ...p, [key]: val }));
  }
  function setErr1(key: string, msg: string) {
    setErr((p) => ({ ...p, [key]: msg }));
  }

  async function confirmDispatch(dispatchId: string, kind: 'driver_pickup' | 'fedex', value: boolean) {
    const key = `${dispatchId}:${kind}`;
    setBusy1(key, true);
    setErr1(key, '');
    try {
      const res = await fetch(`/api/admin/dispatch/${dispatchId}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, value }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setErr1(key, e instanceof Error ? e.message : 'error');
    } finally {
      setBusy1(key, false);
    }
  }

  async function uploadBatch() {
    if (batchFiles.length === 0) return;
    const key = 'batch-upload';
    setBusy1(key, true);
    setErr1(key, '');
    try {
      const dispatches = rows.filter(r => r.dispatchId && !r.labelUrl);
      for (let i = 0; i < Math.min(batchFiles.length, dispatches.length); i++) {
        const fd = new FormData();
        fd.append('file', batchFiles[i]);
        await fetch(`/api/admin/dispatch/${dispatches[i].dispatchId}/label-upload`, { method: 'POST', body: fd });
      }
      setBatchFiles([]);
      router.refresh();
    } catch (e) {
      setErr1(key, e instanceof Error ? e.message : 'batch upload error');
    } finally {
      setBusy1(key, false);
    }
  }

  async function addSampleBox() {
    if (!selectedProspect) return;
    const key = 'sample-box';
    setBusy1(key, true);
    setErr1(key, '');
    try {
      const res = await fetch('/api/admin/dispatch/sample-box', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prospect_id: selectedProspect }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setSampleBoxModal(false);
      setSelectedProspect(null);
      router.refresh();
    } catch (e) {
      setErr1(key, e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy1(key, false);
    }
  }

  async function uploadLabel(dispatchId: string) {
    const file = labelFiles[dispatchId];
    if (!file) return;
    const key = `${dispatchId}:upload`;
    setBusy1(key, true);
    setErr1(key, '');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/admin/dispatch/${dispatchId}/label-upload`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setLabelFiles((p) => ({ ...p, [dispatchId]: null }));
      router.refresh();
    } catch (e) {
      setErr1(key, e instanceof Error ? e.message : 'upload error');
    } finally {
      setBusy1(key, false);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const fedexMessage =
    `Hi team, Floropolis dispatch for ${todayLabel}: ${totalBoxes} box${totalBoxes === 1 ? '' : 'es'} total from ${uniqueFarms} farm${uniqueFarms === 1 ? '' : 's'}. Please confirm receipt at depot tonight before 10pm ECT. Thank you.`;

  const fedexMailto = `mailto:edgar.freire@fedex.com,dromero@entregas.ec?subject=Floropolis%20Dispatch%20${encodeURIComponent(todayLabel)}&body=${encodeURIComponent(fedexMessage)}`;

  const anyFedexConfirmed = rows.some((r) => r.fedexConfirmed);

  return (
    <div className="space-y-5">
      {/* Day heading (Queued / Historical multi-day grouping). */}
      {dayHeading && (
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide border-b border-slate-200 pb-1.5">
          {dayHeading}
        </h2>
      )}

      {/* Header strip */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 text-sm text-slate-500 flex-wrap">
          <span>
            {rows.length} order{rows.length === 1 ? '' : 's'} · {totalBoxes} box{totalBoxes === 1 ? '' : 'es'} · {uniqueFarms} farm{uniqueFarms === 1 ? '' : 's'}
          </span>
          {below2Box ? (
            <span className="bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-lg text-xs font-semibold">
              ⚠ Below 2-box minimum
            </span>
          ) : (
            <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-lg text-xs font-semibold">
              ✓ 2-box minimum met ({totalBoxes} boxes)
            </span>
          )}
        </div>
      </div>

      {/* 3-column grid */}
      <div className="grid lg:grid-cols-3 gap-5">

        {/* ── LEFT: Today's dispatch ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Today&apos;s Dispatch</h2>
            {below2Box && (
              <button
                type="button"
                onClick={() => setSampleBoxModal(true)}
                className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                + Sample Box
              </button>
            )}
          </div>

          {/* Box summary table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">BOX</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">FARM</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">RECIPIENT</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.flatMap((r) => {
                  const bs = boxStatus(r);
                  return Array.from({ length: Math.max(1, r.boxesCount) }, (_, bi) => (
                    <tr key={`${r.orderId}-${bi}`} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-700">#{bi + 1}</td>
                      <td className="px-4 py-2.5 text-slate-600 truncate max-w-[80px]" title={r.farm}>{r.farm.split(' ')[0]}</td>
                      <td className="px-4 py-2.5 text-slate-600 truncate max-w-[80px]" title={r.businessName}>{r.businessName.split(' ')[0]}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold border ${
                            bs === 'confirmed'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : bs === 'needs_followup'
                              ? 'bg-red-50 text-red-800 border-red-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {bs === 'confirmed' ? '✓' : bs === 'needs_followup' ? '🚨' : '⏳'}
                        </span>
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>

          {/* Shipment cards (expandable) */}
          <div className="space-y-2">
            {rows.map((r) => {
              const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.awaiting_pack;
              const isExp = expanded.has(r.orderId);
              return (
                <div key={r.orderId} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50"
                    onClick={() => toggleExpand(r.orderId)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{r.businessName}</p>
                      <p className="text-xs text-slate-400">
                        {r.farm} · {r.boxesCount} box{r.boxesCount === 1 ? '' : 'es'} · {r.totalQty} stems
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className="text-slate-300 text-xs">{isExp ? '▲' : '▼'}</span>
                  </div>
                  {isExp && r.skus.length > 0 && (
                    <div className="border-t border-slate-100 px-4 py-3">
                      <table className="w-full text-xs">
                        <thead className="text-slate-400">
                          <tr>
                            <th className="text-left pb-1.5 font-semibold">Product</th>
                            <th className="text-right pb-1.5 font-semibold">Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {r.skus.map((s, si) => (
                            <tr key={si}>
                              <td className="py-1.5 text-slate-600 truncate max-w-[160px]">{s.name}</td>
                              <td className="py-1.5 text-right text-slate-500">{s.qty}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-400 font-mono">
                        <span>Order: {r.orderNumber}</span>
                        {r.trackingNumber && <span className="ml-3">Tracking: {r.trackingNumber}</span>}
                      </div>
                    </div>
                  )}
                  {isExp && r.skus.length === 0 && (
                    <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400 italic">
                      No SKU detail available
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── MIDDLE: Communications ── */}
        <div className="space-y-4">
          <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Communications</h2>

          {/* Farm emails card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-2">
              📧 Farm emails
              <span className="text-slate-400 font-normal">(Rose auto-drafts via Gmail API)</span>
            </p>
            <div className="space-y-2">
              {rows.map((r) => {
                const sent = farmEmailSent(r.comms);
                const lastComm = r.comms.find((c) => c.channel === 'email' && c.direction === 'outbound');
                return (
                  <div key={r.orderId} className="border border-slate-100 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900">{r.farm}</p>
                        <p className="text-xs text-slate-400">
                          {r.boxesCount} box{r.boxesCount === 1 ? '' : 'es'} → {r.businessName}
                        </p>
                        {lastComm?.sent_at && (
                          <p className="text-xs text-slate-400">
                            Sent {new Date(lastComm.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      {sent ? (
                        <span className="text-xs text-emerald-600 font-semibold shrink-0">✓ Sent</span>
                      ) : (
                        <a
                          href="https://mail.google.com/mail/u/0/#drafts"
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0"
                        >
                          Open Gmail drafts →
                        </a>
                      )}
                    </div>
                    <div
                      className={`text-xs px-1.5 py-0.5 rounded inline-block ${
                        sent
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {sent ? '📧 Sent' : '⏸ Draft pending (Rose)'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* FedEx notification card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-700 mb-3">📦 FedEx notification</p>
            <div className="text-xs text-slate-500 space-y-1 mb-3">
              <p>To: edgar.freire@fedex.com, dromero@entregas.ec</p>
              <p className="bg-slate-50 rounded-lg p-2 text-slate-600 italic">
                &ldquo;{fedexMessage}&rdquo;
              </p>
            </div>
            {anyFedexConfirmed ? (
              <p className="text-xs text-emerald-600 font-semibold">✓ FedEx depot confirmed receipt</p>
            ) : (
              <a
                href={fedexMailto}
                className="inline-block text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-slate-700 transition-colors"
              >
                Send FedEx notification
              </a>
            )}
          </div>

          {/* Yesterday's Arrivals — server-rendered, passed in via prop. */}
          {yesterdayArrivalsSlot}
        </div>

        {/* ── RIGHT: Labels & Confirmations ── */}
        <div className="space-y-4">
          <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Labels &amp; Confirmations</h2>

          {/* FedEx labels card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-700 mb-3">📋 FedEx labels</p>
            <div className="space-y-2">
              <div className="mb-3 pb-3 border-b border-slate-100">
                <p className="text-xs text-slate-500 mb-1.5 font-medium">Upload all labels at once</p>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    onChange={e => setBatchFiles(Array.from(e.target.files ?? []))}
                    className="text-xs flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    disabled={batchFiles.length === 0 || !!busy['batch-upload']}
                    onClick={uploadBatch}
                    className="text-xs font-semibold bg-slate-900 text-white px-2.5 py-1 rounded-lg hover:bg-slate-700 disabled:opacity-40 shrink-0"
                  >
                    {busy['batch-upload'] ? `Uploading…` : `Upload ${batchFiles.length > 0 ? batchFiles.length + ' PDF' + (batchFiles.length > 1 ? 's' : '') : 'PDFs'}`}
                  </button>
                </div>
                {err['batch-upload'] && <p className="text-xs text-red-600 mt-1">{err['batch-upload']}</p>}
              </div>
              {rows.map((r) => {
                if (!r.dispatchId) {
                  return (
                    <div key={r.orderId} className="border border-slate-100 rounded-lg px-3 py-2 text-xs text-slate-400 italic">
                      {r.businessName}: dispatch not initialized
                    </div>
                  );
                }
                const uploadKey = `${r.dispatchId}:upload`;
                if (r.labelUrl) {
                  const fname = r.labelUrl.split('/').pop() ?? 'label.pdf';
                  return (
                    <div key={r.orderId} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                      <span className="text-xs font-mono text-slate-600 truncate">{fname}</span>
                      {r.labelSignedUrl ? (
                        <a href={r.labelSignedUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-700 hover:underline ml-2 shrink-0">
                          Open PDF
                        </a>
                      ) : (
                        <span className="text-xs text-emerald-600 font-semibold ml-2 shrink-0">✓ Uploaded</span>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={r.orderId} className="border-2 border-dashed border-slate-200 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1 font-medium">{r.businessName}</p>
                    <p className="text-xs text-slate-400 mb-2">
                      Expected: {r.boxesCount} PDF{r.boxesCount === 1 ? '' : 's'} for {r.boxesCount} box{r.boxesCount === 1 ? '' : 'es'}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="application/pdf"
                        ref={(el) => { fileRefs.current[r.dispatchId!] = el; }}
                        onChange={(e) => setLabelFiles((p) => ({ ...p, [r.dispatchId!]: e.target.files?.[0] ?? null }))}
                        className="text-xs flex-1 min-w-0"
                        disabled={!!busy[uploadKey]}
                      />
                      <button
                        type="button"
                        onClick={() => uploadLabel(r.dispatchId!)}
                        disabled={!labelFiles[r.dispatchId!] || !!busy[uploadKey]}
                        className="text-xs font-semibold bg-slate-900 text-white px-2.5 py-1 rounded-lg hover:bg-slate-700 disabled:opacity-40 shrink-0"
                      >
                        {busy[uploadKey] ? 'Uploading…' : 'Upload'}
                      </button>
                    </div>
                    {err[uploadKey] && <p className="text-xs text-red-600 mt-1">{err[uploadKey]}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Driver pickup confirmation card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-700">Driver pickup confirmation</p>
              <span className="text-xs text-slate-400">v2: auto from WhatsApp</span>
            </div>
            <div className="space-y-2 mb-3">
              {rows.map((r) => {
                if (!r.dispatchId) return null;
                const dKey = `${r.dispatchId}:driver_pickup`;
                const waDigits = (r.whatsappPhone ?? '').replace(/\D/g, '');
                return (
                  <div key={r.orderId} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{r.farm}</p>
                      <p className="text-xs text-slate-400 truncate">{r.businessName}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {waDigits && (
                        <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer"
                          className="text-xs text-emerald-700 hover:underline">
                          WhatsApp
                        </a>
                      )}
                      {r.driverPickupConfirmed ? (
                        <span className="text-xs text-emerald-600 font-semibold">✓ Picked up</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => confirmDispatch(r.dispatchId!, 'driver_pickup', true)}
                          disabled={!!busy[dKey]}
                          className="text-xs border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg font-medium hover:border-slate-400 disabled:opacity-50"
                        >
                          {busy[dKey] ? 'Saving…' : 'Mark picked up'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {rows.some((r) => r.driverPickupConfirmed) && (
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">
                <p className="font-semibold text-slate-700 mb-1">Auto-confirmation (v2 preview)</p>
                <p className="text-emerald-600">
                  &ldquo;Driver pickup confirmed via WhatsApp&rdquo; — [dromero@entregas.ec]
                </p>
                <p className="text-slate-400 mt-1">Will appear automatically once WhatsApp integration is active.</p>
              </div>
            )}
          </div>

          {/* FedEx depot receipt (one per order) */}
          {rows.some((r) => r.dispatchId) && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-700 mb-3">📦 FedEx depot receipt</p>
              <div className="space-y-2">
                {rows.map((r) => {
                  if (!r.dispatchId) return null;
                  const fKey = `${r.dispatchId}:fedex`;
                  return (
                    <div key={r.orderId} className="flex items-center justify-between py-1">
                      <p className="text-xs text-slate-700 truncate">{r.businessName}</p>
                      {r.fedexConfirmed ? (
                        <span className="text-xs text-emerald-600 font-semibold ml-2 shrink-0">✓ Confirmed</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => confirmDispatch(r.dispatchId!, 'fedex', true)}
                          disabled={!!busy[fKey]}
                          className="text-xs border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg font-medium hover:border-slate-400 disabled:opacity-50 ml-2 shrink-0"
                        >
                          {busy[fKey] ? 'Saving…' : 'Mark received'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Customs */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500 space-y-2">
            <p className="font-semibold text-slate-700">Customs</p>
            <div className="flex justify-between"><span>ISS/NSR</span><span className="font-semibold text-slate-700">PPQ 587 active ✓</span></div>
            <div className="flex justify-between"><span>ETD</span><span className="font-semibold text-slate-700">Enabled ✓</span></div>
            <div className="flex justify-between"><span>Broker</span><span className="font-semibold text-slate-700">Andri Molina, Doral FL</span></div>
          </div>
        </div>
      </div>

      {/* Pipeline stepper — full width */}
      <DispatchPipelineStepper activeStep={activePipelineStep} />

      {/* Sample box modal */}
      {sampleBoxModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="font-bold text-slate-900 text-lg mb-1">Insert Sample Box</h3>
            <p className="text-slate-500 text-sm mb-4">
              Add a sample box to reach the 2-box minimum from Ecuador. Pick a prospect to send it to.
            </p>
            <div className="space-y-2 mb-5">
              {prospects.map((p) => (
                <button
                  key={String(p.id)}
                  onClick={() => setSelectedProspect(String(p.id))}
                  className={`w-full text-left border rounded-xl px-4 py-3 transition-all ${
                    selectedProspect === String(p.id)
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">{p.business_name}</p>
                  <p className="text-xs text-slate-400">
                    {p.contact_name ? `Contact: ${p.contact_name} · ` : ''}
                    {p.city}{p.state ? `, ${p.state}` : ''} · Sample box ($0 — marketing)
                  </p>
                </button>
              ))}
              {prospects.length === 0 && (
                <p className="text-sm text-slate-400 italic">No eligible prospects in system.</p>
              )}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setSampleBoxModal(false); setSelectedProspect(null); }}
                className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:border-slate-400"
              >
                Cancel
              </button>
              <button
                disabled={!!busy['sample-box'] || !selectedProspect}
                onClick={addSampleBox}
                className="text-sm px-5 py-2 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40 hover:bg-emerald-700"
              >
                Add to dispatch →
              </button>
            </div>
            {err['sample-box'] && <p className="text-xs text-red-600 mt-1">{err['sample-box']}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
