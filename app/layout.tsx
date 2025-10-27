import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: 'Floropolis | Farm-Direct Wholesale Flowers from Ecuador & Colombia',
  description: 'Premium wholesale roses, summer flowers, and gypsophila shipped direct from South American farms in 48-72 hours. 15-25% lower cost, 5-7 days fresher than traditional wholesale.',
  keywords: 'wholesale flowers, farm direct flowers, Ecuador roses, Colombia flowers, wholesale florist, bulk flowers',
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
      <body
        className={`${plusJakarta.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
