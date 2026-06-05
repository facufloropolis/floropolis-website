"use client";
// Mockup: /mockups/cohort-review — "Tuesday Cohort Review"
// v1 | 2026-06-05 | Job_PM (CPO)
//
// The CEO's weekly sample-box approval, today a PDF + meeting, becoming Desk cards.
// Static, hardcoded, realistic-fake data from the real sales doc. No DB / API calls.
// Local 'use client' state only — approving a card stamps it; "I see it differently"
// reveals an inline rationale note. No persistence.
//
// Style: emerald-600 primary, slate scale, ASCII-clean copy. Mirrors the visual
// idiom of /admin/desk + /admin/catalog/blocked (badges, cards, uppercase micro-labels).

import { useState } from "react";

// ---------------------------------------------------------------------------
// Hardcoded cohort data (realistic-fake, from the real sales doc).
// ---------------------------------------------------------------------------

type Recommendation = "ENVIAR" | "NURTURE";

interface CohortCard {
  id: string;
  business: string;
  contact: string;
  city: string;
  state: string;
  flora: number;
  reasoning: string;
  addressConfirmed: boolean; // true -> green "confirmed Jun 3"; false -> amber "awaiting"
  boxChoice: string | null; // null -> "REQUIRED before approve"
  composition: string | null;
  salesNotes: string;
  recommendation: Recommendation;
  dealFlag?: string;
  duplicate?: boolean; // 2nd request in 30d
}

const CARDS: CohortCard[] = [
  {
    id: "tinys",
    business: "tinys flowers",
    contact: "Adrian",
    city: "Lansing",
    state: "IL",
    flora: 89,
    reasoning: "High-volume standing buyer, 4-5K stems/wk — fits core supply directly.",
    addressConfirmed: true,
    boxChoice: "HB premium mix",
    composition: "Roses + premium fillers (standard box)",
    salesNotes: "Current supplier $0.88-0.99/stem. Volume buyer, price-sensitive.",
    recommendation: "ENVIAR",
    dealFlag: "DEAL ATTACHED: tier pricing pending Facu",
  },
  {
    id: "athena",
    business: "Roots by Athena",
    contact: "Athena",
    city: "Portland",
    state: "OR",
    flora: 85,
    reasoning: "Garden-rose specialist paying ~$2.00 — premium tier, margin-healthy.",
    addressConfirmed: true,
    boxChoice: "QB garden roses",
    composition: "Garden roses, mixed varieties",
    salesNotes: "Pays ~$2.00/stem today. Cares about stem life on arrival.",
    recommendation: "ENVIAR",
    dealFlag: "PACKAGING EMPHASIS: stem life",
  },
  {
    id: "savko",
    business: "Carolyn savko",
    contact: "Carolyn Savko",
    city: "Los Angeles",
    state: "CA",
    flora: 83,
    reasoning: "Custom $1-2K/wk florist — explicit variado ask, strong repeat profile.",
    addressConfirmed: true,
    boxChoice: "HB variado",
    composition: "VARIADO (explicit ask)",
    salesNotes: "$1-2K/wk custom orders. Wants variety, not single-variety boxes.",
    recommendation: "ENVIAR",
    dealFlag: "COMPOSITION: VARIADO (explicit ask)",
  },
  {
    id: "railtown",
    business: "Railtown Blooms",
    contact: "Sam",
    city: "Tacoma",
    state: "WA",
    flora: 76,
    reasoning: "Event florist — workable, but stem-length expectation needs setting.",
    addressConfirmed: true,
    boxChoice: null,
    composition: null,
    salesNotes: "Event work. Anticipate 50cm min vs her usual 20-30cm.",
    recommendation: "ENVIAR",
    dealFlag: "ANTICIPATE: 50cm min vs her 20-30cm",
  },
  {
    id: "milwood",
    business: "Milwood florist",
    contact: "Dana",
    city: "Milwaukee",
    state: "WI",
    flora: 73,
    reasoning: "Standing weekly buyer, 112 stems — predictable, low-friction.",
    addressConfirmed: true,
    boxChoice: null,
    composition: null,
    salesNotes: "Standing weekly order, 112 stems. Reliable cadence.",
    recommendation: "ENVIAR",
  },
  {
    id: "heaven",
    business: "Heaven Scents",
    contact: "Maria",
    city: "Phoenix",
    state: "AZ",
    flora: 70,
    reasoning: "Just clears the bar — win on value, not on price.",
    addressConfirmed: false,
    boxChoice: null,
    composition: null,
    salesNotes: "Price-shopper. Compete on value not price.",
    recommendation: "ENVIAR",
    dealFlag: "POSITIONING: compete on value not price",
    duplicate: true,
  },
  {
    id: "wagner",
    business: "Dee Wagner",
    contact: "Dee Wagner",
    city: "Denver",
    state: "CO",
    flora: 67,
    reasoning: "Below the send bar — info thin, nurture until discovery call lands.",
    addressConfirmed: false,
    boxChoice: null,
    composition: null,
    salesNotes: "Info thin — discovery call scheduled.",
    recommendation: "NURTURE",
  },
];

