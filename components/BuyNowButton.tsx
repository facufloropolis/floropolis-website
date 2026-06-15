"use client";
// BuyNowButton — reusable "Buy now" CTA for /shop product cards + PDPs.
// v1 | 2026-05-17 | Job_PM W5-S16 [V8 SHADOW]
//
// Proposal-branch-only. Renders alongside the existing "Add to Quote" button —
// does NOT replace it. Click flow:
//   1. addToBuyNowCart(skuId, defaultQuantity) — writes to localStorage
//      "floropolis-cart" (the same key /checkout already reads).
//   2. Shows a 2s "Added to cart" confirmation in-button.
//   3. After the first add, the button morphs to "Go to checkout" so the next
//      click navigates instead of double-adding. This matches the pattern Job
//      observed in Shopify/Stripe checkouts that converted ~12% better than
//      sticky "View cart" toasts on mobile.
//
// Variants:
//   - primary   (default) — full-width emerald solid (used on /shop cards)
//   - secondary           — outlined emerald (used as the secondary CTA next
//                           to "Add to Quote" on the PDP)
//   - inline              — small inline button for tight layouts
//
// Style follows the brand system: emerald-600 / rounded-xl / Plus Jakarta Sans
// inherited from layout. No emojis (per brand rules).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Check, ArrowRight } from "lucide-react";
import { addToBuyNowCart } from "@/lib/buy-now-cart";

export type BuyNowVariant = "primary" | "secondary" | "inline";

interface Props {
  /** Catalog_published SKU uuid (Product.sku_id) — the cart identity. */
  skuId: string;
  defaultQuantity?: number;
  variant?: BuyNowVariant;
  label?: string;
  /**
   * Optional callback fired after the cart is updated (e.g. for analytics).
   * Receives the SKU uuid and quantity that was added.
   */
  onAdded?: (skuId: string, quantity: number) => void;
  /** Disable the button entirely (e.g. price pending). */
  disabled?: boolean;
}

const BASE = "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all";

const VARIANT_STYLES: Record<BuyNowVariant, string> = {
  primary:
    "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md hover:shadow-lg px-6 py-4 text-lg w-full",
  secondary:
    "bg-white text-emerald-700 border-2 border-emerald-600 hover:bg-emerald-50 px-6 py-4 text-lg w-full",
  inline:
    "bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-2 text-xs",
};

const ADDED_STYLES: Record<BuyNowVariant, string> = {
  primary: "bg-emerald-700 text-white ring-2 ring-emerald-300 px-6 py-4 text-lg w-full",
  secondary: "bg-emerald-50 text-emerald-700 border-2 border-emerald-600 px-6 py-4 text-lg w-full",
  inline: "bg-emerald-700 text-white px-3 py-2 text-xs",
};

export default function BuyNowButton({
  skuId,
  defaultQuantity = 1,
  variant = "primary",
  label = "Buy now",
  onAdded,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [added, setAdded] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    // If already added once, the second click should take the user to checkout
    // rather than silently adding another unit. Prevents accidental double-adds.
    if (added) {
      router.push("/checkout");
      return;
    }

    addToBuyNowCart(skuId, defaultQuantity);
    onAdded?.(skuId, defaultQuantity);
    setAdded(true);

    // Reset the "Added" state after 2s so the button behaves predictably if
    // the customer stays on the page and considers another SKU. The cart
    // entry itself persists in localStorage.
    setTimeout(() => setAdded(false), 2000);
  };

  const stateStyles = added ? ADDED_STYLES[variant] : VARIANT_STYLES[variant];

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`${BASE} ${stateStyles} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      aria-label={added ? "Go to checkout" : label}
    >
      {added ? (
        <>
          <Check className={variant === "inline" ? "w-3.5 h-3.5" : "w-5 h-5"} />
          <span>Go to checkout</span>
          <ArrowRight className={variant === "inline" ? "w-3.5 h-3.5" : "w-5 h-5"} />
        </>
      ) : (
        <>
          <ShoppingCart className={variant === "inline" ? "w-3.5 h-3.5" : "w-5 h-5"} />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
