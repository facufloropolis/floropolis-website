// Admin layout -- mounts the wiring overlay toggle (no-op unless ?wiring=on).
// v1 | 2026-05-19 | Job_PM AI-CPO [V8 SHADOW]
//
// The toggle is a client island wrapped in Suspense because it calls
// useSearchParams (Next.js requires Suspense boundary around hooks that read
// the URL during SSR).

import type { ReactNode } from 'react';
import { Suspense } from 'react';
import WiringToggle from '@/components/admin/WiringToggle';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <WiringToggle />
      </Suspense>
      {children}
    </>
  );
}
