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
    <div className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white py-3 text-center text-sm font-semibold tracking-wide relative overflow-hidden">
      <div className="absolute inset-0 bg-white/10 animate-pulse" aria-hidden />
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2">
        <span>🎉 NEW: Magic Flowers Farm — Tropicals & Exotic Greens from Ecuador</span>
        <span className="hidden sm:inline text-white/80">|</span>
        {spotsLeft > 0 ? (
          <span className="bg-white/20 px-2 py-1 rounded">
            LIMITED: {spotsLeft} sample box{spotsLeft !== 1 ? "es" : ""} left this week
          </span>
        ) : (
          <span className="bg-white/20 px-2 py-1 rounded">
            New sample boxes available Monday
          </span>
        )}
        <span className="hidden sm:inline text-white/80">|</span>
        <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <a
            href="https://eshops.kometsales.com/762172?search=tropical&utm_source=Website&utm_campaign=Magic-Flowers-Launch"
            className="underline hover:no-underline font-bold"
            onClick={(e) => handleOutboundClick(e, CTA_EVENTS.shop_now_click, { cta_location: "top_banner_magic" })}
          >
            Shop Magic Flowers →
          </a>
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
