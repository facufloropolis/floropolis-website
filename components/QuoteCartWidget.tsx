"use client";

import { useEffect, useState } from "react";
import { ShoppingCart, X, AlertTriangle } from "lucide-react";
import Link from "next/link";
import {
  getCartItems,
  getItemCount,
  getSubtotal,
  clearCart,
  updateQuantity,
  removeItem,
  hasMultipleDeliveryDates,
  type QuoteItem,
} from "@/lib/quote-cart";
import { validatePromoCode } from "@/lib/data/product-helpers";

type PromoState = {
  code: string;
  discount: number;
};

export default function QuoteCartWidget() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [promo, setPromo] = useState<PromoState>({ code: "", discount: 0 });
  const [itemCount, setItemCount] = useState(0);

  const sync = () => {
    setItems(getCartItems());
    setItemCount(getItemCount());
  };

  useEffect(() => {
    sync();
    const handler = () => sync();
    window.addEventListener("quote-cart-updated", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("quote-cart-updated", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  if (typeof window === "undefined") return null;

  const subtotal = getSubtotal();
  const total = Math.max(0, subtotal - promo.discount);
  const multiDates = hasMultipleDeliveryDates();

  const handleApplyPromo = () => {
    if (!promo.code) {
      setPromo({ code: "", discount: 0 });
      return;
    }
    const result = validatePromoCode(
      promo.code,
      items.map((i) => ({ vendor: i.vendor, category: i.category })),
    );
    if (!result.valid) {
      setPromo({ code: promo.code, discount: 0 });
      return;
    }
    const discount = subtotal * ((result.discount_value ?? 0) / 100);
    setPromo({ code: promo.code, discount });
  };

  if (itemCount === 0 && !open) return null;

  // Format delivery date for display
  const formatDate = (iso?: string) => {
    if (!iso) return "Not set";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-emerald-600 text-white px-5 py-3.5 shadow-lg hover:bg-emerald-700 hover:shadow-xl transition-all animate-bounce-once"
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="text-sm font-bold">
            Quote ({itemCount})
          </span>
          <span className="text-xs opacity-80">
            ${subtotal.toFixed(0)}
          </span>
        </button>
      )}

      {/* Drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">
                Quote Cart ({itemCount} items)
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-md hover:bg-slate-100 text-slate-600"
                aria-label="Close cart"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Multiple delivery dates warning */}
            {multiDates && (
              <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Your cart has items with different delivery dates. You can edit
                  dates on the quote page.
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {items.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Your quote cart is empty.
                </p>
              ) : (
                items.map((item) => (
                  <div
                    key={`${item.slug}-${item.box_type}-${item.units_per_box}-${item.delivery_date}`}
                    className="border border-slate-200 rounded-lg p-3 text-xs flex flex-col gap-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {item.name}
                        </div>
                        <div className="text-slate-500">
                          {item.category} · {item.box_type} box
                        </div>
                        <div className="text-slate-500">
                          {(item.units_per_box || 0).toLocaleString()} stems ·{" "}
                          {item.stem_length || ""}
                        </div>
                        {item.delivery_date && (
                          <div className="text-emerald-600 font-medium mt-0.5">
                            Delivery: {formatDate(item.delivery_date)}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-500"
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
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-50"
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
                        <span className="w-6 text-center text-slate-800 font-medium">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-50"
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
                      <div className="text-right">
                        <div className="font-bold text-slate-900">
                          $
                          {(
                            (item.deal_price ?? item.price) *
                            item.quantity *
                            item.units_per_box
                          ).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-200 px-4 py-3 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={promo.code}
                  onChange={(e) =>
                    setPromo((p) => ({ ...p, code: e.target.value }))
                  }
                  placeholder="Promo code (optional)"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleApplyPromo}
                  className="px-3 py-2 rounded-lg border border-emerald-600 text-emerald-700 text-xs font-semibold hover:bg-emerald-50"
                >
                  Apply
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {promo.discount > 0 && (
                <div className="flex items-center justify-between text-xs text-emerald-700">
                  <span>Promo discount</span>
                  <span>- ${promo.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm font-bold text-slate-900">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>

              <div className="flex gap-2">
                <Link
                  href="/quote"
                  onClick={() => setOpen(false)}
                  className="flex-1 inline-flex items-center justify-center rounded-lg bg-emerald-600 text-white text-sm font-bold py-3 hover:bg-emerald-700 transition-all"
                >
                  Request Quote →
                </Link>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
                  onClick={() => {
                    clearCart();
                    sync();
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
