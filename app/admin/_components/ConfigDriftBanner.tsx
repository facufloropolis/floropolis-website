// ConfigDriftBanner — surfaces config↔code drift so the SYSTEM catches it, not Facu.
// Presentational; receives the drift rows from a server component (getConfigDrift()).
// v1 | 2026-06-11 | Job_PM (CPO)
import type { DriftRow } from '@/lib/admin/config-drift';

export default function ConfigDriftBanner({ rows }: { rows: DriftRow[] }) {
  if (rows.length === 0) return null;
  const drifted = rows.filter((r) => r.drifted);

  if (drifted.length === 0) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-[12px] text-emerald-700">
        Config sincronizado &mdash; las constantes del código coinciden con pricing_constants ({rows.length} chequeada{rows.length === 1 ? '' : 's'}).
      </div>
    );
  }

  return (
    <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
      <div className="font-semibold">⚠️ Drift config↔código ({drifted.length}) &mdash; una constante del código no sigue al config</div>
      <ul className="mt-1.5 space-y-1">
        {drifted.map((r) => (
          <li key={`${r.configKey}:${r.market}`} className="font-mono text-[12px]">
            {r.label}: código = <b>{r.codeValue}</b> &ne; config <code>{r.configKey}</code> ({r.market}) = <b>{r.configValue}</b>
            {' '}&rarr; actualizá la constante en el código.
          </li>
        ))}
      </ul>
    </div>
  );
}
