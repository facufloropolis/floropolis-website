// Mockup shell layout — no nav/footer, just a review banner + content
// v3.1 | 2026-05-14 | Job_PM [V8 SHADOW]

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mockups | Floropolis",
  robots: { index: false, follow: false },
};

export default function MockupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Suppress production overlays (WhatsApp CTA, QuoteBar, etc.) on mockup pages */}
      <style>{`
        /* Hide the production WhatsApp sticky button on mockup pages */
        a[href*="wa.me"].fixed,
        a[href*="wa.me"][class*="fixed"] { display: none !important; }
        /* Hide QuoteBar (fixed bottom bar from production site) */
        [class*="QuoteBar"], [id*="quote-bar"] { display: none !important; }
        /* Slightly increase base font size for mockup readability */
        body { font-size: 15px; }
      `}</style>

      {/* Mockup review banner */}
      <div className="bg-violet-700 text-white text-center py-2 text-sm font-medium tracking-wide">
        MOCKUP PREVIEW — hardcoded data · not wired to any database
        &nbsp;·&nbsp;
        <a href="/mockups" className="underline underline-offset-2 hover:text-violet-200">← All screens</a>
      </div>
      <div className="min-h-screen bg-slate-50">
        {children}
      </div>
    </>
  );
}
