"use client";
// Mockup: /mockups/cohort-review — "Sample Box Cohort Review" (master-detail)
// v2 | 2026-06-05 | Job_PM (CPO)
//
// The CEO's weekly sample-box approval gate, as his desk surface. Burst-session
// optimized: a ranked left rail + a scannable right detail panel + a sticky
// decision bar that stamps the row and auto-advances to the next undecided lead.
// His decision-minutes are the scarcest resource, so the meat (the call analysis,
// the legitimacy evidence, the ask) is front-and-center; data-ops is suppressed.
//
// Static, hardcoded, realistic-fake data from the real sales doc. No DB / API.
// Local 'use client' state only. Decisions are NOT persisted — the summary state
// just narrates what WOULD write to order_status_log on Thursday prep.
//
// Style: emerald-600 primary, slate scale, amber for skeptical/required states.
// Uppercase micro-labels, rounded-xl cards. Mirrors /admin/desk idiom.

import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Hardcoded cohort data (realistic-fake, from the real sales doc).
// ---------------------------------------------------------------------------

type Recommendation = "ENVIAR" | "NURTURE";
type Heat = "hot" | "warm" | "cold";

interface Touchpoints {
  calls: number;
  callMinutes: number;
  emails: number;
  whatsapp: number;
  lastTouch: string;
  thin?: boolean; // "email only — thin"
}

interface Legitimacy {
  website: string | null; // url or null
  gmb: string | null; // "4.7 · 8yr" or null
  zohoAge: string; // "Zoho acct 14 mo"
  businessType: string; // "retail florist"
  weak?: string; // amber note if evidence is weak — overrides to skeptical state
}

// Pattern 3: their economics vs our viable "zona ganable".
// Our viable zone is $0.95–$2.25/stem, GPM floor ~$0.88.
type PriceZone = "ganable" | "borde" | "imposible";

interface Economics {
  theirLow: number; // $/stem they pay (low)
  theirHigh: number; // $/stem they pay (high)
  zone: PriceZone; // ganable=emerald · borde=amber · imposible=red
  note: string; // e.g. "al borde del piso", "zona ganable"
}

interface Analysis {
  callSummary: string;
  keyQuote: string;
  currentSupplier: string; // supplier + prices they pay
  objection: string | null;
  productsOfInterest: string[];
  economics: Economics; // Pattern 3
}

interface Ask {
  boxChoice: string | null; // null -> amber REQUIRED
  composition: string | null; // null -> amber REQUIRED
  flags: string[]; // VARIADO / stem-length anticipation / DEAL ATTACHED
  duplicate?: boolean;
}

// Pattern 2: time-bound urgency. Absence is information — null = no urgency chip.
type UrgencyTone = "red" | "amber";
interface Urgency {
  tone: UrgencyTone;
  label: string;
}

// Pattern 5: recurrence / volume class.
type VolumeClass = "standing" | "event" | "onetime";

interface Lead {
  id: string;
  business: string;
  contact: string;
  city: string;
  state: string;
  flora: number;
  heat: Heat;
  addressConfirmed: boolean;
  recommendation: Recommendation;
  razonClave: string; // Pattern 1: single bold one-liner, drives top of panel + rail row 2
  urgency: Urgency | null; // Pattern 2: null = no urgency (absence is information)
  volume: { class: VolumeClass; label: string }; // Pattern 5
  legitimacy: Legitimacy;
  touchpoints: Touchpoints;
  analysis: Analysis;
  ask: Ask;
}

