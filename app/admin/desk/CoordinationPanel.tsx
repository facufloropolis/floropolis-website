// CoordinationPanel -- on Facu's Desk: cross-agent coordination at a glance.
// (1) Access requests (sellers asking JJ/Facu for admin) -> approve/reject here.
// (2) What Job delegated to other agents + status (so Facu sees it's all connected).
// v1 | 2026-06-09 | Job_PM (CPO)
//
// Access requests: BACKUP public.access_requests. Outbound asks: PROD meta.agent_inbox
// (read-only; degrades to [] if the meta schema isn't API-exposed).

import { getProdReadClient } from '@/lib/supabase/prod-server';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import AccessRequestActions from './AccessRequestActions';

interface OutAsk {
  to_agent: string;
  status: string;
  subject: string;
}
interface AccessReq {
  id: string;
  requester_email: string | null;
  requester_name: string | null;
  role_requested: string | null;
  reason: string | null;
  approver_role: string | null;
}

async function getOutboundAsks(): Promise<OutAsk[]> {
  try {
    const prod = getProdReadClient();
    if (!prod) return [];
    const { data, error } = await prod
      .schema('meta')
      .from('agent_inbox')
      .select('to_agent, status, subject, sent_at')
      .eq('from_agent', 'job_pm')
      .order('sent_at', { ascending: false })
      .limit(15);
    if (error || !Array.isArray(data)) return [];
    return data as unknown as OutAsk[];
  } catch {
    return [];
  }
}

async function getAccessRequests(): Promise<AccessReq[]> {
  try {
    const svc = getBackupServiceClient();
    const { data } = await svc
      .from('access_requests')
      .select('id, requester_email, requester_name, role_requested, reason, approver_role')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    return Array.isArray(data) ? (data as unknown as AccessReq[]) : [];
  } catch {
    return [];
  }
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    decided: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    answered: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    unread: 'border-amber-200 bg-amber-50 text-amber-700',
    unread_consult: 'border-amber-200 bg-amber-50 text-amber-700',
    fyi: 'border-slate-200 bg-slate-50 text-slate-500',
  };
  return map[status] ?? 'border-slate-200 bg-slate-50 text-slate-600';
}

export default async function CoordinationPanel() {
  const [asks, access] = await Promise.all([getOutboundAsks(), getAccessRequests()]);
  if (asks.length === 0 && access.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-slate-900">Coordinacion</h2>
        <span className="text-xs text-slate-500">
          {access.length} pedido(s) de acceso · {asks.length} pedidos a otros agentes
        </span>
      </div>

      {/* Access requests -- the actionable top item */}
      {access.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Pedidos de acceso ({access.length})
          </div>
          <ul className="space-y-2">
            {access.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{r.requester_name ?? r.requester_email ?? 'desconocido'}</span>
                <span className="text-[12px] text-slate-500">{r.requester_email}</span>
                <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
                  {r.role_requested ?? 'sales'}
                </span>
                {r.reason && <span className="text-[12px] text-slate-500">- {r.reason}</span>}
                <span className="ml-auto">
                  <AccessRequestActions id={r.id} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Outbound asks -- delegated work + status */}
      {asks.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Pedidos a otros agentes
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {asks.map((a, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 font-medium text-slate-700">{a.to_agent}</td>
                  <td className="px-4 py-2 text-slate-600">{a.subject}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={'rounded-full border px-2 py-0.5 text-[11px] font-medium ' + statusBadge(a.status)}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
