// Next.js instrumentation hook -- loads Sentry server/edge configs at runtime.
// v1 | 2026-05-17 | Job_PM [V8 SHADOW]
// Required for @sentry/nextjs v8+ to wire server-side error capture.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export async function onRequestError(...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>) {
  const Sentry = await import('@sentry/nextjs');
  return Sentry.captureRequestError(...args);
}