const LEADS: Lead[] = [
  {
    id: "tinys",
    business: "tinys flowers",
    contact: "Adrian",
    city: "Lansing",
    state: "IL",
    flora: 89,
    heat: "hot",
    addressConfirmed: true,
    recommendation: "ENVIAR",
    razonClave:
      "4-5K stems/sem busca proveedor EC — la cuenta del trimestre, pricing pendiente",
    urgency: { tone: "amber", label: "pidió price sheet en la llamada" },
    volume: { class: "standing", label: "standing weekly ~4-5K stems" },
    legitimacy: {
      website: "tinysflowers.com",
      gmb: "4.8 · 11yr",
      zohoAge: "Zoho acct 9 mo",
      businessType: "retail florist",
    },
    touchpoints: {
      calls: 4,
      callMinutes: 38,
      emails: 6,
      whatsapp: 2,
      lastTouch: "Jun 3",
    },
    analysis: {
      callSummary:
        "Adrian runs 4-5K stems/wk through two storefronts. Today buys from a local importer at $0.88-0.99/stem including shipping and is happy with the price but unhappy with breakage on roses. Asked us to send a price sheet. When I floated $1.30 for premium graded stems he said \"that's a lot\" — but stayed on the call 12 more minutes asking about box composition and consistency, which reads as a price anchor, not a hard no. Wants to see a sample before committing volume.",
      keyQuote:
        "that's a lot — but if the heads hold up I lose less to the trash than I do now",
      currentSupplier: "Local importer — $0.88-0.99/stem incl. shipping",
      objection: "Price sensitive at $1.30 vs his $0.88-0.99; needs breakage proof",
      productsOfInterest: ["Premium roses", "Hydrangea", "Greens / fillers"],
      economics: {
        theirLow: 0.88,
        theirHigh: 0.99,
        zone: "borde",
        note: "al borde del piso — gana con grading, no con precio",
      },
    },
    ask: {
      boxChoice: "HB premium mix",
      composition: "Roses + premium fillers (standard box)",
      flags: ["DEAL ATTACHED — tier pricing pending Facu"],
    },
  },
  {
    id: "athena",
    business: "Roots by Athena",
    contact: "Athena",
    city: "Portland",
    state: "OR",
    flora: 85,
    heat: "hot",
    addressConfirmed: true,
    recommendation: "ENVIAR",
    razonClave:
      "Garden-rose premium a ~$2.00 — zona ganable, gana por vase life no por precio",
    urgency: null,
    volume: { class: "event", label: "event-driven (bodas high-end)" },
    legitimacy: {
      website: "rootsbyathena.co",
      gmb: "4.9 · 6yr",
      zohoAge: "Zoho acct 5 mo",
      businessType: "event florist",
    },
    touchpoints: {
      calls: 3,
      callMinutes: 27,
      emails: 4,
      whatsapp: 0,
      lastTouch: "Jun 2",
    },
    analysis: {
      callSummary:
        "Garden-rose specialist doing high-end weddings. Pays ~$2.00/stem today through a boutique wholesaler and is not price-driven — her whole objection is stem life on arrival, because she preps days ahead. Wants named varieties (not 'assorted garden roses') and asked specifically about cold-chain handling. Margin-healthy account; the sample needs to win on vase life, not price.",
      keyQuote: "I'll pay for quality — what I can't do is open a box of tired heads",
      currentSupplier: "Boutique wholesaler — ~$2.00/stem",
      objection: "Stem life on arrival; wants named varieties + cold-chain proof",
      productsOfInterest: ["Garden roses (named)", "Ranunculus", "Spray roses"],
      economics: {
        theirLow: 2.0,
        theirHigh: 2.0,
        zone: "ganable",
        note: "zona ganable — margen sano, no es price-driven",
      },
    },
    ask: {
      boxChoice: "QB garden roses",
      composition: "Garden roses, mixed varieties (named)",
      flags: ["PACKAGING EMPHASIS — stem life / cold chain"],
    },
  },
  {
    id: "savko",
    business: "Carolyn savko",
    contact: "Carolyn Savko",
    city: "Los Angeles",
    state: "CA",
    flora: 83,
    heat: "hot",
    addressConfirmed: true,
    recommendation: "ENVIAR",
    razonClave:
      "$1-2K/sem custom, pide VARIADO explícito — consolidar 3 proveedores en 1 caja",
    urgency: null,
    volume: { class: "standing", label: "standing weekly $1-2K custom" },
    legitimacy: {
      website: "carolynsavkofloral.com",
      gmb: "4.7 · 13yr",
      zohoAge: "Zoho acct 7 mo",
      businessType: "custom / studio florist",
    },
    touchpoints: {
      calls: 5,
      callMinutes: 44,
      emails: 9,
      whatsapp: 3,
      lastTouch: "Jun 4",
    },
    analysis: {
      callSummary:
        "Does $1-2K/wk in custom and event work, very design-led. Explicitly does NOT want single-variety boxes — she wants variado so she can build palettes per client. Currently splits across three suppliers to get variety and hates the logistics of it; consolidating to one variado box is the real pitch here. Engaged, fast replier, already asked when the first box could ship.",
      keyQuote: "give me variety in one box and you've solved my whole Monday",
      currentSupplier: "3 suppliers split — ~$1.40-1.80/stem blended",
      objection: "None on price — needs guaranteed variety, not single-variety fills",
      productsOfInterest: ["Variado mix", "Premium roses", "Textural / specialty"],
      economics: {
        theirLow: 1.4,
        theirHigh: 1.8,
        zone: "ganable",
        note: "zona ganable — paga por variedad consolidada",
      },
    },
    ask: {
      boxChoice: "HB variado",
      composition: "VARIADO (explicit ask)",
      flags: ["VARIADO — explicit ask"],
    },
  },
  {
    id: "railtown",
    business: "Railtown Blooms",
    contact: "Sam",
    city: "Tacoma",
    state: "WA",
    flora: 76,
    heat: "warm",
    addressConfirmed: true,
    recommendation: "ENVIAR",
    razonClave:
      "Event florist con fechas concretas — workable si seteamos largo de tallo primero",
    urgency: { tone: "red", label: "Valentine's + boda octubre = fechas concretas" },
    volume: { class: "event", label: "event-driven (picos por fecha)" },
    legitimacy: {
      website: "railtownblooms.com",
      gmb: "4.6 · 4yr",
      zohoAge: "Zoho acct 3 mo",
      businessType: "event florist",
    },
    touchpoints: {
      calls: 2,
      callMinutes: 19,
      emails: 3,
      whatsapp: 1,
      lastTouch: "Jun 1",
    },
    analysis: {
      callSummary:
        "Event florist, workable but newer relationship. Usual buy is 20-30cm stems for compact arrangements; our standard box runs 50cm min, so the sample will look 'too tall' to her unless we set the expectation first. Not a blocker — taller stems cut down fine — but the note matters or she reads the box as a mismatch. Interested, just needs framing.",
      keyQuote: "these are gorgeous but they're way longer than what I usually order",
      currentSupplier: "Regional wholesaler — ~$1.10/stem",
      objection: "Stem length mismatch (expects 20-30cm, box is 50cm min)",
      productsOfInterest: ["Roses", "Eucalyptus", "Filler greens"],
      economics: {
        theirLow: 1.1,
        theirHigh: 1.1,
        zone: "ganable",
        note: "zona ganable — dentro del rango viable",
      },
    },
    ask: {
      boxChoice: null,
      composition: null,
      flags: ["ANTICIPATE — 50cm min vs her usual 20-30cm"],
    },
  },
  {
    id: "milwood",
    business: "Milwood florist",
    contact: "Dana",
    city: "Milwaukee",
    state: "WI",
    flora: 73,
    heat: "warm",
    addressConfirmed: true,
    recommendation: "ENVIAR",
    razonClave:
      "Standing weekly 112 stems, predecible — lockear la orden recurrente en nuestros rails",
    urgency: null,
    volume: { class: "standing", label: "standing weekly 112 stems" },
    legitimacy: {
      website: "milwoodflorist.com",
      gmb: "4.5 · 9yr",
      zohoAge: "Zoho acct 12 mo",
      businessType: "retail florist",
    },
    touchpoints: {
      calls: 3,
      callMinutes: 22,
      emails: 5,
      whatsapp: 0,
      lastTouch: "Jun 2",
    },
    analysis: {
      callSummary:
        "Standing weekly buyer, very predictable — last order was 112 stems and the cadence rarely moves. Low-friction account: she's not shopping hard, she just wants reliable Tuesday delivery and consistent grading. The sample box is mostly a formality to confirm grade; the real win is locking the standing order onto our rails.",
      keyQuote: "if it shows up Tuesday and the grade is steady, I'm in",
      currentSupplier: "Current supplier — ~$1.05/stem",
      objection: "None material — wants delivery reliability + consistent grade",
      productsOfInterest: ["Roses", "Carnations", "Daily mixed"],
      economics: {
        theirLow: 1.05,
        theirHigh: 1.05,
        zone: "ganable",
        note: "zona ganable — gana por reliability de delivery",
      },
    },
    ask: {
      boxChoice: null,
      composition: null,
      flags: [],
    },
  },
  {
    id: "heaven",
    business: "Heaven Scents",
    contact: "Maria",
    city: "Phoenix",
    state: "AZ",
    flora: 70,
    heat: "cold",
    addressConfirmed: false,
    recommendation: "ENVIAR",
    razonClave: "Compite por valor, no precio — 2nd request en 30d",
    urgency: null,
    volume: { class: "onetime", label: "one-time? — sin cadencia confirmada" },
    legitimacy: {
      website: null,
      gmb: null,
      zohoAge: "Zoho acct 2 mo",
      businessType: "florist (unverified)",
      weak: "no website found · IG only · GMB unclaimed",
    },
    touchpoints: {
      calls: 1,
      callMinutes: 9,
      emails: 4,
      whatsapp: 2,
      lastTouch: "May 30",
    },
    analysis: {
      callSummary:
        "Just clears the send bar. One short call — she's a hard price-shopper and led with 'what's your cheapest stem.' Legitimacy is thin: no website, Instagram only, GMB unclaimed, Zoho account just 2 months old. Already requested a sample two weeks ago (duplicate). If we send, win on value framing, not price — and confirm the address first, it's still unverified.",
      keyQuote: "what's the cheapest you can do — I buy on price",
      currentSupplier: "Unknown — quoting against an unnamed cheap source",
      objection: "Price-led; legitimacy unverified; address not confirmed",
      productsOfInterest: ["Roses (cheap)", "Mixed bunches"],
      economics: {
        theirLow: 0.8,
        theirHigh: 0.8,
        zone: "imposible",
        note: "$0.80 — imposible de igualar respetando GPM floor",
      },
    },
    ask: {
      boxChoice: null,
      composition: null,
      flags: ["POSITIONING — compete on value not price"],
      duplicate: true,
    },
  },
  {
    id: "wagner",
    business: "Dee Wagner",
    contact: "Dee Wagner",
    city: "Denver",
    state: "CO",
    flora: 67,
    heat: "cold",
    addressConfirmed: false,
    recommendation: "NURTURE",
    razonClave: "info de email muy thin — pedir discovery call primero",
    urgency: null,
    volume: { class: "onetime", label: "one-time? — volumen desconocido" },
    legitimacy: {
      website: "deewagnerdesigns.com",
      gmb: "new · 0 reviews",
      zohoAge: "Zoho acct 1 mo",
      businessType: "studio florist (early)",
    },
    touchpoints: {
      calls: 0,
      callMinutes: 0,
      emails: 2,
      whatsapp: 0,
      lastTouch: "May 28",
      thin: true,
    },
    analysis: {
      callSummary:
        "Below the send bar. No call yet — two emails only, so the file is thin and we don't know volume, current supplier, or real intent. Site exists but the business is brand-new. A discovery call is scheduled; until it lands there's nothing to put in a box. Nurture, don't ship.",
      keyQuote: "(no call yet — email only)",
      currentSupplier: "Unknown — no discovery call completed",
      objection: "Unknown — insufficient information to qualify",
      productsOfInterest: ["TBD — pending discovery call"],
      economics: {
        theirLow: 0,
        theirHigh: 0,
        zone: "imposible",
        note: "sin datos — no se puede ubicar vs zona ganable",
      },
    },
    ask: {
      boxChoice: null,
      composition: null,
      flags: ["NURTURE — discovery call scheduled"],
    },
  },
];

