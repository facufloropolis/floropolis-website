'use client';
// Client islands for the daily dispatch manifest (mockup: /mockups/admin-dispatch).
// v1 | 2026-06-09 | Job_PM dispatch-mockup-rebuild
//
// These render the three mockup panels (Today's Dispatch / Communications /
// Labels & Confirmations) plus the Sample Box modal. All data is passed in as
// props from the server page (read from PROD Rose tables). The interactive
// confirmations (driver pickup, mark arrived, FedEx notify) are LOCAL-ONLY
// optimistic toggles: PROD is HARD READ-ONLY for Job_PM, so we cannot persist
// them. They are clearly labeled "local" so Facu knows they don't write back.

import { useState } from 'react';
import type {
  ManifestBox,
  ManifestFarm,
  ManifestEmail,
  ClientNotification,
} from './DispatchManifestData';

type SbBadgeKind = 'ready' | 'received' | 'delivered' | 'pending';

function sbBadge(box: ManifestBox): { kind: SbBadgeKind; cls: string; label: string } {
  if (box.deliveredAt) {
    return { kind: 'delivered', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'Delivered' };
  }
  const s = (box.sbStatus ?? '').toUpperCase();
  if (s === 'SB_READY') {
    return { kind: 'ready', cls: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Ready' };
  }
  if (s === 'SB_RECEIVED') {
    return { kind: 'received', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'Received' };
  }
  return { kind: 'pending', cls: 'bg-slate-100 text-slate-600 border-slate-200', label: s ? s.replace('SB_', '') : 'In transit' };
}

function fmtTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ===========================================================================
// LEFT — Today's Dispatch
// ===========================================================================
export function TodayDispatchPanel({
  boxes,
  farms,
  belowMinimum,
  onOpenSampleBox,
}: {
  boxes: ManifestBox[];
  farms: ManifestFarm[];
  belowMinimum: boolean;
  onOpenSampleBox: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Today&apos;s Dispatch</h2>
        {belowMinimum && (
          <button
            type="button"
            onClick={onOpenSampleBox}
            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-700 transition-colors"
          >
            + Sample Box
          </button>
        )}
      </div>

      {/* Box summary table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {boxes.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-400">
            No boxes dispatched on this date.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-500">TRACKING</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-500">RECIPIENT</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-500">DEST</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-500">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {boxes.map((b) => {
                const badge = sbBadge(b);
                return (
                  <tr key={b.trackingNumber} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-slate-700">{b.trackingNumber.slice(-8)}</td>
                    <td className="px-4 py-2.5 text-slate-600 truncate max-w-[120px]">{b.recipient ?? '-'}</td>
                    <td className="px-4 py-2.5 text-slate-500 truncate max-w-[80px]">{b.destination ?? '-'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold border ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Per-recipient expandable cards */}
      <div className="space-y-2">
        {boxes.map((b) => {
          const badge = sbBadge(b);
          const open = expanded.has(b.trackingNumber);
          return (
            <div key={b.trackingNumber} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50"
                onClick={() => toggle(b.trackingNumber)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{b.recipient ?? 'Unknown recipient'}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {b.destination ?? 'destination pending'} · {b.boxType ?? 'box'}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${badge.cls}`}>{badge.label}</span>
                <span className="text-slate-300 text-xs">{open ? '▲' : '▼'}</span>
              </div>
              {open && (
                <div className="border-t border-slate-100 px-4 py-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tracking</span>
                    <span className="font-mono text-slate-700">{b.trackingNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Carrier</span>
                    <span className="text-slate-600">{b.carrier ?? 'FedEx'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Products</span>
                    <span className="text-slate-600 text-right max-w-[180px] truncate">{b.products ?? 'pending'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tracking status</span>
                    <span className="text-slate-600">{b.trackingStatus ?? 'pending (carrier feed)'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Delivered</span>
                    <span className="text-slate-600">{b.deliveredAt ?? '-'}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Farm-side rollup */}
      {farms.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-700 mb-3">Farm shipments (this date)</p>
          <div className="space-y-2">
            {farms.map((f, i) => (
              <div key={`${f.farm}-${i}`} className="flex items-center justify-between text-xs border-b border-slate-50 last:border-0 pb-1.5 last:pb-0">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{f.farm}</p>
                  <p className="text-slate-400 font-mono">{f.awb ?? 'AWB pending'}</p>
                </div>
                <span className="text-slate-600 whitespace-nowrap">{f.boxes} box{f.boxes === 1 ? '' : 'es'} · {f.stems} stems</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// MIDDLE — Communications
// ===========================================================================
export function CommunicationsPanel({
  farmEmails,
  clientNotifications,
  yesterday,
  totalBoxes,
  farmCount,
}: {
  farmEmails: ManifestEmail[];
  clientNotifications: ClientNotification[];
  yesterday: ManifestBox[];
  totalBoxes: number;
  farmCount: number;
}) {
  const [arrived, setArrived] = useState<Record<string, boolean>>({});
  const [fedexNotified, setFedexNotified] = useState(false);

  // Collapse farm-label emails by subject (one label email covers many boxes).
  const emailsBySubject = new Map<string, ManifestEmail[]>();
  for (const e of farmEmails) {
    const key = e.subject ?? '(no subject)';
    const arr = emailsBySubject.get(key) ?? [];
    arr.push(e);
    emailsBySubject.set(key, arr);
  }

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Communications</h2>

      {/* Farm label emails (from dispatch_tracking) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-2">
          Farm label emails
          <span className="text-slate-400 font-normal">(Rose sends label PDFs)</span>
        </p>
        {emailsBySubject.size === 0 ? (
          <p className="text-xs text-slate-400">No label emails recorded for this date.</p>
        ) : (
          <div className="space-y-2">
            {[...emailsBySubject.entries()].map(([subject, group], i) => {
              const farms = group.flatMap((g) => g.farms);
              const sentAt = group.find((g) => g.sentAt)?.sentAt ?? null;
              return (
                <div key={i} className="border border-slate-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-slate-900">{subject}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {group.length} tracking{group.length === 1 ? '' : 's'}
                    {farms.length > 0 && ` · ${farms.map((f) => `${f.name} (${f.boxes})`).join(', ')}`}
                  </p>
                  <div className={`mt-1 text-xs px-1.5 py-0.5 rounded inline-block ${sentAt ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {sentAt ? `Sent ${fmtTime(sentAt)}` : 'Draft pending'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Client notifications (n8n_dispatch_queue) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-2">
          Client notifications
          <span className="text-slate-400 font-normal">(n8n queue)</span>
        </p>
        {clientNotifications.length === 0 ? (
          <p className="text-xs text-slate-400">No client emails queued for these shipments.</p>
        ) : (
          <div className="space-y-2">
            {clientNotifications.map((c, i) => {
              const s = (c.status ?? '').toUpperCase();
              const cls =
                s === 'SENT' ? 'bg-emerald-50 text-emerald-700' :
                s === 'FAILED' ? 'bg-red-50 text-red-700' :
                'bg-amber-50 text-amber-700';
              return (
                <div key={i} className="border border-slate-100 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{c.customer ?? c.email ?? 'Client'}</p>
                      <p className="text-xs text-slate-400 truncate">{c.template ?? 'notification'}</p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${cls}`}>
                      {c.status ?? 'queued'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {c.sentAt ? `Sent ${fmtTime(c.sentAt)}` : c.scheduledFor ? `Scheduled ${fmtTime(c.scheduledFor)}` : 'unscheduled'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FedEx depot notification — local-only toggle (no write path) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-700 mb-3">FedEx depot notification</p>
        <div className="text-xs text-slate-500 space-y-1 mb-3">
          <p>To: edgar.freire@fedex.com, dromero@entregas.ec</p>
          <p className="bg-slate-50 rounded-lg p-2 text-slate-600 italic">
            &ldquo;Floral Direct LLC dispatch: {totalBoxes} box{totalBoxes === 1 ? '' : 'es'} from {farmCount} farm{farmCount === 1 ? '' : 's'}.
            Please confirm receipt at the Quito depot before 10pm ECT.&rdquo;
          </p>
        </div>
        {fedexNotified ? (
          <p className="text-xs text-emerald-600 font-semibold">Marked notified (local only)</p>
        ) : (
          <button
            type="button"
            onClick={() => setFedexNotified(true)}
            className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-slate-700 transition-colors"
          >
            Mark FedEx notified
          </button>
        )}
        <p className="text-[10px] text-slate-400 mt-2">Local toggle — no write path to PROD; send the email from Gmail.</p>
      </div>

      {/* Yesterday's arrivals */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-700 mb-3">Prior dispatch arrivals</p>
        {yesterday.length === 0 ? (
          <p className="text-xs text-slate-400">No prior shipment found to check arrivals.</p>
        ) : (
          yesterday.slice(0, 12).map((b) => {
            const delivered = !!b.deliveredAt || arrived[b.trackingNumber];
            return (
              <div key={b.trackingNumber} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-xs text-slate-600 truncate max-w-[150px]">{b.recipient ?? b.trackingNumber.slice(-8)}</span>
                {delivered ? (
                  <span className="text-xs text-emerald-600 font-semibold whitespace-nowrap">Arrived</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setArrived((p) => ({ ...p, [b.trackingNumber]: true }))}
                    className="text-xs text-emerald-600 font-semibold border border-emerald-200 px-2 py-0.5 rounded-lg hover:bg-emerald-50 whitespace-nowrap"
                  >
                    Mark arrived
                  </button>
                )}
              </div>
            );
          })
        )}
        <p className="text-[10px] text-slate-400 mt-2">Delivered = tracking_delivered_at from PROD; manual marks are local only.</p>
      </div>
    </div>
  );
}

// ===========================================================================
// RIGHT — Labels & Confirmations
// ===========================================================================
export function LabelsPanel({
  boxes,
  totalBoxes,
}: {
  boxes: ManifestBox[];
  totalBoxes: number;
}) {
  const [driverPicked, setDriverPicked] = useState<Record<string, boolean>>({});

  // Each parsed tracking row is effectively one parsed FedEx label.
  const parsed = boxes.filter((b) => b.trackingNumber);
  // Group destinations for the driver pickup list (by recipient).
  const recipients = [...new Set(parsed.map((b) => b.recipient ?? b.trackingNumber.slice(-8)))];

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Labels &amp; Confirmations</h2>

      {/* FedEx labels — parsed from dispatch_tracking */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-700 mb-3">FedEx labels</p>
        {parsed.length === 0 ? (
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center">
            <p className="text-xs text-slate-500">No labels parsed for this date yet.</p>
            <p className="text-[10px] text-slate-400 mt-1">Rose label_reader.py writes dispatch_tracking after FedEx generates labels.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-emerald-600 font-semibold mb-1">{parsed.length} label{parsed.length === 1 ? '' : 's'} parsed</p>
            {parsed.map((b) => (
              <div key={b.trackingNumber} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <span className="text-xs font-mono text-slate-600">{b.trackingNumber}</span>
                  <p className="text-[10px] text-slate-400 truncate">{b.recipient ?? '-'}</p>
                </div>
                <span className="text-xs text-emerald-600 font-semibold whitespace-nowrap">Parsed</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-400 mt-2">Expected {totalBoxes} label{totalBoxes === 1 ? '' : 's'} for {totalBoxes} box{totalBoxes === 1 ? '' : 'es'}.</p>
      </div>

      {/* Driver pickup — local-only toggles (no WhatsApp feed yet) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-700">Driver pickup confirmation</p>
          <span className="text-xs text-slate-400">via WhatsApp</span>
        </div>
        {recipients.length === 0 ? (
          <p className="text-xs text-slate-400">No shipments to confirm.</p>
        ) : (
          <div className="space-y-2 mb-3">
            {recipients.map((r) => (
              <div key={r} className="flex items-center justify-between py-1.5">
                <p className="text-xs font-semibold text-slate-900 truncate max-w-[150px]">{r}</p>
                {driverPicked[r] ? (
                  <span className="text-xs text-emerald-600 font-semibold">Picked up</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDriverPicked((p) => ({ ...p, [r]: true }))}
                    className="text-xs border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg font-medium hover:border-slate-400"
                  >
                    Mark picked up
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">
          <p className="font-semibold text-slate-700 mb-1">Auto-confirmation (pending)</p>
          <p className="text-slate-400">WhatsApp pickup confirmations are not yet wired to a table; marks above are local only.</p>
        </div>
      </div>

      {/* Customs — static reference (no per-shipment source yet) */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500 space-y-2">
        <p className="font-semibold text-slate-700">Customs reference</p>
        <div className="flex justify-between"><span>ISS/NSR</span><span className="font-semibold text-slate-700">PPQ 587</span></div>
        <div className="flex justify-between"><span>Broker</span><span className="font-semibold text-slate-700">Andri Molina, Doral FL</span></div>
        <p className="text-[10px] text-slate-400">Static reference — no per-shipment customs source wired yet.</p>
      </div>
    </div>
  );
}

// ===========================================================================
// Sample Box modal
// ===========================================================================
export interface SampleProspect {
  id: number | string;
  name: string;
  contact: string | null;
}

export function SampleBoxModal({
  open,
  prospects,
  onClose,
}: {
  open: boolean;
  prospects: SampleProspect[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h3 className="font-bold text-slate-900 text-lg mb-1">Insert Sample Box</h3>
        <p className="text-slate-500 text-sm mb-4">
          Add a sample box to reach the 2-box minimum from Ecuador. Pick a prospect to send it to.
        </p>
        <div className="space-y-2 mb-5 max-h-72 overflow-y-auto">
          {prospects.length === 0 ? (
            <p className="text-xs text-slate-400">No eligible prospects loaded.</p>
          ) : (
            prospects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(String(p.id))}
                className={`w-full text-left border rounded-xl px-4 py-3 transition-all ${
                  selected === String(p.id) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-400">{p.contact ? `Contact: ${p.contact} · ` : ''}Sample box ($0 marketing)</p>
              </button>
            ))
          )}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => { setSelected(null); onClose(); }}
            className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => { setSelected(null); onClose(); }}
            className="text-sm px-5 py-2 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40 hover:bg-emerald-700"
          >
            Add to dispatch
          </button>
        </div>
      </div>
    </div>
  );
}
