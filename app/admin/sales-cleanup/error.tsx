'use client';

export default function SalesCleanupError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-8 text-center">
      <p className="text-red-600 font-mono text-sm mb-4">{error.message}</p>
      <button onClick={reset} className="text-sm underline text-emerald-700">Retry</button>
    </div>
  );
}
