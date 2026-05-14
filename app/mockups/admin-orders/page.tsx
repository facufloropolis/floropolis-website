"use client";
// Mockup: /admin/orders — Order queue v3
// v3.1 | 2026-05-14 | Job_PM [V8 SHADOW]
// Fixed: date filter actually filters; move order modal works; audit log per order; banner management

import { useState } from "react";
import Link from "next/link";
import StatusBadge from "../_components/StatusBadge";

type Status = "pending_review" | "confirmed" | "preauth_ok" | "paid" | "dispatching" | "payment_failed" | "cancelled" | "pending_approval";
type Tab = "upcoming" | "confirmed" | "dispatched" | "arrived" | "issues" | "all";
type Admin = "Facu" | "JJ";

// Mock "today" for the mockup
const TODAY = new Date("2026-05-14");

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

type Order = {
  id: string; customer: string; items: string; total: number;
  delivery: string; deliveryDate: Date; leadDays: number;
  status: Status; submitted: string; boxes: number; hoursToC: number;
};

const INITIAL_ORDERS: Order[] = [
  { id: "FLO-20260523-001", customer: "Buonasera Events", items: "Roses Free Spirit 50CM (Ecoroses) x2, Anemone Burgundy Mariane 35CM (Flodecol) x1", total: 243.00, delivery: "May 23", deliveryDate: new Date("2026-05-23"), leadDays: 9, status: "pending_review", submitted: "2h ago", boxes: 2, hoursToC: 216 },
  { id: "FLO-20260521-002", customer: "Selena Ross Flowers", items: "Roses Antonia Garden 60CM (Ecoroses) x2, Bells of Ireland Green 80-90CM (Flodecol) x1", total: 312.00, delivery: "May 21", deliveryDate: new Date("2026-05-21"), leadDays: 7, status: "confirmed", submitted: "3h ago", boxes: 2, hoursToC: 168 },
  { id: "FLO-20260519-003", customer: "Nasrin Kolyani Design", items: "Delphinium Dark Blue Sea Waltz 80CM (Flodecol) x2, Anemone Fuchsia Mariane 35-40CM (Magic Flowers) x1", total: 198.50, delivery: "May 19", deliveryDate: new Date("2026-05-19"), leadDays: 5, status: "preauth_ok", submitted: "Yesterday", boxes: 2, hoursToC: 144 },
  { id: "FLO-20260519-004", customer: "Blooms by Carla", items: "Rose Bicolor Yellow/Red High & Flame Magic 60CM (Flodecol) x4", total: 520.00, delivery: "May 19", deliveryDate: new Date("2026-05-19"), leadDays: 5, status: "paid", submitted: "2 days ago", boxes: 4, hoursToC: 120 },
  { id: "FLO-20260518-005", customer: "Fleur de Luxe LA", items: "Anemone Pink Mariane 35CM (Flodecol) x2, Eucalyptus Silver 60CM (Magic Flowers) x1", total: 178.00, delivery: "May 18", deliveryDate: new Date("2026-05-18"), leadDays: 4, status: "dispatching", submitted: "3 days ago", boxes: 2, hoursToC: 40 },
  { id: "FLO-20260518-006", customer: "Harvest Flowers PDX", items: "Roses Cool Water 50CM (Ecoroses) x2", total: 154.00, delivery: "May 18", deliveryDate: new Date("2026-05-18"), leadDays: 4, status: "payment_failed", submitted: "3 days ago", boxes: 2, hoursToC: 40 },
  { id: "FLO-20260517-007", customer: "Sunrise Blooms ATL", items: "Bouquets Assorted Round Medium Amazon 50CM (Magic Flowers) x1", total: 89.00, delivery: "May 17", deliveryDate: new Date("2026-05-17"), leadDays: 3, status: "payment_failed", submitted: "4 days ago", boxes: 1, hoursToC: 18 },
  { id: "FLO-20260516-008", customer: "Green & Bloom Austin", items: "Greens & Foliage Green Fern Tree Fern 60CM (Magic Flowers) x1", total: 112.00, delivery: "May 16", deliveryDate: new Date("2026-05-16"), leadDays: 2, status: "cancelled", submitted: "5 days ago", boxes: 1, hoursToC: 0 },
  { id: "FLO-20260528-009", customer: "Magnolia Flowers Nashville", items: "Roses Atomic 70CM (Ecoroses) x2, Anemone Red Mariane 35CM (Flodecol) x1", total: 206.00, delivery: "May 28", deliveryDate: new Date("2026-05-28"), leadDays: 14, status: "pending_review", submitted: "1h ago", boxes: 2, hoursToC: 336 },
];

