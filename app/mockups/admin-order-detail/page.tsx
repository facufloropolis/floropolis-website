"use client";
// Mockup: /admin/orders/[id] — Order detail v2
// v3.1 | 2026-05-14 | Job_PM [V8 SHADOW]
// New: quick actions, Arrived toggle, Email log, Customer conversations

import { useState } from "react";
import Link from "next/link";
import StatusBadge from "../_components/StatusBadge";
import WhatsAppLink from "../_components/WhatsAppLink";

type Status = "pending_review" | "confirmed" | "cancelled";

const AUDIT_LOG = [
  { time: "May 13, 2026 09:14", actor: "system", action: "Order created from quote #Q-8841" },
  { time: "May 13, 2026 09:14", actor: "system", action: "Stripe SetupIntent created: seti_xxx" },
  { time: "May 13, 2026 09:15", actor: "system", action: "Payment method saved: pm_xxx (Visa ••4242)" },
];

const EMAIL_LOG = [
  { type: "Order confirmation", sent: "May 13, 09:15", status: "opened", icon: "✉️" },
  { type: "Payment receipt", sent: "May 18, 07:02", status: "delivered", icon: "💳" },
  { type: "Tracking number", sent: "May 19, 11:30", status: "opened", icon: "📦" },
  { type: "\"Arrives tomorrow\" reminder", sent: "May 22, 09:00", status: "pending", icon: "📅" },
  { type: "\"How was your order?\" feedback", sent: "--", status: "not_sent", icon: "⭐" },
];

const CONVERSATIONS = [
  { from: "Buonasera Events (orders@buonasera.com)", time: "May 14, 2:12 PM", msg: "Hi! Quick question -- will the roses be fully open or in bud stage when they arrive?", channel: "email" },
  { from: "Facu", time: "May 14, 3:45 PM", msg: "They'll be in bud stage, should open within 2-3 days in your cooler. Perfect for events later in the week.", channel: "email" },
  { from: "Buonasera Events (WhatsApp)", time: "May 20, 9:03 AM", msg: "Just got the box! Everything looks great, very fresh. One stem broken in transit but that's it.", channel: "whatsapp" },
];

const ORDER = {
  id: "FLO-20260523-001",
  customer: { name: "Buonasera Events", email: "orders@buonasera.com", phone: "+1 805 748 2111", city: "Oceano, CA" },
  deliveryDate: "May 23, 2026",
  leadDays: 10,
  leadMode: ">=10 days (Mode A)",
  preauthDate: "May 16, 2026",
  chargeDate: "May 18, 2026",
  address: "2310 Wilmar Avenue, Oceano, CA 93445",
  stripeCustomer: "cus_NzW8q123",
  stripeSetupIntent: "seti_1Pxxx",
  paymentMethod: "Visa ••4242 · exp 08/28",
  lines: [
    { id: 1, name: "Roses Free Spirit 50CM", length: "50cm", vendor: "Ecoroses ECU · Ecuador", boxes: 2, units: 125, unitPrice: 68.75, hts: "0603.11.00" },
    { id: 2, name: "Anemone Burgundy Mariane 35CM", length: "35cm", vendor: "Flodecol ECU · Colombia", boxes: 1, units: 125, unitPrice: 135.00, hts: "0603.19.01" },
  ],
};

const subtotal = ORDER.lines.reduce((s, l) => s + l.boxes * l.unitPrice, 0);

const EMAIL_STATUS_STYLE: Record<string, string> = {
  sent:      "text-blue-600",
  delivered: "text-emerald-600",
  opened:    "text-emerald-700 font-semibold",
  pending:   "text-amber-600",
  not_sent:  "text-slate-400",
};

