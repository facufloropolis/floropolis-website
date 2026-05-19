"use client";
// /checkout — REAL checkout page (Stripe.js Elements + SetupIntent confirm)
// v2 | 2026-05-19 | Job_PM [V8 SHADOW] — T1 3-path picker + T2 EIN/B2B tax
// v1 | 2026-05-17 | Job_PM W4-S11 [V8 SHADOW]
//
// Behavior:
//   1. Read cart from localStorage key `floropolis-cart`:
//      { items: [{sku_id, quantity}], delivery_date? }
//   2. Hydrate cart via GET /api/checkout/sku-details?ids=...
//   3. Anon user: show 3-path picker (guest / sign in / sign up). Guest is
//      default — they fill email/phone/business inline. Picker collapses
//      after selection. Guest state persists in localStorage key
//      `guest_checkout_state` so reloads don't lose typing.
//   4. Collect delivery date + recipient + shipping (+ optional billing) addresses
//   5. Optional EIN field (XX-XXXXXXX). Valid EIN -> B2B mode, tax_total = 0.
//      Blank EIN -> B2C, state sales tax pulled from us_state_sales_tax.
//   6. POST /api/checkout/session -> get {client_secret, publishable_key,
//      tax_treatment, tax_total, ...}. Body includes guest_email/phone if anon.
//   7. Mount Stripe PaymentElement, call stripe.confirmSetup(...)
//      with return_url = /order-confirmation/{order_id}
//   8. On success: Stripe redirects to return_url (which we route here too —
//      simple "Order confirmed" interstitial that links to /account).
//
// Design ref: /app/mockups/checkout/page.tsx (DO NOT EDIT — visual target).
// We re-use BRAND constants from mockups/_constants/brand.ts.
//
// Auth: NOT required (CEO directive 2026-05-19). The API route accepts a
// guest_email and provisions a confirmed user record on the fly so the
// downstream FK + Stripe Customer remain intact. Signed-in users skip the
// picker entirely.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  Suspense,
} from "react";
import Link from "next/link";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { BRAND } from "../mockups/_constants/brand";
import { useAuthBackup } from "@/lib/auth-context-backup";
import { createBackupClient } from "@/lib/supabase/backup-client";
import { normalizeEIN, formatEIN } from "@/lib/checkout/totals";

// ============================================================================
// Types
// ============================================================================

interface LocalCartItem {
  sku_id: number;
  quantity: number;
}

interface LocalCart {
  items: LocalCartItem[];
  delivery_date?: string; // YYYY-MM-DD
}

interface SkuDetail {
  id: number;
  name: string;
  variety: string | null;
  length: string | null;
  unit: string | null;
  price: number;
  vendor: string | null;
  is_on_deal: boolean;
  deal_price: number | null;
  images: unknown | null;
  stems_per_bunch: number | null;
  units_per_box: number | null;
}

interface AddressForm {
  recipient_name: string;
  business_name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
}

interface SavedPaymentMethod {
  pm_id: string;
  brand: string;
  last4: string;
}

interface SessionResponse {
  order_id: number;
  order_number: string;
  mode: "mode_a" | "mode_b" | "mode_c";
  lead_time_days: number;
  client_secret: string;
  publishable_key: string;
  subtotal?: number;
  discount_total?: number;
  // Phase D: applied discount rules summary, returned by /api/checkout/session.
  discount_applications?: Array<{
    scope: string;
    scope_value: string;
    discount_pct: number;
    applied_amount: number;
    matched_line_sku_id: number | null;
  }>;
  tax_total?: number;
  tax_treatment?: "B2B" | "B2C";
  tax_rate_pct?: number;
  tax_state?: string | null;
  grand_total: number;
  currency: string;
  next_step: string;
  is_guest?: boolean;
  // CHK-POLISH (2026-05-18): present when user has a usable saved card on file.
  saved_payment_method?: SavedPaymentMethod | null;
  // 'succeeded' when the server already confirmed the SetupIntent inline
  // (use_saved_payment_method=true on submit). Tells the page to skip Stripe
  // Elements entirely and go straight to /order-confirmation/{order_id}.
  setup_intent_status?: string;
}

// T1 3-path picker — the choice the anon user made.
// "guest" = continue without an account (fills email + phone inline)
// "signin" = small inline sign-in form
// "signup" = link to /signup?next=/checkout to come back after
type AuthPath = "guest" | "signin" | "signup" | null;

// ============================================================================
// Constants + helpers
// ============================================================================

const CART_KEY = "floropolis-cart";
const GUEST_STATE_KEY = "guest_checkout_state"; // T1 — survives page reload
const US_POSTAL_REGEX = /^\d{5}(-\d{4})?$/;
const US_PHONE_REGEX = /^\+?1?[\s\-.]?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}$/;
const EIN_DISPLAY_REGEX = /^\d{2}-\d{7}$/;

interface GuestState {
  path: AuthPath;
  email: string;
  phone: string;
  business_name: string;
  ein: string;
}

function emptyGuest(): GuestState {
  return { path: null, email: "", phone: "", business_name: "", ein: "" };
}

function readGuestState(): GuestState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GUEST_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestState>;
    return {
      path: (parsed.path ?? null) as AuthPath,
      email: typeof parsed.email === "string" ? parsed.email : "",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      business_name: typeof parsed.business_name === "string" ? parsed.business_name : "",
      ein: typeof parsed.ein === "string" ? parsed.ein : "",
    };
  } catch {
    return null;
  }
}

function writeGuestState(s: GuestState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_STATE_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode — best-effort */
  }
}

function emptyAddress(): AddressForm {
  return {
    recipient_name: "",
    business_name: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
  };
}

function defaultDeliveryDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function readLocalCart(): LocalCart | null {
  if (typeof window === "undefined") return null;

  // Demo mode: ?demo=1 in URL = synthesize a 2-item cart so Facu (or anyone
  // reviewing the design) can see the full checkout without seeding localStorage.
  // Picks 2 real SKU IDs from the current mirror (FullStar Anemone variants).
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      const fortnight = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      return {
        items: [
          { sku_id: 6676, quantity: 100 },
          { sku_id: 6677, quantity: 50 },
        ],
        delivery_date: fortnight,
      };
    }
  } catch {
    /* fall through to localStorage */
  }

  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalCart>;
    if (!parsed.items || !Array.isArray(parsed.items)) return null;
    const items: LocalCartItem[] = parsed.items
      .filter(
        (x): x is LocalCartItem =>
          x != null &&
          Number.isFinite(Number(x.sku_id)) &&
          Number.isInteger(Number(x.quantity)) &&
          Number(x.quantity) > 0,
      )
      .map((x) => ({ sku_id: Number(x.sku_id), quantity: Number(x.quantity) }));
    if (items.length === 0) return null;
    return { items, delivery_date: parsed.delivery_date };
  } catch {
    return null;
  }
}

