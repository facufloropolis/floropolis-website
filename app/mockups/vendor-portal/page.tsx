"use client";
// Mockup: /v/[token] — Vendor/farm pickup confirmation portal
// v3.1 | 2026-05-14 | Job_PM [V8 SHADOW]
// Mobile-first. Farm receives link by email, opens on phone.
// Multi-day view: 14 upcoming dispatch days, per-day confirmation.

import { useState } from "react";

const WA_NUMBER = "17869308463";
const WA_DISPLAY = "+1 (786) 930-8463";

type DayStatus = "pending" | "confirmed" | "auto_confirmed" | "not_required";

interface BoxItem {
  seq: number;
  product: string;
  stems: number;
  weight: string;
  tracking: string;
}

interface DispatchDay {
  id: string;
  date: string;
  dateShort: string;
  dayLabel: string;
  pickupTime: string;
  customer: string;
  orderId: string;
  boxes: BoxItem[];
  status: DayStatus;
  confirmedAt?: string;
  confirmedVia?: string;
  driverName?: string;
}

const FARM = "Ecoroses ECU";
const FARM_CONTACT = "Carlos Mejia";

const DAYS: DispatchDay[] = [
  {
    id: "d1",
    date: "Monday, May 19",
    dateShort: "May 19",
    dayLabel: "Mon",
    pickupTime: "Afternoon -- driver arrives by 4:00 PM",
    customer: "Blooms by Carla · New York, NY",
    orderId: "FLO-20260519-004",
    boxes: [
      { seq: 1, product: "Rose Bicolor Yellow/Red High & Flame Magic 60CM", stems: 125, weight: "12.5 kg", tracking: "7748 9997 8881" },
      { seq: 2, product: "Rose Bicolor Yellow/Red High & Flame Magic 60CM", stems: 125, weight: "12.5 kg", tracking: "7748 9997 8882" },
      { seq: 3, product: "Rose Bicolor Yellow/Red High & Flame Magic 60CM", stems: 125, weight: "11.8 kg", tracking: "7748 9997 8883" },
      { seq: 4, product: "Rose Bicolor Yellow/Red High & Flame Magic 60CM", stems: 125, weight: "11.8 kg", tracking: "7748 9997 8884" },
    ],
    status: "auto_confirmed",
    confirmedAt: "4:23 PM",
    confirmedVia: "WhatsApp",
    driverName: "Miguel Andrade",
  },
  {
    id: "d2",
    date: "Wednesday, May 21",
    dateShort: "May 21",
    dayLabel: "Wed",
    pickupTime: "Afternoon -- driver arrives by 4:00 PM",
    customer: "Selena Ross Flowers · West Linn, OR",
    orderId: "FLO-20260521-002",
    boxes: [
      { seq: 1, product: "Roses Antonia Garden 60CM", stems: 125, weight: "10.2 kg", tracking: "7748 9997 9001" },
      { seq: 2, product: "Roses Antonia Garden 60CM", stems: 125, weight: "10.2 kg", tracking: "7748 9997 9002" },
    ],
    status: "pending",
  },
  {
    id: "d3",
    date: "Friday, May 23",
    dateShort: "May 23",
    dayLabel: "Fri",
    pickupTime: "Afternoon -- driver arrives by 4:00 PM",
    customer: "Buonasera Events · Oceano, CA",
    orderId: "FLO-20260523-001",
    boxes: [
      { seq: 1, product: "Roses Free Spirit 50CM", stems: 125, weight: "11.0 kg", tracking: "7748 9997 9101" },
      { seq: 2, product: "Roses Free Spirit 50CM", stems: 125, weight: "11.0 kg", tracking: "7748 9997 9102" },
    ],
    status: "confirmed",
    confirmedAt: "Yesterday, 3:11 PM",
    confirmedVia: "Portal",
  },
  {
    id: "d4",
    date: "Monday, May 26",
    dateShort: "May 26",
    dayLabel: "Mon",
    pickupTime: "Afternoon -- driver arrives by 4:00 PM",
    customer: "Fleur de Luxe LA · Los Angeles, CA",
    orderId: "FLO-20260526-003",
    boxes: [
      { seq: 1, product: "Roses Cool Water 50CM", stems: 125, weight: "10.8 kg", tracking: "7748 9997 9201" },
      { seq: 2, product: "Roses Cool Water 50CM", stems: 125, weight: "10.8 kg", tracking: "7748 9997 9202" },
    ],
    status: "pending",
  },
  {
    id: "d5",
    date: "Wednesday, May 28",
    dateShort: "May 28",
    dayLabel: "Wed",
    pickupTime: "Afternoon -- driver arrives by 4:00 PM",
    customer: "Magnolia Flowers Nashville · Nashville, TN",
    orderId: "FLO-20260528-009",
    boxes: [
      { seq: 1, product: "Roses Atomic 70CM", stems: 125, weight: "13.5 kg", tracking: "7748 9997 9301" },
      { seq: 2, product: "Roses Atomic 70CM", stems: 125, weight: "13.5 kg", tracking: "7748 9997 9302" },
    ],
    status: "not_required",
  },
];

