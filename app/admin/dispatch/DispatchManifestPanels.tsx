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
  CommsSignal,
} from './DispatchManifestData';

type SbBadgeKind = 'ready' | 'received' | 'delivered' | 'pending';

function sbBadge(box: ManifestBox): { kind: SbBadgeKind; cls: string; label: string } {
  if (box.deliveredAt) {
    return { kind: 'delivered', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'Entregada' };
  }
  const s = (box.sbStatus ?? '').toUpperCase();
  if (s === 'SB_READY') {
    return { kind: 'ready', cls: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Lista' };
  }
  if (s === 'SB_RECEIVED') {
    return { kind: 'received', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'Recibida' };
  }
  return { kind: 'pending', cls: 'bg-slate-100 text-slate-600 border-slate-200', label: s ? s.replace('SB_', '') : 'En transito' };
}

function fmtTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// D3 — one ops-signal chip. Confirmed = emerald; pending = neutral slate.
// Honest "pendiente" when no signal was derived from comms (never fabricated).
function SignalChip({ signal }: { signal: CommsSignal }) {
  const confirmed = signal.state === 'confirmed';
  const cls = confirmed
    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : 'bg-slate-50 text-slate-500 border-slate-200';
  const title =
    confirmed && (signal.detail || signal.sourceAt)
      ? `${signal.detail ?? ''}${signal.sourceAt ? ` (${fmtTime(signal.sourceAt)})` : ''}`.trim()
      : 'Sin senal en comms aun';
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${cls}`}
    >
      <span aria-hidden>{confirmed ? '✓' : '·'}</span>
      {signal.label}
      {!confirmed && <span className="font-normal text-slate-400">pendiente</span>}
    </span>
  );
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
      <div className="flex items-center justify-between min-h-[28px]">
        <h2 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Despacho de hoy</h2>
        {belowMinimum && (
          <button
            type="button"
            onClick={onOpenSampleBox}
            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-700 transition-colors"
          >
            + Caja muestra
          </button>
        )}
      </div>

      {/* Box summary table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {boxes.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-slate-500">Sin cajas despachadas</p>
            <p className="text-xs text-slate-400 mt-1">No hay despacho registrado para esta fecha.</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wide text-[10px] text-slate-500">Tracking</th>
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wide text-[10px] text-slate-500">Destinatario</th>
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wide text-[10px] text-slate-500">Destino</th>
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wide text-[10px] text-slate-500">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {boxes.map((b) => {
                const badge = sbBadge(b);
                return (
                  <tr key={b.trackingNumber} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-slate-700">{b.trackingNumber.slice(-8)}</td>
                    <td className="px-4 py-2.5 text-slate-600 truncate max-w-[120px]">{b.recipient ?? '-'}</td>
                    <td className="px-4 py-2.5 text-slate-500 truncate max-w-[80px]">{b.destination ?? '-'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.cls}`}>
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
            <div key={b.trackingNumber} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => toggle(b.trackingNumber)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{b.recipient ?? 'Destinatario sin nombre'}</p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {b.destination ?? 'destino pendiente'} &middot; {b.boxType ?? 'caja'}
                  </p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${badge.cls}`}>{badge.label}</span>
                <span className="text-slate-300 text-[10px]">{open ? '▲' : '▼'}</span>
              </div>
              {open && (
                <div className="border-t border-slate-100 px-4 py-3 space-y-3 text-xs">
                  {/* D1 — Box contents (products_sent): what actually went in the box */}
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                      Contenido de la caja
                    </p>
                    {b.products ? (
                      <p className="text-slate-700 leading-snug whitespace-pre-wrap break-words">{b.products}</p>
                    ) : (
                      <p className="text-slate-400 italic">
                        -- sin contenido registrado (products_sent vacio en sample_box_status)
                      </p>
                    )}
                  </div>

                  {/* D3 — derived ops signals from comms (WhatsApp/calls), not FedEx */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                      Senales de comms
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {b.signals.length === 0 ? (
                        <span className="text-slate-400 italic">-- sin analisis de comms</span>
                      ) : (
                        b.signals.map((s) => <SignalChip key={s.key} signal={s} />)
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      Derivado de messages.analysis_v2 (WhatsApp/llamadas). Entrega al cliente desde comms ahora; FedEx API luego.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400 shrink-0">Tracking</span>
                      <span className="font-mono text-slate-700 truncate text-right">{b.trackingNumber}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400 shrink-0">Transportista</span>
                      <span className="text-slate-600 text-right">{b.carrier ?? 'FedEx'}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400 shrink-0">Estado de tracking</span>
                      <span className="text-slate-600 text-right">{b.trackingStatus ?? 'pendiente (feed del carrier)'}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400 shrink-0">Entregada</span>
                      <span className="text-slate-600 text-right">{b.deliveredAt ?? '-'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Farm-side rollup */}
      {farms.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Envios de fincas (esta fecha)</p>
          <div className="space-y-2.5">
            {farms.map((f, i) => (
              <div key={`${f.farm}-${i}`} className="flex items-center justify-between gap-3 text-xs border-b border-slate-50 last:border-0 pb-2.5 last:pb-0">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{f.farm}</p>
                  <p className="text-slate-400 font-mono mt-0.5">{f.awb ?? 'AWB pendiente'}</p>
                </div>
                <span className="text-slate-600 whitespace-nowrap">{f.boxes} caja{f.boxes === 1 ? '' : 's'} &middot; {f.stems} tallos</span>
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
      <h2 className="font-bold text-slate-900 text-xs uppercase tracking-wider min-h-[28px] flex items-center">Comunicaciones</h2>

      {/* Farm label emails (from dispatch_tracking) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          Emails de etiquetas a fincas
          <span className="text-slate-400 font-normal normal-case tracking-normal">(Rose envia los PDF)</span>
        </p>
        {emailsBySubject.size === 0 ? (
          <p className="text-xs text-slate-400">Sin emails de etiquetas registrados para esta fecha.</p>
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
                  <div className={`mt-2 text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block ${sentAt ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {sentAt ? `Enviado ${fmtTime(sentAt)}` : 'Borrador pendiente'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Client notifications (n8n_dispatch_queue) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          Notificaciones a clientes
          <span className="text-slate-400 font-normal normal-case tracking-normal">(cola n8n)</span>
        </p>
        {clientNotifications.length === 0 ? (
          <p className="text-xs text-slate-400">Sin emails a clientes en cola para estos envios.</p>
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
                      <p className="text-xs font-semibold text-slate-900 truncate">{c.customer ?? c.email ?? 'Cliente'}</p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{c.template ?? 'notificacion'}</p>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${cls}`}>
                      {c.status ?? 'en cola'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">
                    {c.sentAt ? `Enviado ${fmtTime(c.sentAt)}` : c.scheduledFor ? `Programado ${fmtTime(c.scheduledFor)}` : 'sin programar'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FedEx depot notification — local-only toggle (no write path) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Aviso al deposito FedEx</p>
        <div className="text-xs text-slate-500 space-y-2 mb-3">
          <p>Para: edgar.freire@fedex.com, dromero@entregas.ec</p>
          <p className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-slate-600 italic leading-relaxed">
            &ldquo;Despacho Floral Direct LLC: {totalBoxes} caja{totalBoxes === 1 ? '' : 's'} de {farmCount} finca{farmCount === 1 ? '' : 's'}.
            Por favor confirmar recepcion en el deposito de Quito antes de las 10pm ECT.&rdquo;
          </p>
        </div>
        {fedexNotified ? (
          <p className="text-xs text-emerald-600 font-semibold">Marcado como avisado (solo local)</p>
        ) : (
          <button
            type="button"
            onClick={() => setFedexNotified(true)}
            className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-slate-700 transition-colors"
          >
            Marcar FedEx avisado
          </button>
        )}
        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">Toggle local &mdash; sin escritura a PROD; envia el email desde Gmail.</p>
      </div>

      {/* Yesterday's arrivals */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Llegadas del despacho anterior</p>
        {yesterday.length === 0 ? (
          <p className="text-xs text-slate-400">No se encontro un envio anterior para verificar llegadas.</p>
        ) : (
          yesterday.slice(0, 12).map((b) => {
            const delivered = !!b.deliveredAt || arrived[b.trackingNumber];
            return (
              <div key={b.trackingNumber} className="flex items-center justify-between gap-3 py-2 border-b border-slate-50 last:border-0">
                <span className="text-xs text-slate-600 truncate max-w-[150px]">{b.recipient ?? b.trackingNumber.slice(-8)}</span>
                {delivered ? (
                  <span className="text-xs text-emerald-600 font-semibold whitespace-nowrap">Llego</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setArrived((p) => ({ ...p, [b.trackingNumber]: true }))}
                    className="text-xs text-emerald-700 font-semibold border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-50 transition-colors whitespace-nowrap"
                  >
                    Marcar llegada
                  </button>
                )}
              </div>
            );
          })
        )}
        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">Entregada = tracking_delivered_at de PROD; las marcas manuales son solo locales.</p>
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
  dispatchDate,
}: {
  boxes: ManifestBox[];
  totalBoxes: number;
  dispatchDate: string;
}) {
  const [driverPicked, setDriverPicked] = useState<Record<string, boolean>>({});
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelMsg, setLabelMsg] = useState<string | null>(null);

  // D2 — POST to the label-file route and trigger a CSV download in-browser.
  async function generarLabels() {
    setLabelBusy(true);
    setLabelMsg(null);
    try {
      const res = await fetch(
        `/api/admin/dispatch/label-file?date=${encodeURIComponent(dispatchDate)}`,
        { method: 'POST' },
      );
      if (!res.ok) {
        setLabelMsg(`Error ${res.status} al generar el archivo`);
        return;
      }
      const rows = res.headers.get('x-label-rows') ?? '?';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `floropolis_labels_${dispatchDate}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setLabelMsg(
        rows === '0'
          ? 'Archivo generado: sin cajas para esta fecha (vacio honesto).'
          : `Archivo generado: ${rows} caja(s).`,
      );
    } catch {
      setLabelMsg('No se pudo generar el archivo (red).');
    } finally {
      setLabelBusy(false);
    }
  }

  // Each parsed tracking row is effectively one parsed FedEx label.
  const parsed = boxes.filter((b) => b.trackingNumber);
  // Group destinations for the driver pickup list (by recipient).
  const recipients = [...new Set(parsed.map((b) => b.recipient ?? b.trackingNumber.slice(-8)))];

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-slate-900 text-xs uppercase tracking-wider min-h-[28px] flex items-center">Etiquetas y confirmaciones</h2>

      {/* FedEx labels — parsed from dispatch_tracking */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Etiquetas FedEx</p>
        {parsed.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
            <p className="text-xs font-medium text-slate-500">Aun sin etiquetas leidas para esta fecha</p>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">Rose (label_reader.py) escribe dispatch_tracking despues de que FedEx genera las etiquetas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-emerald-600 font-semibold mb-1">{parsed.length} etiqueta{parsed.length === 1 ? '' : 's'} leida{parsed.length === 1 ? '' : 's'}</p>
            {parsed.map((b) => (
              <div key={b.trackingNumber} className="flex items-center justify-between gap-3 border border-slate-100 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <span className="text-xs font-mono text-slate-600">{b.trackingNumber}</span>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{b.recipient ?? '-'}</p>
                </div>
                <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">Leida</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-400 mt-2">Esperadas {totalBoxes} etiqueta{totalBoxes === 1 ? '' : 's'} para {totalBoxes} caja{totalBoxes === 1 ? '' : 's'}.</p>

        {/* D2 — label-input file generator (CSV with FedEx label columns per box) */}
        <div className="mt-3 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={generarLabels}
            disabled={labelBusy}
            className="w-full text-xs bg-emerald-600 text-white px-3 py-2 rounded-lg font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {labelBusy ? 'Generando...' : 'Generar archivo de etiquetas'}
          </button>
          {labelMsg && <p className="text-[10px] text-slate-500 mt-1.5">{labelMsg}</p>}
          <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
            CSV con direccion + dimensiones + peso facturable por caja (sample_box_status + box_master). Los campos faltantes salen como &ldquo;--&rdquo;.
          </p>
        </div>
      </div>

      {/* Driver pickup — local-only toggles (no WhatsApp feed yet) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confirmacion de retiro del chofer</p>
          <span className="text-[10px] text-slate-400 whitespace-nowrap">via WhatsApp</span>
        </div>
        {recipients.length === 0 ? (
          <p className="text-xs text-slate-400">No hay envios para confirmar.</p>
        ) : (
          <div className="space-y-1 mb-3">
            {recipients.map((r) => (
              <div key={r} className="flex items-center justify-between gap-3 py-1.5">
                <p className="text-xs font-semibold text-slate-900 truncate max-w-[150px]">{r}</p>
                {driverPicked[r] ? (
                  <span className="text-xs text-emerald-600 font-semibold whitespace-nowrap">Retirada</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDriverPicked((p) => ({ ...p, [r]: true }))}
                    className="text-xs border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg font-medium hover:border-slate-400 transition-colors whitespace-nowrap"
                  >
                    Marcar retiro
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs text-slate-500">
          <p className="font-semibold text-slate-700 mb-1">Auto-confirmacion (pendiente)</p>
          <p className="text-slate-400 leading-relaxed">Las confirmaciones de retiro por WhatsApp aun no estan conectadas a una tabla; las marcas de arriba son solo locales.</p>
        </div>
      </div>

      {/* Customs — static reference (no per-shipment source yet) */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500 space-y-2">
        <p className="font-semibold uppercase tracking-wide text-slate-500">Referencia de aduana</p>
        <div className="flex justify-between gap-3 pt-0.5"><span>ISS/NSR</span><span className="font-semibold text-slate-700">PPQ 587</span></div>
        <div className="flex justify-between gap-3"><span>Broker</span><span className="font-semibold text-slate-700">Andri Molina, Doral FL</span></div>
        <p className="text-[10px] text-slate-400 leading-relaxed">Referencia estatica &mdash; aun sin fuente de aduana por envio.</p>
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
        <h3 className="font-bold text-slate-900 text-lg mb-1">Insertar caja muestra</h3>
        <p className="text-slate-500 text-sm mb-5 leading-relaxed">
          Agrega una caja muestra para llegar al minimo de 2 cajas desde Ecuador. Elegi un prospecto para enviarsela.
        </p>
        <div className="space-y-2 mb-5 max-h-72 overflow-y-auto">
          {prospects.length === 0 ? (
            <p className="text-xs text-slate-400">No hay prospectos elegibles cargados.</p>
          ) : (
            prospects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(String(p.id))}
                className={`w-full text-left border rounded-xl px-4 py-3 transition-all ${
                  selected === String(p.id) ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{p.contact ? `Contacto: ${p.contact} · ` : ''}Caja muestra ($0 marketing)</p>
              </button>
            ))
          )}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => { setSelected(null); onClose(); }}
            className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-medium hover:border-slate-300 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => { setSelected(null); onClose(); }}
            className="text-sm px-5 py-2 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40 hover:bg-emerald-700 transition-colors"
          >
            Agregar al despacho
          </button>
        </div>
      </div>
    </div>
  );
}
