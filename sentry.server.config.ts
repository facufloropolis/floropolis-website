// Sentry server-side config -- runs in Vercel server functions + Edge runtime.
// v1 | 2026-05-17 | Job_PM [V8 SHADOW]
// Uses the same DSN as client (NEXT_PUBLIC_SENTRY_DSN); SENTRY_AUTH_TOKEN is for source maps.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
});
