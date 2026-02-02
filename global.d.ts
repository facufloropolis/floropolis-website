/** GTM dataLayer – used by app for GA4 events via GTM */
declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export {};
