// Formatting + small badge-class helpers for the Sample Review components.
// Keeps the components clean. ASCII-clean copy; emerald/slate/rose scale.
// v1 | 2026-06-09 | Job_PM (CPO)

import type { SampleReviewRow } from './types';

// Talk time: seconds -> "12m" / "1h 4m" / "45s" (under a minute).
export function fmtTalk(seconds: number | null | undefined): string {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return '0m';
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.round(s)}s`;
}

// Short date for chips / timeline. NULL-safe -> "--".
export function fmtDate(at: string | null | undefined): string {
  if (!at) return '--';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString();
}

// Truncate a string to one visual line by char budget (no fancy ellipsis logic).
export function truncate(text: string | null | undefined, max = 110): string {
  if (!text) return '';
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}...` : t;
}

// Quality verdict -> badge classes + label. good=emerald, bad=rose, unclear=slate.
export function qualityBadge(verdict: 'good' | 'bad' | 'unclear'): {
  cls: string;
  label: string;
} {
  switch (verdict) {
    case 'good':
      return { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'good' };
    case 'bad':
      return { cls: 'bg-rose-50 text-rose-700 border-rose-200', label: 'bad' };
    default:
      return { cls: 'bg-slate-100 text-slate-600 border-slate-200', label: 'unclear' };
  }
}

// Status -> badge classes + Spanish-leaning label, matching cohort-review pill idiom.
export function statusBadge(status: SampleReviewRow['status']): { cls: string; label: string } {
  switch (status) {
    case 'in_review':
      return { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: 'a revisar' };
    case 'aligned':
      return { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'alineado' };
    case 'rejected':
      return { cls: 'bg-rose-50 text-rose-700 border-rose-200', label: 'rechazado' };
    case 'question_open':
      return { cls: 'bg-sky-50 text-sky-700 border-sky-200', label: 'pregunta abierta' };
    case 'answered':
      return { cls: 'bg-violet-50 text-violet-700 border-violet-200', label: 'respondido' };
    default:
      return { cls: 'bg-slate-100 text-slate-600 border-slate-200', label: 'borrador' };
  }
}

// Green/red readiness chip classes (label-readiness row).
export function readyChip(ok: boolean): string {
  return ok
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-rose-50 text-rose-700 border-rose-200';
}

// Sort: unreviewed (in_review) first, then by cohortDate desc (newest first), then name.
export function sortForReview(rows: SampleReviewRow[]): SampleReviewRow[] {
  const rank: Record<SampleReviewRow['status'], number> = {
    in_review: 0,
    answered: 1,
    question_open: 2,
    draft: 3,
    aligned: 4,
    rejected: 5,
  };
  return [...rows].sort((a, b) => {
    const r = rank[a.status] - rank[b.status];
    if (r !== 0) return r;
    const da = a.cohortDate ? new Date(a.cohortDate).getTime() : 0;
    const db = b.cohortDate ? new Date(b.cohortDate).getTime() : 0;
    if (db !== da) return db - da;
    return a.businessName.localeCompare(b.businessName);
  });
}

// Comms type -> emoji chip (the simple set allowed by the style rule).
export function commsIcon(type: SampleCommsType): string {
  switch (type) {
    case 'call':
      return '📞'; // phone receiver
    case 'email':
      return '✉️'; // envelope
    case 'message':
      return '💬'; // speech balloon
    default:
      return '•';
  }
}

type SampleCommsType = 'call' | 'email' | 'message';
