// Farm shipments tab: read-only view of farm_shipments (last 30d).
// v1 | 2026-05-19 | Job_PM disp-real [V8 SHADOW]

import type { FarmShipmentRow, RoseTabResult } from './RoseDispatchData';
import RoseFreshnessBadge from './RoseFreshnessBadge';

interface RoseFarmShipmentsTabProps {
  data: RoseTabResult<FarmShipmentRow>;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}

function itemsCount(r: FarmShipmentRow): string {
  const candidates = [r.items_count, r.total_boxes, r.boxes];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return String(c);
  }
  return '-';
}

function farmName(r: FarmShipmentRow): string {
  return (
    (r.farm_name as string | null) ??
    (r.farm as string | null) ??
    '-'
  );
}

function shipDate(r: FarmShipmentRow): string {
  return fmtDate(
    (r.ship_date as string | null) ??
      (r.fly_date as string | null) ??
      (r.arrival_date as string | null) ??
      (r.created_at as string | null),
  );
}

export default function RoseFarmShipmentsTab({ data }: RoseFarmShipmentsTabProps) {
  const { configured, rows, lastSyncedAt, error } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Farm shipments ({rows.length}) - last 30 days
        </h2>
        <RoseFreshnessBadge
          configured={configured}
          lastSyncedAt={lastSyncedAt}
          source="AI-Infra pipeline (farm_shipments)"
          error={error}
        />
      </div>

      {!configured ? (
        <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <p className="font-semibold text-slate-600">Production read client not configured</p>
          <p className="text-sm mt-1">
            Set PROD_SUPABASE_SERVICE_KEY in the environment to enable Rose-tab reads.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <p className="font-semibold text-slate-600">No farm shipments</p>
          <p className="text-sm mt-1">No farm_shipments rows in the last 30 days.</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                  Farm
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                  Ship date
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                  Invoice
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                  Items / boxes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => {
                const key =
                  (r.id != null ? String(r.id) : null) ??
                  (r.invoice_number ?? null) ??
                  `farm-${i}`;
                return (
                  <tr key={key} className="hover:bg-slate-50">
                    <td className="px-3 py-3 text-slate-700">{farmName(r)}</td>
                    <td className="px-3 py-3 text-slate-700 text-xs">{shipDate(r)}</td>
                    <td className="px-3 py-3 text-slate-500 font-mono text-xs">
                      {r.invoice_number ?? '-'}
                    </td>
                    <td className="px-3 py-3 text-slate-700 text-sm">{itemsCount(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