// ---------------------------------------------------------------------------
// Decision model (local only)
// ---------------------------------------------------------------------------

type DecisionKind = "approved" | "challenged" | "different" | "nurtured";

interface DecisionState {
  kind: DecisionKind;
  rationale: string;
}

// Pattern 4: cohort money frame — backlog leads the filters declined this week.
const COHORT_FILTERED_OUT = 21; // declined by filters before reaching this gate
const COST_PER_BOX = 120;
const COHORT_SAVED = COHORT_FILTERED_OUT * COST_PER_BOX; // $2,520 NOT burned

const HEAT_META: Record<Heat, { label: string; dot: string; text: string }> = {
  hot: { label: "Hot", dot: "bg-red-500", text: "text-red-600" },
  warm: { label: "Warm", dot: "bg-amber-500", text: "text-amber-600" },
  cold: { label: "Cold", dot: "bg-slate-400", text: "text-slate-500" },
};

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function FloraBadge({ score, size = "sm" }: { score: number; size?: "sm" | "lg" }) {
  const emerald = score >= 70;
  const pad = size === "lg" ? "text-xs px-2.5 py-1" : "text-[10px] px-1.5 py-0.5";
  return (
    <span
      className={
        "font-bold rounded-md border tabular-nums shrink-0 " +
        pad +
        " " +
        (emerald
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-amber-50 text-amber-700 border-amber-200")
      }
    >
      FLORA {score}
    </span>
  );
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
      {children}
    </div>
  );
}

