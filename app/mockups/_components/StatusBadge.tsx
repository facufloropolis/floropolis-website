// StatusBadge — v2 | 2026-05-14 | Job_PM
type Variant =
  | 'pending' | 'pending_review' | 'pending_approval'
  | 'confirmed' | 'preauth_ok' | 'paid'
  | 'dispatching' | 'dispatched' | 'in_transit'
  | 'arrived' | 'delivered'
  | 'payment_failed'
  | 'cancelled';

const STYLES: Record<Variant, { label: string; cls: string }> = {
  pending:          { label: 'Pending',          cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  pending_review:   { label: 'Pending review',   cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  pending_approval: { label: 'Pending approval', cls: 'bg-orange-50 text-orange-800 border-orange-200' },
  confirmed:        { label: 'Confirmed',        cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  preauth_ok:       { label: 'Preauth OK',       cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  paid:             { label: 'Paid',             cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  dispatching:      { label: 'Dispatching',      cls: 'bg-violet-50 text-violet-800 border-violet-200' },
  dispatched:       { label: 'Dispatched',       cls: 'bg-violet-50 text-violet-800 border-violet-200' },
  in_transit:       { label: 'In transit',       cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  arrived:          { label: 'Arrived',          cls: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
  delivered:        { label: 'Delivered',        cls: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
  payment_failed:   { label: 'Payment failed',   cls: 'bg-red-50 text-red-800 border-red-200' },
  cancelled:        { label: 'Cancelled',        cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export default function StatusBadge({ variant, label }: { variant: Variant; label?: string }) {
  const s = STYLES[variant];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${s.cls}`}>
      {label ?? s.label}
    </span>
  );
}
