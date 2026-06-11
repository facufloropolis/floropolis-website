// DealsCreatedLog -- read-only visibility into EVERY deal the team created (any status),
// so Facu sees what was built without opening each one. Pending-approval ones also show in
// DealsQueue above; this is the full ledger. Client-sendable output = doable after (v1.2 scope).
// v1 | 2026-06-11 | Job_PM (CPO)

export interface CreatedDeal {
  id: number;
  businessName: string | null;
  dealType: string | null;
  cadence: string | null;
  totalPrice: number | null;
  blendedGpm: number | null;
  createdBy: string | null;
  approvalStatus: string | null;
  createdAt: string | null;
  belowFloor?: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  pending_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  sent: 'bg-sky-100 text-sky-700',
};

function fmtMoney(n: number | null): string {
  if (n == null) return '--';
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtGpm(n: number | null): string {
  if (n == null) return '--';
  return `${Math.round(n * (n <= 1 ? 100 : 1))}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function DealsCreatedLog({ deals }: { deals: CreatedDeal[] }) {
  if (deals.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-[13px] text-slate-500">
        Deals creados -- todavia no se creo ninguno. Cuando el equipo arme un deal aparece aca.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-[14px] font-semibold text-slate-800">Deals creados</h2>
        <span className="text-[12px] text-slate-500">{deals.length} en total -- visibilidad de lo que armo el equipo</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">Cadencia</th>
              <th className="px-4 py-2 font-medium">Precio</th>
              <th className="px-4 py-2 font-medium">GPM</th>
              <th className="px-4 py-2 font-medium">Creado por</th>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium text-slate-800">{d.businessName ?? '(sin nombre)'}</td>
                <td className="px-4 py-2 text-slate-600">{d.dealType ?? '--'}</td>
                <td className="px-4 py-2 text-slate-600">{d.cadence ?? '--'}</td>
                <td className="px-4 py-2 text-slate-700">{fmtMoney(d.totalPrice)}</td>
                <td className={`px-4 py-2 ${d.belowFloor ? 'font-semibold text-rose-600' : 'text-slate-700'}`}>
                  {fmtGpm(d.blendedGpm)}
                  {d.belowFloor ? ' !' : ''}
                </td>
                <td className="px-4 py-2 text-slate-500">{d.createdBy ?? '--'}</td>
                <td className="px-4 py-2 text-slate-500">{fmtDate(d.createdAt)}</td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${
                      STATUS_STYLE[d.approvalStatus ?? ''] ?? 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {d.approvalStatus ?? 'desconocido'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
