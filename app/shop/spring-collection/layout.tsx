import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Spring Flowers Collection — Ranunculus, Anemone, Delphinium | Floropolis",
  description:
    "Spring flowers no wholesaler carries. 13 Ranunculus Amandine, 17 Anemone, 16 Delphinium varieties + scabiosa, thistle, molucella, larkspur. Direct from Ecuador. EXCLUSIVE.",
  alternates: { canonical: 'https://www.floropolis.com/shop/spring-collection' },
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

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What spring flowers do you carry?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We carry an exclusive selection of spring specialty stems: 13 varieties of Ranunculus Amandine, 17 Anemone varieties, 16 Delphinium varieties, plus scabiosa, larkspur, molucella, eryngium, and thistle. Sourced from Megaflor's high-altitude Ecuador farm (3,150m altitude).",
      },
    },
    {
      "@type": "Question",
      name: "Are these spring varieties exclusive?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Many of our spring specialty varieties are not available through traditional wholesalers. The breadth of Ranunculus Amandine, Anemone, and Delphinium varieties comes from our direct farm relationship with Megaflor in Ecuador.",
      },
    },
    {
      "@type": "Question",
      name: "Are spring flowers available year-round?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Spring specialty stems like ranunculus and anemone have seasonal peaks but are available much of the year from high-altitude Ecuador farms. Availability varies — check our shop for current stock. Pre-order options available for events.",
      },
    },
    {
      "@type": "Question",
      name: "How long does spring flower delivery take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Farm-direct from Ecuador to your door in 4 days via FedEx Priority. Spring stems are cut fresh and shipped direct from Megaflor's high-altitude farm — no warehouse stops.",
      },
    },
  ],
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      {children}
    </>
  );
}
