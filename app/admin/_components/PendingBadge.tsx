// PendingBadge -- inline "data dependency pending" marker.
// v1 | 2026-05-27 | Job_PM Sub-Agent B [V8 SHADOW]
//
// Small dotted badge that links to /admin#data-plane-status so Facu (or any
// admin) can see at a glance that the data behind a section is stubbed /
// partial / not yet wired to the canonical pipeline. Pure server component,
// no client interactivity required — the link is the affordance.
//
// Usage:
//   <PendingBadge label="vendor-scoped box dims pending" />
//   <PendingBadge label="country pricing pending" tone="partial" />
//
// Tones:
//   pending  (default) — red dot, fully stubbed
//   partial            — amber dot, data exists but rollup/scope missing

import Link from 'next/link';

type Tone = 'pending' | 'partial';

interface Props {
  label: string;
  tone?: Tone;
  href?: string; // override the default link target
  title?: string; // tooltip
}

export default function PendingBadge({
  label,
  tone = 'pending',
  href = '/admin#data-plane-status',
  title,
}: Props) {
  const dotCls = tone === 'partial' ? 'bg-amber-500' : 'bg-red-500';
  const textCls = tone === 'partial' ? 'text-amber-700' : 'text-red-700';
  const borderCls = tone === 'partial' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50';

  return (
    <Link
      href={href}
      title={title ?? `Data plane status — ${label}`}
      className={`inline-flex items-center gap-1 align-middle rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${borderCls} ${textCls} hover:opacity-80`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotCls}`} />
      <span>{label}</span>
    </Link>
  );
}
