// lib/phone-utils.ts — v1 | 2026-05-19 | Job_PM (Audit #57 dedup) [V8 SHADOW]
//
// Shared US phone helpers. Server- and client-safe (no env, no DOM).
// Consolidated from prior duplicates in:
//   - /app/signup/page.tsx     (formatUsPhone, digitsOnly, validator inline)
//   - /app/quote/page.tsx       (validation on submit was missing entirely)
//   - /app/sample-box/page.tsx  (validation on submit was missing entirely)

/**
 * Strip every non-digit character from the input.
 * "(305) 555-1212 ext 4" -> "30555512124"
 */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Progressively format a US phone string as "(NNN) NNN-NNNN" while typing.
 * Truncates to the first 10 digits so paste-bombs (e.g. with country code)
 * still produce a well-formed result. Returns "" for empty input.
 *
 *   ""           -> ""
 *   "3"          -> "(3"
 *   "305"        -> "(305"
 *   "3055"       -> "(305) 5"
 *   "3055551"    -> "(305) 555-1"
 *   "3055551212" -> "(305) 555-1212"
 */
export function formatUSPhone(raw: string): string {
  const digits = digitsOnly(raw).slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * True iff the input contains exactly 10 digits (a complete US number).
 * Caller is responsible for treating empty input as "skip validation"
 * when the field is optional.
 */
export function validateUSPhone(raw: string): boolean {
  return digitsOnly(raw).length === 10;
}
