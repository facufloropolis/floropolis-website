"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";

/**
 * Site-wide banner: Free Sample Box CTA with countdown.
 */
export default function TopBanner() {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function update() {
      const now = new Date();
      // Countdown resets every Monday 8 AM ET (weekly batch)
      const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const day = et.getDay(); // 0=Sun
      // Days until next Monday
      const daysUntilMon = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
      const nextMon = new Date(et);
      nextMon.setDate(nextMon.getDate() + daysUntilMon);
      nextMon.setHours(8, 0, 0, 0);
      const diff = nextMon.getTime() - et.getTime();
      if (diff <= 0) {
        setTimeLeft("");
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(d > 0 ? `${d}d ${h}h left` : `${h}h ${m}m left`);
    }
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white py-1.5 sm:py-2.5 text-center text-xs sm:text-sm font-semibold tracking-wide relative overflow-hidden">
      <div className="relative z-10 flex items-center justify-center gap-x-2 px-3">
        {/* Mobile */}
        <span className="sm:hidden truncate">
          🌸 Free Sample Box — Try Farm-Direct Flowers{" "}
          <Link
            href="/sample-box"
            className="underline font-bold"
            onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "top_banner" })}
          >
            Get Yours →
          </Link>
          {timeLeft && <span className="text-white/80 ml-1">· {timeLeft}</span>}
        </span>
        {/* Desktop */}
        <span className="hidden sm:flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>🌸 Free Sample Box — Try our farm-direct flowers, no obligation</span>
          {timeLeft && (
            <>
              <span className="text-white/80">|</span>
              <span className="text-yellow-200 font-bold">{timeLeft}</span>
            </>
          )}
          <span className="text-white/80">|</span>
          <Link
            href="/sample-box"
            className="underline hover:no-underline font-bold"
            onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "top_banner" })}
          >
            Request Your Free Box →
          </Link>
        </span>
      </div>
    </div>
  );
}
