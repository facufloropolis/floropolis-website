// Mockup index -- Floropolis Mockups
// v3.2 | 2026-05-15 | Job_PM [V8 SHADOW]

import Link from "next/link";

type Group = {
  label: string;
  icon: string;
  description: string;
  screens: Screen[];
};

type Screen = {
  num: string;
  title: string;
  url: string;
  description: string;
  color: string;
  badge?: string;
  variants?: { label: string; href: string }[];
};

const groups: Group[] = [
  {
    label: "Customer",
    icon: "🛍️",
    description: "Screens customers see when shopping, logging in, and managing orders",
    screens: [
      {
        num: "C1",
        title: "Login",
        url: "/mockups/login",
        description: "4 auth methods: Google, Apple, Email magic link, Email+password. States: default, email-sent, pending-approval, device-verify.",
        color: "emerald",
        variants: [
          { label: "Default", href: "/mockups/login?state=default" },
          { label: "Email sent", href: "/mockups/login?state=email-sent" },
          { label: "Device verify", href: "/mockups/login?state=device-verify" },
        ],
      },
      {
        num: "C2",
        title: "Sign Up",
        url: "/mockups/signup",
        description: "3-step wizard: account → business info (role, address, Instagram optional) → review. Post-submit pending-approval screen.",
        color: "emerald",
      },
      {
        num: "C3",
        title: "Checkout — Save Card & Confirm Order",
        url: "/mockups/checkout",
        description: "Delivery date, quote cart, Stripe card save. 3-tier charge schedule based on lead time. Credit card only.",
        color: "emerald",
        variants: [
          { label: "Mode A (≥10 days)", href: "/mockups/checkout?lead=12" },
          { label: "Mode B (6-9 days)", href: "/mockups/checkout?lead=7" },
          { label: "Mode C (≤5 days)", href: "/mockups/checkout?lead=4" },
        ],
      },
      {
        num: "C4",
        title: "Account — Order History",
        url: "/mockups/account-orders",
        description: "All orders, statuses, tracking. Promo banner, edit/add-item buttons (if pending), address confirmation, star rating for delivered orders, WhatsApp CTA.",
        color: "blue",
      },
    ],
  },
  {
    label: "Admin",
    icon: "⚙️",
    description: "Screens for Facu and JJ — order management, dispatch, communications",
    screens: [
      {
        num: "A1",
        title: "Admin Login",
        url: "/mockups/login-admin",
        description: "Email+password → TOTP 6-digit → device approval (Facu approves JJ only, never reverse). Dark secure UI.",
        color: "violet",
        badge: "TOTP required",
        variants: [
          { label: "Password step", href: "/mockups/login-admin?state=default" },
          { label: "TOTP step", href: "/mockups/login-admin?state=password-entered" },
          { label: "Device pending", href: "/mockups/login-admin?state=device-pending" },
          { label: "Device approved", href: "/mockups/login-admin?state=device-approved-by-Facu" },
        ],
      },
      {
        num: "A2",
        title: "Admin — Order Queue",
        url: "/mockups/admin-orders",
        description: "Orders grouped by delivery day. 2-box minimum flag. Tabs: upcoming/confirmed/dispatched/arrived/issues/all. Sample Box modal. Payment failed decision tree (JJ vs Facu, >48h vs <48h).",
        color: "violet",
      },
      {
        num: "A3",
        title: "Admin — Order Detail",
        url: "/mockups/admin-order-detail",
        description: "Quick actions bar, edit line items, confirm/cancel, refund authority card. Arrived toggle. Full email log timeline. Customer conversation thread (email + WhatsApp).",
        color: "violet",
      },
      {
        num: "A4",
        title: "Admin — Dispatch Manifest",
        url: "/mockups/admin-dispatch",
        description: "3-panel layout: dispatch / farm communications / labels. Rose pipeline stepper (9 steps). FedEx depot clarification. Per-farm email drafts + FedEx notification. Label upload + driver confirmation.",
        color: "amber",
      },
    ],
  },
  {
    label: "Vendor / Farm",
    icon: "🌹",
    description: "Mobile-first portal for farms -- pickup confirmation, per-day box manifest",
    screens: [
      {
        num: "V1",
        title: "Vendor Portal -- Pickup Confirmation",
        url: "/mockups/vendor-portal",
        description: "14-day multi-day view. Per-day expand/collapse. Confirm per day or via WhatsApp. FedEx depot clarification banner. Auto-confirmation placeholder (driver pickup confirmed via WhatsApp). Real WhatsApp CTA.",
        color: "teal",
      },
    ],
  },
  {
    label: "Catalog Control Plane (v0.1 -- 2026-05-15)",
    icon: "📦",
    description: "Admin-only catalog command center. Multi-vendor, multi-country, multi-ingestion. 8 screens.",
    screens: [
      {
        num: "X1",
        title: "Catalog -- Unified List",
        url: "/mockups/admin-catalog",
        description: "30 SKUs across 5 vendors / 3 countries. Source badges (K2K live / T2 / T3), GPM bands, filters, inline 'awaiting Facu' indicators, today vs target toggle.",
        color: "violet",
        badge: "v0.1",
      },
      {
        num: "X2",
        title: "Catalog -- SKU Detail",
        url: "/mockups/admin-catalog/sku_eco_freedom_60",
        description: "Sources side-by-side, full cost breakdown with shipping transparency, override audit, history + verifier health (Pita owned).",
        color: "violet",
        variants: [
          { label: "Ecoroses Freedom Red", href: "/mockups/admin-catalog/sku_eco_freedom_60" },
          { label: "MF Anemone (awaiting cost)", href: "/mockups/admin-catalog/sku_mf_anemone_fuchsia" },
          { label: "AndesColor (WhatsApp)", href: "/mockups/admin-catalog/sku_and_hydrangea_blue" },
          { label: "DutchFlora (email NL)", href: "/mockups/admin-catalog/sku_dut_peony_sarah" },
        ],
      },
      {
        num: "X3",
        title: "Catalog -- Config (Inputs)",
        url: "/mockups/admin-catalog-config",
        description: "Tabs: Box types per vendor, Shipping config per country/port, GPM targets. Propose -> Facu approves -> cascade preview.",
        color: "violet",
      },
      {
        num: "X4",
        title: "Catalog -- Ingest staging",
        url: "/mockups/admin-catalog-ingest",
        description: "Vendor Ingestion Adapter output: K2K API, email, WhatsApp, CSV. Auto-applied >= 0.85 conf, review queue below.",
        color: "violet",
      },
      {
        num: "X5",
        title: "Catalog -- SKU mapping queue",
        url: "/mockups/admin-catalog-mapping",
        description: "Low-confidence vendor name -> quality_family matches awaiting human review. Accept / remap / new family.",
        color: "violet",
      },
      {
        num: "X6",
        title: "Catalog -- Discount rules",
        url: "/mockups/admin-catalog-discounts",
        description: "Discounts by category / vendor / SKU / client. Inline warnings (low margin, below GPM floor). Facu approves all.",
        color: "violet",
      },
      {
        num: "X7",
        title: "Catalog -- Approval queue",
        url: "/mockups/admin-catalog-approval-queue",
        description: "Facu's destination. All proposals from across the catalog plane. Cascade impact + warnings + approve/reject inline.",
        color: "violet",
        badge: "Facu inbox",
      },
      {
        num: "X8",
        title: "Catalog -- Proposals (meta)",
        url: "/mockups/admin-catalog-proposals",
        description: "Tab A: 15 specializations Job_PM needs (F/B/I) with 6 full specs for cutover blockers. Tab B: agents / contracts / tables / flows / verifiers Job has already specced.",
        color: "violet",
        badge: "CPO surface",
      },
    ],
  },
];