const STATUS_CONFIG: Record<DayStatus, { label: string; color: string; dot: string }> = {
  pending: { label: "Action needed", color: "text-amber-700 bg-amber-50 border-amber-200", dot: "bg-amber-400" },
  confirmed: { label: "Confirmed", color: "text-emerald-700 bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  auto_confirmed: { label: "Auto-confirmed", color: "text-blue-700 bg-blue-50 border-blue-200", dot: "bg-blue-500" },
  not_required: { label: "No pickup", color: "text-slate-500 bg-slate-50 border-slate-200", dot: "bg-slate-300" },
};

export default function VendorPortalV2() {
  const [statuses, setStatuses] = useState<Record<string, DayStatus>>(
    Object.fromEntries(DAYS.map((d) => [d.id, d.status]))
  );
  const [confirming, setConfirming] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string>("d2"); // open the first pending day
  const [showBoxes, setShowBoxes] = useState<Record<string, boolean>>({});

  const handleConfirm = (dayId: string) => {
    setConfirming(dayId);
    setTimeout(() => {
      setStatuses((prev) => ({ ...prev, [dayId]: "confirmed" }));
      setConfirming(null);
    }, 1200);
  };

  const pendingCount = Object.values(statuses).filter((s) => s === "pending").length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">F</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-none">Floropolis</p>
              <p className="text-xs text-slate-400 leading-none mt-0.5">Farm Portal</p>
            </div>
          </div>
          <a
            href={`https://wa.me/${WA_NUMBER}?text=Hello%2C%20this%20is%20${encodeURIComponent(FARM_CONTACT)}%20from%20${encodeURIComponent(FARM)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-sm"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp us
          </a>
        </div>
      </div>

      {/* FedEx depot clarification banner */}
      <div className="bg-blue-900 text-blue-100">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex gap-2.5 items-start">
            <span className="text-blue-300 text-base mt-0.5">📦</span>
            <div>
              <p className="text-xs font-semibold text-blue-200 mb-0.5">How FedEx pickup works</p>
              <p className="text-xs text-blue-300 leading-relaxed">
                FedEx receives shipments at their <strong className="text-blue-200">Quito depot by 10:00 PM</strong>. Our driver picks up boxes directly from your farm in the afternoon and delivers them to the depot same-day.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Farm greeting + summary */}
      <div className="max-w-lg mx-auto px-4 pt-6 pb-2">
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-slate-500 text-sm">Hello, {FARM_CONTACT}</p>
            <h1 className="text-xl font-bold text-slate-900">Upcoming pickups -- {FARM}</h1>
          </div>
        </div>

        {pendingCount > 0 ? (
          <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              {pendingCount} day{pendingCount > 1 ? "s" : ""} need{pendingCount === 1 ? "s" : ""} your confirmation
            </p>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-800 font-medium">All pickups confirmed — thank you!</p>
          </div>
        )}
      </div>

      {/* 14-day tab row */}
      <div className="max-w-lg mx-auto px-4 mt-4">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {DAYS.map((day) => {
            const cfg = STATUS_CONFIG[statuses[day.id]];
            const isActive = expanded === day.id;
            return (
              <button
                key={day.id}
                onClick={() => setExpanded(isActive ? "" : day.id)}
                className={`shrink-0 flex flex-col items-center px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-slate-900 border-slate-900 text-white shadow-md"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
              >
                <span className="text-[10px] font-medium opacity-60 mb-0.5">{day.dayLabel}</span>
                <span className="font-bold text-sm">{day.dateShort.split(" ")[1]}</span>
                <span className="text-[10px] opacity-60">{day.dateShort.split(" ")[0]}</span>
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${isActive ? "bg-white" : cfg.dot}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Day cards */}
      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {DAYS.map((day) => {
          const currentStatus = statuses[day.id];
          const cfg = STATUS_CONFIG[currentStatus];
          const isOpen = expanded === day.id;
          const isConfirmingThis = confirming === day.id;
          const boxesVisible = showBoxes[day.id];

          return (
            <div
              key={day.id}
              className={`bg-white rounded-2xl border overflow-hidden transition-all ${
                isOpen ? "border-slate-300 shadow-md" : "border-slate-200"
              }`}
            >
              {/* Day header */}
              <button
                className="w-full text-left px-5 py-4 flex items-center justify-between"
                onClick={() => setExpanded(isOpen ? "" : day.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] text-slate-400 font-medium leading-none">{day.dayLabel}</span>
                    <span className="text-base font-bold text-slate-900 leading-none">{day.dateShort.split(" ")[1]}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{day.date}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {day.boxes.length} box{day.boxes.length > 1 ? "es" : ""} · {day.customer.split("·")[0].trim()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div className="border-t border-slate-100">
                  {/* What we need from you */}
                  <div className="px-5 pt-4 pb-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">What we need from you</p>

                    {currentStatus === "not_required" ? (
                      <div className="bg-slate-50 rounded-xl px-4 py-3">
                        <p className="text-sm text-slate-600">No pickup required on this date. Rest easy!</p>
                      </div>
                    ) : currentStatus === "auto_confirmed" ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span className="text-blue-500 mt-0.5">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-blue-900">Driver pickup confirmed via WhatsApp</p>
                            <p className="text-xs text-blue-600 mt-0.5">
                              {day.confirmedAt} · Driver: {day.driverName}
                            </p>
                            <p className="text-xs text-blue-500 mt-1">Floropolis auto-logged this confirmation.</p>
                          </div>
                        </div>
                      </div>
                    ) : currentStatus === "confirmed" ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <div>
                            <p className="text-sm font-semibold text-emerald-900">Pickup confirmed</p>
                            <p className="text-xs text-emerald-600 mt-0.5">
                              {day.confirmedAt ?? "Just now"} via {day.confirmedVia ?? "Portal"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                          <p className="text-sm text-amber-900">
                            <strong>Prepare {day.boxes.length} boxes</strong> and tap the button below once our driver has picked them up.
                          </p>
                          <p className="text-xs text-amber-600 mt-1">{day.pickupTime}</p>
                        </div>
                        <button
                          onClick={() => handleConfirm(day.id)}
                          disabled={isConfirmingThis}
                          className={`w-full py-4 rounded-2xl font-bold text-base transition-all shadow-sm ${
                            isConfirmingThis
                              ? "bg-emerald-400 text-white cursor-wait"
                              : "bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-md active:scale-[0.98]"
                          }`}
                        >
                          {isConfirmingThis
                            ? "Confirming..."
                            : `✓ Driver picked up all ${day.boxes.length} boxes`}
                        </button>
                        <a
                          href={`https://wa.me/${WA_NUMBER}?text=Hi%2C%20${encodeURIComponent(FARM_CONTACT)}%20from%20${encodeURIComponent(FARM)}%20here.%20Driver%20picked%20up%20${day.boxes.length}%20boxes%20for%20order%20${day.orderId}.`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-2 border-emerald-600 text-emerald-700 font-semibold text-sm hover:bg-emerald-50 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                          Confirm via WhatsApp instead
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Order info */}
                  <div className="px-5 pb-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Order details</p>
                    <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-slate-900">{day.orderId}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{day.customer}</p>
                        </div>
                        <span className="text-xs font-semibold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-lg">
                          {day.boxes.length} boxes
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Box manifest toggle */}
                  <div className="px-5 pb-4">
                    <button
                      onClick={() => setShowBoxes((prev) => ({ ...prev, [day.id]: !prev[day.id] }))}
                      className="text-xs font-semibold text-violet-600 flex items-center gap-1"
                    >
                      <svg className={`w-3.5 h-3.5 transition-transform ${boxesVisible ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {boxesVisible ? "Hide" : "View"} box manifest ({day.boxes.length} boxes)
                    </button>

                    {boxesVisible && (
                      <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden">
                        <div className="grid grid-cols-5 bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                          <span>Box</span>
                          <span className="col-span-2">Product</span>
                          <span>Tracking</span>
                          <span className="text-right">Label</span>
                        </div>
                        {day.boxes.map((box) => (
                          <div key={box.seq} className="grid grid-cols-5 px-3 py-2.5 border-t border-slate-100 text-xs items-center">
                            <span className="font-bold text-violet-700">#{box.seq}</span>
                            <span className="col-span-2 text-slate-700 pr-2 truncate">{box.product}</span>
                            <span className="font-mono text-[10px] text-slate-500">{box.tracking}</span>
                            <div className="text-right">
                              <a
                                href="#"
                                onClick={e => e.preventDefault()}
                                className="inline-flex items-center gap-1 text-violet-600 font-semibold border border-violet-200 px-2 py-1 rounded-lg hover:bg-violet-50 transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                                PDF
                              </a>
                            </div>
                          </div>
                        ))}
                        <div className="bg-slate-50 px-3 py-2 border-t border-slate-200 text-xs text-slate-500">
                          Print and attach each label to the corresponding box before driver pickup.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* No more pickups notice */}
        <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4 text-center">
          <p className="text-xs text-slate-400">Showing next 14 days · May 19 – Jun 1, 2026</p>
          <p className="text-xs text-slate-400 mt-0.5">New pickups appear here automatically when orders are confirmed.</p>
        </div>
      </div>

      {/* Sticky WhatsApp footer */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 py-4 max-w-lg mx-auto">
        <a
          href={`https://wa.me/${WA_NUMBER}?text=Hi%2C%20${encodeURIComponent(FARM_CONTACT)}%20from%20${encodeURIComponent(FARM)}%20here.`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2.5 w-full py-3.5 bg-[#25D366] text-white rounded-2xl font-bold text-sm shadow-lg"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          WhatsApp Floropolis — {WA_DISPLAY}
        </a>
      </div>
    </div>
  );
}
