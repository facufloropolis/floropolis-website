"use client";
// QuoteBar — EXP-055 | 2026-03-24 | Job_PM
// Sticky bottom bar: appears when cart has items, drives shop→quote submission
// Hypothesis: persistent visible CTA reduces "I'll do it later" drop-off

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCartItems, getSubtotal } from "@/lib/quote-cart";
import { ShoppingCart } from "lucide-react";
import { pushEvent } from "@/lib/gtm";

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

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe">
      <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between max-w-screen-xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="relative">
            <ShoppingCart className="w-5 h-5" />
            <span className="absolute -top-2 -right-2 bg-white text-emerald-700 text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {itemCount}
            </span>
          </div>
          <span className="text-sm font-medium">
            {itemCount === 1 ? "1 variety in your quote" : `${itemCount} varieties in your quote`}
          </span>
        </div>
        <button
          onClick={handleClick}
          className="flex items-center gap-1.5 bg-white text-emerald-700 font-bold text-sm px-4 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors"
        >
          {subtotal > 0 ? `Request Quote ($${subtotal.toFixed(0)}) →` : "Get My Free Quote →"}
        </button>
      </div>
    </div>
  );
}
