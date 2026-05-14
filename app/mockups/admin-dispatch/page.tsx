"use client";
// Mockup: /admin/dispatch — Daily dispatch manifest v2
// v3.1 | 2026-05-14 | Job_PM [V8 SHADOW]
// New: 3-panel layout, Rose pipeline stepper, sample box insert, label ingest, farm emails, FedEx clarification

import { useState } from "react";
import Link from "next/link";

const DISPATCH_DATE = "May 19, 2026 (Monday)";

type VendorStatus = "pending" | "confirmed" | "needs_followup";
type PipelineStep = { label: string; owner: string; status: "done" | "active" | "pending"; desc: string };

const PIPELINE: PipelineStep[] = [
  { label: "PREP", owner: "Rose", status: "done", desc: "dispatch_prep.py ran at 07:00. Google Sheet updated with Dispatch Prep + FedEx Input tabs." },
  { label: "REVIEW", owner: "Facu", status: "done", desc: "Facu reviewed the Google Sheet, no flags." },
  { label: "DISPATCH", owner: "Facu", status: "active", desc: "Run FedEx Ship Manager from PC using the FedEx Input tab. Generate labels. (PC only)" },
  { label: "LABELS", owner: "Facu", status: "pending", desc: "Upload PDF labels to Google Drive folder after FedEx generates them." },
  { label: "READ", owner: "Rose", status: "pending", desc: "label_reader.py parses PDFs, matches tracking to orders, triggers client email via n8n." },
  { label: "EMAILS", owner: "Rose", status: "pending", desc: "dispatch_vendor_email_drafter.py creates Gmail drafts to farms with labels attached." },
  { label: "SEND", owner: "Facu", status: "pending", desc: "Open Gmail drafts, review, send from facu@floropolis.com." },
  { label: "LOG", owner: "Rose", status: "pending", desc: "dispatch_logger.py updates Supabase with tracking numbers. Runs after Facu confirms emails sent." },
  { label: "PRE-ARRIVAL", owner: "Rose", status: "pending", desc: "Day-before cron sends arrival reminder to client. (prearrival_email.py — copy TBD)" },
];

const SHIPMENTS = [
  {
    orderId: "FLO-20260519-004", customer: "Blooms by Carla", customerCity: "New York, NY",
    farm: "Ecoroses ECU", farmCountry: "Ecuador",
    boxes: [
      { seq: 1, product: "Rose Bicolor Yellow/Red High & Flame Magic 60CM", qty: 125, dims: "100×33×24", weight: "12.5 kg", hts: "0603.11.00", declared: 130.00 },
      { seq: 2, product: "Rose Bicolor Yellow/Red High & Flame Magic 60CM", qty: 125, dims: "100×33×24", weight: "12.5 kg", hts: "0603.11.00", declared: 130.00 },
      { seq: 3, product: "Rose Bicolor Yellow/Red High & Flame Magic 60CM", qty: 125, dims: "100×33×24", weight: "12.5 kg", hts: "0603.11.00", declared: 130.00 },
      { seq: 4, product: "Rose Bicolor Yellow/Red High & Flame Magic 60CM", qty: 125, dims: "100×33×24", weight: "12.5 kg", hts: "0603.11.00", declared: 130.00 },
    ],
    total: 520.00, vendorStatus: "confirmed" as VendorStatus, tracking: "7748 9997 8888",
    emailDraftReady: true, farmEmail: "exports@ecoroses.com.ec",
  },
  {
    orderId: "FLO-20260519-008", customer: "Nasrin Kolyani Design", customerCity: "McLean, VA",
    farm: "Magic Flowers ECU", farmCountry: "Ecuador",
    boxes: [
      { seq: 1, product: "Anemone Fuchsia Mariane 35-40CM", qty: 50, dims: "60×33×24", weight: "7.5 kg", hts: "0603.19.01", declared: 58.00 },
      { seq: 2, product: "Eucalyptus Silver 60CM", qty: 50, dims: "60×33×24", weight: "6.0 kg", hts: "0604.20.00", declared: 16.00 },
    ],
    total: 198.50, vendorStatus: "pending" as VendorStatus, tracking: null,
    emailDraftReady: true, farmEmail: "logistics@magicflowers.ec",
  },
  {
    orderId: "FLO-20260519-009", customer: "Selena Ross Flowers", customerCity: "West Linn, OR",
    farm: "Flodecol ECU", farmCountry: "Colombia",
    boxes: [
      { seq: 1, product: "Delphinium Dark Blue Sea Waltz 80CM", qty: 125, dims: "100×33×24", weight: "9.5 kg", hts: "0603.19.01", declared: 121.00 },
    ],
    total: 312.00, vendorStatus: "needs_followup" as VendorStatus, tracking: null,
    emailDraftReady: false, farmEmail: "exports@flodecol.com.co",
  },
];

