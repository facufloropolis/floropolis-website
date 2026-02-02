import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Script from "next/script";

/** GA4 Measurement ID – Floropolis stream (https://www.floropolis.com) */
const GA_MEASUREMENT_ID = "G-TL18BYQ102";

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
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: true });
          `}
        </Script>
      </head>
      <body className={`${plusJakarta.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
