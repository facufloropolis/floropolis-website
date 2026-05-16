// Sentry client-side config -- runs in user browsers.
// v1 | 2026-05-17 | Job_PM [V8 SHADOW]
// DSN comes from NEXT_PUBLIC_SENTRY_DSN env var (set in Vercel Project Settings).

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring -- 10% of transactions traced in prod, 100% in dev
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay -- 10% of sessions, 100% of sessions with errors
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Tag every event with environment so prod / preview / dev are filterable
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',

  // Drop browser noise (extension errors, network blips)
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
  ],
});
