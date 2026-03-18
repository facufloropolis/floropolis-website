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

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.floropolis.com" },
    { "@type": "ListItem", position: 2, name: "Get a Quote", item: "https://www.floropolis.com/quote" },
  ],
};

export default function QuoteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {children}
    </>
  );
}
