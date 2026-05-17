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

function modeHintFor(lead: number): { mode: "A" | "B" | "C"; text: string; tone: string } {
  if (lead >= 10) {
    return {
      mode: "A",
      tone: "bg-emerald-50 border-emerald-200 text-emerald-800",
      text: "We will charge your card 5 days before delivery.",
    };
  }
  if (lead >= 6) {
    return {
      mode: "B",
      tone: "bg-amber-50 border-amber-200 text-amber-800",
      text: "Card saved + held with $1 verification. Full charge 5 days before delivery.",
    };
  }
  return {
    mode: "C",
    tone: "bg-red-50 border-red-200 text-red-800",
    text: "We will charge your card now (5 days or less to delivery).",
  };
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
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
  const modeHint = useMemo(() => modeHintFor(lead), [lead]);

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
                <p className={`mt-3 text-xs px-3 py-2 rounded-xl border ${modeHint.tone}`}>
                  Mode {modeHint.mode} - {lead} day{lead === 1 ? "" : "s"} out. {modeHint.text}
                </p>
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
