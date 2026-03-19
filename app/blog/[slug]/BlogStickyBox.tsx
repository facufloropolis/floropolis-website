"use client";

import Link from "next/link";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";

/**
 * Sticky sidebar CTA for blog posts (XL desktops only).
 * Blog drives 26% of traffic — this gives readers a persistent SB nudge
 * without waiting for them to scroll to the bottom CTA.
 */
export default function BlogStickyBox({ category }: { category: string }) {
  return (
    <aside className="hidden xl:block sticky top-24 w-60 flex-shrink-0 self-start">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="text-2xl mb-2">📦</div>
        <h3 className="font-bold text-slate-900 mb-1 text-sm">Try before you order</h3>
        <p className="text-xs text-slate-600 mb-3 leading-relaxed">
          Get a free sample box — farm-direct from Ecuador. No credit card, no obligation.
          Ships in 4 days.
        </p>
        <Link
          href="/sample-box"
          className="block w-full text-center bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-emerald-700 transition-colors"
          onClick={() => pushEvent(CTA_EVENTS.sample_box_click, {
            cta_location: "blog_sidebar",
            blog_category: category,
          })}
        >
          Get Free Sample Box
        </Link>
        <div className="mt-3 pt-3 border-t border-emerald-200 space-y-1 text-xs text-slate-500">
          <p>✓ No credit card required</p>
          <p>✓ Free shipping included</p>
          <p>✓ No commitment</p>
        </div>
      </div>
    </aside>
  );
}
