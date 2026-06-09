'use client';
// Orders queue -- client surface, mockup-faithful (app/mockups/admin-orders).
// v1 | 2026-06-09 | Job_PM order-visibility #3
//
// Layout matched to the approved mockup:
//   - Header: title + "showing orders up to N days out"
//   - KPI tiles (Pending review / Confirmed / Dispatched / Issues)
//   - Tabs (upcoming / confirmed / dispatched / issues / all) + date filter
//   - Orders grouped by delivery day; per-day box-count + Ecuador 2-box warning
//   - Per-row expand -> order + client (v_customer_360) detail, inline
//
// Wired to public.v_unified_orders + public.v_customer_360 (read-only). All
// rows are real; empty -> honest empty state. No fabricated orders.

import { useMemo, useState } from 'react';
import StatusBadge from './_StatusBadge';
import {
  BUCKET_BADGE,
  CHANNEL_META,
  type Bucket,
  type UnifiedOrder,
} from './unified-orders';

type Tab = 'upcoming' | 'confirmed' | 'dispatched' | 'issues' | 'all';

const TABS: { id: Tab; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'dispatched', label: 'Dispatched' },
  { id: 'issues', label: 'Issues' },
  { id: 'all', label: 'All' },
];

const DATE_FILTERS: [string, string][] = [
  ['1', 'Hoy'],
  ['7', '7 dias'],
  ['14', '14 dias'],
  ['30', '30 dias'],
  ['all', 'Todo'],
];

