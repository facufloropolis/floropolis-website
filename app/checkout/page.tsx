"use client";
// /checkout — REAL checkout page (Stripe.js Elements + SetupIntent confirm)
// v1 | 2026-05-17 | Job_PM W4-S11 [V8 SHADOW]
//
// Behavior:
//   1. Read cart from localStorage key `floropolis-cart`:
//      { items: [{sku_id, quantity}], delivery_date? }
//   2. Hydrate cart via GET /api/checkout/sku-details?ids=...
//   3. Collect delivery date + recipient + shipping (+ optional billing) addresses
//   4. POST /api/checkout/session -> get {client_secret, publishable_key}
//   5. Mount Stripe PaymentElement, call stripe.confirmSetup(...)
//      with return_url = /order-confirmation/{order_id}
//   6. On success: Stripe redirects to return_url (which we route here too —
//      simple "Order confirmed" interstitial that links to /account).
//
// Design ref: /app/mockups/checkout/page.tsx (DO NOT EDIT — visual target).
// We re-use BRAND constants from mockups/_constants/brand.ts.
//
// Auth: requires the user be signed in (the POST /api/checkout/session route
// enforces this with a 401). If unauthenticated we surface the error and link
// to /auth/login?next=/checkout. We do NOT pre-flight auth.getUser() here to
// keep the page a static client component — the API does the gating.

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
import { useAuth } from "@/lib/auth-context";

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

interface SessionResponse {
  order_id: number;
  order_number: string;
  mode: "mode_a" | "mode_b" | "mode_c";
  lead_time_days: number;
  client_secret: string;
  publishable_key: string;
  grand_total: number;
  currency: string;
  next_step: string;
}

// ============================================================================
// Constants + helpers
// ============================================================================

const CART_KEY = "floropolis-cart";
const US_POSTAL_REGEX = /^\d{5}(-\d{4})?$/;
const US_PHONE_REGEX = /^\+?1?[\s\-.]?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}$/;

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
      title: "$1 hold now, full charge later.",
      body: `We save your card and place a $1 verification hold today. Full ${total} charge happens ${chargeDays} days before delivery${chargeDate ? ` (on ${chargeDate})` : ""}.`,
      refund: `Cancel up to ${chargeDays - 1} days before delivery — no fees.`,
      chargeSummary: `$1 hold today. Full ${total} runs ${chargeDays} days before delivery${chargeDate ? ` (${chargeDate})` : ""}.`,
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
  onError,
  busy,
  setBusy,
}: {
  session: SessionResponse;
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

      const { error } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: returnUrl },
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
// Main page
// ============================================================================

function CheckoutContent() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [cart, setCart] = useState<LocalCart | null>(null);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [skuMap, setSkuMap] = useState<Map<number, SkuDetail>>(new Map());
  const [missingIds, setMissingIds] = useState<number[]>([]);
  const [skuLoading, setSkuLoading] = useState(false);
  const [skuError, setSkuError] = useState<string>("");

  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [shipping, setShipping] = useState<AddressForm>(emptyAddress());
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<AddressForm>(emptyAddress());

  const [submitError, setSubmitError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [stripePromise, setStripePromise] =
    useState<Promise<StripeJs | null> | null>(null);
  const [paying, setPaying] = useState(false);

  // ---- 1. Read localStorage cart on mount ----
  useEffect(() => {
    const c = readLocalCart();
    setCart(c);
    setCartLoaded(true);
    setDeliveryDate(c?.delivery_date ?? defaultDeliveryDate());
  }, []);

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

  const lead = useMemo(() => (deliveryDate ? leadDays(deliveryDate) : 0), [deliveryDate]);
  const modeHint = useMemo(
    () => modeHintFor(lead, subtotal, deliveryDate),
    [lead, subtotal, deliveryDate],
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
      const body = {
        items: cart.items,
        requested_delivery_date: deliveryDate,
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
                  <p className="text-[11px] mt-2 opacity-60">
                    Mode {modeHint.mode} · {lead} day{lead === 1 ? "" : "s"} out
                  </p>
                </div>
              </section>

              {/* Shipping */}
              <AddressFieldset
                title="Shipping address"
                value={shipping}
                onChange={setShipping}
                requirePhone
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

              {stripePromise && (
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
                    onError={setSubmitError}
                    busy={paying}
                    setBusy={setPaying}
                  />
                </Elements>
              )}

              {submitError && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setSession(null);
                  setStripePromise(null);
                  setSubmitError("");
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
                const unit =
                  snap?.is_on_deal && snap?.deal_price != null
                    ? snap.deal_price
                    : snap?.price ?? 0;
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
                      <p className="text-xs text-slate-500">
                        {it.quantity} x {money(unit)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 shrink-0">
                      {money(unit * it.quantity)}
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
            <div className="flex justify-between text-slate-500">
              <span>Customs and freight</span>
              <span className="text-emerald-600">Included</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 text-base pt-2 border-t border-slate-100">
              <span>Total</span>
              <span>{money(subtotal)}</span>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Delivery</span>
              <span className="font-medium text-slate-600">
                {deliveryDate || "Pick a date"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Charge mode</span>
              <span className="font-medium text-slate-600">Mode {modeHint.mode}</span>
            </div>
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

  return (
    <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3">
      <p className="text-sm text-amber-900">
        Continuing as guest — your order will be linked to your email.
      </p>
      <Link
        href="/auth/login?next=/checkout"
        className="text-xs text-amber-900 font-semibold underline underline-offset-2 hover:text-amber-700"
      >
        Sign in instead
      </Link>
    </div>
  );
}

// ============================================================================
// Reusable address fieldset
// ============================================================================

function AddressFieldset({
  title,
  value,
  onChange,
  requirePhone = false,
}: {
  title: string;
  value: AddressForm;
  onChange: (next: AddressForm) => void;
  requirePhone?: boolean;
}) {
  const set = <K extends keyof AddressForm>(k: K, v: AddressForm[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6">
      <h2 className="font-semibold text-slate-900 mb-4">{title}</h2>
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
