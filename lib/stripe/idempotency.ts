// Idempotency key generators for Stripe + payments.idempotency_key UNIQUE constraint.
// v1 | 2026-05-17 | Job_PM W3-S9 [V8 SHADOW]
// Key formats LOCKED in d3_stripe_webhook_design.md §1.1.
// DO NOT change without bumping the design doc — Mode B/C inline keys are designed
// to COLLIDE with the cron keys so cron retries collapse against inline writes.

/** YYYY-MM-DD in UTC (date-only; cron + inline must agree on same day). */
function toDateUTC(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** webhook:{stripe_event.id} — for every webhook event ledger write. */
export function keyForWebhookEvent(eventId: string): string {
  return `webhook:${eventId}`;
}

/** setup:{order_id} — for SetupIntent creation (one-shot per order). */
export function keyForSetupIntent(orderId: number | string): string {
  return `setup:${orderId}`;
}

/** preauth:{order_id}:{YYYY-MM-DD} — cron + Mode B inline both use this. Collision = idempotent dedup. */
export function keyForScheduledPreauth(
  orderId: number | string,
  when: Date = new Date(),
): string {
  return `preauth:${orderId}:${toDateUTC(when)}`;
}

/** charge:{order_id}:{YYYY-MM-DD} — cron + Mode C inline both use this. Collision = idempotent dedup. */
export function keyForScheduledCharge(
  orderId: number | string,
  when: Date = new Date(),
): string {
  return `charge:${orderId}:${toDateUTC(when)}`;
}

/** refund:{refund_approval_id} — admin executes via D4 route (out of scope here). */
export function keyForRefund(refundApprovalId: number | string): string {
  return `refund:${refundApprovalId}`;
}
