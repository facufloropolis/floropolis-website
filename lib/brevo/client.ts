// Brevo (formerly Sendinblue) transactional events client -- READ-ONLY.
// v1 | 2026-05-19 | Job_PM ORDER-COMMS [V8 SHADOW]
//
// Server-only. We never expose BREVO_API_KEY to the browser. Used by the
// /admin/orders/[id] EmailLogSection + ConversationsSection to fetch the
// transactional email event stream for a single order (filtered by recipient
// email + order-number tag/subject match).
//
// IMPORTANT: this module DOES NOT send email. Only reads /v3/smtp/statistics/events.
// Outbound sending lives elsewhere (Phase G work on dispatch panel; not here).
//
// Degrades gracefully:
//   - If BREVO_API_KEY is unset, returns [] and emits a one-time console note.
//   - If the API returns an error, logs and returns [].
//
// Matching strategy:
//   1. Call /v3/smtp/statistics/events?email=<customerEmail>&limit=100
//   2. Brevo events carry an optional `tag` (array OR comma string depending on
//      SDK version -- we normalize) and a `subject` string. We match by tag
//      equal to the order number OR subject containing "#<orderId>" or the
//      order_number. Tag match is preferred; subject is a fallback for legacy
//      emails sent before tags were added.
//
// Brevo API ref: https://developers.brevo.com/reference/getemaileventreport-1

export type BrevoStatus =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'spam'
  | 'blocked'
  | 'soft_bounce'
  | 'hard_bounce'
  | 'deferred'
  | 'unsubscribed'
  | 'complaint'
  | 'unique_opened'
  | 'request';

export interface EmailLogEntry {
  messageId: string;
  subject: string;
  sentAt: string; // ISO
  status: BrevoStatus;
  recipient: string;
}

const BREVO_BASE = 'https://api.brevo.com/v3';

// One-time warning latch so we don't spam logs.
let warnedNoKey = false;

function warnOnceNoKey(): void {
  if (warnedNoKey) return;
  warnedNoKey = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[lib/brevo] BREVO_API_KEY not set; email log will render empty placeholder. ' +
      'Set BREVO_API_KEY in Vercel env to enable LIVE data.',
  );
}

// ---------------------------------------------------------------------------
// Brevo raw event shape (defensive -- field naming has varied historically)
// ---------------------------------------------------------------------------

interface BrevoRawEvent {
  email?: string;
  date?: string;
  subject?: string;
  messageId?: string;
  'message-id'?: string;
  event?: string;
  tag?: string | string[] | null;
  tags?: string[] | null;
}

interface BrevoEventsResponse {
  events?: BrevoRawEvent[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isBrevoConfigured(): boolean {
  return !!process.env.BREVO_API_KEY;
}

/**
 * Fetch the Brevo transactional event log for a given (order, customer)
 * pair. Returns [] gracefully on unset key, fetch error, or empty match set.
 *
 * @param orderId        DB id (number) OR order_number ("FLO-...") -- we match
 *                       on both since either could be embedded in the tag/subject.
 * @param customerEmail  recipient email to filter the upstream query by.
 */
export async function getEmailLogForOrder(
  orderId: number | string,
  customerEmail: string | null | undefined,
): Promise<EmailLogEntry[]> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    warnOnceNoKey();
    return [];
  }
  if (!customerEmail) {
    // Without a recipient we can't query meaningfully.
    return [];
  }