// ---------------------------------------------------------------------------
// Card component (local interactivity).
// ---------------------------------------------------------------------------

type Decision = "none" | "approved" | "challenged" | "different";

function FloraBadge({ score }: { score: number }) {
  const emerald = score >= 70;
  return (
    <span
      className={
        "text-[11px] font-bold px-2 py-0.5 rounded-md border tabular-nums " +
        (emerald
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-amber-50 text-amber-700 border-amber-200")
      }
    >
      FLORA {score}
    </span>
  );
}

function CohortCardView({ card }: { card: CohortCard }) {
  const [decision, setDecision] = useState<Decision>("none");
  const [showDifferent, setShowDifferent] = useState(false);
  const [rationale, setRationale] = useState("");

  const approved = decision === "approved";

  return (
    <article
      className={
        "rounded-xl border bg-white overflow-hidden transition-colors " +
        (approved
          ? "border-l-4 border-l-emerald-500 border-slate-200"
          : "border-slate-200")
      }
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-slate-900">
              {card.business}
            </h3>
            {card.recommendation === "NURTURE" && (
              <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                nurture
              </span>
            )}
            {card.duplicate && (
              <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                2nd request in 30d
              </span>
            )}
          </div>
          <div className="text-[12px] text-slate-500 mt-0.5">
            {card.contact} · {card.city}, {card.state}
          </div>
        </div>
        <div className="shrink-0">
          <FloraBadge score={card.flora} />
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Reasoning */}
        <p className="text-sm text-slate-700">{card.reasoning}</p>

        {/* Address-confirmed badge */}
        <div>
          {card.addressConfirmed ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span aria-hidden>✓</span> address confirmed Jun 3
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
              awaiting confirm
            </span>
          )}
        </div>

        {/* Box choice + composition */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">
              Box choice
            </div>
            {card.boxChoice ? (
              <p className="text-sm text-slate-700">{card.boxChoice}</p>
            ) : (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                REQUIRED before approve
              </span>
            )}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">
              Composition
            </div>
            {card.composition ? (
              <p className="text-sm text-slate-700">{card.composition}</p>
            ) : (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                REQUIRED before approve
              </span>
            )}
          </div>
        </div>

        {/* Deal / flag */}
        {card.dealFlag && (
          <div className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">
            {card.dealFlag}
          </div>
        )}

        {/* Sales notes */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">
            Sales notes
          </div>
          <p className="text-sm text-slate-600">{card.salesNotes}</p>
        </div>

        {/* Approved stamp */}
        {approved && (
          <div className="text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">
            approved by Facu — logged
          </div>
        )}
        {decision === "challenged" && (
          <div className="text-[12px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
            challenged — back to sales for rework
          </div>
        )}

        {/* "I see it differently" inline rationale */}
        {showDifferent && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              I see it differently — what is actually correct + why
            </label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="why (recorded with your decision)"
              rows={2}
              className="mt-1 w-full text-sm rounded-md border border-slate-200 px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        )}
      </div>

      {/* Actions row */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setDecision("approved")}
            className="text-sm font-semibold px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => setDecision("challenged")}
            className="text-sm font-medium px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            Challenge
          </button>
          <button
            type="button"
            onClick={() => {
              setShowDifferent((v) => !v);
              setDecision("different");
            }}
            className="text-sm font-medium px-2 py-1.5 rounded-md text-emerald-700 hover:underline"
          >
            I see it differently
          </button>
        </div>
        <input
          type="text"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="why (recorded with your decision)"
          className="w-full text-sm rounded-md border border-slate-200 px-2 py-1.5 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CohortReviewPage() {
  const [approvedAll, setApprovedAll] = useState(false);

  const recommendedSend = CARDS.filter((c) => c.recommendation === "ENVIAR").length;
  const nurture = CARDS.filter((c) => c.recommendation === "NURTURE").length;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">
          Cohort 2026-W24 — Tuesday review
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Your weekly sample-box approval. Each card is one florist; approve,
          challenge, or correct it. Every decision writes the rationale with it.
        </p>
      </div>

      {/* Summary strip */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 font-medium">
          {CARDS.length} cards
        </span>
        <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 font-medium">
          dispatch Thursday Jun 11
        </span>
        <span className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
          {recommendedSend} recommended ENVIAR
        </span>
        <span className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-600 font-medium">
          {nurture} nurture
        </span>
        <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-500">
          backlog remaining ~140
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {CARDS.map((c) => (
          <CohortCardView key={c.id} card={c} />
        ))}
      </div>

      {/* Bottom */}
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => setApprovedAll(true)}
            className="text-sm font-semibold px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Approve all remaining
          </button>
          {approvedAll && (
            <span className="ml-3 text-[12px] font-semibold text-emerald-700">
              all remaining approved — logged
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-400 max-w-xs">
          every decision writes order_status_log with your rationale
        </p>
      </div>
    </main>
  );
}