function Chip({
  tone = "slate",
  children,
}: {
  tone?: "slate" | "emerald" | "amber" | "red";
  children: React.ReactNode;
}) {
  const map = {
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
  } as const;
  return (
    <span
      className={
        "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border " +
        map[tone]
      }
    >
      {children}
    </span>
  );
}

// Pattern 3: mini price-position bar. Viable zone $0.95–$2.25, GPM floor ~$0.88.
const ZONE_FLOOR = 0.88;
const ZONE_LOW = 0.95;
const ZONE_HIGH = 2.25;
const SCALE_MIN = 0.7; // a touch below floor so "imposible" sits left of the floor
const SCALE_MAX = 2.4;

function PricePosition({ econ }: { econ: Economics }) {
  const toneMap = {
    ganable: { chip: "emerald" as const, dot: "bg-emerald-500", text: "text-emerald-700" },
    borde: { chip: "amber" as const, dot: "bg-amber-500", text: "text-amber-700" },
    imposible: { chip: "red" as const, dot: "bg-red-500", text: "text-red-700" },
  };
  const t = toneMap[econ.zone];
  const span = SCALE_MAX - SCALE_MIN;
  const pct = (v: number) =>
    Math.max(0, Math.min(100, ((v - SCALE_MIN) / span) * 100));
  const hasData = econ.theirHigh > 0;
  const mid = (econ.theirLow + econ.theirHigh) / 2;
  const priceLabel =
    econ.theirLow === econ.theirHigh
      ? `$${econ.theirLow.toFixed(2)}`
      : `$${econ.theirLow.toFixed(2)}–$${econ.theirHigh.toFixed(2)}`;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={"text-[13px] font-semibold tabular-nums " + t.text}>
          {hasData ? `${priceLabel}/stem` : "sin datos"}
        </span>
        <Chip tone={t.chip}>{econ.note}</Chip>
      </div>
      {/* track: floor → ganable window highlighted */}
      <div className="relative h-2 rounded-full bg-slate-100">
        {/* viable zone band */}
        <div
          className="absolute top-0 h-full rounded-full bg-emerald-100"
          style={{
            left: `${pct(ZONE_LOW)}%`,
            width: `${pct(ZONE_HIGH) - pct(ZONE_LOW)}%`,
          }}
        />
        {/* GPM floor marker */}
        <div
          className="absolute top-[-2px] h-[calc(100%+4px)] w-px bg-slate-400"
          style={{ left: `${pct(ZONE_FLOOR)}%` }}
          title="GPM floor ~$0.88"
        />
        {/* their position */}
        {hasData && (
          <div
            className={"absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-white shadow " + t.dot}
            style={{ left: `${pct(mid)}%` }}
            aria-label="their price position"
          />
        )}
      </div>
      <div className="flex justify-between mt-1 text-[9px] uppercase tracking-wide text-slate-400 font-semibold">
        <span>floor $0.88</span>
        <span>zona ganable $0.95–$2.25</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left rail — ranked compact queue
// ---------------------------------------------------------------------------

function QueueRow({
  lead,
  index,
  active,
  decision,
  onSelect,
}: {
  lead: Lead;
  index: number;
  active: boolean;
  decision?: DecisionState;
  onSelect: () => void;
}) {
  const heat = HEAT_META[lead.heat];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        "w-full text-left rounded-xl border px-3 py-2.5 transition-colors " +
        (active
          ? "border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-200"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50")
      }
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-slate-400 tabular-nums w-4 shrink-0">
          {index + 1}
        </span>
        <span
          className={"h-2 w-2 rounded-full shrink-0 " + heat.dot}
          title={heat.label}
          aria-hidden
        />
        <span className="text-sm font-semibold text-slate-900 truncate flex-1 min-w-0">
          {lead.business}
        </span>
        {decision ? (
          decision.kind === "approved" ? (
            <span className="text-emerald-600 text-sm shrink-0" aria-label="approved">
              ✓
            </span>
          ) : decision.kind === "challenged" ? (
            <span className="text-amber-600 text-[11px] font-bold shrink-0">!</span>
          ) : decision.kind === "nurtured" ? (
            <span className="text-slate-400 text-[11px] font-semibold shrink-0">~</span>
          ) : (
            <span className="text-slate-500 text-[11px] font-bold shrink-0">≠</span>
          )
        ) : (
          <FloraBadge score={lead.flora} />
        )}
      </div>
      <div className="flex items-center gap-2 mt-1 pl-6">
        <span className={"text-[10px] font-medium " + heat.text}>{heat.label}</span>
        <span className="text-slate-300">·</span>
        {lead.addressConfirmed ? (
          <span className="text-[10px] text-emerald-600 inline-flex items-center gap-0.5">
            <span aria-hidden>✓</span> addr
          </span>
        ) : (
          <span className="text-[10px] text-amber-600">addr ?</span>
        )}
        {lead.recommendation === "NURTURE" && (
          <>
            <span className="text-slate-300">·</span>
            <span className="text-[10px] text-slate-400">nurture</span>
          </>
        )}
        {decision && (
          <>
            <span className="text-slate-300">·</span>
            <span className="text-[10px] text-slate-400">
              {decision.kind === "approved"
                ? "approved"
                : decision.kind === "challenged"
                  ? "challenged"
                  : decision.kind === "nurtured"
                    ? "nurtured"
                    : "noted"}
            </span>
          </>
        )}
      </div>
      {/* Pattern 1: razón clave as truncated row-2 */}
      <p className="text-[11px] text-slate-500 mt-1 pl-6 truncate">
        {lead.razonClave}
      </p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Right panel — full lead detail in scannable zones
// ---------------------------------------------------------------------------

function DetailPanel({
  lead,
  decision,
  onDecide,
}: {
  lead: Lead;
  decision?: DecisionState;
  onDecide: (kind: DecisionKind, rationale: string) => void;
}) {
  const [showDifferent, setShowDifferent] = useState(false);
  const [rationale, setRationale] = useState("");
  const heat = HEAT_META[lead.heat];
  const L = lead.legitimacy;
  const T = lead.touchpoints;
  const A = lead.analysis;
  const K = lead.ask;
  // NB: the parent keys this component by lead.id, so it remounts on each
  // selection — showDifferent/rationale reset to defaults automatically.

  return (
    <div className="flex flex-col h-full">
      {/* scrollable zones */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 pb-28">
        {/* ── PATTERN 1: RAZÓN CLAVE — bold one-liner above everything ─── */}
        <div className="rounded-xl border-l-4 border-l-emerald-500 border border-slate-200 bg-white px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 mb-0.5">
            Razón clave
          </div>
          <p className="text-[15px] font-bold text-slate-900 leading-snug">
            {lead.razonClave}
          </p>
        </div>

        {/* ── ZONE A: IDENTITY + LEGITIMACY ───────────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900">{lead.business}</h2>
                {lead.recommendation === "NURTURE" && (
                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                    nurture
                  </span>
                )}
              </div>
              <div className="text-[12px] text-slate-500 mt-0.5">
                {lead.contact} · {lead.city}, {lead.state}
              </div>
            </div>
            <FloraBadge score={lead.flora} size="lg" />
          </div>

          <MicroLabel>Real florist? — evidence</MicroLabel>
          <div className="flex flex-wrap gap-1.5">
            {L.weak ? (
              <Chip tone="amber">⚠ {L.weak}</Chip>
            ) : (
              <>
                {L.website && (
                  <a
                    href={"https://" + L.website}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.preventDefault()}
                    className="inline-flex"
                  >
                    <Chip tone="emerald">🔗 {L.website}</Chip>
                  </a>
                )}
                {L.gmb && <Chip tone="emerald">GMB {L.gmb}</Chip>}
              </>
            )}
            <Chip tone={L.weak ? "amber" : "slate"}>{L.zohoAge}</Chip>
            <Chip tone="slate">{L.businessType}</Chip>
          </div>

          {/* Pattern 5: volume / recurrence profile + Pattern 2: urgency window.
              Urgency absence is information — no chip when lead.urgency is null. */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <Chip tone="slate">
              <span className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold mr-0.5">
                vol
              </span>
              {lead.volume.label}
            </Chip>
            {lead.urgency && (
              <Chip tone={lead.urgency.tone === "red" ? "red" : "amber"}>
                ⏱ {lead.urgency.label}
              </Chip>
            )}
          </div>
        </section>

        {/* ── ZONE B: RELATIONSHIP ────────────────────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <MicroLabel>Relationship — touchpoints</MicroLabel>
          <div className="flex items-center gap-2 flex-wrap text-[13px] text-slate-700">
            {T.thin ? (
              <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                ⚠ email only — thin
              </span>
            ) : (
              <span className="font-medium">
                {T.calls} {T.calls === 1 ? "call" : "calls"}{" "}
                <span className="text-slate-400">
                  ({T.callMinutes} min total)
                </span>
              </span>
            )}
            <span className="text-slate-300">·</span>
            <span>{T.emails} emails</span>
            {T.whatsapp > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span>{T.whatsapp} WhatsApp</span>
              </>
            )}
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">last touch {T.lastTouch}</span>
          </div>
          <div className="flex items-center gap-2 mt-2.5">
            <span
              className={
                "inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-md border " +
                "bg-white border-slate-200 " +
                heat.text
              }
            >
              <span className={"h-2 w-2 rounded-full " + heat.dot} aria-hidden />
              Heat_Band: {heat.label}
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border bg-slate-50 text-slate-600 border-slate-200 tabular-nums">
              Interest_Score {lead.flora}
            </span>
          </div>
        </section>

        {/* ── ZONE C: THE ANALYSIS (the meat) ─────────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <MicroLabel>The analysis — latest call</MicroLabel>
          <p className="text-sm text-slate-700 leading-relaxed">{A.callSummary}</p>

          {/* Pull-quote */}
          <blockquote className="mt-3 border-l-4 border-emerald-400 bg-emerald-50/50 rounded-r-md pl-3 pr-2 py-2">
            <p className="text-sm font-medium text-emerald-900 italic">
              “{A.keyQuote}”
            </p>
            <span className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">
              key quote · {lead.contact}
            </span>
          </blockquote>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <MicroLabel>Current supplier + price</MicroLabel>
              <p className="text-[13px] text-slate-700">{A.currentSupplier}</p>
            </div>
            <div>
              <MicroLabel>Objection</MicroLabel>
              {A.objection ? (
                <p className="text-[13px] text-slate-700">{A.objection}</p>
              ) : (
                <p className="text-[13px] text-slate-400">none surfaced</p>
              )}
            </div>
          </div>

          {/* Pattern 3: their economics vs our zona ganable ($0.95–$2.25, floor ~$0.88) */}
          <div className="mt-3">
            <MicroLabel>Their economics vs zona ganable</MicroLabel>
            <PricePosition econ={A.economics} />
          </div>

          <div className="mt-3">
            <MicroLabel>Products of interest</MicroLabel>
            <div className="flex flex-wrap gap-1.5">
              {A.productsOfInterest.map((p) => (
                <Chip key={p} tone="slate">
                  {p}
                </Chip>
              ))}
            </div>
          </div>
        </section>

        {/* ── ZONE D: THE ASK ─────────────────────────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <MicroLabel>The ask — sample box</MicroLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <MicroLabel>Box choice</MicroLabel>
              {K.boxChoice ? (
                <p className="text-[13px] text-slate-800 font-medium">{K.boxChoice}</p>
              ) : (
                <Chip tone="amber">REQUIRED before approve</Chip>
              )}
            </div>
            <div>
              <MicroLabel>Composition</MicroLabel>
              {K.composition ? (
                <p className="text-[13px] text-slate-800 font-medium">
                  {K.composition}
                </p>
              ) : (
                <Chip tone="amber">REQUIRED before approve</Chip>
              )}
            </div>
          </div>

          {(K.flags.length > 0 || K.duplicate) && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {K.duplicate && (
                <Chip tone="amber">⟳ 2nd request in 30d</Chip>
              )}
              {K.flags.map((f) => {
                const isDeal = f.startsWith("DEAL ATTACHED");
                const isNurture = f.startsWith("NURTURE");
                return (
                  <Chip key={f} tone={isDeal ? "emerald" : isNurture ? "slate" : "amber"}>
                    {f}
                  </Chip>
                );
              })}
            </div>
          )}
        </section>

        {/* Decision echo (when already decided) */}
        {decision && (
          <div
            className={
              "rounded-xl border px-4 py-3 text-[13px] font-medium " +
              (decision.kind === "approved"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : decision.kind === "nurtured"
                  ? "bg-slate-50 border-slate-200 text-slate-600"
                  : "bg-amber-50 border-amber-200 text-amber-800")
            }
          >
            {decision.kind === "approved" && "Approved — will write order_status_log Thursday prep."}
            {decision.kind === "challenged" && "Challenged — routed back to sales for rework."}
            {decision.kind === "different" && "Marked “I see it differently” — your note is recorded with the decision."}
            {decision.kind === "nurtured" && "Held for nurture — discovery call to land first."}
            {decision.rationale && (
              <p className="mt-1 font-normal italic text-slate-600">
                “{decision.rationale}”
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── ZONE E: STICKY DECISION BAR ───────────────────────────────── */}
      <div className="border-t border-slate-200 bg-white/95 backdrop-blur px-5 py-3 space-y-2 sticky bottom-0">
        {showDifferent && (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              I see it differently — what is actually correct + why
            </label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="why (recorded with your decision)"
              rows={2}
              className="mt-1 w-full text-sm rounded-md border border-amber-200 px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() =>
              onDecide(
                lead.recommendation === "NURTURE" ? "nurtured" : "approved",
                rationale,
              )
            }
            className="text-sm font-semibold px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {lead.recommendation === "NURTURE" ? "Hold nurture & next" : "Approve & next"}
          </button>
          <button
            type="button"
            onClick={() => onDecide("challenged", rationale)}
            className="text-sm font-medium px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            Challenge
          </button>
          <button
            type="button"
            onClick={() => setShowDifferent((v) => !v)}
            className={
              "text-sm font-medium px-3 py-2 rounded-lg border " +
              (showDifferent
                ? "bg-amber-100 border-amber-300 text-amber-800"
                : "bg-white border-slate-200 text-emerald-700 hover:bg-slate-50")
            }
          >
            I see it differently
          </button>
        </div>
        <input
          type="text"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="why (recorded with your decision)"
          className="w-full text-sm rounded-md border border-slate-200 px-2.5 py-1.5 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page (master-detail orchestration)
// ---------------------------------------------------------------------------

export default function CohortReviewPage() {
  const [decisions, setDecisions] = useState<Record<string, DecisionState>>({});
  const [selectedId, setSelectedId] = useState<string>(LEADS[0].id);

  const recommendedSend = LEADS.filter((l) => l.recommendation === "ENVIAR").length;
  const nurture = LEADS.filter((l) => l.recommendation === "NURTURE").length;

  const reviewedCount = Object.keys(decisions).length;
  const total = LEADS.length;
  const allDone = reviewedCount === total;

  const counts = useMemo(() => {
    const vals = Object.values(decisions);
    return {
      approved: vals.filter((d) => d.kind === "approved").length,
      challenged: vals.filter((d) => d.kind === "challenged").length,
      nurtured: vals.filter((d) => d.kind === "nurtured").length,
      different: vals.filter((d) => d.kind === "different").length,
    };
  }, [decisions]);

  const selected = LEADS.find((l) => l.id === selectedId) ?? LEADS[0];

  function decide(kind: DecisionKind, rationale: string) {
    const next = { ...decisions, [selectedId]: { kind, rationale } };
    setDecisions(next);
    // auto-advance to next undecided lead
    const order = LEADS.map((l) => l.id);
    const start = order.indexOf(selectedId);
    for (let i = 1; i <= order.length; i++) {
      const candidate = order[(start + i) % order.length];
      if (!next[candidate]) {
        setSelectedId(candidate);
        return;
      }
    }
    // none left — stay on current (summary surfaces below)
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          Sample Box Cohort — 2026-W24
          <span className="text-slate-400 font-medium">
            {" "}
            · Tuesday review → Thursday dispatch
          </span>
        </h1>
        <p className="text-[13px] text-slate-500 mt-1">
          7 to review · ~10 min · {recommendedSend} recommended{" "}
          <span className="font-semibold text-emerald-600">ENVIAR</span> · {nurture}{" "}
          nurture · backlog 140
        </p>
        {/* Pattern 4: cohort money frame */}
        <p className="text-[13px] text-slate-600 mt-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium text-emerald-800">
            filtering 21 of backlog → ${COHORT_SAVED.toLocaleString()} NOT burned
            <span className="text-emerald-600 font-normal">($120/box)</span>
          </span>
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden max-w-md">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${(reviewedCount / total) * 100}%` }}
          />
        </div>
        <span className="text-[12px] font-semibold text-slate-600 tabular-nums">
          {reviewedCount} of {total} reviewed
        </span>
      </div>

      {/* Master-detail grid (rail collapses to horizontal chips on mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4 items-start">
        {/* Left rail */}
        <aside className="lg:sticky lg:top-4">
          {/* Desktop: vertical ranked queue */}
          <div className="hidden lg:flex lg:flex-col gap-2">
            {LEADS.map((lead, i) => (
              <QueueRow
                key={lead.id}
                lead={lead}
                index={i}
                active={lead.id === selectedId}
                decision={decisions[lead.id]}
                onSelect={() => setSelectedId(lead.id)}
              />
            ))}
            {/* Pattern 7: calibration strip — rep vs FLORA agreement */}
            <div className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Rep vs FLORA agreement
                </span>
                <span className="text-[12px] font-bold text-emerald-700 tabular-nums">
                  25/28 · 89%
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                last cohort · divergences flag weight-or-insight review
              </p>
            </div>
          </div>
          {/* Mobile: horizontal chip strip */}
          <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            {LEADS.map((lead, i) => {
              const d = decisions[lead.id];
              const heat = HEAT_META[lead.heat];
              const active = lead.id === selectedId;
              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => setSelectedId(lead.id)}
                  className={
                    "shrink-0 rounded-xl border px-3 py-2 text-left transition-colors " +
                    (active
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-200 bg-white")
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {i + 1}
                    </span>
                    <span className={"h-2 w-2 rounded-full " + heat.dot} aria-hidden />
                    <span className="text-[13px] font-semibold text-slate-800 whitespace-nowrap">
                      {lead.business}
                    </span>
                    {d ? (
                      <span className="text-emerald-600 text-xs">
                        {d.kind === "approved" ? "✓" : d.kind === "challenged" ? "!" : "~"}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                        {lead.flora}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right panel */}
        <section className="rounded-2xl border border-slate-200 bg-slate-50/60 overflow-hidden min-h-[70vh] flex flex-col">
          {allDone ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="max-w-md text-center">
                <div className="text-emerald-600 text-3xl mb-2">✓</div>
                <h2 className="text-lg font-bold text-slate-900">
                  {total} reviewed
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  {counts.approved} approved · {counts.challenged} challenged ·{" "}
                  {counts.nurtured + counts.different > 0
                    ? `${counts.nurtured} nurture`
                    : "0 nurture"}
                  {counts.different > 0 && ` · ${counts.different} noted`}
                </p>
                {/* Pattern 4: $ saved by filters this cohort */}
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12px] font-medium text-emerald-800">
                  ${COHORT_SAVED.toLocaleString()} saved by filters this cohort
                  <span className="font-normal text-emerald-600">
                    ({COHORT_FILTERED_OUT} boxes not burned)
                  </span>
                </p>
                <p className="text-[12px] text-slate-500 mt-3">
                  Decisions write{" "}
                  <span className="font-mono text-slate-700">order_status_log</span> —
                  Thursday prep starts.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDecisions({});
                    setSelectedId(LEADS[0].id);
                  }}
                  className="mt-4 text-[12px] font-medium text-emerald-700 hover:underline"
                >
                  ← reset review (mockup)
                </button>
              </div>
            </div>
          ) : (
            <DetailPanel
              key={selected.id}
              lead={selected}
              decision={decisions[selected.id]}
              onDecide={decide}
            />
          )}
        </section>
      </div>
    </main>
  );
}