type AuditEntry = { time: string; actor: string; action: string };
const INITIAL_AUDIT: Record<string, AuditEntry[]> = {
  "FLO-20260523-001": [
    { time: "May 13, 09:14", actor: "system", action: "Order created from quote #Q-8841" },
    { time: "May 13, 09:15", actor: "system", action: "Card saved via SetupIntent (Visa ••4242)" },
    { time: "May 14, 08:30", actor: "facu@floropolis.com", action: "Quote reviewed — prices adjusted +5%" },
  ],
  "FLO-20260521-002": [
    { time: "May 11, 11:02", actor: "system", action: "Order created" },
    { time: "May 11, 11:05", actor: "system", action: "Card saved (MC ••1234)" },
    { time: "May 12, 09:00", actor: "jjp@floropolis.com", action: "Order confirmed" },
  ],
};

const AVAILABLE_MOVE_DATES = [
  { label: "May 21 (Wed)", value: "May 21", date: new Date("2026-05-21") },
  { label: "May 23 (Fri)", value: "May 23", date: new Date("2026-05-23") },
  { label: "May 26 (Mon)", value: "May 26", date: new Date("2026-05-26") },
  { label: "May 28 (Wed)", value: "May 28", date: new Date("2026-05-28") },
];

const PROSPECTS = [
  { name: "Lily's Petals, Nashville TN", contact: "Sarah J." },
  { name: "Bloom Studio ATL, Atlanta GA", contact: "Mark R." },
  { name: "Floral Dreams, Austin TX", contact: "Ana M." },
];

const KPI_TILES = [
  { label: "Pending review", count: 2, color: "bg-amber-50 border-amber-200 text-amber-800", icon: "⏳" },
  { label: "Awaiting charge (T-5)", count: 2, color: "bg-blue-50 border-blue-200 text-blue-800", icon: "💳" },
  { label: "Payment failed", count: 2, color: "bg-red-50 border-red-200 text-red-800", icon: "🚨" },
  { label: "In transit", count: 1, color: "bg-emerald-50 border-emerald-200 text-emerald-800", icon: "📦" },
];

// Banner state (controls what customers see in My Orders)
type Banner = { active: boolean; headline: string; subtext: string; code: string; discount: string; cta: string };

const DEFAULT_BANNER: Banner = {
  active: true,
  headline: "10% off your next order",
  subtext: "It's been a while. Use the code at checkout.",
  code: "RETURN10",
  discount: "10%",
  cta: "See pricing →",
};

