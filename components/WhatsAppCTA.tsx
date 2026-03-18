"use client";

/**
 * Experiment #20: WhatsApp Sticky CTA
 * Hypothesis: Florists prefer WhatsApp over filling a long form.
 * A floating "Talk to us on WhatsApp" button captures leads that wouldn't complete a quote.
 * Metric: whatsapp_sticky_click events in GA4.
 * Shown on: all pages except /quote (don't compete with the form).
 */

import { usePathname } from "next/navigation";
import { pushEvent } from "@/lib/gtm";

const WA_NUMBER = "17869308463";
const WA_MESSAGE = "Hi! I have a question about your wholesale flowers.";
const WA_URL = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_MESSAGE)}`;

export default function WhatsAppCTA() {
  const pathname = usePathname();

  // Hide on quote page — don't compete with the quote form
  if (pathname?.startsWith("/quote")) return null;

  // Hide on PDP routes (/shop/[slug]) — WhatsAppWidget on those pages shows a product-specific message
  const CATEGORY_SLUGS = ["roses", "tropicals", "greens", "combo-boxes", "spring-collection"];
  const shopSegment = pathname?.startsWith("/shop/") ? (pathname.split("/")[2] ?? "") : "";
  if (shopSegment && !CATEGORY_SLUGS.includes(shopSegment)) return null;

  function handleClick() {
    pushEvent("whatsapp_sticky_click", { page: pathname ?? "/" });
    setTimeout(() => {
      window.open(WA_URL, "_blank", "noopener,noreferrer");
    }, 150);
  }

  return (
    <button
      onClick={handleClick}
      aria-label="Chat on WhatsApp"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold text-sm rounded-full shadow-lg px-4 py-3 transition-all duration-200 hover:shadow-xl hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2"
      style={{ boxShadow: "0 4px 16px rgba(37,211,102,0.35)" }}
    >
      {/* WhatsApp SVG icon */}
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-5 h-5 flex-shrink-0"
        aria-hidden="true"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      <span className="hidden sm:inline">Chat with us</span>
    </button>
  );
}
