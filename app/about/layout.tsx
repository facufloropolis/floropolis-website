import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Floropolis — Farm-Direct Flowers Built for Florists",
  description:
    "Floropolis connects florists directly with premium farm partners in Ecuador & Colombia — and soon the US and Mexico — with a cold chain built for 4-day delivery.",
  alternates: { canonical: 'https://www.floropolis.com/about' },
  openGraph: {
    title: "About Floropolis — Farm-Direct Flowers Built for Florists",
    description:
      "Floropolis connects florists directly with premium farm partners. Farm-direct, 4-day delivery.",
    url: "https://www.floropolis.com/about",
    siteName: "Floropolis",
    images: [{ url: "https://www.floropolis.com/Floropolis-logo-only.png", alt: "Floropolis — Farm-Direct Wholesale Flowers" }],
    type: "website",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.floropolis.com" },
    { "@type": "ListItem", position: 2, name: "About", item: "https://www.floropolis.com/about" },
  ],
};

const localBusinessLd = {
  "@context": "https://schema.org",
  "@type": "WholesaleStore",
  name: "Floropolis",
  description: "Farm-direct wholesale flowers from Ecuador and Colombia. Roses, tropicals, greens, and specialty stems delivered to your door in 4 days.",
  url: "https://www.floropolis.com",
  telephone: "+17869308463",
  email: "orders@floropolis.com",
  priceRange: "$$",
  areaServed: "United States",
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Wholesale Flower Catalog",
    itemListElement: [
      { "@type": "Offer", itemOffered: { "@type": "Product", name: "Wholesale Roses", description: "Farm-direct Ecuador roses — 30+ varieties, from $1.30/stem" } },
      { "@type": "Offer", itemOffered: { "@type": "Product", name: "Tropical Flowers", description: "Heliconias, gingers, birds of paradise, anthuriums from $0.63/stem" } },
      { "@type": "Offer", itemOffered: { "@type": "Product", name: "Greens & Foliage", description: "Eucalyptus, monsteras, ferns, and 40+ foliage varieties from $0.13/stem" } },
    ],
  },
  sameAs: ["https://www.floropolis.com"],
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd) }}
      />
      {children}
    </>
  );
}
