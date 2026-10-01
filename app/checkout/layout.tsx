// /checkout — server-side metadata wrapper.
// Required because page.tsx is 'use client' and cannot export metadata.
// Without this, empty-cart state inherits the homepage <title>.
// v1 | 2026-05-19 | Job_PM [V8 SHADOW]
// v2 | 2026-10-01 | Job_PM — PERMANENT CATALOG: while direct checkout is
//    centrally disabled (DIRECT_CHECKOUT_ENABLED in lib/catalog-availability.ts)
//    every /checkout request is redirected to /quote. The page implementation
//    below stays untouched for when the switch is turned on.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DIRECT_CHECKOUT_ENABLED } from '@/lib/catalog-availability';

export const metadata: Metadata = {
  title: 'Checkout | Floropolis',
  description: 'Complete your wholesale flower order — secure payment via Stripe, delivery included.',
  robots: { index: false, follow: false },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  if (!DIRECT_CHECKOUT_ENABLED) {
    redirect('/quote');
  }
  return children;
}
