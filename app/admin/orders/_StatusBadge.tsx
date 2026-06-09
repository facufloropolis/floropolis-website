// StatusBadge -- local to /admin/orders (mockup parity, house style).
// v1 | 2026-06-09 | Job_PM order-visibility #3
import type { BadgeVariant } from './unified-orders';

const STYLES: Record<BadgeVariant, { label: string; cls: string }> = {
  pending: { label: 'Open', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  pending_review: { label: 'Pending review', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  confirmed: { label: 'Confirmed', cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  dispatched: { label: 'Dispatched', cls: 'bg-violet-50 text-violet-800 border-violet-200' },
  payment_failed: { label: 'Payment issue', cls: 'bg-red-50 text-red-800 border-red-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export default function StatusBadge({ variant, label }: { variant: BadgeVariant; label?: string }) {
  const s = STYLES[variant];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${s.cls}`}>
      {label ?? s.label}
    </span>
  );
}