const colorMap: Record<string, { badge: string; border: string; num: string; variantBg: string }> = {
  emerald: { badge: "bg-emerald-100 text-emerald-800", border: "hover:border-emerald-400", num: "bg-emerald-600", variantBg: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200" },
  violet:  { badge: "bg-violet-100 text-violet-800",  border: "hover:border-violet-400",  num: "bg-violet-600",  variantBg: "bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200" },
  amber:   { badge: "bg-amber-100 text-amber-800",    border: "hover:border-amber-400",   num: "bg-amber-500",   variantBg: "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200" },
  blue:    { badge: "bg-blue-100 text-blue-800",      border: "hover:border-blue-400",    num: "bg-blue-600",    variantBg: "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200" },
  teal:    { badge: "bg-teal-100 text-teal-800",      border: "hover:border-teal-400",    num: "bg-teal-600",    variantBg: "bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200" },
};

const groupHeaderColors: Record<string, string> = {
  "Customer": "bg-emerald-600",
  "Admin": "bg-violet-600",
  "Vendor / Farm": "bg-teal-600",
  "Catalog Control Plane (v0.1 -- 2026-05-15)": "bg-violet-700",
};

export default function MockupIndex() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg font-bold">F</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Floropolis Mockups</h1>
              <p className="text-slate-500 text-sm">17 screens . All hardcoded mockups -- safe to open anywhere</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="text-xs bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-medium">4 Customer screens</span>
            <span className="text-xs bg-violet-100 text-violet-800 px-3 py-1 rounded-full font-medium">4 Admin screens</span>
            <span className="text-xs bg-teal-100 text-teal-800 px-3 py-1 rounded-full font-medium">1 Vendor screen</span>
            <span className="text-xs bg-violet-100 text-violet-800 px-3 py-1 rounded-full font-medium">8 Catalog Control Plane</span>
            <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-medium">Next.js 15 · Tailwind · TypeScript</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-12">
        {groups.map((group) => (
          <div key={group.label}>
            {/* Group header */}
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-base ${groupHeaderColors[group.label]}`}>
                {group.icon}
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">{group.label}</h2>
                <p className="text-xs text-slate-500">{group.description}</p>
              </div>
            </div>

            {/* Screen cards */}
            <div className="space-y-3">
              {group.screens.map((s) => {
                const c = colorMap[s.color];
                return (
                  <div key={s.url} className={`rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-md transition-all ${c.border}`}>
                    <Link href={s.url} className="flex items-start gap-5 p-6">
                      <span className={`flex-shrink-0 w-10 h-10 rounded-xl ${c.num} text-white flex items-center justify-center text-sm font-bold`}>
                        {s.num}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900">{s.title}</span>
                          {s.badge && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700 border border-red-200">
                              {s.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-1 leading-relaxed">{s.description}</p>
                      </div>
                      <span className="text-slate-300 text-lg self-center shrink-0">→</span>
                    </Link>

                    {/* State/variant quick links */}
                    {s.variants && s.variants.length > 0 && (
                      <div className="px-6 pb-5 pt-0 flex flex-wrap gap-2">
                        <span className="text-xs text-slate-400 self-center mr-1">States:</span>
                        {s.variants.map((v) => (
                          <Link
                            key={v.href}
                            href={v.href}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${c.variantBg}`}
                          >
                            {v.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Footer note */}
        <div className="border border-slate-200 rounded-2xl bg-white px-6 py-5">
          <p className="text-sm font-semibold text-slate-900 mb-2">About these mockups</p>
          <ul className="text-sm text-slate-500 space-y-1 list-disc list-inside">
            <li>All data is hardcoded — no real Supabase queries, no real Stripe charges</li>
            <li>States are controlled via <code className="bg-slate-100 px-1 rounded text-xs">?state=</code> and <code className="bg-slate-100 px-1 rounded text-xs">?lead=</code> query params</li>
            <li>Safe to share with the team for feedback — nothing touches production</li>
            <li>Plan + research docs: <code className="bg-slate-100 px-1 rounded text-xs">checkout-system/</code> at project root</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
