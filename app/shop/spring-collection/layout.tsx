import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Spring Flowers Collection — Ranunculus, Anemone, Delphinium | Floropolis",
  description:
    "Spring flowers no wholesaler carries. 13 Ranunculus Amandine, 17 Anemone, 16 Delphinium varieties + scabiosa, thistle, molucella, larkspur. Direct from Ecuador. EXCLUSIVE.",
  openGraph: {
    title: "Spring Flowers Collection | Floropolis",
    description:
      "Seasonal spring flowers direct from Ecuador. EXCLUSIVE varieties. Farm-direct pricing.",
    url: "https://www.floropolis.com/shop/spring-collection",
    siteName: "Floropolis",
    images: [{ url: "https://www.floropolis.com/Floropolis-logo-only.png", alt: "Wholesale spring flowers — Floropolis" }],
    type: "website",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.floropolis.com" },
    { "@type": "ListItem", position: 2, name: "Shop", item: "https://www.floropolis.com/shop" },
    { "@type": "ListItem", position: 3, name: "Spring Collection", item: "https://www.floropolis.com/shop/spring-collection" },
  ],
};

export default function SpringCollectionLayout({
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
      {children}
    </>
  );
}
