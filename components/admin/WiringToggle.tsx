'use client';

// WiringToggle -- adds a global `wiring-on` class to <html> when the URL
// carries ?wiring=on. Lets the wiring overlay show without prop-drilling.
// v1 | 2026-05-19 | Job_PM AI-CPO [V8 SHADOW]

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function WiringToggle(): null {
  const params = useSearchParams();
  const on = params?.get('wiring') === 'on';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (on) root.classList.add('wiring-on');
    else root.classList.remove('wiring-on');
    return () => {
      root.classList.remove('wiring-on');
    };
  }, [on]);

  return null;
}