  const url = new URL(`${BREVO_BASE}/smtp/statistics/events`);
  url.searchParams.set('email', customerEmail);
  url.searchParams.set('limit', '100');
  url.searchParams.set('sort', 'desc');

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
      },
      // Next 15: default to no-store for fresh reads. Caller will not cache.
      cache: 'no-store',
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[lib/brevo] fetch failed:', err);
    return [];
  }

  if (!res.ok) {
    // 404 = no events for that email; not an error case worth shouting about.
    if (res.status !== 404) {
      // eslint-disable-next-line no-console
      console.error('[lib/brevo] events API returned', res.status, await safeText(res));
    }
    return [];
  }

  let json: BrevoEventsResponse;
  try {
    json = (await res.json()) as BrevoEventsResponse;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[lib/brevo] JSON parse failed:', err);
    return [];
  }

  const orderIdStr = String(orderId);
  const events = json.events ?? [];

  // Filter by tag (preferred) or subject (fallback).
  const matched = events.filter((e) => matchEventToOrder(e, orderIdStr));

  // Normalize + dedupe by messageId+event (Brevo returns one row per event,
  // so a single message may show sent + delivered + opened separately --
  // collapse to the strongest status).
  const byMessage = new Map<string, EmailLogEntry>();
  for (const e of matched) {
    const mid = (e.messageId ?? e['message-id'] ?? '').toString();
    const normalized = normalizeEvent(e, customerEmail);
    if (!normalized) continue;
    const existing = byMessage.get(mid);
    if (!existing) {
      byMessage.set(mid, normalized);
    } else if (
      statusRank(normalized.status) > statusRank(existing.status)
    ) {
      // Keep the latest/strongest status for this message but preserve the
      // earliest sentAt seen (which is the actual send time).
      byMessage.set(mid, {
        ...normalized,
        sentAt: minIso(existing.sentAt, normalized.sentAt),
      });
    }
  }

  // Sort desc by sentAt.
  return Array.from(byMessage.values()).sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function matchEventToOrder(e: BrevoRawEvent, orderIdStr: string): boolean {
  // Normalize tags into a flat string[].
  const tags: string[] = [];
  if (Array.isArray(e.tags)) tags.push(...e.tags);
  if (Array.isArray(e.tag)) tags.push(...e.tag);
  else if (typeof e.tag === 'string') {
    // Brevo sometimes serializes as JSON-looking string: "[\"x\",\"y\"]"
    if (e.tag.startsWith('[')) {
      try {
        const parsed = JSON.parse(e.tag) as unknown;
        if (Array.isArray(parsed)) tags.push(...parsed.map(String));
      } catch {
        tags.push(e.tag);
      }
    } else {
      tags.push(e.tag);
    }
  }
  if (tags.some((t) => t === orderIdStr || t === `#${orderIdStr}`)) return true;

  // Fallback: subject contains "#<id>" or the bare orderId.
  const subj = (e.subject ?? '').toLowerCase();
  if (!subj) return false;
  const id = orderIdStr.toLowerCase();
  return subj.includes(`#${id}`) || subj.includes(id);
}

function normalizeEvent(
  e: BrevoRawEvent,
  fallbackRecipient: string,
): EmailLogEntry | null {
  const mid = (e.messageId ?? e['message-id'] ?? '').toString();
  if (!mid && !e.date) return null;
  const status = normalizeStatus(e.event);
  return {
    messageId: mid || `${e.date ?? 'unknown'}-${status}`,
    subject: e.subject ?? '(no subject)',
    sentAt: e.date ?? new Date(0).toISOString(),
    status,
    recipient: e.email ?? fallbackRecipient,
  };
}

function normalizeStatus(event: string | undefined): BrevoStatus {
  if (!event) return 'sent';
  const lc = event.toLowerCase();
  switch (lc) {
    case 'requests':
    case 'request':
      return 'request';
    case 'delivered':
      return 'delivered';
    case 'opened':
    case 'first_opening':
    case 'unique_opened':
      return 'opened';
    case 'clicks':
    case 'click':
    case 'clicked':
      return 'clicked';
    case 'hardbounces':
    case 'hard_bounce':
      return 'hard_bounce';
    case 'softbounces':
    case 'soft_bounce':
      return 'soft_bounce';
    case 'spam':
    case 'complaints':
      return 'spam';
    case 'blocked':
      return 'blocked';
    case 'unsubscribed':
      return 'unsubscribed';
    case 'deferred':
      return 'deferred';
    case 'sent':
      return 'sent';
    default:
      return 'sent';
  }
}

// Higher rank = "stronger" status (clicked > opened > delivered > sent).
const STATUS_RANK: Record<BrevoStatus, number> = {
  request: 0,
  sent: 1,
  deferred: 2,
  delivered: 3,
  opened: 4,
  unique_opened: 4,
  clicked: 5,
  unsubscribed: 6,
  soft_bounce: 7,
  hard_bounce: 8,
  bounced: 8,
  blocked: 9,
  complaint: 10,
  spam: 10,
};

function statusRank(s: BrevoStatus): number {
  return STATUS_RANK[s] ?? 0;
}

function minIso(a: string, b: string): string {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (!Number.isFinite(ta)) return b;
  if (!Number.isFinite(tb)) return a;
  return ta <= tb ? a : b;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}
