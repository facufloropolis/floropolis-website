// EmailLogSection -- Brevo transactional event stream for one order.
// v1 | 2026-05-19 | Job_PM ORDER-COMMS [V8 SHADOW]
//
// Server component. Reads Brevo /v3/smtp/statistics/events filtered by recipient
// + order tag/subject. Degrades to a friendly placeholder when BREVO_API_KEY
// is unset OR the customer has no email on file. No client-side state.
//
// Wired into /admin/orders/[id] left column via the W5: EMAIL_LOG slot.

import WiringSection from '@/components/admin/WiringSection';
import {
  getEmailLogForOrder,
  isBrevoConfigured,
  type EmailLogEntry,
} from '@/lib/brevo/client';

interface Props {
  orderId: number | string;
  customerEmail: string | null;
}

// Status -> Tailwind chip classes. Emerald = good (delivered/opened), slate =
// neutral (sent/request), amber = pending-ish, red = failure.
const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  request:        { cls: 'bg-slate-100 text-slate-700 border-slate-200',         label: 'queued' },
  sent:           { cls: 'bg-slate-100 text-slate-700 border-slate-200',         label: 'sent' },
  deferred:       { cls: 'bg-amber-50 text-amber-800 border-amber-200',          label: 'deferred' },
  delivered:      { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',    label: 'delivered' },
  opened:         { cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',   label: 'opened' },
  unique_opened:  { cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',   label: 'opened' },
  clicked:        { cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',   label: 'clicked' },
  soft_bounce:    { cls: 'bg-amber-100 text-amber-900 border-amber-300',         label: 'soft bounce' },
  hard_bounce:    { cls: 'bg-red-50 text-red-800 border-red-200',                label: 'hard bounce' },
  bounced:        { cls: 'bg-red-50 text-red-800 border-red-200',                label: 'bounced' },
  blocked:        { cls: 'bg-red-50 text-red-800 border-red-200',                label: 'blocked' },
  spam:           { cls: 'bg-red-50 text-red-800 border-red-200',                label: 'spam' },
  complaint:      { cls: 'bg-red-50 text-red-800 border-red-200',                label: 'complaint' },
  unsubscribed:   { cls: 'bg-slate-200 text-slate-700 border-slate-300',         label: 'unsubscribed' },
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

export default async function EmailLogSection({ orderId, customerEmail }: Props) {
  const configured = isBrevoConfigured();
  const events: EmailLogEntry[] = await getEmailLogForOrder(orderId, customerEmail);

  return (
    <WiringSection level="LIVE" id="email-log" note="Brevo /v3/smtp/statistics/events filtered by recipient + order tag/subject.">
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Email log</h2>
          {configured ? (
            <span className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">
              brevo
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              brevo: not configured
            </span>
          )}
        </div>

        {!configured && events.length === 0 && (
          <p className="text-sm text-slate-500 italic">
            Email log will populate when{' '}
            <span className="font-mono text-xs">BREVO_API_KEY</span> is configured
            in Vercel.
          </p>
        )}

        {configured && events.length === 0 && (
          <p className="text-sm text-slate-500 italic">
            {customerEmail
              ? 'No emails sent for this order yet.'
              : 'No customer email on file -- cannot query Brevo.'}
          </p>
        )}

        {events.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {events.map((e) => {
              const meta = STATUS_STYLE[e.status] ?? STATUS_STYLE.sent;
              return (
                <li
                  key={e.messageId}
                  className="py-2.5 flex items-start gap-3 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 font-medium truncate">
                      {e.subject || '(no subject)'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {fmtDate(e.sentAt)} -- {e.recipient}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </WiringSection>
  );
}
