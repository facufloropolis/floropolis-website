'use client';

// WiringFooterToggle -- a small "Show wiring overlays" link rendered in the
// admin index footer. Flips ?wiring=on/off via shallow router navigation while
// preserving everything else in the URL. Other admin links inside the wiring
// overlay don't need this because the param naturally drops on next click; the
// CEO can re-enable by toggling here whenever needed.
// v1 | 2026-05-19 | Job_PM AI-CPO [V8 SHADOW]

import type { ReactElement } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export default function WiringFooterToggle(): ReactElement {
  const pathname = usePathname() ?? '/admin';
  const params = useSearchParams();
  const isOn = params?.get('wiring') === 'on';
  const next = new URLSearchParams(params?.toString() ?? '');
  if (isOn) next.delete('wiring');
  else next.set('wiring', 'on');
  const qs = next.toString();
  const href = qs ? `${pathname}?${qs}` : pathname;
  return (
    <Link
      href={href}
      className="text-xs text-slate-400 hover:text-emerald-700 underline ml-3"
    >
      {isOn ? 'Hide wiring overlays' : 'Show wiring overlays'}
    </Link>
  );
}
