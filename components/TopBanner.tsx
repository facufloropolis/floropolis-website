"use client";

import Link from "next/link";
import { getSampleBoxesAvailable } from "@/lib/sample-boxes";
import { handleOutboundClick, pushEvent, CTA_EVENTS } from "@/lib/gtm";

/**
 * Main site-wide banner: Magic Flowers + LIMITED sample boxes (same number as sample-box page).
 * Two CTAs: Shop Now (Magic Flowers) and FREE Samples. No one-off free shipping messaging.
 */
export default function TopBanner() {
  const spotsLeft = getSampleBoxesAvailable();

  return (
    <div className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white py-1.5 sm:py-2.5 text-center text-xs sm:text-sm font-semibold tracking-wide relative overflow-hidden">
      <div className="relative z-10 flex items-center justify-center gap-x-2 px-3">
        {/* Mobile: compact single-line */}
        <span className="sm:hidden truncate">
          🎉 Farm-Direct Tropicals & Greens{" "}
          <Link href="/shop?category=Tropicals" className="underline font-bold">Shop →</Link>
        </span>
        {/* Desktop: full version */}
        <span className="hidden sm:flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>🎉 NEW: Magic Flowers Farm — Tropicals & Exotic Greens from Ecuador</span>
          <span className="text-white/80">|</span>
          {spotsLeft > 0 ? (
            <span className="bg-white/20 px-2 py-0.5 rounded text-xs">
              LIMITED: {spotsLeft} sample box{spotsLeft !== 1 ? "es" : ""} left
            </span>
          ) : (
            <span className="bg-white/20 px-2 py-0.5 rounded text-xs">
              New sample boxes Monday
            </span>
          )}
          <span className="text-white/80">|</span>
          <Link
            href="/shop?category=Tropicals"
            className="underline hover:no-underline font-bold"
          >
            Shop Magic Flowers →
          </Link>
          <Link
            href="/sample-box"
            className="underline hover:no-underline font-bold"
            onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "top_banner" })}
          >
            FREE Samples
          </Link>
        </span>
      </div>
    </div>
  );
}