export default function AdminOrdersV3() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [admin, setAdmin] = useState<Admin>("Facu");
  const [dateFilter, setDateFilter] = useState("14");
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [auditLog, setAuditLog] = useState<Record<string, AuditEntry[]>>(INITIAL_AUDIT);
  const [expandedLog, setExpandedLog] = useState<Set<string>>(new Set());
  const [sampleBoxDay, setSampleBoxDay] = useState<string | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<string | null>(null);
  const [paymentAction, setPaymentAction] = useState<Record<string, string>>({});
  const [arrivedStatus, setArrivedStatus] = useState<Record<string, string>>({});
  const [moveOrderId, setMoveOrderId] = useState<string | null>(null);
  const [moveTargetDate, setMoveTargetDate] = useState<string | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [banner, setBanner] = useState<Banner>(DEFAULT_BANNER);
  const [bannerDraft, setBannerDraft] = useState<Banner>(DEFAULT_BANNER);

  // Date filter — filter by delivery date within N days from today
  const dateFilterDays = parseInt(dateFilter);
  const maxDate = addDays(TODAY, dateFilterDays);

  const tabFilter = (o: Order) => {
    switch (tab) {
      case "upcoming":   return ["pending_review", "pending_approval", "confirmed", "preauth_ok", "paid"].includes(o.status);
      case "confirmed":  return o.status === "confirmed";
      case "dispatched": return o.status === "dispatching";
      case "arrived":    return false; // arrived tab has its own UI
      case "issues":     return ["payment_failed", "pending_approval"].includes(o.status);
      case "all":        return true;
      default:           return true;
    }
  };

  // Apply both date filter AND tab filter
  const filtered = orders.filter(o =>
    tabFilter(o) && (tab === "issues" || tab === "all" ? true : o.deliveryDate <= maxDate)
  );

  // Group by delivery day
  const days = Array.from(new Set(filtered.map(o => o.delivery)));

  function boxesOnDay(day: string) {
    return orders.filter(o => o.delivery === day && o.status !== "cancelled").reduce((s, o) => s + o.boxes, 0);
  }

  function logChange(orderId: string, action: string) {
    const entry: AuditEntry = {
      time: new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      actor: admin === "Facu" ? "facu@floropolis.com" : "jjp@floropolis.com",
      action,
    };
    setAuditLog(prev => ({ ...prev, [orderId]: [...(prev[orderId] ?? []), entry] }));
  }

  function handleMoveOrder() {
    if (!moveOrderId || !moveTargetDate) return;
    const target = AVAILABLE_MOVE_DATES.find(d => d.value === moveTargetDate)!;
    setOrders(prev => prev.map(o =>
      o.id === moveOrderId
        ? { ...o, delivery: target.value, deliveryDate: target.date }
        : o
    ));
    logChange(moveOrderId, `Delivery date moved to ${target.label}`);
    setMoveOrderId(null);
    setMoveTargetDate(null);
  }

  const moveOrder = orders.find(o => o.id === moveOrderId);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
          <p className="text-slate-500 text-sm mt-0.5">Floropolis admin · Showing orders up to {dateFilter === "1" ? "today" : `${dateFilter} days out`}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Admin identity toggle */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 text-xs">
            {(["Facu","JJ"] as Admin[]).map(a => (
              <button key={a} onClick={() => setAdmin(a)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${admin === a ? "bg-white shadow text-slate-900" : "text-slate-500"}`}>
                {a === "Facu" ? "👤 Facu (you)" : "👤 JJ"}
              </button>
            ))}
          </div>
          {/* Banner manager */}
          <button
            onClick={() => { setBannerDraft(banner); setBannerOpen(true); }}
            className={`text-sm px-3 py-2 rounded-xl border font-medium transition-colors flex items-center gap-1.5 ${
              banner.active ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-slate-200 text-slate-500 bg-white"
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${banner.active ? "bg-emerald-500" : "bg-slate-300"}`} />
            Customer banner
          </button>
          <Link href="/mockups/admin-dispatch" className="text-sm px-4 py-2 rounded-xl border border-slate-200 hover:border-emerald-300 text-slate-600 font-medium transition-colors">
            Dispatch view →
          </Link>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {KPI_TILES.map((tile) => (
          <div key={tile.label} className={`rounded-2xl border p-4 ${tile.color}`}>
            <div className="text-xl mb-1">{tile.icon}</div>
            <div className="text-2xl font-bold">{tile.count}</div>
            <div className="text-xs font-medium mt-0.5 opacity-80">{tile.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + Date filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
          {(["upcoming","confirmed","dispatched","arrived","issues","all"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                tab === t ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}>
              {t}
              {t === "issues" && <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">2</span>}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 items-center">
          <span className="text-xs text-slate-400 mr-1">Show:</span>
          {[["1","Today"],["7","7 days"],["14","14 days"],["30","30 days"]] .map(([v, label]) => (
            <button key={v} onClick={() => setDateFilter(v)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                dateFilter === v ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Arrived tab */}
      {tab === "arrived" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500 mb-4">Past orders — mark arrival status for quality tracking.</p>
          {orders.filter(o => ["dispatching", "paid"].includes(o.status)).map(order => (
            <div key={order.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-500">{order.id}</span>
                    <StatusBadge variant="dispatched" />
                  </div>
                  <p className="font-semibold text-slate-900">{order.customer}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Delivery: {order.delivery} · {order.boxes} box{order.boxes !== 1 ? "es" : ""}</p>
                </div>
                <div className="flex gap-2">
                  {["On time","Late","Not arrived"].map(s => (
                    <button key={s} onClick={() => {
                      setArrivedStatus(prev => ({ ...prev, [order.id]: s }));
                      logChange(order.id, `Marked arrival: ${s}`);
                    }}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                        arrivedStatus[order.id] === s
                          ? s === "On time" ? "bg-emerald-600 text-white border-emerald-600"
                            : s === "Late" ? "bg-amber-500 text-white border-amber-500"
                            : "bg-red-600 text-white border-red-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {arrivedStatus[order.id] && arrivedStatus[order.id] !== "On time" && (
                <textarea placeholder="What happened? (optional)" className="w-full text-sm border border-slate-200 rounded-xl p-3 resize-none h-16 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              )}
              {arrivedStatus[order.id] === "On time" && (
                <p className="text-xs text-emerald-600 font-medium">✓ Marked on time by {admin}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Main orders list */}
      {tab !== "arrived" && (
        <div className="space-y-6">
          {days.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
              <p className="text-slate-500 text-sm">No orders match this filter.</p>
              <button onClick={() => setDateFilter("30")} className="mt-3 text-sm text-emerald-600 font-medium hover:text-emerald-800">
                Expand to 30 days →
              </button>
            </div>
          )}

          {days.map(day => {
            const dayOrders = filtered.filter(o => o.delivery === day);
            if (dayOrders.length === 0) return null;
            const totalBoxesDay = boxesOnDay(day);
            const below2Box = totalBoxesDay < 2;

            return (
              <div key={day}>
                {/* Day header */}
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-700">{day}</h3>
                  <span className="text-xs text-slate-400">{totalBoxesDay} box{totalBoxesDay !== 1 ? "es" : ""}</span>
                  {below2Box && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-red-800">⚠️ Only {totalBoxesDay} box — Ecuador minimum 2</span>
                      <button onClick={() => setSampleBoxDay(day)}
                        className="text-xs bg-red-600 text-white px-2.5 py-1 rounded-lg font-semibold hover:bg-red-700 transition-colors">
                        + Sample Box
                      </button>
                      <button
                        onClick={() => {
                          const orderId = dayOrders[0]?.id;
                          if (orderId) { setMoveOrderId(orderId); setMoveTargetDate(null); }
                        }}
                        className="text-xs border border-red-300 text-red-700 px-2.5 py-1 rounded-lg font-medium hover:border-red-400 transition-colors">
                        Move order →
                      </button>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Order</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Items</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Delivery</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayOrders.map((order) => {
                        const logEntries = auditLog[order.id] ?? [];
                        const logOpen = expandedLog.has(order.id);
                        return (
                          <>
                            <tr key={order.id} className="hover:bg-slate-50 transition-colors border-t border-slate-100 first:border-t-0">
                              <td className="px-5 py-4">
                                <p className="font-mono text-xs text-slate-900 font-semibold">{order.id}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{order.submitted}</p>
                                <button
                                  onClick={() => setExpandedLog(prev => {
                                    const next = new Set(prev);
                                    next.has(order.id) ? next.delete(order.id) : next.add(order.id);
                                    return next;
                                  })}
                                  className="text-xs text-violet-600 hover:text-violet-800 mt-0.5 flex items-center gap-0.5">
                                  {logOpen ? "▾" : "▸"} Log ({logEntries.length})
                                </button>
                              </td>
                              <td className="px-5 py-4">
                                <p className="font-medium text-slate-900">{order.customer}</p>
                              </td>
                              <td className="px-5 py-4 hidden md:table-cell">
                                <p className="text-slate-500 text-xs max-w-xs truncate">{order.items}</p>
                              </td>
                              <td className="px-5 py-4">
                                <p className="font-semibold text-slate-900">${order.total.toFixed(2)}</p>
                              </td>
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-slate-700 font-medium">{order.delivery}</p>
                                  <button
                                    onClick={() => { setMoveOrderId(order.id); setMoveTargetDate(null); }}
                                    className="text-slate-300 hover:text-violet-500 transition-colors text-sm"
                                    title="Change delivery date"
                                  >✏️</button>
                                </div>
                                <p className="text-xs text-slate-400">{order.leadDays}d lead</p>
                              </td>
                              <td className="px-5 py-4">
                                <StatusBadge variant={order.status as Parameters<typeof StatusBadge>[0]["variant"]} />
                              </td>
                              <td className="px-5 py-4">
                                {order.status === "payment_failed" ? (
                                  <div className="space-y-1">
                                    {paymentAction[order.id] ? (
                                      <span className="text-xs text-emerald-600 font-medium">✓ {paymentAction[order.id]}</span>
                                    ) : order.hoursToC > 48 ? (
                                      <div className="flex gap-1 flex-wrap">
                                        <button onClick={() => { setPaymentAction(p => ({ ...p, [order.id]: "Retry sent" })); logChange(order.id, "Payment retry triggered"); }}
                                          className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-semibold hover:bg-emerald-700">Retry</button>
                                        <button onClick={() => { setPaymentAction(p => ({ ...p, [order.id]: "Email sent" })); logChange(order.id, "Manual payment email sent to customer"); }}
                                          className="text-xs border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg font-medium hover:border-slate-400">Email</button>
                                      </div>
                                    ) : admin === "Facu" ? (
                                      <div className="space-y-1">
                                        <p className="text-xs text-red-600 font-semibold">⏰ &lt;48h — decide:</p>
                                        <div className="flex gap-1 flex-wrap">
                                          <button onClick={() => { setPaymentAction(p => ({ ...p, [order.id]: "Cancelled" })); logChange(order.id, "Order cancelled — payment failed <48h"); }}
                                            className="text-xs bg-red-600 text-white px-2.5 py-1 rounded-lg font-semibold">Cancel</button>
                                          <button onClick={() => { setPaymentAction(p => ({ ...p, [order.id]: "Force charged" })); logChange(order.id, "Force charge triggered by Facu"); }}
                                            className="text-xs bg-amber-500 text-white px-2.5 py-1 rounded-lg font-semibold">Force</button>
                                          <button onClick={() => { setPaymentAction(p => ({ ...p, [order.id]: "1h grace" })); logChange(order.id, "1h grace given to customer"); }}
                                            className="text-xs border border-blue-300 text-blue-700 px-2.5 py-1 rounded-lg font-medium">+1h</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        <p className="text-xs text-red-600 font-semibold">⏰ &lt;48h — Facu decides</p>
                                        <button onClick={() => { setPaymentAction(p => ({ ...p, [order.id]: "Flagged for Facu" })); logChange(order.id, "Flagged for Facu decision"); }}
                                          className="text-xs border border-red-300 text-red-700 px-2.5 py-1 rounded-lg font-medium mt-1">Flag for Facu</button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <Link href="/mockups/admin-order-detail"
                                    className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold border border-emerald-200 hover:border-emerald-400 px-3 py-1.5 rounded-lg transition-colors">
                                    Open →
                                  </Link>
                                )}
                              </td>
                            </tr>
                            {/* Expandable audit log row */}
                            {logOpen && (
                              <tr key={`${order.id}-log`} className="bg-violet-50 border-t border-violet-100">
                                <td colSpan={7} className="px-5 py-3">
                                  <p className="text-xs font-semibold text-violet-700 mb-2">Change log — {order.id}</p>
                                  {logEntries.length === 0 && (
                                    <p className="text-xs text-slate-400">No changes logged yet.</p>
                                  )}
                                  <div className="space-y-1">
                                    {logEntries.map((e, i) => (
                                      <div key={i} className="flex gap-3 text-xs">
                                        <span className="text-slate-400 shrink-0 w-32">{e.time}</span>
                                        <span className="text-violet-600 shrink-0">{e.actor}</span>
                                        <span className="text-slate-600">{e.action}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sample Box Modal */}
      {sampleBoxDay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="font-bold text-slate-900 text-lg mb-1">Add Sample Box — {sampleBoxDay}</h3>
            <p className="text-slate-500 text-sm mb-4">
              Send a sample box to a prospect to meet the 2-box Ecuador minimum.
            </p>
            <div className="space-y-2 mb-5">
              {PROSPECTS.map(p => (
                <button key={p.name} onClick={() => setSelectedProspect(p.name)}
                  className={`w-full text-left border rounded-xl px-4 py-3 transition-all ${
                    selectedProspect === p.name ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"
                  }`}>
                  <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-400">Contact: {p.contact} · Sample ($0 — marketing cost)</p>
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setSampleBoxDay(null); setSelectedProspect(null); }}
                className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600">Cancel</button>
              <button
                disabled={!selectedProspect}
                onClick={() => { setSampleBoxDay(null); setSelectedProspect(null); }}
                className="text-sm px-5 py-2 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40 hover:bg-emerald-700 transition-colors"
              >Add sample box →</button>
            </div>
          </div>
        </div>
      )}

      {/* Move Order Modal */}
      {moveOrderId && moveOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="font-bold text-slate-900 text-lg mb-1">Move order</h3>
            <p className="text-slate-500 text-sm mb-1">
              <span className="font-mono font-semibold text-slate-700">{moveOrder.id}</span> · {moveOrder.customer}
            </p>
            <p className="text-xs text-slate-400 mb-5">
              Currently: <strong>{moveOrder.delivery}</strong> · Select a new delivery date:
            </p>
            <div className="space-y-2 mb-5">
              {AVAILABLE_MOVE_DATES.filter(d => d.value !== moveOrder.delivery).map(d => (
                <button key={d.value} onClick={() => setMoveTargetDate(d.value)}
                  className={`w-full text-left border rounded-xl px-4 py-3 transition-all ${
                    moveTargetDate === d.value ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-slate-300"
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{d.label}</span>
                    <span className="text-xs text-slate-400">
                      {boxesOnDay(d.value)} box{boxesOnDay(d.value) !== 1 ? "es" : ""} already on this day
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 mb-4">
              <strong>Note:</strong> Customer will receive an email notification about the date change. Card charge date adjusts automatically.
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setMoveOrderId(null); setMoveTargetDate(null); }}
                className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600">Cancel</button>
              <button
                disabled={!moveTargetDate}
                onClick={handleMoveOrder}
                className="text-sm px-5 py-2 rounded-xl bg-violet-600 text-white font-semibold disabled:opacity-40 hover:bg-violet-700 transition-colors"
              >Confirm move →</button>
            </div>
          </div>
        </div>
      )}

      {/* Banner Manager Modal */}
      {bannerOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-lg">Customer Banner</h3>
              <span className="text-xs text-slate-400">Appears at top of every customer&apos;s &quot;My Orders&quot; page</span>
            </div>

            {/* Live preview */}
            <div className={`rounded-2xl p-4 mb-5 relative overflow-hidden ${bannerDraft.active ? "bg-gradient-to-r from-emerald-500 to-emerald-700 text-white" : "bg-slate-100 text-slate-400 opacity-50"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80 mb-0.5">Welcome back 👋</p>
              <p className="font-bold text-base mb-0.5">{bannerDraft.headline || "Banner headline"}</p>
              <p className="text-sm opacity-80 mb-2">{bannerDraft.subtext} Use code <strong className="bg-white/20 px-1.5 py-0.5 rounded font-mono">{bannerDraft.code}</strong></p>
              <button className="text-xs bg-white text-emerald-700 font-semibold px-3 py-1.5 rounded-xl">{bannerDraft.cta}</button>
              <span className="absolute top-2 right-2 text-white/40 text-xs">PREVIEW</span>
            </div>

            <div className="space-y-3 mb-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Show banner to customers</span>
                <button
                  onClick={() => setBannerDraft(p => ({ ...p, active: !p.active }))}
                  className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${bannerDraft.active ? "bg-emerald-500" : "bg-slate-300"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${bannerDraft.active ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Headline</label>
                <input value={bannerDraft.headline} onChange={e => setBannerDraft(p => ({ ...p, headline: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Subtext</label>
                <input value={bannerDraft.subtext} onChange={e => setBannerDraft(p => ({ ...p, subtext: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Promo code</label>
                  <input value={bannerDraft.code} onChange={e => setBannerDraft(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div className="w-28">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Discount</label>
                  <input value={bannerDraft.discount} onChange={e => setBannerDraft(p => ({ ...p, discount: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">CTA button text</label>
                <input value={bannerDraft.cta} onChange={e => setBannerDraft(p => ({ ...p, cta: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setBannerOpen(false)}
                className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600">Discard</button>
              <button onClick={() => { setBanner(bannerDraft); setBannerOpen(false); }}
                className="text-sm px-5 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors">
                Save & publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