function leadDays(deliveryISO: string): number {
  const delivery = new Date(deliveryISO + "T00:00:00Z");
  const today = new Date();
  const ms = delivery.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

interface ModeHint {
  mode: "A" | "B" | "C";
  title: string;
  body: string;
  refund: string;
  chargeSummary: string; // one-line summary for the "what happens next" section
  tone: string;
}

function modeHintFor(lead: number, grandTotal: number, deliveryISO: string): ModeHint {
  const total = grandTotal > 0 ? money(grandTotal) : "the full amount";
  const chargeDays = 5; // M = days before delivery the card is charged
  const verifyDays = 6; // N = days before delivery the $1 verification hold runs (Mode A)

  // The actual charge calendar date = delivery_date - chargeDays.
  const chargeDate = deliveryISO
    ? formatChargeDate(deliveryISO, chargeDays)
    : "";
  // emerald-themed across all modes — soft, not alarming. Mode C is slightly
  // amber to flag "charged today" but never red (Facu: don't make it look like
  // an error).
  if (lead >= 10) {
    return {
      mode: "A",
      tone: "bg-emerald-50 border-emerald-200 text-emerald-900",
      title: "You won't be charged today.",
      body: `We save your card now. ${verifyDays} days before delivery we hold $1 to verify it works, then charge ${total} in full ${chargeDays} days before delivery${chargeDate ? ` (on ${chargeDate})` : ""}.`,
      refund: "Cancel anytime before the charge — no fees.",
      chargeSummary: `No charge today. Full ${total} runs ${chargeDays} days before delivery${chargeDate ? ` (${chargeDate})` : ""}.`,
    };
  }
  if (lead >= 6) {
    return {
      mode: "B",
      tone: "bg-emerald-50 border-emerald-200 text-emerald-900",
      title: "We save your card today.",
      // CHK-POLISH (2026-05-18): Facu wanted the $1 hold call-out kept but with
      // plain-English framing — "verification" not "preauth", clear date for
      // the full charge.
      body: `We save your card today + place a $1 verification hold so we know it works. Full ${total} charges ${chargeDays} days before delivery${chargeDate ? ` on ${chargeDate}` : ""}.`,
      refund: `Cancel up to ${chargeDays - 1} days before delivery — no fees.`,
      chargeSummary: `Card saved today. Full ${total} runs ${chargeDays} days before delivery${chargeDate ? ` (${chargeDate})` : ""}.`,
    };
  }
  return {
    mode: "C",
    tone: "bg-amber-50 border-amber-200 text-amber-900",
    title: "Charged today.",
    body: `Because delivery is so close, we charge ${total} now to lock the inventory.`,
    refund: "Quality guarantee: report any issues within 48h of delivery for a refund.",
    chargeSummary: `Full ${total} charged today to lock the inventory.`,
  };
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

// CHK-POLISH (2026-05-18): format the line-item header + footnote with unit
// context. Centralized here so the order summary stays declarative. Returns:
//   header   - "3 stems × $4.48/stem = $13.44"
//   footnote - "(less than 1 bunch — bunches are 10 stems)" or null when N/A
//   warning  - small-qty warning string when qty < stems_per_bunch (soft)
interface LineDisplay {
  header: string;
  footnote: string | null;
  warning: string | null;
}
function describeLine(qty: number, unitPrice: number, snap: SkuDetail | undefined): LineDisplay {
  const total = qty * unitPrice;
  if (!snap || !snap.unit) {
    // Fallback: no unit info -> show "3 × $4.48 = $13.44", no context.
    return {
      header: `${qty} × ${money(unitPrice)} = ${money(total)}`,
      footnote: null,
      warning: null,
    };
  }
  const unitLower = snap.unit.toLowerCase();
  const spb = snap.stems_per_bunch ?? null;
  const upb = snap.units_per_box ?? null;
  if (unitLower === "stem" && spb && spb > 0) {
    const header = `${qty} stem${qty === 1 ? "" : "s"} × ${money(unitPrice)}/stem = ${money(total)}`;
    const footnote =
      qty < spb
        ? `(less than 1 bunch — bunches are ${spb} stems)`
        : `(${Math.floor(qty / spb)} bunch${Math.floor(qty / spb) === 1 ? "" : "es"}${qty % spb === 0 ? "" : ` + ${qty % spb} stems`} — ${spb} stems/bunch)`;
    const warning =
      qty < spb
        ? `Less than 1 bunch. Increase to ${spb} stems (1 bunch) for the standard wholesale order.`
        : null;
    return { header, footnote, warning };
  }
  if (unitLower === "bunch") {
    const header = `${qty} bunch${qty === 1 ? "" : "es"} × ${money(unitPrice)}/bunch = ${money(total)}`;
    const footnote = spb && spb > 0
      ? `(${qty * spb} stems total — ${spb} stems/bunch)`
      : null;
    return { header, footnote, warning: null };
  }
  if (unitLower === "box") {
    const header = `${qty} box${qty === 1 ? "" : "es"} × ${money(unitPrice)}/box = ${money(total)}`;
    // Box stem totals = units_per_box × stems_per_bunch for Bunch-packed boxes;
    // for Stem-packed boxes, units_per_box IS the stem count. We don't know
    // which here without the original product unit, so prefer the simple form
    // when both are present.
    let footnote: string | null = null;
    if (upb && upb > 0 && spb && spb > 0) {
      const stemsTotal = upb * spb;
      footnote = `(${qty * stemsTotal} stems total — ${stemsTotal} stems/box)`;
    } else if (upb && upb > 0) {
      footnote = `(${qty * upb} stems total — ${upb} stems/box)`;
    }
    return { header, footnote, warning: null };
  }
  return {
    header: `${qty} × ${money(unitPrice)} = ${money(total)}`,
    footnote: null,
    warning: null,
  };
}

// Format "delivery_date - N days" as a friendly short date (e.g. "Wed May 22").
// Returns "" if the ISO is invalid so callers can hide it.
function formatChargeDate(deliveryISO: string, daysBefore: number): string {
  try {
    const d = new Date(deliveryISO + "T00:00:00Z");
    if (Number.isNaN(d.getTime())) return "";
    d.setUTCDate(d.getUTCDate() - daysBefore);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return "";
  }
}

// ============================================================================
// Inner Stripe form (must be mounted inside <Elements>)
// ============================================================================

function StripePayForm({
  session,
  billingAddress,
  onError,
  busy,
  setBusy,
}: {
  session: SessionResponse;
  billingAddress: AddressForm;
  onError: (msg: string) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stripe || !elements) return;
      setBusy(true);
      onError("");

      const returnUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/order-confirmation/${session.order_id}`
          : `/order-confirmation/${session.order_id}`;

      // We opt out of Stripe's address collection (fields.billingDetails.address='never')
      // because we collect address in our own form. Stripe REQUIRES we pass it back here.
      const { error } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: returnUrl,
          payment_method_data: {
            billing_details: {
              name: billingAddress.recipient_name || undefined,
              phone: billingAddress.phone || undefined,
              address: {
                line1: billingAddress.line1 || undefined,
                line2: billingAddress.line2 || undefined,
                city: billingAddress.city || undefined,
                state: billingAddress.state || undefined,
                postal_code: billingAddress.postal_code || undefined,
                country: "US",
              },
            },
          },
        },
      });

      // If no redirect happens, confirmSetup returned with an error (validation
      // or card declined). Otherwise the user is already navigating away.
      if (error) {
        onError(error.message ?? "Card setup failed. Please try again.");
        setBusy(false);
      }
    },
    [stripe, elements, session.order_id, onError, setBusy],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement
        options={{
          layout: "tabs",
          fields: { billingDetails: { address: "never" } },
        }}
      />
      <button
        type="submit"
        disabled={!stripe || !elements || busy}
        className={`w-full py-4 rounded-2xl font-bold text-base transition-all ${
          !stripe || !elements || busy
            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
            : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg"
        }`}
      >
        {busy ? "Processing..." : `Save card and confirm order - ${money(session.grand_total)}`}
      </button>
    </form>
  );
}

// ============================================================================
// Saved-card confirm button (CHK-POLISH 2026-05-18)
// Hits /api/checkout/confirm-saved to confirm the SetupIntent with the saved
// pm. No Stripe.js loaded on the page — server does the talking. On success
// the parent flips `savedCardConfirmed` and redirects.
// ============================================================================

function SavedCardConfirmButton({
  session,
  onError,
  onConfirmed,
  busy,
  setBusy,
}: {
  session: SessionResponse;
  onError: (msg: string) => void;
  onConfirmed: () => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  async function handleConfirm() {
    setBusy(true);
    onError("");
    try {
      const res = await fetch("/api/checkout/confirm-saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: session.order_id }),
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        status?: string;
        next_action?: unknown;
      };
      if (!res.ok) {
        onError(j.message ?? j.error ?? `Could not confirm saved card (${res.status})`);
        return;
      }
      // SetupIntent may transition to `requires_action` for 3DS-like flows on
      // some banks. We don't have Stripe.js loaded, so surface a clear message
      // and let the user fall back to "Add a new card".
      if (j.status === "requires_action") {
        onError(
          "Your bank wants to verify this card. Pick \"Add a new card\" to complete verification, or try a different card.",
        );
        return;
      }
      if (j.status !== "succeeded") {
        onError(`Card not confirmed (status: ${j.status ?? "unknown"}). Try \"Add a new card\".`);
        return;
      }
      onConfirmed();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not confirm saved card");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleConfirm}
      disabled={busy}
      className={`w-full py-4 rounded-2xl font-bold text-base transition-all ${
        busy
          ? "bg-slate-200 text-slate-400 cursor-not-allowed"
          : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg"
      }`}
    >
      {busy ? "Confirming..." : `Confirm order with saved card - ${money(session.grand_total)}`}
    </button>
  );
}

