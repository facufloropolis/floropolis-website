import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Script from "next/script";

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
        {/* Google Tag Manager – loads GA4 (G-TL18BYQ102) and listens for dataLayer events */}
        <Script id="gtm-head" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-5WRG7GNX');`}
        </Script>
      </head>
      <body className={`${plusJakarta.variable} font-sans antialiased`}>
        {/* GTM noscript fallback */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-5WRG7GNX"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="GTM"
          />
        </noscript>
        {children}
      </body>
    </html>
  );
}
