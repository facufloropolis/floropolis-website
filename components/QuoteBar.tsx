"use client";
// QuoteBar — EXP-055+068+080+139 | 2026-04-14 | Job_PM
// Sticky bottom bar: appears when cart has items.
// EXP-139 (2026-04-14): Quick-submit inline form — removes /quote page round-trip.
//   Hypothesis: 96% form abandonment is driven by page navigation friction.
//   Variant: users can submit directly from /shop with 3 fields (business, name, email).
//   Metric: submit_quote events via quick-submit path vs legacy /quote path.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCartItems, getSubtotal, clearCart } from "@/lib/quote-cart";
import { ShoppingCart, Share2, X, Copy, Check, Send } from "lucide-react";
import { pushEvent } from "@/lib/gtm";
import { WHATSAPP_NUMBER } from "@/lib/catalog-constants";

export default function QuoteBar() {
  const router = useRouter();
  const [itemCount, setItemCount] = useState(0);
  const [visible, setVisible] = useState(false);
  const [subtotal, setSubtotal] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // EXP-139 quick-submit modal state
  const [showQuickSubmit, setShowQuickSubmit] = useState(false);
  const [qBusiness, setQBusiness] = useState("");
  const [qName, setQName] = useState("");
  const [qEmail, setQEmail] = useState("");
  const [qSubmitting, setQSubmitting] = useState(false);
  const [qError, setQError] = useState<string | null>(null);
  const [qSuccess, setQSuccess] = useState(false);

  useEffect(() => {
    const update = () => {
      const items = getCartItems();
      const count = items.reduce((sum, i) => sum + i.quantity, 0);
      setItemCount(count);
      setVisible(count > 0);
      setSubtotal(getSubtotal());
    };
    update();
    window.addEventListener("quote-cart-updated", update);
    return () => window.removeEventListener("quote-cart-updated", update);
  }, []);

  if (!visible && !qSuccess) return null;

  const openQuickSubmit = () => {
    pushEvent("quick_submit_opened", { item_count: itemCount, subtotal });
    setShowQuickSubmit(true);
  };

  const goToFullQuote = () => {
    pushEvent("quote_bar_clicked", { item_count: itemCount, path: "full_quote_page" });
    router.push("/quote");
  };

  const buildWhatsAppUrl = () => {
    const items = getCartItems();
    const lines = items.map((item) => {
      const price = item.deal_price ?? item.price;
      return `- ${item.name} | ${item.quantity}x ${item.box_type} | $${price.toFixed(2)}/stem`;
    });
    const msg = [
      "Hi! I'd like to get a quote for:",
      "",
      ...lines,
      "",
      `Estimated total: $${subtotal.toFixed(2)}`,
    ].join("\n");
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  };

  const handleShare = () => {
    const items = getCartItems();
    try {
      const encoded = btoa(JSON.stringify(items));
      const url = `${window.location.origin}/quote?cart=${encoded}`;
      setShareUrl(url);
      setShowShareModal(true);
      setCopied(false);
      pushEvent("share_cart_opened", { item_count: itemCount });
    } catch { /* ignore */ }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      pushEvent("share_cart_copied", { item_count: itemCount });
    } catch { /* ignore */ }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "My Floropolis Cart",
          text: `Check out my flower order — ${itemCount} varieties, $${subtotal.toFixed(0)} estimated`,
          url: shareUrl,
        });
        pushEvent("share_cart_native", { item_count: itemCount });
      } catch { /* cancelled */ }
    }
  };

  // EXP-139: quick-submit POST
  const handleQuickSubmit = async () => {
    if (!qBusiness.trim() || !qName.trim() || !qEmail.trim()) {
      setQError("All three fields are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(qEmail)) {
      setQError("Please enter a valid email.");
      return;
    }

    setQError(null);
    setQSubmitting(true);
    pushEvent("form_start", { path: "quick_submit", item_count: itemCount });

    const items = getCartItems();
    const payload = {
      business_name: qBusiness.trim(),
      contact_name: qName.trim(),
      email: qEmail.trim(),
      phone: null,
      shipping_address: null,
      shipping_city: null,
      shipping_state: null,
      shipping_zip: null,
      preferred_delivery_date: null,
      notes: "Submitted via quick-submit (EXP-139) — shipping details to be confirmed on call.",
      wants_call: false,
      is_existing_client: false,
      items: items.map((i) => ({
        slug: i.slug,
        name: i.name,
        category: i.category,
        vendor: i.vendor,
        price: i.price,
        deal_price: i.deal_price,
        quantity: i.quantity,
        units_per_box: i.units_per_box,
        box_type: i.box_type,
        unit: i.unit,
        delivery_date: i.delivery_date,
        stem_length: i.stem_length,
      })),
      subtotal,
      discount: 0,
      total: subtotal,
      promo_code: null,
    };

    try {
      const res = await fetch("/api/notify-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API ${res.status}: ${text.slice(0, 120)}`);
      }
      pushEvent("submit_quote", { path: "quick_submit", item_count: itemCount, subtotal });
      pushEvent("quick_submit_success", { item_count: itemCount, subtotal });
      clearCart();
      setQSuccess(true);
      setShowQuickSubmit(false);
    } catch (err) {
      console.error("quick-submit failed", err);
      setQError("Something went wrong. Please try the full quote page, or WhatsApp us.");
      pushEvent("quick_submit_error", { item_count: itemCount, message: String(err).slice(0, 80) });
    } finally {
      setQSubmitting(false);
    }
  };

  return (
    <>
      {/* Success banner — replaces the bar after submit */}
      {qSuccess && (
        <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe">
          <div className="bg-emerald-700 text-white px-4 py-4 max-w-screen-xl mx-auto flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-sm">Quote received</p>
              <p className="text-xs text-emerald-100">We'll confirm within 1 hour, Mon–Fri. Check your email.</p>
            </div>
            <button
              onClick={() => setQSuccess(false)}
              className="text-white/80 hover:text-white text-sm font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Main bar */}
      {visible && !qSuccess && (
        <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe">
          <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between gap-3 max-w-screen-xl mx-auto">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative flex-shrink-0">
                <ShoppingCart className="w-5 h-5" />
                <span className="absolute -top-2 -right-2 bg-white text-emerald-700 text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {itemCount}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight truncate">
                  {subtotal > 0 ? `$${subtotal.toFixed(0)} ready to submit` : `${itemCount} ${itemCount === 1 ? "variety" : "varieties"} in cart`}
                </p>
                <p className="text-xs text-emerald-200 leading-tight">
                  {itemCount === 1 ? "1 item · complete your order" : `${itemCount} items · don't lose your cart`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleShare}
                title="Share cart"
                className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-2 py-1.5 rounded-lg transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Share</span>
              </button>
              <a
                href={buildWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => pushEvent("quote_bar_whatsapp_click", { item_count: itemCount, subtotal })}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-2 sm:px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </a>
              {/* EXP-139: Primary CTA now opens quick-submit modal (used to route to /quote) */}
              <button
                onClick={openQuickSubmit}
                className="flex items-center gap-1.5 bg-white text-emerald-700 font-bold text-sm px-4 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                Submit Quote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXP-139: Quick-submit modal */}
      {showQuickSubmit && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !qSubmitting && setShowQuickSubmit(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md mx-0 sm:mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900 text-lg">Submit your quote</h3>
              <button
                onClick={() => !qSubmitting && setShowQuickSubmit(false)}
                className="text-slate-400 hover:text-slate-600"
                disabled={qSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              {itemCount} {itemCount === 1 ? "item" : "items"} · ${subtotal.toFixed(0)} estimated · Delivery details confirmed on call.
            </p>

            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Business name</span>
                <input
                  type="text"
                  value={qBusiness}
                  onChange={(e) => setQBusiness(e.target.value)}
                  autoFocus
                  placeholder="Your florist shop or company"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                  disabled={qSubmitting}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Your name</span>
                <input
                  type="text"
                  value={qName}
                  onChange={(e) => setQName(e.target.value)}
                  placeholder="First and last name"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                  disabled={qSubmitting}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Email</span>
                <input
                  type="email"
                  value={qEmail}
                  onChange={(e) => setQEmail(e.target.value)}
                  placeholder="you@yourshop.com"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                  disabled={qSubmitting}
                />
              </label>
            </div>

            {qError && (
              <p className="mt-3 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{qError}</p>
            )}

            <button
              onClick={handleQuickSubmit}
              disabled={qSubmitting}
              className="mt-5 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {qSubmitting ? "Submitting..." : "Submit quote"}
            </button>

            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <button
                onClick={() => {
                  pushEvent("quick_submit_full_page_click", { item_count: itemCount });
                  router.push("/quote");
                }}
                className="underline underline-offset-2 hover:text-slate-700"
                disabled={qSubmitting}
              >
                Need to add shipping details? Use full quote page →
              </button>
            </div>
            <p className="mt-3 text-[11px] text-slate-400 text-center">
              We reply within 1 hour (Mon–Fri). No payment required yet.
            </p>
          </div>
        </div>
      )}

      {/* Share cart modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowShareModal(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-sm mx-0 sm:mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">Share your cart</h3>
              <button onClick={() => setShowShareModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Anyone with this link can open your exact cart and place the same order.
            </p>
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 mb-4">
              <p className="text-xs text-slate-600 flex-1 truncate font-mono">{shareUrl}</p>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCopy}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 text-slate-700 py-2.5 text-sm font-semibold hover:bg-slate-50"
              >
                <Copy className="w-4 h-4" />
                {copied ? "Copied!" : "Copy link"}
              </button>
              {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
                <button
                  onClick={handleNativeShare}
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white py-2.5 text-sm font-semibold hover:bg-emerald-700"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
              ) : (
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Check out my Floropolis cart: ${shareUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white py-2.5 text-sm font-semibold hover:bg-emerald-700"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
