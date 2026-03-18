import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request a Wholesale Quote | Floropolis",
  description:
    "Build your custom wholesale flower quote. Add roses, tropicals, greens and specialty stems. Farm-direct from Ecuador. Response within 1 hour.",
  openGraph: {
    title: "Request a Wholesale Quote | Floropolis",
    description:
      "Custom wholesale flower quotes. Farm-direct from Ecuador. Response within 1 hour, Mon-Fri 8AM-6PM ET.",
    url: "https://www.floropolis.com/quote",
    siteName: "Floropolis",
    images: [{ url: "https://www.floropolis.com/Floropolis-logo-only.png", alt: "Floropolis Wholesale Flower Quote" }],
    type: "website",
  },
};

export default function QuoteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
