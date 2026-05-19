// ConversationsSection -- interleaved Brevo emails + dispatch_communications
// for one order, sorted by timestamp DESC.
// v1 | 2026-05-19 | Job_PM ORDER-COMMS [V8 SHADOW]
//
// Server component. Reads two sources:
//   1. dispatch_communications (channel: email | whatsapp | phone_note,
//      direction: outbound | inbound). Keyed by dispatch_id, so we look up
//      dispatches by order_id first, then pull comms.
//   2. Brevo /v3/smtp/statistics/events for the customer (via lib/brevo).
//
// We union both and sort DESC by timestamp.
//
// Schema note: orders has no `client_id` column -- only `user_id`. The "client"
// linkage in this codebase is user_id -> client_profiles (1:1). dispatch_comms
// is naturally per-order via dispatches.order_id, so we use that path. The
// clientId prop is accepted for future cross-client conversation views (e.g.
// pulling earlier emails from before this order existed) but is unused today.

import WiringSection from '@/components/admin/WiringSection';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import {
  getEmailLogForOrder,
  isBrevoConfigured,
  type EmailLogEntry,
} from '@/lib/brevo/client';

interface Props {
  orderId: number | string;
  clientId?: string | null; // accepted but unused today; see note above.
  customerEmail: string | null;
}

interface DispatchCommRow {
  id: string;
  dispatch_id: string;
  channel: 'email' | 'whatsapp' | 'phone_note';
  direction: 'outbound' | 'inbound';
  subject: string | null;
  recipient: string | null;
  sent_at: string;
  notes: string | null;
}

interface ConversationEntry {
  key: string;
  channel: 'email' | 'whatsapp' | 'phone_note';
  direction: 'outbound' | 'inbound' | 'unknown';
  sender: string;
  body: string;
  at: string; // ISO
  badge?: string; // e.g. status from Brevo
}

const CHANNEL_ICON: Record<ConversationEntry['channel'], string> = {
  email: '@',
  whatsapp: 'WA',
  phone_note: 'TEL',
};

const CHANNEL_LABEL: Record<ConversationEntry['channel'], string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  phone_note: 'Phone',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function excerpt(s: string | null | undefined, max = 200): string {
  if (!s) return '';
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export default async function ConversationsSection({
  orderId,
  clientId: _clientId,
  customerEmail,
}: Props) {
  const svc = getBackupServiceClient();

  // 1. Find all dispatches for this order. (Most orders have 0 or 1, but the
  //    schema permits multiple if split-shipping ever ships.)
  const { data: dispatchRows } = await svc
    .from('dispatches')
    .select('id')
    .eq('order_id', orderId);
  const dispatchIds = ((dispatchRows ?? []) as { id: string }[]).map((d) => d.id);

  // 2. Pull dispatch_communications for those dispatches.
  let comms: DispatchCommRow[] = [];
  if (dispatchIds.length > 0) {
    const { data: commsRaw } = await svc
      .from('dispatch_communications')
      .select(
        'id, dispatch_id, channel, direction, subject, recipient, sent_at, notes',
      )
      .in('dispatch_id', dispatchIds)
      .order('sent_at', { ascending: false });
    comms = (commsRaw ?? []) as DispatchCommRow[];
  }

  // 3. Pull Brevo events.
  const brevoEvents: EmailLogEntry[] = await getEmailLogForOrder(
    orderId,
    customerEmail,
  );
  const brevoConfigured = isBrevoConfigured();

  // 4. Normalize both into ConversationEntry and merge.
  const entries: ConversationEntry[] = [];
  for (const c of comms) {
    entries.push({
      key: `comm-${c.id}`,
      channel: c.channel,
      direction: c.direction,
      sender:
        c.direction === 'outbound'
          ? 'Floropolis'
          : c.recipient ?? customerEmail ?? 'Customer',
      body: excerpt(c.subject ? `${c.subject} -- ${c.notes ?? ''}` : c.notes),
      at: c.sent_at,
    });
  }
  for (const e of brevoEvents) {
    entries.push({
      key: `brevo-${e.messageId}`,
      channel: 'email',
      direction: 'outbound',
      sender: 'Floropolis',
      body: excerpt(e.subject),
      at: e.sentAt,
      badge: e.status,
    });
  }

  entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const empty = entries.length === 0;

  return (
    <WiringSection
      level="LIVE"
      id="conversations"
      note="dispatch_communications joined via dispatches.order_id + Brevo events, interleaved DESC."
    >
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">Conversations</h2>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              {comms.length} comm{comms.length === 1 ? '' : 's'}
            </span>
            <span className="text-slate-300 text-[10px]">·</span>
            <span
              className={`text-[10px] uppercase tracking-wide font-semibold ${
                brevoConfigured ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              {brevoConfigured
                ? `${brevoEvents.length} brevo`
                : 'brevo: off'}
            </span>
          </div>
        </div>

        {empty && (
          <p className="text-sm text-slate-500 italic">
            {brevoConfigured
              ? 'No conversations yet for this order.'
              : 'No conversations yet. Brevo email events will appear here once BREVO_API_KEY is configured.'}
          </p>
        )}

        {!empty && (
          <ul className="space-y-3">
            {entries.map((e) => (
              <li
                key={e.key}
                className="flex items-start gap-3 text-sm border-l-2 border-slate-100 pl-3"
              >
                <div className="shrink-0 w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center">
                  {CHANNEL_ICON[e.channel]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 truncate">
                      {e.sender}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                      {CHANNEL_LABEL[e.channel]}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">
                      {e.direction === 'outbound'
                        ? 'out'
                        : e.direction === 'inbound'
                        ? 'in'
                        : ''}
                    </span>
                    {e.badge && (
                      <span className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">
                        {e.badge}
                      </span>
                    )}
                  </div>
                  {e.body && (
                    <p className="text-slate-700 mt-0.5 break-words">{e.body}</p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {fmtDate(e.at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </WiringSection>
  );
}
