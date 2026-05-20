// /checkout — server-side metadata wrapper.
// Required because page.tsx is 'use client' and cannot export metadata.
// Without this, empty-cart state inherits the homepage <title>.
// v1 | 2026-05-19 | Job_PM [V8 SHADOW]

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Checkout | Floropolis',
  description: 'Complete your wholesale flower order — secure payment via Stripe, delivery included.',
  robots: { index: false, follow: false },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
