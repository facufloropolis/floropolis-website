"use client";
// QuoteBar — EXP-055+068 | 2026-03-25 | Job_PM
// Sticky bottom bar: appears when cart has items, drives shop→quote submission
// EXP-068: Added WhatsApp secondary CTA for florists who prefer WA over form

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCartItems, getSubtotal } from "@/lib/quote-cart";
import { ShoppingCart } from "lucide-react";
import { pushEvent } from "@/lib/gtm";
import { WHATSAPP_NUMBER } from "@/lib/catalog-constants";

export default function QuoteBar() {
  const router = useRouter();
  const [itemCount, setItemCount] = useState(0);
  const [visible, setVisible] = useState(false);
  const [subtotal, setSubtotal] = useState(0);

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

  if (!visible) return null;

  const handleClick = () => {
    pushEvent("quote_bar_clicked", { item_count: itemCount });
    router.push("/quote");
  };

  // EXP-068: Build WhatsApp message from cart items for direct WA path
  const buildWhatsAppUrl = () => {
    const items = getCartItems();
    const lines = items.map((item) => {
      const price = item.deal_price ?? item.price;
      return `- ${item.name} | ${item.quantity}x ${item.box_type} | $${price.toFixed(2)}/stem`;
    });
    const msg = [
      "Hi! I\'d like to get a quote for:",
      "",
      ...lines,
      "",
      `Estimated total: $${subtotal.toFixed(2)}`,
    ].join("\n");
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe">
      <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between gap-3 max-w-screen-xl mx-auto">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <ShoppingCart className="w-5 h-5" />
            <span className="absolute -top-2 -right-2 bg-white text-emerald-700 text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {itemCount}
            </span>
          </div>
          <span className="text-sm font-medium truncate">
            {itemCount === 1 ? "1 variety in your quote" : `${itemCount} varieties in your quote`}
          </span>
        </div>
        {/* EXP-068: Two paths — form or WhatsApp */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={buildWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => pushEvent("quote_bar_whatsapp_click", { item_count: itemCount, subtotal })}
            className="hidden sm:flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </a>
          <button
            onClick={handleClick}
            className="flex items-center gap-1.5 bg-white text-emerald-700 font-bold text-sm px-4 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors"
          >
            {subtotal > 0 ? `Request Quote ($${subtotal.toFixed(0)}) →` : "Get My Free Quote →"}
          </button>
        </div>
      </div>
    </div>
  );
}
