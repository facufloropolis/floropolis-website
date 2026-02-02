/**
 * Push events to GTM dataLayer so Custom Event triggers fire and GA4 receives differentiated CTAs.
 * Use these exact event names in GTM: create GA4 Event tags with Custom Event triggers matching these names.
 */

export function pushEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>
): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  const payload: Record<string, unknown> = { event: eventName };
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) payload[k] = v;
    });
  }
  window.dataLayer.push(payload);
}

// CTA event names – use these in GTM Custom Event triggers and GA4 Event tags
export const CTA_EVENTS = {
  // Valentine's / Shop Valentine's
  valentine_shop_click: "valentine_shop_click",
  // Get Free Sample Box / Free Sample Box (links)
  sample_box_click: "sample_box_click",
  // Form submit on sample-box page (key conversion)
  sample_box_request: "sample_box_request",
  // Shop Now
  shop_now_click: "shop_now_click",
  // Contact Us / Contact link
  contact_click: "contact_click",
  // Footer contact
  footer_email_click: "footer_email_click",
  footer_whatsapp_click: "footer_whatsapp_click",
  footer_instagram_click: "footer_instagram_click",
  footer_tiktok_click: "footer_tiktok_click",
  // Contact page
  contact_email_click: "contact_email_click",
  contact_whatsapp_click: "contact_whatsapp_click",
  contact_call_click: "contact_call_click",
} as const;

/** Delay (ms) before following external/mailto/tel links so GTM can send the hit before page unload. */
const OUTBOUND_DELAY_MS = 250;

/**
 * Use for links that leave the site (external URL, mailto:, tel:). Pushes the event,
 * waits briefly so GTM can fire and send to GA4, then navigates. Prevents events being lost on unload.
 */
export function handleOutboundClick(
  e: React.MouseEvent<HTMLAnchorElement>,
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>
): void {
  const href = e.currentTarget.getAttribute("href");
  if (!href) return;
  e.preventDefault();
  pushEvent(eventName, params);
  setTimeout(() => {
    window.location.href = href;
  }, OUTBOUND_DELAY_MS);
}
