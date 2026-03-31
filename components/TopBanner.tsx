"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";

/**
 * Site-wide banner: EXP-107 — MDY seasonal banner until May 10, then reverts to sample box.
 * April 25 pre-order cutoff is high urgency. Show MDY > sample box while cutoff is active.
 */
export default function TopBanner() {
  const [timeLeft, setTimeLeft] = useState("");

  // EXP-107: Countdown to April 25 MDY pre-order cutoff
  useEffect(() => {
    const CUTOFF = new Date("2026-04-25T23:59:59-04:00").getTime();
    function update() {
      const diff = CUTOFF - Date.now();
      if (diff <= 0) { setTimeLeft(""); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(d > 0 ? `${d}d ${h}h left` : `${h}h ${m}m left`);
    }
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);

  // After April 25 cutoff, show sample box banner instead
  const pastCutoff = new Date() > new Date("2026-04-25T23:59:59-04:00");

  if (pastCutoff) {
    return (
      <div className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white py-1.5 sm:py-2.5 text-center text-xs sm:text-sm font-semibold tracking-wide relative overflow-hidden">
        <div className="relative z-10 flex items-center justify-center gap-x-2 px-3">
          <span className="sm:hidden truncate">
            🌸 Free Sample Box — Try Farm-Direct Flowers{" "}
            <Link href="/sample-box" className="underline font-bold" onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "top_banner" })}>
              Get Yours →
            </Link>
          </span>
          <span className="hidden sm:flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <span>🌸 Free Sample Box — Try our farm-direct flowers, no obligation</span>
            <span className="text-white/80">|</span>
            <Link href="/sample-box" className="underline hover:no-underline font-bold" onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "top_banner" })}>
              Request Your Free Box →
            </Link>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-rose-600 via-pink-600 to-rose-500 text-white py-1.5 sm:py-2.5 text-center text-xs sm:text-sm font-semibold tracking-wide relative overflow-hidden">
      <div className="relative z-10 flex items-center justify-center gap-x-2 px-3">
        {/* Mobile */}
        <span className="sm:hidden truncate">
          💐 Mother&apos;s Day — Order by April 25, ships May 10{" "}
          <Link
            href="/mothers-day-2026"
            className="underline font-bold"
            onClick={() => pushEvent("mdy_banner_click", { cta_location: "top_banner" })}
          >
            Shop Now →
          </Link>
          {timeLeft && <span className="text-white/80 ml-1">· {timeLeft}</span>}
        </span>
        {/* Desktop */}
        <span className="hidden sm:flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>💐 Mother&apos;s Day Farm-Direct Flowers — Guaranteed May 10 delivery, delivery included</span>
          {timeLeft && (
            <>
              <span className="text-white/80">|</span>
              <span className="text-yellow-200 font-bold">Pre-order cutoff: {timeLeft}</span>
            </>
          )}
          <span className="text-white/80">|</span>
          <Link
            href="/mothers-day-2026"
            className="underline hover:no-underline font-bold"
            onClick={() => pushEvent("mdy_banner_click", { cta_location: "top_banner" })}
          >
            Shop Mother&apos;s Day →
          </Link>
        </span>
      </div>
    </div>
  );
}
