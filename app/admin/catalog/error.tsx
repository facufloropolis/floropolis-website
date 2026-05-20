'use client';

// Defensive error boundary for /admin/catalog.
// v1 | 2026-05-19 | Job_PM admin-port [V8 SHADOW]
//
// Next.js auto-mounts this when the catalog page (or any descendant in the
// same route segment) throws during render. Without it, the page falls back
// to the framework's generic "Application error" shell, which strips the
// digest and gives no recovery affordance. With it, the user sees a clear
// "Catalog failed to load" panel, the digest (for Sentry cross-ref), the
// raw error message, and a Retry button that re-runs the server render.

import { useEffect } from 'react';

export default function CatalogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin/catalog/error]', error);
  }, [error]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-xl font-bold text-slate-900 mb-2">Catalog failed to load</h1>
      <p className="text-sm text-slate-600 mb-3">
        Digest: {error.digest ?? 'unknown'} -- error captured in Sentry.
      </p>
      <p className="text-xs text-slate-500 mb-4 break-words">{error.message}</p>
      <button
        onClick={reset}
        className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700"
      >
        Retry
      </button>
    </div>
  );
}
