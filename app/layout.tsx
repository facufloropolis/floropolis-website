import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Script from "next/script";

/** GA4 Measurement ID – Floropolis stream (https://www.floropolis.com) */
const GA_MEASUREMENT_ID = "G-TL18BYQ102";
/** Set NEXT_PUBLIC_GA_DEBUG=true in .env.local to enable GA4 Debug View */
const GA_DEBUG = process.env.NEXT_PUBLIC_GA_DEBUG === "true";
/** GTM container ID – Floropolis (override with NEXT_PUBLIC_GTM_ID if needed) */
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || "GTM-5WRG7GNX";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: 'Floropolis | Farm-Direct Wholesale Flowers from Ecuador & Colombia',
  description: 'Premium wholesale roses, summer flowers, and gypsophila shipped direct from South American farms in 48-72 hours. 15-40% lower cost, 5-7 days fresher than traditional wholesale.',
  keywords: 'wholesale flowers, farm direct flowers, Ecuador roses, Colombia flowers, wholesale florist, bulk flowers, valentines roses',
  openGraph: {
    title: 'Floropolis | Farm-Direct Wholesale Flowers',
    description: 'Premium wholesale flowers delivered in 48-72 hours from Ecuador and Colombia farms',
    url: 'https://floropolis.com',
    siteName: 'Floropolis',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Google Tag Manager – loads when NEXT_PUBLIC_GTM_ID is set */}
        {GTM_ID && (
          <Script id="gtm-head" strategy="beforeInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
          </Script>
        )}
        {/* Google tag (gtag.js) – GA4; can later be moved into GTM and this block removed */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="beforeInteractive"
        />
        <Script id="google-analytics" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            ${GA_DEBUG ? `gtag('config', '${GA_MEASUREMENT_ID}', { debug_mode: true });` : `gtag('config', '${GA_MEASUREMENT_ID}');`}
          `}
        </Script>
      </head>
      <body className={`${plusJakarta.variable} font-sans antialiased`}>
        {/* Google Tag Manager (noscript) – fallback when JS is disabled */}
        {GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="Google Tag Manager"
            />
          </noscript>
        )}
        {children}
      </body>
    </html>
  );
}
