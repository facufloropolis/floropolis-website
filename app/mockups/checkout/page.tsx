"use client";
// Mockup: /checkout — Customer card save + order confirmation v2
// v3.1 | 2026-05-14 | Job_PM [V8 SHADOW]
// Changes: credit card only, 3-tier charge explanation (lead time via ?lead=12|7|4), trust badges, branding

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { BRAND } from "../_constants/brand";

const ORDER_ITEMS = [
  { name: "Explorer Red Roses", length: "60cm", boxes: 2, unitsPerBox: 175, unitPrice: 89.50, vendor: "Ecoroses · Ecuador", emoji: "🌹" },
  { name: "Ranunculus Mixed", length: "40cm", boxes: 1, unitsPerBox: 100, unitPrice: 64.00, vendor: "Magic Flowers ECU · Ecuador", emoji: "🌸" },
];

const subtotal = ORDER_ITEMS.reduce((s, i) => s + i.boxes * i.unitPrice, 0);

function getChargeInfo(lead: number) {
  const delivery = new Date("2026-05-23");
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (lead >= 10) {
    const preauth = new Date(delivery); preauth.setDate(delivery.getDate() - 7);
    const charge  = new Date(delivery); charge.setDate(delivery.getDate() - 5);
    return {
      mode: "A",
      label: `${lead} days out`,
      badge: "bg-emerald-50 border-emerald-200 text-emerald-800",
      timeline: [
        { date: "Today",     desc: "Card saved securely via Stripe. Order sent for review." },
        { date: fmt(preauth), desc: `$1 card authorization (${7}-day check, instantly voided).` },
        { date: fmt(charge),  desc: `Full charge of $${subtotal.toFixed(2)} processed automatically.`, highlight: true },
        { date: "May 23",    desc: "Flowers arrive. FedEx International Priority." },
      ],
      chargeDate: fmt(charge),
    };
  } else if (lead >= 6) {
    const charge = new Date(delivery); charge.setDate(delivery.getDate() - 5);
    return {
      mode: "B",
      label: `${lead} days out`,
      badge: "bg-amber-50 border-amber-200 text-amber-800",
      timeline: [
        { date: "Today",     desc: "Card saved + $1 authorization placed immediately (card alive check)." },
        { date: fmt(charge),  desc: `Full charge of $${subtotal.toFixed(2)} processed automatically.`, highlight: true },
        { date: "May 23",    desc: "Flowers arrive." },
      ],
      chargeDate: fmt(charge),
    };
  } else {
    return {
      mode: "C",
      label: `${lead} days out — charged today`,
      badge: "bg-red-50 border-red-200 text-red-800",
      timeline: [
        { date: "Today", desc: `Card saved + full charge of $${subtotal.toFixed(2)} processed immediately (5 days or less).`, highlight: true },
        { date: "May 23", desc: "Flowers arrive." },
      ],
      chargeDate: "Today",
    };
  }
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const lead = parseInt(searchParams.get("lead") ?? "10");
  const chargeInfo = getChargeInfo(lead);

  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expandCharge, setExpandCharge] = useState(true);

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">🌹</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Order confirmed!</h2>
        <p className="text-slate-500 mb-5 leading-relaxed">
          Your card has been saved securely. We&apos;ll review your order and confirm within 4 hours.
        </p>
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 text-left mb-6">
          <p className="text-sm font-semibold text-slate-700 mb-3">Charge schedule</p>
          <div className="space-y-2">
            {chargeInfo.timeline.map((step, i) => (
              <div key={i} className={`flex items-start gap-3 text-sm ${step.highlight ? "font-semibold text-slate-900" : "text-slate-600"}`}>
                <span className="text-xs text-slate-400 w-20 shrink-0 mt-0.5">{step.date}</span>
                <span>{step.desc}</span>
              </div>
            ))}
          </div>
        </div>
        <Link href="/mockups/account-orders"
          className="inline-block bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-emerald-700 transition-colors shadow-md">
          View my order →
        </Link>
        <div className="mt-4">
          <a href={BRAND.whatsappUrl} className="text-sm text-slate-500 hover:text-emerald-600">
            Questions? WhatsApp us {BRAND.whatsappDisplay}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">🌹</span>
          <h1 className="text-2xl font-bold text-slate-900">Confirm your order</h1>
        </div>
        <p className="text-slate-500 text-sm mt-1">
          Save your payment method to reserve this order.{" "}
          <span className={`font-semibold px-2 py-0.5 rounded-full text-xs border ${chargeInfo.badge}`}>
            Mode {chargeInfo.mode} — {chargeInfo.label}
          </span>
        </p>

        {/* Lead time switcher (mockup only) */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400">Preview lead time:</span>
          {[["12","12 days (Mode A)"],["7","7 days (Mode B)"],["4","4 days (Mode C)"]].map(([v, label]) => (
            <a key={v} href={`/mockups/checkout?lead=${v}`}
              className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                lead.toString() === v ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
              }`}>
              {label}
            </a>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-8 items-start">
        {/* LEFT */}
        <div className="space-y-5">

          {/* Contact info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Contact</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                ["Business name", "Miami Blooms LLC"],
                ["Email", "orders@miamiblooms.com"],
                ["Phone", "+1 305 555 0199"],
              ].map(([label, val]) => (
                <div key={label}>
                  <label className="text-xs font-medium text-slate-500 block mb-1">{label}</label>
                  <div className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 bg-slate-50">{val}</div>
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Delivery date</label>
                <div className="border border-emerald-300 bg-emerald-50 rounded-xl px-3 py-2.5 text-sm text-emerald-800 font-medium">
                  May 23, 2026 — {lead} days out
                </div>
              </div>
            </div>
          </div>

          {/* Delivery address */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Delivery address</h2>
              <button className="text-xs text-emerald-600 hover:text-emerald-800 font-medium border border-emerald-200 px-3 py-1 rounded-lg">Edit</button>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700">
              <p className="font-semibold">Miami Blooms — Loading Dock</p>
              <p className="text-slate-500">1234 Brickell Ave, Suite 100</p>
              <p className="text-slate-500">Miami, FL 33131</p>
            </div>
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="text-emerald-600 text-sm">✓</span>
              <p className="text-xs text-emerald-700 font-medium">Address confirmed — FedEx International Priority. Est. arrival 8–10 AM.</p>
            </div>
          </div>

          {/* Payment — CREDIT CARD ONLY */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-slate-900">Payment method</h2>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">Credit / Debit card only</span>
            </div>
            <p className="text-xs text-slate-400 mb-5">Your card is saved via Stripe — charged on <strong>{chargeInfo.chargeDate}</strong>.</p>

            <div className="space-y-3">
              <div className="border border-slate-200 rounded-xl p-4 bg-white">
                <label className="text-xs font-medium text-slate-500 block mb-2">Card number</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-5 bg-slate-100 rounded animate-pulse" />
                  <div className="flex gap-1.5">
                    {["💳","💳","💳","💳"].map((_, i) => (
                      <div key={i} className="w-6 h-4 bg-slate-200 rounded text-xs"></div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-xl p-4 bg-white">
                  <label className="text-xs font-medium text-slate-500 block mb-2">Expiry</label>
                  <div className="h-5 bg-slate-100 rounded animate-pulse" />
                </div>
                <div className="border border-slate-200 rounded-xl p-4 bg-white">
                  <label className="text-xs font-medium text-slate-500 block mb-2">CVC</label>
                  <div className="h-5 bg-slate-100 rounded animate-pulse" />
                </div>
              </div>

              {/* Trust badges */}
              <div className="flex items-center gap-3 flex-wrap pt-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>🔒</span>
                  <span>Powered by Stripe</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>🛡️</span>
                  <span>256-bit encryption</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>✓</span>
                  <span>Card never stored by Floropolis</span>
                </div>
              </div>
            </div>
          </div>

          {/* Charge schedule — expandable */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-4"
              onClick={() => setExpandCharge(!expandCharge)}
            >
              <span className="text-sm font-semibold text-amber-900">When will I be charged?</span>
              <span className="text-amber-600 text-sm">{expandCharge ? "▲" : "▼"}</span>
            </button>
            {expandCharge && (
              <div className="px-5 pb-5 space-y-3">
                {chargeInfo.timeline.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className={`w-20 text-xs font-semibold shrink-0 mt-0.5 ${step.highlight ? "text-amber-900" : "text-amber-700"}`}>{step.date}</span>
                    <span className={`text-sm ${step.highlight ? "font-bold text-amber-900" : "text-amber-800"}`}>{step.desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Terms */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-emerald-600" />
            <span className="text-sm text-slate-600">
              I authorize Floropolis (Floral Direct LLC) to charge <strong>${subtotal.toFixed(2)}</strong> to my
              saved card on <strong>{chargeInfo.chargeDate}</strong>. I can cancel before then for a full refund.
            </span>
          </label>

          <button
            onClick={() => agreed && setSubmitted(true)}
            disabled={!agreed}
            className={`w-full py-4 rounded-2xl font-bold text-base transition-all ${
              agreed ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg" : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            Save card & confirm order →
          </button>
        </div>

        {/* RIGHT — Order summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sticky top-6">
          <h2 className="font-semibold text-slate-900 mb-5">Order summary</h2>
          <div className="space-y-4 mb-5">
            {ORDER_ITEMS.map(item => (
              <div key={item.name} className="flex items-start gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-lg shrink-0">{item.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{item.name} {item.length}</p>
                  <p className="text-xs text-slate-400">{item.vendor}</p>
                  <p className="text-xs text-slate-500">{item.boxes} box{item.boxes > 1 ? "es" : ""} · {item.unitsPerBox * item.boxes} stems</p>
                </div>
                <p className="text-sm font-semibold text-slate-900 shrink-0">${(item.boxes * item.unitPrice).toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Customs & freight</span><span className="text-emerald-600">Included</span></div>
            <div className="flex justify-between font-bold text-slate-900 text-base pt-2 border-t border-slate-100">
              <span>Total</span><span>${subtotal.toFixed(2)}</span>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Delivery</span><span className="font-medium text-slate-600">May 23, 2026</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>Charged on</span><span className="font-medium text-slate-600">{chargeInfo.chargeDate}</span>
            </div>
          </div>
          <div className="mt-4 bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-xs text-slate-500">
              Questions?{" "}
              <a href={BRAND.whatsappUrl} className="text-emerald-600 font-medium">WhatsApp us</a>
              {" "}· {BRAND.whatsappDisplay}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutV2() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>}>
      <CheckoutContent />
    </Suspense>
  );
}
