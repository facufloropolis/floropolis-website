// WhatsAppLink — v2 | 2026-05-14 | Job_PM
import { BRAND } from '../_constants/brand';

export default function WhatsAppLink({
  prefill = '',
  className = '',
  children,
}: {
  prefill?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const url = prefill
    ? `${BRAND.whatsappUrl}?text=${encodeURIComponent(prefill)}`
    : BRAND.whatsappUrl;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className || 'text-emerald-600 hover:text-emerald-800 font-medium'}
    >
      {children ?? `💬 WhatsApp ${BRAND.whatsappDisplay}`}
    </a>
  );
}
