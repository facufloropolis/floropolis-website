/** GTM dataLayer – used by app for GA4 events via GTM */
declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export {};
