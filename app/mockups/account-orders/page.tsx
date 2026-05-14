"use client";
// Mockup: /account/orders — Customer order history v3
// v3.1 | 2026-05-14 | Job_PM [V8 SHADOW]
// New: inline rating (no navigation), edit order modal, add item modal, show stored rating on card

import { useState } from "react";
import Link from "next/link";
import StatusBadge from "../_components/StatusBadge";
import WhatsAppLink from "../_components/WhatsAppLink";

type OrderStatus = "pending_review" | "confirmed" | "paid" | "dispatching" | "in_transit" | "delivered" | "cancelled";

const STATUS_META: Record<OrderStatus, { step: number }> = {
  pending_review: { step: 1 },
  confirmed:      { step: 2 },
  paid:           { step: 3 },
  dispatching:    { step: 4 },
  in_transit:     { step: 5 },
  delivered:      { step: 6 },
  cancelled:      { step: 0 },
};

type OrderLine = { id: number; name: string; qty: number; unit: string; unitPrice: number };

type Order = {
  id: string; date: string; delivery: string; chargeDate: string;
  summary: string; total: number; status: OrderStatus;
  canEdit: boolean; canAdd: boolean; hoursToC: number;
  invoiceReady: boolean; tracking: string | null;
  address: string; addressConfirmed: boolean;
  feedbackSubmitted?: boolean;
  rating?: number;
  lines: OrderLine[];
};

const PRODUCT_CATALOG = [
  { id: 10, name: "Roses Free Spirit 50CM - Ecoroses ECU", unitPrice: 68.75, unit: "box (125 stems)" },
  { id: 11, name: "Anemone Burgundy Mariane 35CM - Flodecol ECU", unitPrice: 135.00, unit: "QB (125 stems)" },
  { id: 12, name: "Roses Atomic 70CM - Ecoroses ECU", unitPrice: 218.75, unit: "QB (125 stems)" },
  { id: 13, name: "Eucalyptus Silver 60CM - Magic Flowers ECU", unitPrice: 16.00, unit: "HB (50 stems)" },
  { id: 14, name: "Delphinium Dark Blue Sea Waltz 80CM - Flodecol ECU", unitPrice: 121.25, unit: "QB (125 stems)" },
  { id: 15, name: "Bouquets Assorted Round Medium Amazon 50CM - Magic Flowers ECU", unitPrice: 341.50, unit: "HB (50 units)" },
];

const INITIAL_ORDERS: Order[] = [
  {
    id: "FLO-20260523-001", date: "May 13, 2026", delivery: "May 23, 2026", chargeDate: "May 18, 2026",
    summary: "Roses Free Spirit 50CM x2, Anemone Burgundy Mariane 35CM x1", total: 243.00,
    status: "confirmed", canEdit: true, canAdd: true, hoursToC: 96,
    invoiceReady: false, tracking: null,
    address: "1234 Brickell Ave, Suite 100, Miami, FL 33131", addressConfirmed: true,
    lines: [
      { id: 1, name: "Roses Free Spirit 50CM - Ecoroses ECU", qty: 2, unit: "QB", unitPrice: 68.75 },
      { id: 2, name: "Anemone Burgundy Mariane 35CM - Flodecol ECU", qty: 1, unit: "QB", unitPrice: 105.50 },
    ],
  },
  {
    id: "FLO-20260510-002", date: "Apr 28, 2026", delivery: "May 10, 2026", chargeDate: "May 5, 2026",
    summary: "Roses Antonia Garden 60CM x2, Bells of Ireland Green 80-90CM x1", total: 312.00,
    status: "delivered", canEdit: false, canAdd: false, hoursToC: 0,
    invoiceReady: true, tracking: "7748 0001 4443",
    address: "1234 Brickell Ave, Suite 100, Miami, FL 33131", addressConfirmed: true,
    lines: [
      { id: 3, name: "Roses Antonia Garden 60CM - Ecoroses ECU", qty: 2, unit: "QB", unitPrice: 75.00 },
      { id: 4, name: "Bells of Ireland Green 80-90CM - Flodecol ECU", qty: 1, unit: "QB", unitPrice: 140.00 },
    ],
  },
  {
    id: "FLO-20260418-003", date: "Apr 10, 2026", delivery: "Apr 18, 2026", chargeDate: "Apr 13, 2026",
    summary: "Delphinium Dark Blue Sea Waltz 80CM x2, Roses Atomic 70CM x1", total: 388.00,
    status: "delivered", canEdit: false, canAdd: false, hoursToC: 0,
    invoiceReady: true, tracking: "7748 0001 3331",
    address: "1234 Brickell Ave, Suite 100, Miami, FL 33131", addressConfirmed: true,
    feedbackSubmitted: true,
    rating: 5,
    lines: [
      { id: 5, name: "Delphinium Dark Blue Sea Waltz 80CM - Flodecol ECU", qty: 2, unit: "QB", unitPrice: 121.25 },
      { id: 6, name: "Roses Atomic 70CM - Ecoroses ECU", qty: 1, unit: "QB", unitPrice: 218.75 },
    ],
  },
];

