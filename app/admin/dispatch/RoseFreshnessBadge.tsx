// Freshness badge for Rose-source tabs.
// v1 | 2026-05-19 | Job_PM disp-real [V8 SHADOW]
// Shows "Source: AI-Infra pipeline, last synced N min ago" or stale/unconfigured states.

interface RoseFreshnessBadgeProps {
  configured: boolean;
  lastSyncedAt: string | null;
  source: string;
  error?: string | null;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function RoseFreshnessBadge({
  configured,
  lastSyncedAt,
  source,
  error,
}: RoseFreshnessBadgeProps) {
  if (!configured) {
    return (
      <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5 inline-flex items-center gap-2">
        <span className="font-semibold">Read client not configured</span>
        <span className="text-amber-700">
          Set PROD_SUPABASE_SERVICE_KEY to view {source}
        </span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-1.5 inline-flex items-center gap-2">
        <span className="font-semibold">Read failed</span>
        <span className="text-red-700">{error}</span>
      </div>
    );
  }
  return (
    <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 inline-flex items-center gap-2">
      <span className="font-semibold">Source:</span>
      <span>{source}</span>
      <span className="text-slate-400">|</span>
      <span>last synced {formatRelative(lastSyncedAt)}</span>
    </div>
  );
}