const VENDOR_BADGE: Record<VendorStatus, { cls: string; label: string }> = {
  confirmed:      { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", label: "✓ Confirmed" },
  pending:        { cls: "bg-amber-50 text-amber-800 border-amber-200",       label: "⏳ Awaiting" },
  needs_followup: { cls: "bg-red-50 text-red-800 border-red-200",             label: "🚨 Follow up" },
};

const totalBoxes = SHIPMENTS.reduce((s, sh) => s + sh.boxes.length, 0);

const PROSPECTS = [
  { name: "Lily's Petals, Nashville TN", contact: "Sarah J." },
  { name: "Bloom Studio ATL, Atlanta GA", contact: "Mark R." },
  { name: "Floral Dreams, Austin TX", contact: "Ana M." },
];

export default function AdminDispatchV2() {
  const [labelsUploaded, setLabelsUploaded] = useState(false);
  const [labelsCount, setLabelsCount] = useState(0);
  const [emailSent, setEmailSent] = useState<Record<string, boolean>>({});
  const [fedexConfirmed, setFedexConfirmed] = useState(false);
  const [driverConfirmed, setDriverConfirmed] = useState<Record<string, boolean>>({});
  const [sampleBoxModal, setSampleBoxModal] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<string | null>(null);
  const [activeTip, setActiveTip] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([SHIPMENTS[0].orderId]));

  const toggleExpand = (id: string) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const below2Box = totalBoxes < 2;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/mockups/admin-orders" className="text-slate-400 hover:text-slate-700 text-sm">← Orders</Link>
            <span className="text-slate-300">|</span>
            <h1 className="text-2xl font-bold text-slate-900">Dispatch — {DISPATCH_DATE}</h1>
          </div>
          <div className="flex items-center gap-3 flex-wrap text-sm text-slate-500">
            <span>{SHIPMENTS.length} orders · {totalBoxes} boxes · {new Set(SHIPMENTS.map(s => s.farm)).size} farms</span>
            {below2Box ? (
              <span className="bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-lg text-xs font-semibold">⚠️ Below 2-box minimum</span>
            ) : (
              <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-lg text-xs font-semibold">✓ 2-box minimum met ({totalBoxes} boxes)</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-400">← May 18</button>
          <span className="text-sm font-semibold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg">May 19</span>
          <button className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-400">May 20 →</button>
        </div>
      </div>

      {/* FedEx clarification banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
        <span className="text-blue-500 text-lg shrink-0">📦</span>
        <p className="text-sm text-blue-800">
          <strong>FedEx receives at their Quito depot by 10pm.</strong> The truck driver picks up at the farm/vendor typically in the afternoon.
          Pickup confirmation usually arrives via WhatsApp from the driver.
          {" "}<span className="text-blue-600 font-medium">→ Contacts: edgar.freire@fedex.com · Dominique Romero (dromero@entregas.ec)</span>
        </p>
      </div>

      {/* 3-panel layout */}
      <div className="grid lg:grid-cols-3 gap-5 mb-8">

        {/* LEFT — Today's dispatch */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Today&apos;s Dispatch</h2>
            {below2Box && (
              <button onClick={() => setSampleBoxModal(true)}
                className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-700 transition-colors">
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
                {SHIPMENTS.flatMap(sh => sh.boxes.map(box => ({
                  boxLabel: `#${box.seq}`,
                  farm: sh.farm,
                  recipient: sh.customer,
                  tracking: sh.tracking,
                  status: sh.vendorStatus,
                }))).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-700">{row.boxLabel}</td>
                    <td className="px-4 py-2.5 text-slate-600 truncate max-w-[80px]">{row.farm}</td>
                    <td className="px-4 py-2.5 text-slate-600 truncate max-w-[80px]">{row.recipient.split(" ")[0]}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold border ${VENDOR_BADGE[row.status].cls}`}>
                        {row.status === "confirmed" ? "✓" : row.status === "pending" ? "⏳" : "🚨"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Shipment cards (expandable) */}
          <div className="space-y-2">
            {SHIPMENTS.map(sh => (
              <div key={sh.orderId} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50" onClick={() => toggleExpand(sh.orderId)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{sh.customer}</p>
                    <p className="text-xs text-slate-400">{sh.farm} · {sh.boxes.length} box{sh.boxes.length > 1 ? "es" : ""}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${VENDOR_BADGE[sh.vendorStatus].cls}`}>
                    {VENDOR_BADGE[sh.vendorStatus].label}
                  </span>
                  <span className="text-slate-300 text-xs">{expanded.has(sh.orderId) ? "▲" : "▼"}</span>
                </div>
                {expanded.has(sh.orderId) && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    <table className="w-full text-xs">
                      <thead className="text-slate-400">
                        <tr>
                          <th className="text-left pb-1.5 font-semibold">Box</th>
                          <th className="text-left pb-1.5 font-semibold">Product</th>
                          <th className="text-left pb-1.5 font-semibold">Qty</th>
                          <th className="text-left pb-1.5 font-semibold">Wt</th>
                          <th className="text-left pb-1.5 font-semibold">$</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {sh.boxes.map(box => (
                          <tr key={box.seq}>
                            <td className="py-1.5 font-mono font-bold text-slate-700">#{box.seq}</td>
                            <td className="py-1.5 text-slate-600 max-w-[100px] truncate">{box.product.split(" ").slice(0,3).join(" ")}</td>
                            <td className="py-1.5 text-slate-500">{box.qty}</td>
                            <td className="py-1.5 text-slate-500">{box.weight}</td>
                            <td className="py-1.5 text-slate-600 font-semibold">${box.declared}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-2 pt-2 border-t border-slate-100 flex gap-3 text-xs text-slate-400 font-mono flex-wrap">
                      <span>REL: 34458984</span>
                      <span>HTS: {sh.boxes[0].hts}</span>
                      <span>Country: {sh.farmCountry === "Ecuador" ? "EC" : "CO"}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* MIDDLE — Communications */}
        <div className="space-y-4">
          <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Communications</h2>

          {/* Farm emails */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-2">
              📧 Farm emails
              <span className="text-slate-400 font-normal">(Rose auto-drafts via Gmail API)</span>
            </p>
            <div className="space-y-2">
              {SHIPMENTS.map(sh => (
                <div key={sh.orderId} className="border border-slate-100 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{sh.farm}</p>
                      <p className="text-xs text-slate-400">{sh.farmEmail}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{sh.boxes.length} box{sh.boxes.length > 1 ? "es" : ""} → {sh.customer}</p>
                    </div>
                    {sh.emailDraftReady ? (
                      emailSent[sh.orderId] ? (
                        <span className="text-xs text-emerald-600 font-semibold whitespace-nowrap">✓ Sent</span>
                      ) : (
                        <button onClick={() => setEmailSent(p => ({ ...p, [sh.orderId]: true }))}
                          className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0">
                          Send draft
                        </button>
                      )
                    ) : (
                      <span className="text-xs text-amber-600 font-medium whitespace-nowrap">Draft pending</span>
                    )}
                  </div>
                  <div className={`text-xs px-1.5 py-0.5 rounded inline-block ${
                    emailSent[sh.orderId] ? "bg-emerald-50 text-emerald-700" :
                    sh.emailDraftReady ? "bg-amber-50 text-amber-700" :
                    "bg-slate-100 text-slate-500"
                  }`}>
                    {emailSent[sh.orderId] ? "📧 Sent" : sh.emailDraftReady ? "⏸ Draft ready" : "⏳ Building draft"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FedEx notification */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-700 mb-3">📦 FedEx notification</p>
            <div className="text-xs text-slate-500 space-y-1 mb-3">
              <p>To: edgar.freire@fedex.com, dromero@entregas.ec</p>
              <p className="bg-slate-50 rounded-lg p-2 text-slate-600 italic">
                &ldquo;Hi team, Floral Direct LLC dispatch for May 19:
                {totalBoxes} boxes total from {new Set(SHIPMENTS.map(s => s.farm)).size} farms.
                Please confirm receipt at depot tonight before 10pm ECT. Thank you.&rdquo;
              </p>
            </div>
            {fedexConfirmed ? (
              <p className="text-xs text-emerald-600 font-semibold">✓ FedEx notified</p>
            ) : (
              <button onClick={() => setFedexConfirmed(true)}
                className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-slate-700 transition-colors">
                Send FedEx notification
              </button>
            )}
          </div>

          {/* Yesterday's quality */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-700 mb-3">📋 Yesterday&apos;s arrivals (May 18)</p>
            {["Fleur de Luxe – NY", "Harvest Flowers – LA"].map(c => (
              <div key={c} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-xs text-slate-600">{c}</span>
                <button className="text-xs text-emerald-600 font-semibold border border-emerald-200 px-2 py-0.5 rounded-lg hover:bg-emerald-50">
                  Mark arrived ✓
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Labels & confirmations */}
        <div className="space-y-4">
          <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Labels & Confirmations</h2>

          {/* FedEx labels */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-700 mb-3">📋 FedEx labels</p>
            {!labelsUploaded ? (
              <div>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center mb-3">
                  <p className="text-xs text-slate-500 mb-2">Upload PDFs from Google Drive after FedEx generates them</p>
                  <button onClick={() => { setLabelsUploaded(true); setLabelsCount(totalBoxes); }}
                    className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-slate-700 transition-colors">
                    + Upload from Drive
                  </button>
                </div>
                <p className="text-xs text-slate-400 text-center">Expected: {totalBoxes} PDFs for {totalBoxes} boxes</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-emerald-600 font-semibold mb-2">✓ {labelsCount} labels uploaded · label_reader.py will parse shortly</p>
                {[...Array(Math.min(labelsCount, 4))].map((_, i) => (
                  <div key={i} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                    <span className="text-xs font-mono text-slate-600">FedEx_Label_Box{i+1}.pdf</span>
                    <span className="text-xs text-emerald-600 font-semibold">✓ Parsed</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Driver/vendor confirmations */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-700">Driver pickup confirmation</p>
              <span className="text-xs text-slate-400">v2: auto from WhatsApp</span>
            </div>
            <div className="space-y-2 mb-3">
              {SHIPMENTS.map(sh => (
                <div key={sh.orderId} className="flex items-center justify-between py-1.5">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{sh.farm}</p>
                    <p className="text-xs text-slate-400">{sh.farmCountry}</p>
                  </div>
                  {driverConfirmed[sh.orderId] ? (
                    <span className="text-xs text-emerald-600 font-semibold">✓ Picked up</span>
                  ) : (
                    <button onClick={() => setDriverConfirmed(p => ({ ...p, [sh.orderId]: true }))}
                      className="text-xs border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg font-medium hover:border-slate-400">
                      Mark picked up
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">
              <p className="font-semibold text-slate-700 mb-1">Auto-confirmation (v2 preview)</p>
              <p className="text-emerald-600">&ldquo;Driver pickup confirmed via WhatsApp at 4:23pm ECT&rdquo; — [dromero@entregas.ec]</p>
              <p className="text-slate-400 mt-1">This will appear automatically once WhatsApp integration is active.</p>
            </div>
          </div>

          {/* Customs info */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500 space-y-2">
            <p className="font-semibold text-slate-700">Customs</p>
            <div className="flex justify-between"><span>ISS/NSR</span><span className="font-semibold text-slate-700">PPQ 587 active ✓</span></div>
            <div className="flex justify-between"><span>REL_NUMBER</span><span className="font-mono font-semibold text-slate-700">34458984</span></div>
            <div className="flex justify-between"><span>ETD</span><span className="font-semibold text-slate-700">Enabled ✓</span></div>
            <div className="flex justify-between"><span>Broker</span><span className="font-semibold text-slate-700">Andri Molina, Doral FL</span></div>
          </div>
        </div>
      </div>

      {/* Rose Pipeline Status */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-900 text-sm">🌹 Rose Dispatch Pipeline</h2>
          <span className="text-xs text-slate-400">9 steps · Automated by Rose · 3 manual steps remain for Facu</span>
        </div>
        <div className="flex items-start gap-0 overflow-x-auto pb-2">
          {PIPELINE.map((step, i) => (
            <div key={step.label} className="flex items-start flex-shrink-0">
              <div className="flex flex-col items-center w-20">
                <div
                  className={`relative w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border-2 cursor-pointer transition-all ${
                    step.status === "done" ? "bg-emerald-500 border-emerald-500 text-white" :
                    step.status === "active" ? "bg-amber-500 border-amber-500 text-white ring-4 ring-amber-100" :
                    "bg-white border-slate-200 text-slate-400"
                  }`}
                  onClick={() => setActiveTip(activeTip === i ? null : i)}
                >
                  {step.status === "done" ? "✓" : i + 1}
                  {step.owner === "Facu" && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-violet-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">F</span>
                    </div>
                  )}
                </div>
                <p className={`text-xs font-semibold mt-1 text-center ${
                  step.status === "done" ? "text-emerald-700" :
                  step.status === "active" ? "text-amber-700" :
                  "text-slate-400"
                }`}>{step.label}</p>
                <p className="text-xs text-slate-400 text-center">{step.owner}</p>
              </div>
              {i < PIPELINE.length - 1 && (
                <div className={`h-0.5 w-4 mt-5 flex-shrink-0 ${
                  PIPELINE[i + 1].status === "pending" && step.status === "pending" ? "bg-slate-200" :
                  step.status === "done" ? "bg-emerald-400" :
                  "bg-slate-200"
                }`} />
              )}
            </div>
          ))}
        </div>
        {activeTip !== null && (
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
            <strong className="text-slate-900">{PIPELINE[activeTip].label} ({PIPELINE[activeTip].owner}):</strong>{" "}
            {PIPELINE[activeTip].desc}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3">
          Legend: <span className="text-violet-600 font-semibold">F</span> = Facu manual step ·
          Click any step for description
        </p>
      </div>

      {/* Sample Box Modal */}
      {sampleBoxModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="font-bold text-slate-900 text-lg mb-1">Insert Sample Box</h3>
            <p className="text-slate-500 text-sm mb-4">
              Add a sample box to reach the 2-box minimum from Ecuador. Pick a prospect to send it to.
            </p>
            <div className="space-y-2 mb-5">
              {PROSPECTS.map(p => (
                <button key={p.name} onClick={() => setSelectedProspect(p.name)}
                  className={`w-full text-left border rounded-xl px-4 py-3 transition-all ${selectedProspect === p.name ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-400">Contact: {p.contact} · Sample box ($0 — marketing)</p>
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setSampleBoxModal(false); setSelectedProspect(null); }}
                className="text-sm px-4 py-2 rounded-xl border border-slate-200 text-slate-600">Cancel</button>
              <button
                disabled={!selectedProspect}
                onClick={() => { setSampleBoxModal(false); setSelectedProspect(null); }}
                className="text-sm px-5 py-2 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40 hover:bg-emerald-700">
                Add to dispatch →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