function StarRating({ rating, size = "md" }: { rating: number; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "text-base" : size === "lg" ? "text-3xl" : "text-xl";
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={`${s} ${i <= rating ? "opacity-100" : "opacity-20"}`}>⭐</span>
      ))}
    </div>
  );
}

function ProgressBar({ status }: { status: OrderStatus }) {
  const STEPS = ["Placed", "Confirmed", "Paid", "Dispatched", "Transit", "Delivered"];
  const step = STATUS_META[status].step;
  if (status === "cancelled") return null;
  return (
    <div className="flex items-center gap-1 mt-3">
      {STEPS.map((_, i) => (
        <div key={i} className="flex items-center flex-1">
          <div className={`w-2 h-2 rounded-full shrink-0 ${i < step ? "bg-emerald-500" : i === step - 1 ? "bg-emerald-500 ring-2 ring-emerald-200" : "bg-slate-200"}`} />
          {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 ${i < step - 1 ? "bg-emerald-400" : "bg-slate-200"}`} />}
        </div>
      ))}
    </div>
  );
}

export default function AccountOrdersV3() {
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [ratingPanelId, setRatingPanelId] = useState<string | null>(null);
  const [pendingRating, setPendingRating] = useState<Record<string, number>>({});
  const [pendingText, setPendingText] = useState<Record<string, string>>({});
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [editLines, setEditLines] = useState<OrderLine[]>([]);
  const [addItemOrderId, setAddItemOrderId] = useState<string | null>(null);
  const [addItemQty, setAddItemQty] = useState<Record<number, number>>({});
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const detailOrder = detailId ? orders.find(o => o.id === detailId) : null;

  function submitRating(orderId: string) {
    const r = pendingRating[orderId];
    if (!r) return;
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, feedbackSubmitted: true, rating: r } : o
    ));
    setRatingPanelId(null);
  }

  function submitEditOrder() {
    if (!editOrderId) return;
    const newTotal = editLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    setOrders(prev => prev.map(o =>
      o.id === editOrderId
        ? { ...o, lines: editLines, total: newTotal, summary: editLines.map(l => `${l.name} ×${l.qty}`).join(", ") }
        : o
    ));
    setEditOrderId(null);
  }

  function submitAddItems() {
    if (!addItemOrderId) return;
    const order = orders.find(o => o.id === addItemOrderId)!;
    const newLines = [...order.lines];
    let added = false;
    PRODUCT_CATALOG.forEach(p => {
      const qty = addItemQty[p.id] ?? 0;
      if (qty > 0) {
        const existing = newLines.find(l => l.name === p.name);
        if (existing) existing.qty += qty;
        else newLines.push({ id: p.id, name: p.name, qty, unit: p.unit, unitPrice: p.unitPrice });
        added = true;
      }
    });
    if (added) {
      const newTotal = newLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
      setOrders(prev => prev.map(o =>
        o.id === addItemOrderId
          ? { ...o, lines: newLines, total: newTotal, summary: newLines.map(l => `${l.name} ×${l.qty}`).join(", ") }
          : o
      ));
    }
    setAddItemOrderId(null);
    setAddItemQty({});
  }

  // Order detail view
  if (detailOrder) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <button onClick={() => setDetailId(null)} className="text-sm text-slate-500 hover:text-slate-800 mb-6 flex items-center gap-1.5">
          ← My orders
        </button>

        {!detailOrder.addressConfirmed && (
          <div className="mb-5 bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-amber-500 mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Please confirm your delivery address</p>
              <p className="text-xs text-slate-600 mt-0.5">{detailOrder.address}</p>
            </div>
            <button className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg font-semibold">Confirm →</button>
          </div>
        )}

        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{detailOrder.id}</h1>
            <p className="text-slate-500 text-sm mt-0.5">Placed {detailOrder.date} · Delivery {detailOrder.delivery}</p>
          </div>
          <StatusBadge variant={detailOrder.status as Parameters<typeof StatusBadge>[0]["variant"]} />
        </div>

        {detailOrder.status !== "cancelled" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
            <p className="text-sm font-semibold text-slate-700 mb-3">Order progress</p>
            <ProgressBar status={detailOrder.status} />
            <div className="flex justify-between text-xs text-slate-400 mt-1.5">
              {["Placed","Confirmed","Paid","Dispatched","Transit","Delivered"].map(s => <span key={s}>{s}</span>)}
            </div>
            {detailOrder.tracking && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500">FedEx tracking: <span className="font-mono font-semibold text-slate-700">{detailOrder.tracking}</span></p>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
          <p className="text-sm font-semibold text-slate-700 mb-3">Items</p>
          <div className="space-y-2">
            {detailOrder.lines.map(l => (
              <div key={l.id} className="flex justify-between text-sm">
                <span className="text-slate-700">{l.name} ×{l.qty}</span>
                <span className="text-slate-500">${(l.qty * l.unitPrice).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between">
            <span className="text-sm text-slate-500">Total</span>
            <span className="text-sm font-bold text-slate-900">${detailOrder.total.toFixed(2)}</span>
          </div>
        </div>

        {/* Feedback — detail view */}
        {detailOrder.status === "delivered" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
            {detailOrder.feedbackSubmitted ? (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Your rating</p>
                {detailOrder.rating && <StarRating rating={detailOrder.rating} size="lg" />}
                <p className="text-xs text-slate-400 mt-2">Thanks! Your feedback helps us improve.</p>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-700 mb-3">How was this order?</p>
                <div className="flex gap-2 mb-3">
                  {[1,2,3,4,5].map(star => (
                    <button key={star} onClick={() => setPendingRating(p => ({ ...p, [detailOrder.id]: star }))}
                      className={`text-2xl transition-all ${(pendingRating[detailOrder.id] ?? 0) >= star ? "opacity-100" : "opacity-30"}`}>
                      ⭐
                    </button>
                  ))}
                </div>
                <textarea
                  placeholder="What could be better? (optional)"
                  value={pendingText[detailOrder.id] ?? ""}
                  onChange={e => setPendingText(p => ({ ...p, [detailOrder.id]: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-emerald-300 mb-3"
                />
                <button
                  onClick={() => submitRating(detailOrder.id)}
                  disabled={!pendingRating[detailOrder.id]}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-emerald-700 transition-colors"
                >Submit feedback</button>
              </>
            )}
          </div>
        )}

        <div className="flex gap-3 flex-wrap mb-6">
          {detailOrder.invoiceReady && (
            <button className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 shadow-sm">
              Download invoice (PDF) ↓
            </button>
          )}
          {detailOrder.canEdit && (
            <button onClick={() => { setEditLines([...detailOrder.lines]); setEditOrderId(detailOrder.id); }}
              className="px-5 py-2.5 rounded-xl border border-blue-200 text-blue-700 font-semibold text-sm hover:border-blue-400 transition-colors">
              ✏️ Edit order
            </button>
          )}
          {detailOrder.canAdd && (
            <button onClick={() => { setAddItemOrderId(detailOrder.id); setAddItemQty({}); }}
              className="px-5 py-2.5 rounded-xl border border-emerald-200 text-emerald-700 font-semibold text-sm hover:border-emerald-400 transition-colors">
              + Add item
            </button>
          )}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
          <p className="text-sm text-slate-600 mb-2">Questions about this order?</p>
          <WhatsAppLink
            prefill={`Hi, I have a question about order ${detailOrder.id}`}
            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors"
          >
            💬 Message us on WhatsApp →
          </WhatsAppLink>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My orders</h1>
          <p className="text-slate-500 text-sm mt-0.5">Miami Blooms LLC · Wholesale account</p>
        </div>
        <Link href="/shop" className="text-sm px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors">
          Shop again →
        </Link>
      </div>

      {/* Personalized banner — controlled by admin */}
      {!bannerDismissed && (
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-700 rounded-2xl p-5 mb-5 text-white relative overflow-hidden">
          <button onClick={() => setBannerDismissed(true)}
            className="absolute top-3 right-3 text-white/60 hover:text-white text-xl leading-none">×</button>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80 mb-1">Welcome back 👋</p>
          <p className="font-bold text-lg mb-1">10% off your next order</p>
          <p className="text-emerald-100 text-sm mb-3">It&apos;s been a while. Use code <strong className="bg-white/20 px-2 py-0.5 rounded font-mono">RETURN10</strong> at checkout.</p>
          <div className="flex gap-3">
            <Link href="/shop" className="text-sm bg-white text-emerald-700 font-semibold px-4 py-2 rounded-xl hover:bg-emerald-50 transition-colors">
              See pricing →
            </Link>
            <button className="text-sm border border-white/40 text-white font-semibold px-4 py-2 rounded-xl hover:bg-white/10 transition-colors">
              Re-order my last list →
            </button>
          </div>
        </div>
      )}

      {/* Card on file */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-900">Card on file</p>
          <p className="text-xs text-blue-600 mt-0.5">Visa ••4242 · exp 08/28 · Auto-charged T-5 before delivery</p>
        </div>
        <button className="text-xs text-blue-600 font-semibold border border-blue-300 px-3 py-1.5 rounded-lg hover:border-blue-400 transition-colors">
          Manage
        </button>
      </div>

      {/* Orders list */}
      <div className="space-y-4">
        {orders.map(order => {
          const needsFeedback = order.status === "delivered" && !order.feedbackSubmitted;
          const showRatingPanel = ratingPanelId === order.id;

          return (
            <div key={order.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-slate-300 transition-all">
              {/* Main card row — clickable to detail */}
              <div className="p-5 cursor-pointer" onClick={() => setDetailId(order.id)}>
                {!order.addressConfirmed && (
                  <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 font-semibold">
                    ⚠️ Please confirm your delivery address before cutoff
                  </div>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs text-slate-500">{order.id}</span>
                      <StatusBadge variant={order.status as Parameters<typeof StatusBadge>[0]["variant"]} />
                      {/* Show rating if submitted */}
                      {order.feedbackSubmitted && order.rating && (
                        <StarRating rating={order.rating} size="sm" />
                      )}
                      {/* Rate this order badge */}
                      {needsFeedback && !showRatingPanel && (
                        <button
                          onClick={e => { e.stopPropagation(); setRatingPanelId(order.id); }}
                          className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold hover:bg-amber-200 transition-colors"
                        >
                          ⭐ Rate this order
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 truncate">{order.summary}</p>
                    <p className="text-xs text-slate-400 mt-1">Placed {order.date} · Delivery {order.delivery}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-900">${order.total.toFixed(2)}</p>
                    {order.invoiceReady && (
                      <button onClick={e => e.stopPropagation()}
                        className="text-xs text-emerald-600 font-medium mt-1 hover:text-emerald-800">Invoice ↓</button>
                    )}
                  </div>
                </div>

                <ProgressBar status={order.status} />
                {order.status !== "cancelled" && (
                  <div className="flex justify-between text-xs text-slate-300 mt-1">
                    {["Placed","Confirmed","Paid","Dispatched","Transit","Delivered"].map(s => <span key={s}>{s}</span>)}
                  </div>
                )}

                {order.tracking && (
                  <p className="text-xs text-slate-400 mt-2">FedEx <span className="font-mono">{order.tracking}</span></p>
                )}
              </div>

              {/* Inline rating panel */}
              {showRatingPanel && (
                <div className="border-t border-amber-100 bg-amber-50 px-5 py-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-slate-900">How was order {order.id}?</p>
                    <button onClick={() => setRatingPanelId(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
                  </div>
                  <div className="flex gap-2 mb-3">
                    {[1,2,3,4,5].map(star => (
                      <button key={star}
                        onClick={() => setPendingRating(p => ({ ...p, [order.id]: star }))}
                        className={`text-3xl transition-all hover:scale-110 ${(pendingRating[order.id] ?? 0) >= star ? "opacity-100" : "opacity-25"}`}>
                        ⭐
                      </button>
                    ))}
                    {pendingRating[order.id] && (
                      <span className="text-sm text-amber-700 self-center ml-2 font-medium">
                        {["","Needs work","Below average","Good","Very good","Excellent!"][pendingRating[order.id]]}
                      </span>
                    )}
                  </div>
                  <textarea
                    placeholder="Any comments? (optional)"
                    value={pendingText[order.id] ?? ""}
                    onChange={e => setPendingText(p => ({ ...p, [order.id]: e.target.value }))}
                    className="w-full border border-amber-200 rounded-xl p-3 text-sm resize-none h-14 focus:outline-none focus:ring-2 focus:ring-amber-300 mb-3 bg-white"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitRating(order.id)}
                      disabled={!pendingRating[order.id]}
                      className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-emerald-700 transition-colors"
                    >
                      Submit feedback
                    </button>
                    <button onClick={() => setRatingPanelId(null)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:border-slate-300">
                      Maybe later
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons — only when canEdit/canAdd */}
              {(order.canEdit || order.canAdd) && !showRatingPanel && (
                <div className="border-t border-slate-100 px-5 py-3 flex gap-2" onClick={e => e.stopPropagation()}>
                  {order.canEdit && (
                    <button
                      onClick={() => { setEditLines([...order.lines]); setEditOrderId(order.id); }}
                      className="text-xs border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-medium hover:border-blue-400 hover:bg-blue-50 transition-colors">
                      ✏️ Edit order
                    </button>
                  )}
                  {order.canAdd && (
                    <button
                      onClick={() => { setAddItemOrderId(order.id); setAddItemQty({}); }}
                      className="text-xs border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg font-medium hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                      + Add item
                    </button>
                  )}
                  <span className="text-xs text-slate-400 self-center ml-1">
                    Changes allowed until {order.chargeDate}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* WhatsApp CTA */}
      <div className="mt-8 bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
        <p className="text-sm font-semibold text-emerald-900 mb-1">Questions or need to make changes?</p>
        <p className="text-xs text-emerald-700 mb-3">We&apos;re usually available within 30 minutes during business hours.</p>
        <WhatsAppLink
          prefill="Hi Floropolis! I have a question about my order"
          className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors"
        >
          💬 Message us on WhatsApp →
        </WhatsAppLink>
      </div>

      {/* Edit Order Modal */}
      {editOrderId && (() => {
        const ord = orders.find(o => o.id === editOrderId)!;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 text-lg">Edit order</h3>
                <span className="font-mono text-xs text-slate-500">{editOrderId}</span>
              </div>
              <p className="text-xs text-slate-400 mb-4">Adjust quantities before your charge date ({ord.chargeDate}). You cannot change items after that.</p>

              <div className="space-y-3 mb-5">
                {editLines.map((line, i) => (
                  <div key={line.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{line.name}</p>
                      <p className="text-xs text-slate-400">${line.unitPrice.toFixed(2)}/box</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setEditLines(prev => prev.map((l, j) => j === i ? { ...l, qty: Math.max(1, l.qty - 1) } : l))}
                        className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-400 flex items-center justify-center font-bold text-base"
                      >−</button>
                      <span className="w-6 text-center font-semibold text-slate-900">{line.qty}</span>
                      <button
                        onClick={() => setEditLines(prev => prev.map((l, j) => j === i ? { ...l, qty: l.qty + 1 } : l))}
                        className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-400 flex items-center justify-center font-bold text-base"
                      >+</button>
                      <span className="text-sm font-semibold text-slate-700 w-16 text-right">${(line.qty * line.unitPrice).toFixed(2)}</span>
                      <button
                        onClick={() => setEditLines(prev => prev.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600 ml-1 text-sm"
                        title="Remove"
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center mb-5 px-1">
                <span className="text-sm text-slate-500">New total</span>
                <span className="font-bold text-slate-900 text-base">${editLines.reduce((s, l) => s + l.qty * l.unitPrice, 0).toFixed(2)}</span>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 mb-4">
                <strong>Note:</strong> Floropolis will review your changes before the charge date. You&apos;ll receive a confirmation email.
              </div>

              <div className="flex gap-3 justify-end">
                <button onClick={() => setEditOrderId(null)} className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600">Cancel</button>
                <button onClick={submitEditOrder}
                  className="text-sm px-5 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors">
                  Save changes →
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Item Modal */}
      {addItemOrderId && (() => {
        const ord = orders.find(o => o.id === addItemOrderId)!;
        const addTotal = PRODUCT_CATALOG.reduce((s, p) => s + (addItemQty[p.id] ?? 0) * p.unitPrice, 0);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 text-lg">Add items to order</h3>
                <span className="font-mono text-xs text-slate-500">{addItemOrderId}</span>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Delivery: {ord.delivery} · Charge date: {ord.chargeDate} · Add boxes to your existing order.
              </p>

              <div className="space-y-2 mb-5">
                {PRODUCT_CATALOG.map(p => {
                  const qty = addItemQty[p.id] ?? 0;
                  return (
                    <div key={p.id} className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-all ${qty > 0 ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-400">${p.unitPrice.toFixed(2)}/box</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setAddItemQty(prev => ({ ...prev, [p.id]: Math.max(0, (prev[p.id] ?? 0) - 1) }))}
                          disabled={qty === 0}
                          className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-400 flex items-center justify-center font-bold disabled:opacity-30"
                        >−</button>
                        <span className="w-6 text-center font-semibold text-slate-900">{qty}</span>
                        <button
                          onClick={() => setAddItemQty(prev => ({ ...prev, [p.id]: (prev[p.id] ?? 0) + 1 }))}
                          className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:border-emerald-400 hover:text-emerald-700 flex items-center justify-center font-bold"
                        >+</button>
                        {qty > 0 && (
                          <span className="text-sm font-semibold text-emerald-700 w-14 text-right">${(qty * p.unitPrice).toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {addTotal > 0 && (
                <div className="flex justify-between items-center mb-4 px-1">
                  <span className="text-sm text-slate-500">Adding to order</span>
                  <span className="font-bold text-emerald-700 text-base">+${addTotal.toFixed(2)}</span>
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 mb-4">
                <strong>Note:</strong> Adding items sends a request to Floropolis. They&apos;ll confirm availability and update your charge.
              </div>

              <div className="flex gap-3 justify-end">
                <button onClick={() => setAddItemOrderId(null)} className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600">Cancel</button>
                <button
                  onClick={submitAddItems}
                  disabled={addTotal === 0}
                  className="text-sm px-5 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-40 transition-colors">
                  Add {addTotal > 0 ? `(+$${addTotal.toFixed(2)})` : "items"} →
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
