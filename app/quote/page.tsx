"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { ChevronLeft, ChevronRight, Plus, Trash2, Package, CalendarDays } from "lucide-react";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";
import {
  clearCart,
  getCartItems,
  getSubtotal,
  removeItem,
  updateQuantity,
  updateItemDeliveryDate,
  getCartDeliveryDates,
  type QuoteItem,
} from "@/lib/quote-cart";
import { addItem } from "@/lib/quote-cart";
import { getGroupedProducts } from "@/lib/data/product-helpers";
import { validatePromoCode, type PromoResult } from "@/lib/promo-engine";
import { type Product } from "@/lib/data/products";
import { PRODUCT_IMAGES_BASE_URL } from "@/lib/catalog-constants";
import { getProductImage } from "@/lib/product-images";
import WhatsAppWidget from "@/components/WhatsAppWidget";
import {
  getDeliveryDates,
  getEarliestDeliveryDate,
  formatDeliveryDate,
  toISODate,
} from "@/lib/delivery-dates";

import { WHATSAPP_NUMBER } from "@/lib/catalog-constants";

function resolveImage(path: string): string {
  if (!path) return "/Floropolis-logo-only.png";
  if (path.startsWith("http") || path.startsWith("/")) return path;
  const base = PRODUCT_IMAGES_BASE_URL.replace(/\/$/, "");
  return `${base}/${path}`;
}