function brandLabel(brand: string): string {
  const map: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    discover: "Discover",
    diners: "Diners",
    jcb: "JCB",
    unionpay: "UnionPay",
  };
  return map[brand.toLowerCase()] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

// ============================================================================
// Main page
// ============================================================================

function CheckoutContent() {
  const { user, loading: authLoading, signOut } = useAuthBackup();
  const [cart, setCart] = useState<LocalCart | null>(null);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [skuMap, setSkuMap] = useState<Map<number, SkuDetail>>(new Map());
  const [missingIds, setMissingIds] = useState<number[]>([]);
  const [skuLoading, setSkuLoading] = useState(false);
  const [skuError, setSkuError] = useState<string>("");

  // T1 3-path picker state. Loaded from localStorage on mount (so reloads
  // don't lose typing). Default path: "guest" once cart is hydrated and user
  // is confirmed anon. Signed-in users never see the picker.
  const [guest, setGuest] = useState<GuestState>(emptyGuest);
  const [guestLoaded, setGuestLoaded] = useState(false);

  // Inline sign-in form state (the "signin" path).
  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [signinBusy, setSigninBusy] = useState(false);
  const [signinError, setSigninError] = useState<string>("");

  // T2 EIN state — separate from the localStorage GuestState because signed-in
  // users also use it (autofilled from client_profiles.ein).
  const [einInput, setEinInput] = useState<string>("");

  // T2 tax preview — computed locally so we can show "Sales tax: $X (FL B2C 6%)"
  // before submit. Real authoritative numbers come from /api/checkout/session
  // after submit and are mirrored back into `session`.
  const [taxRatePct, setTaxRatePct] = useState<number>(0); // resolved from state, 0 if unknown

  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [shipping, setShipping] = useState<AddressForm>(emptyAddress());
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<AddressForm>(emptyAddress());
  // CHK-POLISH (2026-05-18): true when we prefilled `shipping` from the user's
  // most recent address. Drives the "Using your last shipping address. Change?"
  // pill. User clicking the pill resets shipping to empty + clears this flag.
  const [shippingPrefilled, setShippingPrefilled] = useState(false);

  const [submitError, setSubmitError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [stripePromise, setStripePromise] =
    useState<Promise<StripeJs | null> | null>(null);
  const [paying, setPaying] = useState(false);
  // CHK-POLISH (2026-05-18): when the user has a saved card on file, default to
  // reusing it. Setting to false re-renders Stripe Elements for "Add a new card".
  const [useSavedCard, setUseSavedCard] = useState<boolean>(true);
  // CHK-POLISH (2026-05-18): true once we successfully confirmed the SetupIntent
  // server-side using the saved pm. Triggers redirect to order-confirmation.
  const [savedCardConfirmed, setSavedCardConfirmed] = useState<boolean>(false);

  // ---- 1. Read localStorage cart + guest state on mount ----
  useEffect(() => {
    const c = readLocalCart();
    setCart(c);
    setCartLoaded(true);
    setDeliveryDate(c?.delivery_date ?? defaultDeliveryDate());
    const g = readGuestState();
    if (g) {
      setGuest(g);
      if (g.ein) setEinInput(g.ein);
    }
    setGuestLoaded(true);
  }, []);

  // ---- 1b. Persist guest state on every change ----
  useEffect(() => {
    if (!guestLoaded) return;
    writeGuestState({ ...guest, ein: einInput });
  }, [guest, einInput, guestLoaded]);

  // ---- 1c. Default picker to "guest" once we know user is anon ----
  useEffect(() => {
    if (authLoading) return;
    if (user) return;
    if (!guestLoaded) return;
    setGuest((g) => (g.path == null ? { ...g, path: "guest" } : g));
  }, [authLoading, user, guestLoaded]);

  // ---- 1d. Fetch state sales tax rate when shipping.state changes ----
  // Public read on us_state_sales_tax (RLS policy in T2 migration).
  useEffect(() => {
    const state = (shipping.state ?? "").trim().toUpperCase();
    if (!state || state.length !== 2) {
      setTaxRatePct(0);
      return;
    }
    let cancelled = false;
    try {
      const supabase = createBackupClient();
      supabase
        .from("us_state_sales_tax")
        .select("rate_pct")
        .eq("state_code", state)
        .maybeSingle()
        .then(({ data }: { data: { rate_pct: number | string } | null }) => {
          if (cancelled) return;
          setTaxRatePct(data?.rate_pct != null ? Number(data.rate_pct) : 0);
        });
    } catch {
      setTaxRatePct(0);
    }
    return () => {
      cancelled = true;
    };
  }, [shipping.state]);

  // ---- 2. Hydrate SKU details ----
  useEffect(() => {
    if (!cart || cart.items.length === 0) return;
    let cancelled = false;
    setSkuLoading(true);
    setSkuError("");
    const ids = cart.items.map((i) => i.sku_id).join(",");
    fetch(`/api/checkout/sku-details?ids=${ids}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`sku-details ${res.status}`);
        return res.json();
      })
      .then(
        (json: { items: SkuDetail[]; missing_ids: number[] }) => {
          if (cancelled) return;
          const m = new Map<number, SkuDetail>();
          for (const it of json.items) m.set(it.id, it);
          setSkuMap(m);
          setMissingIds(json.missing_ids ?? []);
        },
      )
      .catch((err) => {
        if (cancelled) return;
        setSkuError(err instanceof Error ? err.message : "Could not load cart items");
      })
      .finally(() => {
        if (!cancelled) setSkuLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cart]);

  // ---- 2b. Prefill shipping address from user's most recent address ----
  // CHK-POLISH (2026-05-18): returning users should see their last address
  // already filled. New users (404) stay with the empty form.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return; // guest -> nothing to prefill
    let cancelled = false;
    fetch("/api/account/last-address?kind=shipping", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) return null;
        return res.json();
      })
      .then((j: { address?: AddressForm } | null) => {
        if (cancelled || !j?.address) return;
        const addr = j.address;
        // Only prefill if the user hasn't already started typing into the form.
        setShipping((cur) => {
          const empty = !cur.recipient_name && !cur.line1 && !cur.city && !cur.postal_code;
          if (!empty) return cur;
          setShippingPrefilled(true);
          return {
            recipient_name: addr.recipient_name ?? "",
            business_name: addr.business_name ?? "",
            phone: addr.phone ?? "",
            line1: addr.line1 ?? "",
            line2: addr.line2 ?? "",
            city: addr.city ?? "",
            state: addr.state ?? "",
            postal_code: addr.postal_code ?? "",
          };
        });
      })
      .catch(() => {
        /* swallow — form just stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  // ---- 2c. Prefill EIN from client_profiles for signed-in users ----
  // T2: returning customers who entered an EIN in a prior order see it again.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    let cancelled = false;
    try {
      const supabase = createBackupClient();
      supabase
        .from("client_profiles")
        .select("ein")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }: { data: { ein: string | null } | null }) => {
          if (cancelled || !data?.ein) return;
          setEinInput((cur) => (cur ? cur : data.ein ?? ""));
        });
    } catch {
      /* swallow — empty form stays */
    }
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  // ---- 3. Totals ----
  const subtotal = useMemo(() => {
    if (!cart) return 0;
    return cart.items.reduce((sum, it) => {
      const snap = skuMap.get(it.sku_id);
      if (!snap) return sum;
      const unit = snap.is_on_deal && snap.deal_price != null ? snap.deal_price : snap.price;
      return sum + unit * it.quantity;
    }, 0);
  }, [cart, skuMap]);

  // T2 + Phase D preview: tax computed locally from picked state + EIN flag.
  // Discount remains 0 here until Phase D wires real consumption from
  // discount_rules; we read body field passthrough so it's wire-ready.
  const einDigits = useMemo(() => normalizeEIN(einInput), [einInput]);
  const isB2B = einDigits != null;
  const previewDiscount = 0; // Phase D — populated when discount-applier ships
  const previewTaxable = useMemo(
    () => Math.max(0, Math.round((subtotal - previewDiscount) * 100) / 100),
    [subtotal],
  );
  const previewTax = useMemo(() => {
    if (isB2B) return 0;
    return Math.round(previewTaxable * taxRatePct * 100) / 100;
  }, [isB2B, previewTaxable, taxRatePct]);
  const previewGrand = useMemo(
    () => Math.round((previewTaxable + previewTax) * 100) / 100,
    [previewTaxable, previewTax],
  );

  const lead = useMemo(() => (deliveryDate ? leadDays(deliveryDate) : 0), [deliveryDate]);
  const modeHint = useMemo(
    // Mode hint reads grand_total (with tax) so the customer sees the right
    // dollar amount in the "we will charge $X" copy.
    () => modeHintFor(lead, previewGrand, deliveryDate),
    [lead, previewGrand, deliveryDate],
  );

  // ---- 4. Validation ----
  function addressValid(a: AddressForm): string | null {
    if (!a.recipient_name.trim()) return "Recipient name is required";
    if (!a.line1.trim()) return "Address line 1 is required";
    if (!a.city.trim()) return "City is required";
    if (!a.state.trim()) return "State is required";
    if (!US_POSTAL_REGEX.test(a.postal_code.trim())) return "ZIP must be 5 digits (or ZIP+4)";
    return null;
  }

  function formValid(): string | null {
    // T1 guest path: require email at minimum (phone optional but encouraged).
    if (!user && guest.path === "guest") {
      const e = guest.email.trim();
      if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        return "Enter a valid email so we can send your order confirmation";
      }
    }
    if (!user && guest.path !== "guest") {
      return "Pick how you'd like to check out (guest, sign in, or sign up)";
    }
    if (!deliveryDate) return "Choose a delivery date";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(deliveryDate + "T00:00:00Z") < today) return "Delivery date must be in the future";
    if (!US_PHONE_REGEX.test(shipping.phone.trim())) return "Phone must be a valid US number";
    const shipErr = addressValid(shipping);
    if (shipErr) return `Shipping: ${shipErr}`;
    if (!billingSame) {
      const billErr = addressValid(billing);
      if (billErr) return `Billing: ${billErr}`;
    }
    // T2: EIN, if provided, must be 9 digits (we accept XX-XXXXXXX or 9 raw digits).
    if (einInput.trim() && normalizeEIN(einInput) == null) {
      return "EIN must be 9 digits in the format XX-XXXXXXX";
    }
    return null;
  }

  // ---- 5. Submit to /api/checkout/session ----
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    const err = formValid();
    if (err) {
      setSubmitError(err);
      return;
    }
    if (!cart || cart.items.length === 0) {
      setSubmitError("Your cart is empty");
      return;
    }
    setSubmitting(true);
    try {
      // T1: only attach guest_* fields when user is anon (signed-in path
      // ignores them — API checks session first).
      const guestPayload = !user && guest.path === "guest"
        ? {
            guest_email: guest.email.trim(),
            guest_phone: guest.phone.trim() || null,
            guest_business_name: guest.business_name.trim() || null,
          }
        : {};
      // T2: format EIN as XX-XXXXXXX for the API (server re-normalizes).
      const einNorm = normalizeEIN(einInput);
      const einPayload = einNorm
        ? { ein: `${einNorm.slice(0, 2)}-${einNorm.slice(2)}` }
        : {};
      const body = {
        items: cart.items,
        requested_delivery_date: deliveryDate,
        ...guestPayload,
        ...einPayload,
        shipping_address: {
          recipient_name: shipping.recipient_name.trim(),
          business_name: shipping.business_name.trim() || null,
          phone: shipping.phone.trim(),
          line1: shipping.line1.trim(),
          line2: shipping.line2.trim() || null,
          city: shipping.city.trim(),
          state: shipping.state.trim().toUpperCase(),
          postal_code: shipping.postal_code.trim(),
          country: "US",
        },
        billing_address: billingSame
          ? {
              recipient_name: shipping.recipient_name.trim(),
              business_name: shipping.business_name.trim() || null,
              phone: shipping.phone.trim(),
              line1: shipping.line1.trim(),
              line2: shipping.line2.trim() || null,
              city: shipping.city.trim(),
              state: shipping.state.trim().toUpperCase(),
              postal_code: shipping.postal_code.trim(),
              country: "US",
            }
          : {
              recipient_name: billing.recipient_name.trim(),
              business_name: billing.business_name.trim() || null,
              phone: billing.phone.trim() || null,
              line1: billing.line1.trim(),
              line2: billing.line2.trim() || null,
              city: billing.city.trim(),
              state: billing.state.trim().toUpperCase(),
              postal_code: billing.postal_code.trim(),
              country: "US",
            },
      };
      const res = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (res.status === 401) {
          setSubmitError("Please sign in to complete checkout.");
        } else {
          setSubmitError(j.error ? `${j.error}${j.message ? ` (${j.message})` : ""}` : `Request failed (${res.status})`);
        }
        return;
      }
      const json = (await res.json()) as SessionResponse;
      setSession(json);
      setStripePromise(loadStripe(json.publishable_key));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setSubmitting(false);
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!cartLoaded) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400">
        Loading cart...
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
          🛒
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Your cart is empty</h1>
        <p className="text-slate-500 mb-6">
          Add a few SKUs first, then come back to check out.
        </p>
        <Link
          href="/shop"
          className="inline-block bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
        >
          Browse catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Auth status indicator — confirms whether the user is signed in
          or continuing as guest. Doesn't block checkout. */}
      <AuthStatusBar user={user} loading={authLoading} signOut={signOut} />

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Confirm your order</h1>
        <p className="text-slate-500 text-sm mt-1">
          Save your payment method to reserve this order.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
        {/* ============== LEFT: form ============== */}
        <div className="space-y-5">
          {!session ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* T1: 3-path picker — only when anon. Signed-in users skip it. */}
              {!authLoading && !user && (
                <AuthPathPicker
                  guest={guest}
                  setGuest={setGuest}
                  signinEmail={signinEmail}
                  setSigninEmail={setSigninEmail}
                  signinPassword={signinPassword}
                  setSigninPassword={setSigninPassword}
                  signinBusy={signinBusy}
                  setSigninBusy={setSigninBusy}
                  signinError={signinError}
                  setSigninError={setSigninError}
                />
              )}

              {/* Delivery date */}
              <section className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="font-semibold text-slate-900 mb-4">Delivery date</h2>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none"
                />
                <div className={`mt-3 rounded-xl border px-4 py-3 ${modeHint.tone}`}>
                  <p className="text-sm font-semibold">{modeHint.title}</p>
                  <p className="text-xs mt-1 leading-relaxed">{modeHint.body}</p>
                  <p className="text-xs mt-2 opacity-80">{modeHint.refund}</p>
                  {/* CHK-POLISH (2026-05-18): dropped internal "Mode X · N days out"
                      footer — customer-facing, jargon. Internal payment-mode tag
                      stays in the API/DB, just hidden from UI. */}
                </div>
              </section>

              {/* Shipping */}
              <AddressFieldset
                title="Shipping address"
                value={shipping}
                onChange={(next) => {
                  setShipping(next);
                  // CHK-POLISH: any manual edit clears the prefill banner.
                  if (shippingPrefilled) setShippingPrefilled(false);
                }}
                requirePhone
                headerExtra={
                  shippingPrefilled ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShipping(emptyAddress());
                        setShippingPrefilled(false);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full px-3 py-1 hover:bg-emerald-100 transition-colors"
                    >
                      <span>Using your last shipping address.</span>
                      <span className="underline underline-offset-2 font-medium">Change?</span>
                    </button>
                  ) : null
                }
              />

              {/* Billing toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={billingSame}
                  onChange={(e) => setBillingSame(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600"
                />
                <span className="text-sm text-slate-700">Billing address is the same as shipping</span>
              </label>

              {!billingSame && (
                <AddressFieldset
                  title="Billing address"
                  value={billing}
                  onChange={setBilling}
                />
              )}

              {/* T2: EIN (Tax ID) — optional, switches order to B2B (no sales tax). */}
              <EinFieldset
                ein={einInput}
                setEin={setEinInput}
                isB2B={isB2B}
                shippingState={shipping.state}
                taxRatePct={taxRatePct}
              />

              {/* What happens next — trust + flow transparency before the CTA. */}
              <section className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="font-semibold text-slate-900 mb-3">What happens next</h2>
                <ol className="space-y-2.5 text-sm text-slate-700">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center justify-center">1</span>
                    <span>Enter your card. We use Stripe — your card details never touch our servers.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center justify-center">2</span>
                    <span>{modeHint.chargeSummary}</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center justify-center">3</span>
                    <span>Email and WhatsApp confirmations the moment we ship.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center justify-center">4</span>
                    <span>
                      Need a hand? Text us at{" "}
                      <a href={BRAND.whatsappUrl} className="text-emerald-700 font-medium underline underline-offset-2">
                        {BRAND.whatsappDisplay}
                      </a>
                      {" "}— we reply in minutes.
                    </span>
                  </li>
                </ol>
              </section>

              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  {submitError}
                  {submitError.toLowerCase().includes("sign in") && (
                    <>
                      {" "}
                      <Link href="/auth/login?next=/checkout" className="underline font-medium">
                        Sign in
                      </Link>
                    </>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || skuLoading}
                className={`w-full py-4 rounded-2xl font-bold text-base transition-all ${
                  submitting || skuLoading
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg"
                }`}
              >
                {submitting ? "Preparing checkout..." : "Continue to payment"}
              </button>
            </form>
          ) : savedCardConfirmed ? (
            // CHK-POLISH (2026-05-18): user picked saved card AND server confirmed.
            // Brief interstitial; redirect to /order-confirmation/{order_id} on
            // the next tick.
            <section className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-700 text-xl">✓</div>
              <p className="text-sm font-semibold text-slate-900">Order placed.</p>
              <p className="text-xs text-slate-500 mt-1">Redirecting to your confirmation...</p>
            </section>
          ) : (
            <section className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-900">Payment method</h2>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                  Credit or debit card
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Order #{session.order_number}. Card secured by Stripe; Floropolis never sees the digits.
              </p>

              {/* CHK-POLISH (2026-05-18): saved-card option. Renders only when
                  the backend reports a usable pm on file. Default = saved card;
                  switching to "new card" renders Stripe Elements below. */}
              {session.saved_payment_method && (
                <div className="mb-4 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer bg-emerald-50/60 border border-emerald-200 rounded-xl px-4 py-3 hover:bg-emerald-50 transition-colors">
                    <input
                      type="radio"
                      name="card-choice"
                      checked={useSavedCard}
                      onChange={() => {
                        setUseSavedCard(true);
                        setSubmitError("");
                      }}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    <span className="text-sm text-slate-800">
                      Use saved card ending in{" "}
                      <span className="font-semibold">**** {session.saved_payment_method.last4}</span>{" "}
                      <span className="text-slate-500">({brandLabel(session.saved_payment_method.brand)})</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer bg-white border border-slate-200 rounded-xl px-4 py-3 hover:bg-slate-50 transition-colors">
                    <input
                      type="radio"
                      name="card-choice"
                      checked={!useSavedCard}
                      onChange={() => {
                        setUseSavedCard(false);
                        setSubmitError("");
                      }}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    <span className="text-sm text-slate-800">Add a new card</span>
                  </label>
                </div>
              )}

              {session.saved_payment_method && useSavedCard ? (
                <SavedCardConfirmButton
                  session={session}
                  onError={setSubmitError}
                  onConfirmed={() => {
                    setSavedCardConfirmed(true);
                    // Redirect after a short beat so the user sees the success state.
                    if (typeof window !== "undefined") {
                      setTimeout(() => {
                        window.location.href = `/order-confirmation/${session.order_id}`;
                      }, 600);
                    }
                  }}
                  busy={paying}
                  setBusy={setPaying}
                />
              ) : (
                stripePromise && (
                  <Elements
                    stripe={stripePromise}
                    options={{
                      clientSecret: session.client_secret,
                      appearance: {
                        theme: "stripe",
                        variables: {
                          colorPrimary: "#059669",
                          borderRadius: "12px",
                          fontFamily: "Plus Jakarta Sans, system-ui, sans-serif",
                        },
                      },
                    }}
                  >
                    <StripePayForm
                      session={session}
                      billingAddress={billingSame ? shipping : billing}
                      onError={setSubmitError}
                      busy={paying}
                      setBusy={setPaying}
                    />
                  </Elements>
                )
              )}

              {submitError && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  {submitError}
                  {/* CHK-POLISH (2026-05-18): phone error recovery — let the user
                      go back to the form, fix the phone, then retry without
                      losing the rest of their state. */}
                  {/phone|verification|3d secure/i.test(submitError) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSession(null);
                        setStripePromise(null);
                        setSubmitError("");
                        setSavedCardConfirmed(false);
                        // shipping/billing state is preserved by React — user just
                        // edits the phone field and re-submits.
                      }}
                      className="block mt-2 underline font-medium hover:text-red-900"
                    >
                      Edit phone number and try again
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setSession(null);
                  setStripePromise(null);
                  setSubmitError("");
                  setSavedCardConfirmed(false);
                }}
                className="mt-4 text-xs text-slate-500 hover:text-emerald-600"
              >
                Edit shipping or delivery date
              </button>
            </section>
          )}
        </div>

        {/* ============== RIGHT: summary ============== */}
        <aside className="bg-white rounded-2xl border border-slate-200 p-6 sticky top-6">
          <h2 className="font-semibold text-slate-900 mb-5">Order summary</h2>

          {skuLoading && (
            <p className="text-sm text-slate-400">Loading cart items...</p>
          )}
          {skuError && (
            <p className="text-sm text-red-600">Could not load cart: {skuError}</p>
          )}

          {!skuLoading && (
            <div className="space-y-4 mb-5">
              {cart.items.map((it) => {
                const snap = skuMap.get(it.sku_id);
                const unitPrice =
                  snap?.is_on_deal && snap?.deal_price != null
                    ? snap.deal_price
                    : snap?.price ?? 0;
                // CHK-POLISH (2026-05-18): unit-aware line display + soft small-
                // qty warning when stem qty < 1 bunch.
                const desc = describeLine(it.quantity, unitPrice, snap);
                return (
                  <div key={it.sku_id} className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-lg shrink-0">
                      🌹
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {snap?.name ?? `SKU ${it.sku_id}`}
                        {snap?.length ? ` ${snap.length}` : ""}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {snap?.vendor ?? ""}
                      </p>
                      <p className="text-xs text-slate-500">{desc.header}</p>
                      {desc.footnote && (
                        <p className="text-[11px] text-slate-400 mt-0.5">{desc.footnote}</p>
                      )}
                      {desc.warning && (
                        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-1.5">
                          {desc.warning}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900 shrink-0">
                      {money(unitPrice * it.quantity)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {missingIds.length > 0 && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
              {missingIds.length} item{missingIds.length === 1 ? "" : "s"} no longer available.
            </div>
          )}

          <div className="border-t border-slate-100 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            {/* Phase D: discount line. Only renders after /api/checkout/session
                returns the matched applications. Each application shows scope +
                pct so the customer sees WHY the discount applied (June promo,
                client-VIP, etc.). */}
            {session?.discount_applications && session.discount_applications.length > 0 && (
              <>
                {session.discount_applications.map((a, idx) => (
                  <div key={idx} className="flex justify-between text-emerald-700">
                    <span className="truncate pr-2">
                      Discount{' '}
                      <span className="text-[10px] uppercase tracking-wide text-emerald-600 ml-1">
                        {a.scope}
                      </span>{' '}
                      <span className="text-[10px] text-slate-400">
                        ({a.discount_pct}% off)
                      </span>
                    </span>
                    <span className="font-semibold">-{money(a.applied_amount)}</span>
                  </div>
                ))}
                {session.discount_total && session.discount_total > 0 && (
                  <div className="flex justify-between text-emerald-700 text-xs font-semibold border-t border-emerald-100 pt-1">
                    <span>Total discount</span>
                    <span>-{money(session.discount_total)}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between text-slate-500">
              <span>Customs and freight</span>
              <span className="text-emerald-600">Included</span>
            </div>
            {/* T2 tax line. Always shown so customers can see whether B2B mode
                is active. Authoritative number comes from `session` after submit;
                before submit we show the local preview. */}
            <div className="flex justify-between text-slate-500">
              <span>
                Sales tax{" "}
                {isB2B ? (
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700 ml-1">
                    B2B
                  </span>
                ) : shipping.state ? (
                  <span className="text-[10px] text-slate-400 ml-1">
                    ({shipping.state} {taxRatePct > 0 ? `${(taxRatePct * 100).toFixed(2)}%` : "0%"})
                  </span>
                ) : null}
              </span>
              <span>
                {money(session?.tax_total ?? previewTax)}
              </span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 text-base pt-2 border-t border-slate-100">
              <span>Total</span>
              <span>{money(session?.grand_total ?? previewGrand)}</span>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Delivery</span>
              <span className="font-medium text-slate-600">
                {deliveryDate || "Pick a date"}
              </span>
            </div>
            {/* CHK-POLISH (2026-05-18): removed "Charge mode Mode B" row — that
                was internal payment-mode jargon leaking into the customer view.
                The mode hint card above already explains the charge schedule in
                plain English. */}
          </div>

          <div className="mt-4 bg-slate-50 rounded-xl p-3 text-center text-xs text-slate-500">
            Questions?{" "}
            <a href={BRAND.whatsappUrl} className="text-emerald-600 font-medium">
              WhatsApp us
            </a>{" "}
            - {BRAND.whatsappDisplay}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ============================================================================
// Auth status indicator — shows signed-in email + sign out, OR guest banner
// ============================================================================

function AuthStatusBar({
  user,
  loading,
  signOut,
}: {
  user: { email?: string | null } | null;
  loading: boolean;
  signOut: () => Promise<void>;
}) {
  // While auth loads, render a neutral placeholder so the layout doesn't jump.
  if (loading) {
    return (
      <div className="mb-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-sm text-slate-400">
        Checking sign-in status...
      </div>
    );
  }

  if (user) {
    return (
      <div className="mb-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-700">
          <span className="text-emerald-700 font-semibold">Signed in</span>
          {user.email ? <> as <span className="font-medium">{user.email}</span></> : null}
        </p>
        <button
          type="button"
          onClick={() => {
            void signOut();
          }}
          className="text-xs text-slate-500 hover:text-emerald-700 underline underline-offset-2"
        >
          Sign out
        </button>
      </div>
    );
  }

  // T1: anon users get the 3-path picker inside the form. No banner here —
  // the picker IS the entry point for anon.
  return null;
}

// ============================================================================
// Reusable address fieldset
// ============================================================================

function AddressFieldset({
  title,
  value,
  onChange,
  requirePhone = false,
  headerExtra = null,
}: {
  title: string;
  value: AddressForm;
  onChange: (next: AddressForm) => void;
  requirePhone?: boolean;
  // CHK-POLISH (2026-05-18): slot for the "Using your last shipping address"
  // pill (and anything else we want to drop in the header in the future).
  headerExtra?: React.ReactNode;
}) {
  const set = <K extends keyof AddressForm>(k: K, v: AddressForm[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {headerExtra}
      </div>
      <div className="space-y-3">
        <LabeledInput
          label="Recipient name"
          required
          value={value.recipient_name}
          onChange={(v) => set("recipient_name", v)}
        />
        <LabeledInput
          label="Business name (optional)"
          value={value.business_name}
          onChange={(v) => set("business_name", v)}
        />
        <LabeledInput
          label={`Phone${requirePhone ? "" : " (optional)"}`}
          required={requirePhone}
          value={value.phone}
          onChange={(v) => set("phone", v)}
          placeholder="+1 (305) 555-0199"
        />
        <LabeledInput
          label="Address line 1"
          required
          value={value.line1}
          onChange={(v) => set("line1", v)}
        />
        <LabeledInput
          label="Address line 2 (optional)"
          value={value.line2}
          onChange={(v) => set("line2", v)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <LabeledInput
            label="City"
            required
            value={value.city}
            onChange={(v) => set("city", v)}
          />
          <LabeledInput
            label="State"
            required
            value={value.state}
            onChange={(v) => set("state", v.toUpperCase())}
            maxLength={2}
            placeholder="FL"
          />
          <LabeledInput
            label="ZIP"
            required
            value={value.postal_code}
            onChange={(v) => set("postal_code", v)}
            placeholder="33131"
          />
        </div>
      </div>
    </section>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  required = false,
  placeholder = "",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500 block mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none"
      />
    </label>
  );
}

// ============================================================================
// T1: AuthPathPicker — 3-path picker shown only when user is anon.
// Default selection is "guest" (less friction). Picker collapses after
// selection but keeps a small radio row so the user can switch paths if they
// change their mind mid-checkout.
// ============================================================================

function AuthPathPicker({
  guest,
  setGuest,
  signinEmail,
  setSigninEmail,
  signinPassword,
  setSigninPassword,
  signinBusy,
  setSigninBusy,
  signinError,
  setSigninError,
}: {
  guest: GuestState;
  setGuest: (next: GuestState | ((cur: GuestState) => GuestState)) => void;
  signinEmail: string;
  setSigninEmail: (v: string) => void;
  signinPassword: string;
  setSigninPassword: (v: string) => void;
  signinBusy: boolean;
  setSigninBusy: (b: boolean) => void;
  signinError: string;
  setSigninError: (s: string) => void;
}) {
  const path: AuthPath = guest.path ?? "guest";

  async function handleSignin(e: React.FormEvent) {
    e.preventDefault();
    if (!signinEmail.trim() || !signinPassword) {
      setSigninError("Enter your email and password");
      return;
    }
    setSigninBusy(true);
    setSigninError("");
    try {
      const supabase = createBackupClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: signinEmail.trim(),
        password: signinPassword,
      });
      if (error) {
        setSigninError(error.message);
      } else {
        // onAuthStateChange in useAuthBackup fires and the picker disappears.
        // We do NOT redirect — the same /checkout page keeps the cart + address.
      }
    } catch (err) {
      setSigninError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSigninBusy(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">How would you like to check out?</h2>
        <p className="text-xs text-slate-500 mt-1">
          You don&apos;t need an account to order. Sign in if you have one to autofill your saved address.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-2">
        <PathRadio
          checked={path === "guest"}
          onSelect={() => setGuest((g) => ({ ...g, path: "guest" }))}
          title="Continue as guest"
          body="Fastest. No password needed."
        />
        <PathRadio
          checked={path === "signin"}
          onSelect={() => setGuest((g) => ({ ...g, path: "signin" }))}
          title="Sign in"
          body="Use your existing Floropolis account."
        />
        <PathRadio
          checked={path === "signup"}
          onSelect={() => setGuest((g) => ({ ...g, path: "signup" }))}
          title="Create account"
          body="Save your details for next time."
        />
      </div>

      {/* GUEST path — inline contact form */}
      {path === "guest" && (
        <div className="space-y-3 pt-2">
          <LabeledInput
            label="Email"
            required
            value={guest.email}
            onChange={(v) => setGuest((g) => ({ ...g, email: v }))}
            placeholder="you@yourshop.com"
          />
          <LabeledInput
            label="Phone (optional)"
            value={guest.phone}
            onChange={(v) => setGuest((g) => ({ ...g, phone: v }))}
            placeholder="+1 (305) 555-0199"
          />
          <LabeledInput
            label="Business name (optional)"
            value={guest.business_name}
            onChange={(v) => setGuest((g) => ({ ...g, business_name: v }))}
          />
          <p className="text-[11px] text-slate-400">
            We will email your order confirmation here. You can claim a full account from the link in that email.
          </p>
        </div>
      )}

      {/* SIGN IN path — inline form */}
      {path === "signin" && (
        <form onSubmit={handleSignin} className="space-y-3 pt-2">
          <LabeledInput
            label="Email"
            required
            value={signinEmail}
            onChange={setSigninEmail}
            placeholder="you@yourshop.com"
          />
          <label className="block">
            <span className="text-xs font-medium text-slate-500 block mb-1">Password</span>
            <input
              type="password"
              value={signinPassword}
              onChange={(e) => setSigninPassword(e.target.value)}
              required
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none"
            />
          </label>
          {signinError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {signinError}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={signinBusy}
              className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                signinBusy
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {signinBusy ? "Signing in..." : "Sign in"}
            </button>
            <Link
              href="/auth/login?next=/checkout"
              className="text-xs text-emerald-700 underline underline-offset-2"
            >
              Use Google or email code instead
            </Link>
          </div>
        </form>
      )}

      {/* SIGN UP path — links out, comes back via ?next=/checkout */}
      {path === "signup" && (
        <div className="pt-2 space-y-3">
          <p className="text-sm text-slate-700">
            Creating an account takes about 30 seconds. After you finish, you&apos;ll come back here with your cart intact.
          </p>
          <Link
            href="/signup?next=/checkout"
            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700"
          >
            Create my account
          </Link>
        </div>
      )}
    </section>
  );
}

function PathRadio({
  checked,
  onSelect,
  title,
  body,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-xl border px-4 py-3 transition-colors ${
        checked
          ? "border-emerald-500 bg-emerald-50"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`w-4 h-4 rounded-full border ${
            checked ? "border-emerald-600 bg-emerald-600" : "border-slate-300"
          }`}
        />
        <span className="text-sm font-semibold text-slate-900">{title}</span>
      </div>
      <p className="text-xs text-slate-500">{body}</p>
    </button>
  );
}

// ============================================================================
// T2: EinFieldset — optional EIN field. When valid, order flips to B2B mode
// (no sales tax). Reuses LabeledInput for consistency.
// ============================================================================

function EinFieldset({
  ein,
  setEin,
  isB2B,
  shippingState,
  taxRatePct,
}: {
  ein: string;
  setEin: (v: string) => void;
  isB2B: boolean;
  shippingState: string;
  taxRatePct: number;
}) {
  const norm = normalizeEIN(ein);
  const valid = norm != null;
  const formatBlur = () => {
    if (norm) setEin(formatEIN(norm));
  };
  const stateLabel = shippingState.trim().toUpperCase();

  let helper: string;
  if (isB2B) {
    helper = `B2B — EIN ${formatEIN(norm ?? ein)}. No state sales tax.`;
  } else if (stateLabel && taxRatePct > 0) {
    helper = `B2C — ${stateLabel} sales tax ${(taxRatePct * 100).toFixed(2)}% will apply. Add your EIN to switch to B2B.`;
  } else if (stateLabel) {
    helper = `B2C — no sales tax configured for ${stateLabel} yet. Add your EIN to lock B2B treatment.`;
  } else {
    helper = "B2C until you add your EIN. Sales tax is calculated from your shipping state.";
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6">
      <h2 className="font-semibold text-slate-900 mb-1">Tax ID (optional)</h2>
      <p className="text-xs text-slate-500 mb-3">
        If you have a US Tax ID / EIN we will skip state sales tax and treat this order as B2B.
      </p>
      <label className="block">
        <span className="text-xs font-medium text-slate-500 block mb-1">EIN (XX-XXXXXXX)</span>
        <input
          type="text"
          value={ein}
          onChange={(e) => setEin(e.target.value)}
          onBlur={formatBlur}
          placeholder="12-3456789"
          inputMode="numeric"
          className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-1 outline-none ${
            ein && !valid
              ? "border-red-300 focus:border-red-400 focus:ring-red-400"
              : "border-slate-200 focus:border-emerald-400 focus:ring-emerald-400"
          }`}
        />
      </label>
      {ein && !valid && (
        <p className="text-xs text-red-700 mt-2">
          EIN must be 9 digits. Format: XX-XXXXXXX.
        </p>
      )}
      <p
        className={`text-xs mt-2 ${
          isB2B ? "text-emerald-700 font-medium" : "text-slate-500"
        }`}
      >
        {helper}
      </p>
    </section>
  );
}

// ============================================================================
// Default export with Suspense wrapper (useSearchParams requirement)
// ============================================================================

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-400">
          Loading...
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