export default function AdminOrderDetailV2() {
  const [status, setStatus] = useState<Status>("pending_review");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [prices, setPrices] = useState<Record<number, number>>(
    Object.fromEntries(ORDER.lines.map(l => [l.id, l.unitPrice]))
  );
  const [arrivedStatus, setArrivedStatus] = useState<"" | "yes" | "no" | "late">("");
  const [arrivedNote, setArrivedNote] = useState("");
  const [newNote, setNewNote] = useState("");
  const [notes, setNotes] = useState<typeof CONVERSATIONS>([]);
  const [quickActionSent, setQuickActionSent] = useState<string | null>(null);

  const editedSubtotal = ORDER.lines.reduce((s, l) => s + l.boxes * (prices[l.id] ?? l.unitPrice), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Back */}
      <div className="mb-5">
        <Link href="/mockups/admin-orders" className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1.5">
          ← Orders
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <h1 className="text-2xl font-bold text-slate-900">{ORDER.id}</h1>
            <StatusBadge variant={status === "pending_review" ? "pending_review" : status === "confirmed" ? "confirmed" : "cancelled"} />
            <span className="bg-blue-100 text-blue-800 border border-blue-200 px-3 py-1 rounded-full text-xs font-semibold">{ORDER.leadMode}</span>
          </div>
          <p className="text-slate-500 text-sm">{ORDER.customer.name} · Delivery {ORDER.deliveryDate}</p>
        </div>

        {status === "pending_review" && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setEditMode(!editMode)}
              className="text-sm px-4 py-2 rounded-xl border border-slate-200 hover:border-slate-400 text-slate-600 font-medium">
              {editMode ? "Cancel edit" : "Edit prices"}
            </button>
            <button onClick={() => setCancelOpen(true)}
              className="text-sm px-4 py-2 rounded-xl border border-red-200 hover:border-red-400 text-red-600 font-medium">
              Reject
            </button>
            <button onClick={() => { setStatus("confirmed"); setEditMode(false); }}
              className="text-sm px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm">
              Confirm order ✓
            </button>
          </div>
        )}
        {status === "confirmed" && (
          <div className="flex gap-2">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-sm text-emerald-800">
              Charge scheduled: <strong>{ORDER.chargeDate}</strong>
            </div>
            <button className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-medium">Manual charge now</button>
          </div>
        )}
      </div>

      {/* Quick actions bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 mb-6 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quick send:</span>
        {["Tracking update", "Arrives tomorrow", "Request feedback"].map(action => (
          <button key={action}
            onClick={() => setQuickActionSent(action)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
              quickActionSent === action
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
            }`}>
            {quickActionSent === action ? `✓ ${action} sent` : `✉️ ${action}`}
          </button>
        ))}
        <WhatsAppLink
          prefill={`Hi, following up on order ${ORDER.id}`}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700 font-medium transition-all"
        >
          💬 WhatsApp client
        </WhatsAppLink>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-6">

          {/* Line items */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Line items</h2>
              {editMode && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">Editing prices</span>}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500">Product</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500">Boxes</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500">Unit price</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500">Line total</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500">HTS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ORDER.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900">{line.name} {line.length}</p>
                      <p className="text-xs text-slate-400">{line.vendor} · {line.units * line.boxes} stems</p>
                    </td>
                    <td className="px-6 py-4 text-slate-700">{line.boxes}</td>
                    <td className="px-6 py-4">
                      {editMode ? (
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400 text-xs">$</span>
                          <input type="number" value={prices[line.id]}
                            onChange={(e) => setPrices(prev => ({ ...prev, [line.id]: parseFloat(e.target.value) || 0 }))}
                            className="w-20 border border-amber-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                        </div>
                      ) : (
                        <span className="text-slate-700">${(prices[line.id] ?? line.unitPrice).toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900">${(line.boxes * (prices[line.id] ?? line.unitPrice)).toFixed(2)}</td>
                    <td className="px-6 py-4 text-xs text-slate-400 font-mono">{line.hts}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50">
                  <td colSpan={3} className="px-6 py-3 text-right font-semibold text-slate-700 text-sm">Total</td>
                  <td className="px-6 py-3 font-bold text-slate-900">${editedSubtotal.toFixed(2)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            {editMode && (
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
                <button onClick={() => setEditMode(false)} className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600">Discard</button>
                <button onClick={() => setEditMode(false)} className="text-sm px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold">Save price changes</button>
              </div>
            )}
          </div>

          {/* Arrived? — NEW */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Arrived?</h2>
              <span className="text-xs text-slate-400">v3: auto from FedEx tracking</span>
            </div>
            <div className="flex gap-2 mb-3">
              {[["yes","✓ On time","emerald"], ["late","⏰ Late","amber"], ["no","✗ Not arrived","red"]].map(([v, label, color]) => (
                <button key={v} onClick={() => setArrivedStatus(v as typeof arrivedStatus)}
                  className={`text-sm px-4 py-2 rounded-xl border font-medium transition-all ${
                    arrivedStatus === v
                      ? color === "emerald" ? "bg-emerald-600 text-white border-emerald-600"
                        : color === "amber" ? "bg-amber-500 text-white border-amber-500"
                        : "bg-red-600 text-white border-red-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            {arrivedStatus === "yes" && (
              <p className="text-sm text-emerald-700 font-medium">✓ Marked on time · {new Date().toLocaleDateString()}</p>
            )}
            {(arrivedStatus === "late" || arrivedStatus === "no") && (
              <textarea
                placeholder="What happened? (FedEx delay, customs hold, quality issue...)"
                value={arrivedNote}
                onChange={e => setArrivedNote(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            )}
          </div>

          {/* Email log — NEW */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Automated emails</h2>
            <div className="space-y-3">
              {EMAIL_LOG.map((entry, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-lg w-7 shrink-0">{entry.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{entry.type}</p>
                    <p className="text-xs text-slate-400">{entry.sent !== "--" ? `Sent ${entry.sent}` : "Not yet sent"}</p>
                  </div>
                  <span className={`text-xs ${EMAIL_STATUS_STYLE[entry.status] ?? "text-slate-400"} shrink-0 capitalize`}>
                    {entry.status.replace("_", " ")}
                  </span>
                  {entry.status !== "not_sent" && (
                    <button className="text-xs text-slate-400 hover:text-slate-600 underline shrink-0">View</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Customer conversations */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-slate-900">Conversations</h2>
            </div>
            <div className="flex gap-3 mb-4">
              <span className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-1 rounded-lg font-medium">✉ Email (Resend inbound)</span>
              <span className="text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-1 rounded-lg font-medium">💬 WhatsApp (Twilio webhook)</span>
              <span className="text-xs bg-slate-50 border border-slate-200 text-slate-500 px-2 py-1 rounded-lg font-medium">📝 Internal notes</span>
            </div>
            <div className="space-y-3 mb-4">
              {[...CONVERSATIONS, ...notes].map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.from === "Facu" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    msg.from === "Facu" ? "bg-emerald-600 text-white"
                    : msg.channel === "note" ? "bg-violet-100 text-violet-600"
                    : "bg-slate-200 text-slate-600"
                  }`}>
                    {msg.from === "Facu" ? "F" : msg.channel === "whatsapp" ? "💬" : msg.channel === "note" ? "📝" : "✉"}
                  </div>
                  <div className={`flex-1 max-w-sm ${msg.from === "Facu" ? "text-right" : ""}`}>
                    <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm ${
                      msg.from === "Facu" ? "bg-emerald-600 text-white"
                      : msg.channel === "note" ? "bg-violet-50 text-violet-900 border border-violet-200 italic"
                      : "bg-slate-100 text-slate-900"
                    }`}>
                      {msg.msg}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {msg.from !== "Facu" ? msg.from + " · " : ""}
                      {msg.time}
                      {msg.channel === "whatsapp" && <span className="ml-1 text-green-500">· WhatsApp</span>}
                      {msg.channel === "email" && msg.from !== "Facu" && <span className="ml-1 text-slate-400">· Email</span>}
                      {msg.channel === "note" && <span className="ml-1 text-violet-500">· Internal note</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Send outgoing WhatsApp + add note */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add internal note..."
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
                <button
                  onClick={() => {
                    if (newNote.trim()) {
                      setNotes(prev => [...prev, { from: "Facu", time: "Just now", msg: newNote, channel: "note" }]);
                      setNewNote("");
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
                >
                  Note
                </button>
              </div>
              <WhatsAppLink
                prefill={`Hi ${ORDER.customer.name.split(" ")[0]}, following up on your Floropolis order ${ORDER.id}`}
                className="flex items-center gap-2 w-full py-2.5 px-4 rounded-xl border-2 border-green-200 text-green-700 font-semibold text-sm hover:bg-green-50 transition-colors"
              >
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Open WhatsApp with {ORDER.customer.name.split(" ")[0]}
                <span className="text-xs text-green-500 ml-auto font-normal">(opens WhatsApp app)</span>
              </WhatsAppLink>
              <p className="text-xs text-slate-400">Incoming WhatsApp replies auto-logged here via Twilio webhook · Email replies via Resend inbound</p>
            </div>
          </div>

          {/* Payment schedule */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Payment schedule</h2>
            <div className="space-y-3">
              {[
                { date: "May 13", event: "Card saved", detail: "Visa ••4242 · SetupIntent", done: true },
                { date: ORDER.preauthDate, event: "$1 preauth (card alive check)", detail: "Cron at 07:00 ET · auto-voided", done: true },
                { date: ORDER.chargeDate, event: `$${editedSubtotal.toFixed(2)} charged`, detail: "Invoice finalized + auto-charged", done: false },
                { date: ORDER.deliveryDate, event: "Delivery", detail: "FedEx International Priority", done: false },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${step.done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"}`}>
                    {step.done ? "✓" : i + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{step.event}</span>
                      <span className="text-xs text-slate-400">{step.date}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Audit log */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Audit log</h2>
            <div className="space-y-2">
              {[...AUDIT_LOG, ...(status === "confirmed" ? [{ time: "Just now", actor: "facu@floropolis.com", action: "Order confirmed" }] : [])].map((entry, i) => (
                <div key={i} className="flex items-start gap-3 text-xs">
                  <span className="text-slate-400 shrink-0 w-36">{entry.time}</span>
                  <span className="text-violet-600 shrink-0">{entry.actor}</span>
                  <span className="text-slate-600">{entry.action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-3 text-sm">Customer</h3>
            <p className="font-medium text-slate-900">{ORDER.customer.name}</p>
            <p className="text-xs text-slate-500 mt-1">{ORDER.customer.email}</p>
            <p className="text-xs text-slate-500">{ORDER.customer.phone}</p>
            <p className="text-xs text-slate-500">{ORDER.customer.city}</p>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400 font-medium mb-1">Delivery address</p>
              <p className="text-xs text-slate-600 leading-relaxed">{ORDER.address}</p>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <WhatsAppLink
                prefill={`Hi, following up on order ${ORDER.id}`}
                className="text-xs text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1"
              >
                💬 Message on WhatsApp
              </WhatsAppLink>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-3 text-sm">Payment</h3>
            <p className="text-xs text-slate-600">{ORDER.paymentMethod}</p>
            <p className="text-xs text-slate-400 mt-1 font-mono">{ORDER.stripeCustomer}</p>
            <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
              <div className="flex justify-between"><span>Mode</span><span className="font-medium text-slate-700">A (≥10 days)</span></div>
              <div className="flex justify-between"><span>Preauth</span><span className="font-medium text-slate-700">{ORDER.preauthDate}</span></div>
              <div className="flex justify-between"><span>Charge</span><span className="font-medium text-slate-700">{ORDER.chargeDate}</span></div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-3 text-sm">Refund authority</h3>
            <div className="text-xs text-slate-500 space-y-1">
              <div className="flex justify-between"><span>JJ can approve</span><span className="font-medium text-slate-700">≤ $200</span></div>
              <div className="flex justify-between"><span>Facu required</span><span className="font-medium text-slate-700">&gt; $200</span></div>
              <div className="flex justify-between"><span>Both required</span><span className="font-medium text-slate-700">&gt; $500</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel modal */}
      {cancelOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="font-bold text-slate-900 text-lg mb-1">Reject this order?</h3>
            <p className="text-slate-500 text-sm mb-4">Customer will be notified. Card hold (if any) will be released.</p>
            <textarea
              placeholder="Reason for rejection (required)..."
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              className="w-full border border-slate-200 rounded-xl p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCancelOpen(false)} className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600">Back</button>
              <button
                onClick={() => { setStatus("cancelled"); setCancelOpen(false); }}
                disabled={!cancelReason.trim()}
                className="text-sm px-4 py-2 rounded-xl bg-red-600 text-white font-semibold disabled:opacity-40"
              >
                Confirm rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