const formatDate = (iso?: string) => {
  if (!iso) return "Not set";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

export default function QuotePage() {
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [promoError, setPromoError] = useState("");
  const [promoDescription, setPromoDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExistingClient, setIsExistingClient] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  const sync = () => setItems(getCartItems());

  useEffect(() => {
    sync();
    const handler = () => sync();
    window.addEventListener("quote-cart-updated", handler);
    return () => window.removeEventListener("quote-cart-updated", handler);
  }, []);

  const subtotal = useMemo(() => getSubtotal(), [items]);
  const total = Math.max(0, subtotal - discount);
  const deliveryDates = getCartDeliveryDates();

  // Group items by delivery date for display
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, QuoteItem[]>();
    for (const item of items) {
      const key = item.delivery_date || "unscheduled";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  // Suggested products for carousel
  const suggestedProducts = useMemo(() => {
    const cartSlugs = new Set(items.map((i) => i.slug));
    return getGroupedProducts()
      .filter((p) => !cartSlugs.has(p.slug))
      .sort(() => Math.random() - 0.5)
      .slice(0, 12);
  }, [items]);

  // Available delivery dates for date editing
  const editableDates = useMemo(() => {
    const earliest = getEarliestDeliveryDate("T1");
    return getDeliveryDates(earliest, 6);
  }, []);

  const handleApplyPromo = () => {
    if (!promoCode) {
      setDiscount(0);
      setPromoError("");
      setPromoDescription("");
      return;
    }
    const cartForPromo = items.map((i) => ({
      slug: i.slug,
      vendor: i.vendor,
      category: i.category,
      price: i.price,
      deal_price: i.deal_price,
      quantity: i.quantity,
      units_per_box: i.units_per_box,
    }));
    const result: PromoResult = validatePromoCode(promoCode, cartForPromo, subtotal);
    if (!result.valid) {
      setDiscount(0);
      setPromoError(result.error || "Invalid code");
      setPromoDescription("");
      return;
    }
    setDiscount(result.discount_amount ?? 0);
    setPromoError("");
    setPromoDescription(result.description || "");
  };

  const handleQuickAdd = (product: Product) => {
    const earliest = getEarliestDeliveryDate(product.tier);
    const deliveryDate = toISODate(earliest);
    const item: QuoteItem = {
      slug: product.slug,
      name: [product.variety, product.color].filter(Boolean).join(" ") || product.name,
      category: product.category,
      vendor: product.vendor || "",
      price: product.price ?? 0,
      deal_price: product.deal_price ?? undefined,
      quantity: 1,
      units_per_box: product.units_per_box || 0,
      box_type: product.box_type || "Standard",
      unit: product.unit || "Stem",
      delivery_date: deliveryDate,
      stem_length: product.length || undefined,
    };
    addItem(item);
    sync();
  };

  const scrollCarousel = (direction: "left" | "right") => {
    if (!carouselRef.current) return;
    const amount = direction === "left" ? -240 : 240;
    carouselRef.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const payload = {
      business_name: formData.get("business_name") as string,
      contact_name: formData.get("contact_name") as string,
      email: formData.get("email") as string,
      phone: (formData.get("phone") as string) || null,
      is_existing_client: isExistingClient,
      shipping_address: (formData.get("shipping_address") as string) || null,
      shipping_city: (formData.get("shipping_city") as string) || null,
      shipping_state: (formData.get("shipping_state") as string) || null,
      shipping_zip: (formData.get("shipping_zip") as string) || null,
      preferred_delivery_date: deliveryDates[0] || null,
      notes: (formData.get("notes") as string) || null,
      wants_call: formData.get("wants_call") === "on",
      items,
      promo_code: promoCode || null,
      subtotal,
      discount,
      total,
    };

    try {
      const res = await fetch("/api/notify-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Submission failed");
      }

      pushEvent(CTA_EVENTS.submit_quote, {
        item_count: items.length,
        quote_total: total,
        has_promo: !!promoCode,
      });
      clearCart();
      const quoteId = data.quote_id ? `?id=${data.quote_id}` : "";
      window.location.href = `/quote/confirmation${quoteId}`;
    } catch (err) {
      console.error(err);
      setError(
        `There was a problem submitting your quote. Please try again or contact us on WhatsApp at +${WHATSAPP_NUMBER}.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-6">
          Review Your Quote
        </h1>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left: Cart Summary (3 cols) */}
          <section className="lg:col-span-3 space-y-6">
            {/* Delivery date summary */}
            {deliveryDates.length > 0 && (
              <div className="rounded-xl bg-emerald-50/80 border border-emerald-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">
                  {deliveryDates.length === 1 ? (
                    <>Delivery: {formatDate(deliveryDates[0])}</>
                  ) : (
                    <>
                      {deliveryDates.length} delivery dates in your order —
                      edit below
                    </>
                  )}
                </p>
              </div>
            )}

            {items.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-slate-600 mb-4">
                  Your quote cart is empty.
                </p>
                <Link
                  href="/shop"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-6 py-3 text-sm font-semibold hover:bg-emerald-700"
                >
                  Browse Catalog
                </Link>
              </div>
            ) : (
              <div className="space-y-5">
                {groupedByDate.map(([date, dateItems]) => (
                  <div key={date}>
                    {/* Date group header */}
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <CalendarDays className="w-4 h-4 text-emerald-600" />
                      <h3 className="text-sm font-bold text-slate-800">
                        {date === "unscheduled" ? "No date set" : formatDate(date)}
                      </h3>
                      <span className="text-xs text-slate-400">
                        {dateItems.length} item{dateItems.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {dateItems.map((item, idx) => (
                        <div
                          key={`${item.slug}-${item.box_type}-${item.units_per_box}-${idx}`}
                          className="border border-slate-200 rounded-xl p-4 flex flex-col gap-2"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <h3 className="font-semibold text-slate-900 text-sm">
                                {item.name}
                              </h3>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {item.category} · {item.box_type} box
                                {item.units_per_box > 0 && ` · ${item.units_per_box.toLocaleString()} stems`}
                                {item.stem_length && ` · ${item.stem_length}`}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-red-500 p-1"
                              onClick={() => {
                                removeItem(
                                  item.slug,
                                  item.box_type,
                                  item.units_per_box,
                                  item.delivery_date,
                                );
                                sync();
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {/* Quantity */}
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  className="w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-50 text-sm"
                                  onClick={() => {
                                    updateQuantity(
                                      item.slug,
                                      item.box_type,
                                      item.units_per_box,
                                      item.quantity - 1,
                                      item.delivery_date,
                                    );
                                    sync();
                                  }}
                                >
                                  -
                                </button>
                                <span className="w-6 text-center text-sm font-medium text-slate-800">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  className="w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-50 text-sm"
                                  onClick={() => {
                                    updateQuantity(
                                      item.slug,
                                      item.box_type,
                                      item.units_per_box,
                                      item.quantity + 1,
                                      item.delivery_date,
                                    );
                                    sync();
                                  }}
                                >
                                  +
                                </button>
                              </div>

                              {/* Delivery date selector */}
                              <select
                                value={item.delivery_date || ""}
                                onChange={(e) => {
                                  updateItemDeliveryDate(
                                    item.slug,
                                    item.box_type,
                                    item.units_per_box,
                                    item.delivery_date,
                                    e.target.value,
                                  );
                                  sync();
                                }}
                                className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700"
                              >
                                {editableDates.map((d) => (
                                  <option key={toISODate(d)} value={toISODate(d)}>
                                    {formatDeliveryDate(d)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold text-slate-900">
                                $
                                {(
                                  (item.deal_price ?? item.price) *
                                  item.quantity *
                                  (item.units_per_box || 1)
                                ).toFixed(2)}
                              </span>
                              <p className="text-[10px] text-slate-400">
                                ${(item.deal_price ?? item.price).toFixed(2)}/
                                {item.unit === "Bunch" ? "bunch" : "stem"}
                                {item.units_per_box > 0 ? ` × ${item.units_per_box}` : ""}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Promo + totals */}
            {items.length > 0 && (
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    placeholder="Promo code"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleApplyPromo}
                    className="px-4 py-2 rounded-lg border border-emerald-600 text-emerald-700 text-xs font-semibold hover:bg-emerald-50"
                  >
                    Apply
                  </button>
                </div>
                {promoError && (
                  <p className="text-xs text-red-600">{promoError}</p>
                )}
                {promoDescription && discount > 0 && (
                  <p className="text-xs text-emerald-600">{promoDescription}</p>
                )}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Promo discount</span>
                      <span>-${discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-900 text-base pt-1 border-t border-slate-100">
                    <span>Total</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Product carousel — "You might also like" */}
            {suggestedProducts.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    You might also want
                  </h3>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => scrollCarousel("left")}
                      className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollCarousel("right")}
                      className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div
                  ref={carouselRef}
                  className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
                >
                  {suggestedProducts.map((p) => {
                    const dbImg = p.images?.[0];
                    const img = dbImg ? resolveImage(dbImg) : getProductImage(p.variety, p.color, p.category);
                    const price = p.deal_price ?? p.price;
                    return (
                      <div
                        key={p.slug}
                        className="flex-shrink-0 w-36 border border-slate-200 rounded-xl overflow-hidden bg-white"
                      >
                        <div className="aspect-square relative bg-slate-50">
                          <Image
                            src={img || "/Floropolis-logo-only.png"}
                            alt={p.name}
                            fill
                            className="object-contain"
                            sizes="144px"
                            unoptimized={img.startsWith("http")}
                          />
                        </div>
                        <div className="p-2">
                          <p className="text-xs font-semibold text-slate-900 line-clamp-1">
                            {p.variety} {p.color}
                          </p>
                          <p className="text-xs text-emerald-600 font-bold">
                            ${price.toFixed(2)}/stem
                          </p>
                          <button
                            type="button"
                            onClick={() => handleQuickAdd(p)}
                            className="mt-1.5 w-full flex items-center justify-center gap-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold py-1.5 hover:bg-emerald-700"
                          >
                            <Plus className="w-3 h-3" />
                            Add
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <style jsx>{`
                  .scrollbar-hide::-webkit-scrollbar { display: none; }
                  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
                `}</style>
              </div>
            )}
          </section>

          {/* Right: Form (2 cols) */}
          <section className="lg:col-span-2">
            <div className="sticky top-24 bg-slate-50 rounded-2xl border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">
                Your Details
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                We'll confirm your order within 1 hour (Mon–Fri, 8 AM – 6 PM ET).
              </p>

              {/* Existing client toggle */}
              <div className="mb-4 flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white">
                <input
                  type="checkbox"
                  checked={isExistingClient}
                  onChange={(e) => setIsExistingClient(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800">
                    I'm an existing Floropolis client
                  </span>
                  <p className="text-xs text-slate-500">
                    We already have your shipping info
                  </p>
                </div>
              </div>

              <form id="quote-form" onSubmit={handleSubmit} className="space-y-3 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1 text-xs font-medium">
                      Contact Name *
                    </label>
                    <input
                      name="contact_name"
                      required
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 mb-1 text-xs font-medium">
                      Business Name *
                    </label>
                    <input
                      name="business_name"
                      required
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                      placeholder="Your shop"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1 text-xs font-medium">
                      Email *
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                      placeholder="you@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 mb-1 text-xs font-medium">
                      Phone {!isExistingClient && "*"}
                    </label>
                    <input
                      name="phone"
                      type="tel"
                      required={!isExistingClient}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                      placeholder="For delivery updates"
                    />
                  </div>
                </div>

                {/* Shipping address — required for new clients */}
                {!isExistingClient && (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <p className="text-xs font-semibold text-slate-700">Shipping Address *</p>
                    <div>
                      <input
                        name="shipping_address"
                        required
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                        placeholder="Street address"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <input
                          name="shipping_city"
                          required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                          placeholder="City"
                        />
                      </div>
                      <div>
                        <select
                          name="shipping_state"
                          required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700"
                          defaultValue=""
                        >
                          <option value="" disabled>State</option>
                          <option value="AL">Alabama</option>
                          <option value="AK">Alaska</option>
                          <option value="AZ">Arizona</option>
                          <option value="AR">Arkansas</option>
                          <option value="CA">California</option>
                          <option value="CO">Colorado</option>
                          <option value="CT">Connecticut</option>
                          <option value="DE">Delaware</option>
                          <option value="DC">District of Columbia</option>
                          <option value="FL">Florida</option>
                          <option value="GA">Georgia</option>
                          <option value="HI">Hawaii</option>
                          <option value="ID">Idaho</option>
                          <option value="IL">Illinois</option>
                          <option value="IN">Indiana</option>
                          <option value="IA">Iowa</option>
                          <option value="KS">Kansas</option>
                          <option value="KY">Kentucky</option>
                          <option value="LA">Louisiana</option>
                          <option value="ME">Maine</option>
                          <option value="MD">Maryland</option>
                          <option value="MA">Massachusetts</option>
                          <option value="MI">Michigan</option>
                          <option value="MN">Minnesota</option>
                          <option value="MS">Mississippi</option>
                          <option value="MO">Missouri</option>
                          <option value="MT">Montana</option>
                          <option value="NE">Nebraska</option>
                          <option value="NV">Nevada</option>
                          <option value="NH">New Hampshire</option>
                          <option value="NJ">New Jersey</option>
                          <option value="NM">New Mexico</option>
                          <option value="NY">New York</option>
                          <option value="NC">North Carolina</option>
                          <option value="ND">North Dakota</option>
                          <option value="OH">Ohio</option>
                          <option value="OK">Oklahoma</option>
                          <option value="OR">Oregon</option>
                          <option value="PA">Pennsylvania</option>
                          <option value="RI">Rhode Island</option>
                          <option value="SC">South Carolina</option>
                          <option value="SD">South Dakota</option>
                          <option value="TN">Tennessee</option>
                          <option value="TX">Texas</option>
                          <option value="UT">Utah</option>
                          <option value="VT">Vermont</option>
                          <option value="VA">Virginia</option>
                          <option value="WA">Washington</option>
                          <option value="WV">West Virginia</option>
                          <option value="WI">Wisconsin</option>
                          <option value="WY">Wyoming</option>
                        </select>
                      </div>
                      <div>
                        <input
                          name="shipping_zip"
                          required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                          placeholder="ZIP"
                          pattern="[0-9]{5}"
                          maxLength={5}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Existing client note */}
                {isExistingClient && (
                  <p className="text-xs text-emerald-600 -mt-1">
                    We have your details on file — just confirm your name and email above.
                  </p>
                )}

                <div>
                  <label className="block text-slate-700 mb-1 text-xs font-medium">
                    Notes (optional)
                  </label>
                  {items.some(i => i.category === "Mixed Boxes" || i.unit === "Box") && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                      📦 Your quote includes curated mix boxes. Use the notes below to specify any variety preferences (e.g., "more heliconias, fewer greens in the Fiesta Box").
                    </p>
                  )}
                  <textarea
                    name="notes"
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder={
                      items.some(i => i.category === "Mixed Boxes" || i.unit === "Box")
                        ? "Mix preferences (e.g., more heliconias, less foliage), delivery notes, special requests..."
                        : "Special requests, color preferences, standing order details..."
                    }
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="wants_call"
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-slate-700">
                    I'd like a quick call to discuss this order
                  </span>
                </div>

                {error && (
                  <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg">
                    {error}
                  </p>
                )}

                {/* Trust bar above submit */}
                <div className="grid grid-cols-3 gap-1 text-center text-[10px] text-slate-500 py-2 border-t border-slate-100">
                  <div>
                    <div className="font-semibold text-slate-700">11+ florists</div>
                    <div>already ordering</div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-700">1 hr response</div>
                    <div>Mon–Fri 8–6 ET</div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-700">Price includes</div>
                    <div>shipping</div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || items.length === 0}
                  className="w-full rounded-xl bg-emerald-600 text-white text-sm font-bold px-6 py-3.5 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-700 transition-all"
                >
                  {submitting ? "Submitting..." : "Submit Quote Request"}
                </button>

                <p className="text-[10px] text-slate-400 text-center mt-1">
                  By submitting, you agree to be contacted about this quote. We
                  never share your information.
                </p>
              </form>

              {/* Sample box nudge */}
              <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <div className="flex items-start gap-2">
                  <Package className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      New to Floropolis?
                    </p>
                    <p className="text-xs text-slate-600">
                      Try a{" "}
                      <Link
                        href="/sample-box"
                        className="text-emerald-600 font-semibold hover:underline"
                      >
                        free sample box
                      </Link>{" "}
                      first — no obligation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Sticky Continue Shopping bar */}
      <div className="sticky bottom-0 z-30 bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Continue Shopping
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
            {items.length > 0 && (
              <Link
                href="#quote-form"
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
              >
                Submit Quote
              </Link>
            )}
          </div>
        </div>
      </div>

      <WhatsAppWidget message="Hi! I have a question about my quote on Floropolis." />
      <Footer />
    </div>
  );
}