function fmtMoney(n: number | null): string {
  if (n == null) return '--';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Day key for grouping (YYYY-MM-DD), and a human label.
function dayKey(o: UnifiedOrder): string {
  return o.deliveryDate ? o.deliveryDate.slice(0, 10) : 'sin-fecha';
}
function dayLabel(key: string): string {
  if (key === 'sin-fecha') return 'Sin fecha de entrega';
  const d = new Date(key + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function OrdersClient({
  rows,
  total,
  bucketCounts,
  error,
}: {
  rows: UnifiedOrder[];
  total: number;
  bucketCounts: Record<Bucket, number>;
  error: string | null;
}) {
  const [tab, setTab] = useState<Tab>('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const tabMatch = (o: UnifiedOrder): boolean => {
    switch (tab) {
      case 'upcoming':
        return o.bucket === 'upcoming' || o.bucket === 'other';
      case 'confirmed':
        return o.bucket === 'confirmed';
      case 'dispatched':
        return o.bucket === 'dispatched';
      case 'issues':
        return o.bucket === 'issues' || o.bucket === 'cancelled';
      case 'all':
      default:
        return true;
    }
  };

  const filtered = useMemo(() => {
    const days = dateFilter === 'all' ? null : parseInt(dateFilter, 10);
    const max = days != null ? new Date(today.getTime() + days * 86400000) : null;
    return rows.filter((o) => {
      if (!tabMatch(o)) return false;
      if (max && o.deliveryDate) {
        const dd = new Date(o.deliveryDate + 'T00:00:00');
        if (!Number.isNaN(dd.getTime()) && dd > max) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tab, dateFilter, today]);

  // Group by delivery day, preserving newest-first order of first appearance.
  const groups = useMemo(() => {
    const map = new Map<string, UnifiedOrder[]>();
    for (const o of filtered) {
      const k = dayKey(o);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(o);
    }
    // Sort day keys: real dates ascending (soonest delivery first), no-date last.
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === 'sin-fecha') return 1;
      if (b[0] === 'sin-fecha') return -1;
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });
  }, [filtered]);

  const KPI_TILES: { label: string; count: number; color: string }[] = [
    { label: 'Pendientes de revisar', count: bucketCounts.upcoming + bucketCounts.other, color: 'bg-amber-50 border-amber-200 text-amber-800' },
    { label: 'Confirmados', count: bucketCounts.confirmed, color: 'bg-blue-50 border-blue-200 text-blue-800' },
    { label: 'Despachados', count: bucketCounts.dispatched, color: 'bg-violet-50 border-violet-200 text-violet-800' },
    { label: 'Con problemas', count: bucketCounts.issues + bucketCounts.cancelled, color: 'bg-red-50 border-red-200 text-red-800' },
  ];

  const issueCount = bucketCounts.issues + bucketCounts.cancelled;

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pedidos</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Floropolis admin · {total} pedido{total !== 1 ? 's' : ''} en total ·{' '}
            {dateFilter === 'all'
              ? 'todas las fechas'
              : dateFilter === '1'
                ? 'entrega hasta hoy'
                : `entrega hasta ${dateFilter} dias`}
          </p>
        </div>
      </div>

      {/* Source / error band */}
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 mb-6 text-sm text-amber-800">
          <strong>Sin datos de produccion:</strong> {error}. Se muestra estado vacio (no se inventan pedidos).
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {KPI_TILES.map((tile) => (
          <div key={tile.label} className={`rounded-2xl border p-4 ${tile.color}`}>
            <div className="text-2xl font-bold">{tile.count}</div>
            <div className="text-xs font-medium mt-0.5 opacity-80">{tile.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + date filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === t.id ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
              {t.id === 'issues' && issueCount > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">
                  {issueCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 items-center">
          <span className="text-xs text-slate-400 mr-1">Mostrar:</span>
          {DATE_FILTERS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => setDateFilter(v)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                dateFilter === v
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders list, grouped by delivery day */}
      <div className="space-y-6">
        {groups.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <p className="text-slate-500 text-sm">
              {total === 0
                ? 'No hay pedidos en la vista combinada.'
                : 'Ningun pedido coincide con este filtro.'}
            </p>
            {total > 0 && dateFilter !== 'all' && (
              <button
                onClick={() => setDateFilter('all')}
                className="mt-3 text-sm text-emerald-600 font-medium hover:text-emerald-800"
              >
                Ver todas las fechas
              </button>
            )}
          </div>
        )}

        {groups.map(([key, dayOrders]) => {
          // Ecuador minimum: every shipping day needs >= 2 boxes. We have no
          // box count in the view, so we proxy "1 order on the day" as the
          // at-risk signal (1 order = likely 1 box). Honest about the proxy.
          const orderCount = dayOrders.length;
          const belowMin = key !== 'sin-fecha' && orderCount < 2;

          return (
            <div key={key}>
              {/* Day header */}
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h3 className="text-sm font-bold text-slate-700">{dayLabel(key)}</h3>
                <span className="text-xs text-slate-400">
                  {orderCount} pedido{orderCount !== 1 ? 's' : ''}
                </span>
                {belowMin && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-red-800">
                      Solo {orderCount} pedido este dia — minimo Ecuador 2 cajas
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pedido</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cliente</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Canal</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Entrega</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayOrders.map((o) => {
                      const open = expanded.has(o.key);
                      const badge = BUCKET_BADGE[o.bucket];
                      const chan = CHANNEL_META[o.channel];
                      return (
                        <FragmentRow key={o.key}>
                          <tr className="hover:bg-slate-50 transition-colors border-t border-slate-100 first:border-t-0">
                            <td className="px-5 py-4">
                              <p className="font-mono text-xs text-slate-900 font-semibold">
                                {o.orderType ?? 'order'} #{o.ref}
                              </p>
                              <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(o.createdAt)}</p>
                            </td>
                            <td className="px-5 py-4">
                              <p className="font-medium text-slate-900">{o.customerName ?? '--'}</p>
                              {o.client?.businessName && (
                                <p className="text-xs text-slate-400 mt-0.5">{o.client.businessName}</p>
                              )}
                            </td>
                            <td className="px-5 py-4 hidden md:table-cell">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${chan.cls}`}>
                                {chan.label}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <p className="font-semibold text-slate-900">{fmtMoney(o.amount)}</p>
                              {o.amountSource && (
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{o.amountSource}</p>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-slate-700 font-medium">{fmtDate(o.deliveryDate)}</p>
                            </td>
                            <td className="px-5 py-4">
                              <StatusBadge variant={badge.variant} label={badge.label} />
                            </td>
                            <td className="px-5 py-4">
                              <button
                                onClick={() => toggle(o.key)}
                                className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold border border-emerald-200 hover:border-emerald-400 px-3 py-1.5 rounded-lg transition-colors"
                              >
                                {open ? 'Cerrar' : 'Abrir'}
                              </button>
                            </td>
                          </tr>
                          {open && (
                            <tr className="bg-slate-50 border-t border-slate-100">
                              <td colSpan={7} className="px-5 py-4">
                                <OrderDetail o={o} />
                              </td>
                            </tr>
                          )}
                        </FragmentRow>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 mt-8">
        Fuente: public.v_unified_orders (vista combinada) + public.v_customer_360 — produccion, solo lectura.
      </p>
    </div>
  );
}

// React fragment wrapper so we can return two <tr> per row with a stable key.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-slate-800">{value ?? '--'}</p>
    </div>
  );
}

function OrderDetail({ o }: { o: UnifiedOrder }) {
  const c = o.client;
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      {/* Order facts */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h4 className="font-semibold text-slate-900 mb-4 text-sm">Pedido</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Ref" value={`${o.orderType ?? 'order'} #${o.ref}`} />
          <Field label="Canal" value={CHANNEL_META[o.channel].label} />
          <Field label="Creado" value={fmtDateTime(o.createdAt)} />
          <Field label="Entrega" value={fmtDate(o.deliveryDate)} />
          <Field label="Total" value={`${fmtMoney(o.amount)}${o.amountSource ? ` (${o.amountSource})` : ''}`} />
          <Field label="Ecommerce" value={o.isEcommerce ? 'Si' : 'No'} />
          <Field label="Estado pago" value={o.paymentStatus} />
          <Field label="Estado factura" value={o.invoiceStatus} />
          <Field label="Estado prebook" value={o.prebookStatus} />
          <Field label="Checkout" value={o.checkOutStatus} />
          <Field label="K2K order id" value={o.k2kOrderId} />
          <Field label="Tracking" value={o.trackingNumber} />
          <Field label="Carrier" value={o.carrierName} />
          <Field
            label="Destino"
            value={[o.shipCity, o.shipState].filter(Boolean).join(', ') || '--'}
          />
          <Field label="Direccion" value={o.shipAddress} />
        </div>
        {o.internalNotes && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Notas internas</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{o.internalNotes}</p>
          </div>
        )}
      </div>

      {/* Client dimension (v_customer_360) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-slate-900 text-sm">Cliente</h4>
          {c?.matchedBy && (
            <span className="text-[10px] text-slate-400">match por {c.matchedBy === 'komet' ? 'codigo' : 'nombre'}</span>
          )}
        </div>
        {c ? (
          <div className="space-y-1.5">
            {c.businessName && <p className="font-medium text-slate-900">{c.businessName}</p>}
            <p className="text-xs text-slate-500">{c.contactName ?? o.customerName ?? '--'}</p>
            {c.email && <p className="text-xs text-slate-500">{c.email}</p>}
            {c.phone && <p className="text-xs text-slate-500">{c.phone}</p>}
            <p className="text-xs text-slate-500">
              {[c.city, c.state, c.country].filter(Boolean).join(', ') || '--'}
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
              <div className="flex justify-between">
                <span>Ventas historicas</span>
                <span className="font-medium text-slate-700">{c.totalSales ?? '--'}</span>
              </div>
              <div className="flex justify-between">
                <span>Revenue total</span>
                <span className="font-medium text-slate-700">{fmtMoney(c.totalRevenueUsd)}</span>
              </div>
              <div className="flex justify-between">
                <span>Ultima txn</span>
                <span className="font-medium text-slate-700">{fmtDate(c.lastTxnAt)}</span>
              </div>
              {c.churnStatus && (
                <div className="flex justify-between">
                  <span>Churn</span>
                  <span className="font-medium text-slate-700">{c.churnStatus}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Sin match en v_customer_360 para {o.customerName ?? 'este pedido'}.
          </p>
        )}
      </div>
    </div>
  );
}
