import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import QuoteCartWidget from "@/components/QuoteCartWidget";
import WhatsAppCTA from "@/components/WhatsAppCTA";
import EmailPopup from "@/components/EmailPopup";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: 'Floropolis | Farm-Direct Wholesale Flowers from Ecuador & Colombia',
  description: 'Premium wholesale roses, tropicals, and specialty stems shipped direct from Ecuador farms in 4 days. Farm-direct quality, 5-7 days fresher.',
  keywords: 'wholesale flowers, farm direct flowers, Ecuador roses, Colombia flowers, wholesale florist, bulk flowers, premium roses',
  openGraph: {
    title: 'Floropolis | Farm-Direct Wholesale Flowers',
    description: 'Premium wholesale flowers delivered in 4 days from Ecuador farms. No middlemen, transparent pricing.',
    url: 'https://www.floropolis.com',
    siteName: 'Floropolis',
    type: 'website',
    images: [{ url: 'https://www.floropolis.com/Floropolis-logo-only.png', alt: 'Floropolis — Farm-Direct Wholesale Flowers' }],
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
        {/* Organization + WebSite JSON-LD — helps Google understand Floropolis as a business */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": "https://www.floropolis.com/#organization",
                  name: "Floropolis",
                  url: "https://www.floropolis.com",
                  description: "Farm-direct wholesale flowers from Ecuador and Colombia. Premium roses, tropicals, and specialty stems delivered in 4 days.",
                  contactPoint: {
                    "@type": "ContactPoint",
                    contactType: "sales",
                    email: "facu@floropolis.com",
                  },
                },
                {
                  "@type": "WebSite",
                  "@id": "https://www.floropolis.com/#website",
                  url: "https://www.floropolis.com",
                  name: "Floropolis",
                  publisher: { "@id": "https://www.floropolis.com/#organization" },
                  potentialAction: {
                    "@type": "SearchAction",
                    target: "https://www.floropolis.com/shop?q={search_term_string}",
                    "query-input": "required name=search_term_string",
                  },
                },
              ],
            }),
          }}
        />
        {/* Google Tag Manager – loads GA4 (G-TL18BYQ102) and listens for dataLayer events */}
        <Script id="gtm-head" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-5WRG7GNX');`}
        </Script>
        {/* Microsoft Clarity — free session recording + heatmaps */}
        <Script id="ms-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window,document,"clarity","script","vt5lsoh7uk");`}
        </Script>
      </head>
      <body className={`${plusJakarta.variable} font-sans antialiased`}>
        {/* Adri version label – visible when running locally so you can confirm you're on the right build */}
        {process.env.NODE_ENV === "development" && (
          <div
            className="bg-emerald-600 text-white text-center text-sm font-medium py-1.5 px-4"
            aria-hidden
          >
            Floropolis — Adri version (local dev)
          </div>
        )}
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
        <QuoteCartWidget />
        <WhatsAppCTA />
        <EmailPopup />
      </body>
    </html>
  );
}
