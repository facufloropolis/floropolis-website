// Stripe server-side SDK init.
// v1 | 2026-05-17 | Job_PM W3-S9 [V8 SHADOW]
// Single shared Stripe instance for all server code (webhook + checkout + cron eventually).
// Intent: pin API version so silent schema drift can't break our event router.
//
// Required env: STRIPE_SECRET_KEY (sk_test_* / sk_live_*)
// Webhook env (read by webhook route only): STRIPE_WEBHOOK_SECRET (whsec_*)
//
// TODO wave-3-ops: STRIPE_WEBHOOK_SECRET not set yet; Facu adds after dashboard registration.

import Stripe from 'stripe';

const STRIPE_API_VERSION = '2025-09-30.acacia' as const;

let _stripe: Stripe | null = null;

/**
 * Returns the shared Stripe client. Lazy so missing env at module-import time
 * doesn't crash unrelated routes (Next bundles eagerly).
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      '[stripe/client] MISSING ENV: STRIPE_SECRET_KEY — cannot create Stripe client',
    );
  }

  _stripe = new Stripe(key, {
    // apiVersion literal type pinned per design doc; Stripe SDK types may lag
    // behind dashboard versions, so we widen the cast intentionally.
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: { name: 'floropolis', version: '0.1.0' },
    maxNetworkRetries: 2,
  });

  return _stripe;
}

/**
 * Soft env check; call from routes that need both secret + webhook secret.
 * Logs (does not throw) so a misconfigured deploy still boots — individual
 * route handlers fail loudly when they actually need the secret.
 */
export function assertStripeEnv(opts: { webhook?: boolean } = {}): void {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[stripe/client] MISSING ENV: STRIPE_SECRET_KEY');
  }
  if (opts.webhook && !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error(
      '[stripe/client] MISSING ENV: STRIPE_WEBHOOK_SECRET — webhook signature verification will fail',
    );
  }
}

export const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
export { STRIPE_API_VERSION };
